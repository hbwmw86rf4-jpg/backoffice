const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Set up file uploads for the local agent
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const uploadDir = process.env.UPLOAD_DIR || path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// --- Authentication & Session Security ---
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'passport2026!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'bos-passport-session-secret-2026';

function signToken(username) {
  const exp = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
  const payload = `${username}|${exp}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}|${hmac}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('|');
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Date.now() > exp) return null;
  const payload = `${username}|${expStr}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return { username, exp };
    }
  } catch (e) {
    return null;
  }
  return null;
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
      }
    });
  }
  return list;
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.bos_session || req.headers['x-session-token'];
  return verifyToken(token);
}

// 1. Mock electron so we can require main.js without it crashing
const handlers = {};
const mockIpcMain = {
  handle: (channel, handler) => {
    handlers[channel] = handler;
  }
};
const mockApp = {
  whenReady: () => Promise.resolve(), // Allows main.js to initialize DB and Watcher
  on: () => {},
  quit: () => {}
};
const mockDialog = {
  showOpenDialog: async () => ({ canceled: true })
};
class MockBrowserWindow {
  constructor() {
    this.webContents = {
      on: () => {},
      send: (channel, data) => {
        console.log(`[IPC Broadcast] ${channel}`, data);
      }
    };
  }
  isDestroyed() { return false; }
  loadFile() {}
  setMenuBarVisibility() {}
  static getAllWindows() { return []; }
}
const mockMenu = {
  buildFromTemplate: () => ({ popup: () => {} })
};

// Intercept require('electron')
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return {
      app: mockApp,
      BrowserWindow: MockBrowserWindow,
      ipcMain: mockIpcMain,
      dialog: mockDialog,
      Menu: mockMenu
    };
  }
  return originalRequire.apply(this, arguments);
};

// 2. Require main.js to register all the ipcMain handlers
require('./main.js');

// 3. Authentication Endpoints
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = signToken(username);
    res.setHeader('Set-Cookie', `bos_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    console.log(`[Auth] User '${username}' logged in successfully`);
    return res.json({ success: true, user: { username } });
  }
  console.warn(`[Auth] Failed login attempt for user '${username}'`);
  return res.status(401).json({ error: 'Invalid username or password' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'bos_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ success: true });
});

app.get('/api/auth-status', (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    return res.json({ authenticated: true, user: { username: user.username } });
  }
  return res.json({ authenticated: false });
});

// 4. Define the Protected IPC bridge endpoint
app.post('/api/ipc', async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const { channel, args = [] } = req.body;
  
  if (!handlers[channel]) {
    console.error(`[IPC] Handler for channel '${channel}' not found`);
    return res.status(404).json({ error: `Handler for ${channel} not found` });
  }

  try {
    // Call the original handler. The first argument is the 'event' object.
    const result = await handlers[channel]({}, ...args);
    res.json(result);
  } catch (err) {
    console.error(`[IPC] Error in channel '${channel}':`, err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Endpoint for Local Agent to upload XML files (API Key protected)
const { importXmlFile } = require('./importers/xml_parser');
app.post('/api/upload-xml', upload.single('xml_file'), async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized API key' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    
    // Rename to have .xml extension for the parser
    const newPath = `${filePath}.xml`;
    fs.renameSync(filePath, newPath);

    console.log(`[Upload] Processing XML file from agent: ${originalName}`);
    const result = await importXmlFile(newPath);
    
    // Clean up
    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
    
    res.json({ success: true, result });
  } catch (err) {
    console.error('[Upload] Error processing file:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Serve the Frontend Dashboard & Login Pages
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Static assets (CSS, JS, images, fonts)
app.use(express.static(path.join(__dirname, 'views')));

// Protected root view
app.get('*', (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.sendFile(path.join(__dirname, 'views', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
  console.log(`Admin user: ${ADMIN_USERNAME}`);
});
