const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Configuration
const CONFIG_FILE = path.join(__dirname, 'agent_config.json');
const STATE_FILE = path.join(__dirname, 'agent_state.json');

let config = {
  endpoint: 'https://backoffice-fancy-oyster-2gt.spcf.app',
  apiKey: 'YOUR_API_KEY_HERE',
  watchDirs: [
    '\\\\10.5.48.2\\XMLGateway\\BOOutBox',
    '\\\\10.5.48.2\\XMLGateway\\FuelPriceManagement\\BOOutBox',
    'C:\\Passport\\BOOutbox',
    'C:\\Passport\\FuelOutbox'
  ],
  deleteAfterUpload: false, // Keep false to protect original POS files; uses state file to prevent re-upload
  archiveDir: '' // Optional folder to move processed XMLs to
};

if (fs.existsSync(CONFIG_FILE)) {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Track uploaded files
let uploadedFiles = new Set();
if (fs.existsSync(STATE_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    uploadedFiles = new Set(raw.uploaded || []);
  } catch (e) {}
}

function saveState() {
  try {
    // Keep last 10,000 filenames in state
    const arr = Array.from(uploadedFiles).slice(-10000);
    fs.writeFileSync(STATE_FILE, JSON.stringify({ uploaded: arr, lastUpdated: new Date().toISOString() }, null, 2));
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

async function uploadFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const fileName = path.basename(filePath);

  if (uploadedFiles.has(fileName)) {
    return; // Already uploaded
  }
  
  // Wait a little bit to ensure file is completely written by Passport
  await new Promise(r => setTimeout(r, 1000));

  try {
    const form = new FormData();
    form.append('xml_file', fs.createReadStream(filePath));

    console.log(`[${new Date().toLocaleTimeString()}] Uploading ${fileName} to ${config.endpoint}/api/upload-xml...`);
    
    const response = await fetch(`${config.endpoint}/api/upload-xml`, {
      method: 'POST',
      body: form,
      headers: {
        'x-api-key': config.apiKey,
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Successfully synced ${fileName}`);
      uploadedFiles.add(fileName);
      saveState();

      if (config.deleteAfterUpload) {
        fs.unlinkSync(filePath);
      } else if (config.archiveDir && fs.existsSync(config.archiveDir)) {
        const dest = path.join(config.archiveDir, fileName);
        fs.copyFileSync(filePath, dest);
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to upload ${fileName}: HTTP ${response.status} - ${errorText}`);
    }
  } catch (err) {
    console.error(`⚠️ Network error uploading ${fileName}:`, err.message);
  }
}

// Filter existing directories
const validDirs = config.watchDirs.filter(dir => {
  const exists = fs.existsSync(dir);
  if (!exists) {
    console.log(`[Notice] Watch path not accessible right now: ${dir}`);
  }
  return exists;
});

console.log('====================================================');
console.log('🚀 Passport POS -> Cloud Sync Agent');
console.log(`📡 Cloud Endpoint : ${config.endpoint}`);
console.log(`📁 Configured paths: ${config.watchDirs.length}`);
console.log(`👀 Active watch paths (${validDirs.length}): ${validDirs.join(', ') || 'None found yet (will poll)'}`);
console.log(`📦 Previously synced files: ${uploadedFiles.size}`);
console.log('====================================================');

// Start watcher
const watcher = chokidar.watch(config.watchDirs, {
  persistent: true,
  ignoreInitial: false, // Upload existing files on startup
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 200
  }
});

watcher.on('add', filePath => {
  if (filePath.toLowerCase().endsWith('.xml')) {
    uploadFile(filePath);
  }
});

watcher.on('error', err => {
  console.error('Watcher error (e.g. network share disconnected):', err.message);
});
