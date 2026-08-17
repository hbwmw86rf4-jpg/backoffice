const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Set up file uploads for the local agent
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

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

// 3. Define the IPC bridge endpoint
app.post('/api/ipc', async (req, res) => {
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

// 4. Endpoint for Local Agent to upload XML files
const { importXmlFile } = require('./importers/xml_parser');
app.post('/api/upload-xml', upload.single('xml_file'), async (req, res) => {
  // Very basic API key protection (optional but recommended)
  const apiKey = req.headers['x-api-key'];
  if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
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

// 5. Serve the Frontend Dashboard
app.use(express.static(path.join(__dirname, 'views')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}`);
});
