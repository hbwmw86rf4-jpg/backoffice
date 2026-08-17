const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const FormData = require('form-data');
const fetch = require('node-fetch'); // using v2 for CommonJS

// Configuration
const CONFIG_FILE = path.join(__dirname, 'agent_config.json');
let config = {
  endpoint: 'http://localhost:3000', // Update to specific.dev URL once deployed
  apiKey: 'YOUR_API_KEY_HERE',
  watchDirs: [
    'C:\\Passport\\BOOutbox',
    'C:\\Passport\\FuelOutbox'
  ]
};

if (fs.existsSync(CONFIG_FILE)) {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE)) };
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function uploadFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const fileName = path.basename(filePath);
  
  // Wait a little bit to ensure file is completely written by Passport
  await new Promise(r => setTimeout(r, 1000));

  try {
    const form = new FormData();
    form.append('xml_file', fs.createReadStream(filePath));

    console.log(`Uploading ${fileName} to ${config.endpoint}/api/upload-xml...`);
    
    const response = await fetch(`${config.endpoint}/api/upload-xml`, {
      method: 'POST',
      body: form,
      headers: {
        'x-api-key': config.apiKey,
        // FormData will automatically set the Content-Type header with the boundary
      }
    });

    if (response.ok) {
      console.log(`Successfully uploaded ${fileName}`);
      // Only delete if upload was successful
      fs.unlinkSync(filePath);
    } else {
      const errorText = await response.text();
      console.error(`Failed to upload ${fileName}: ${response.status} - ${errorText}`);
    }
  } catch (err) {
    console.error(`Network error uploading ${fileName}:`, err.message);
  }
}

// Ensure watch directories exist
config.watchDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
  }
});

console.log('Starting Local Agent...');
console.log(`Watching directories: ${config.watchDirs.join(', ')}`);
console.log(`Uploading to: ${config.endpoint}`);

// Start watcher
const watcher = chokidar.watch(config.watchDirs, {
  persistent: true,
  ignoreInitial: false, // Upload existing files on startup
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100
  }
});

watcher.on('add', filePath => {
  if (filePath.toLowerCase().endsWith('.xml')) {
    uploadFile(filePath);
  }
});
