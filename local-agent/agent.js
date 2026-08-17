const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Configuration
const CONFIG_FILE = path.join(__dirname, 'agent_config.json');
const STATE_FILE = path.join(__dirname, 'agent_state.json');

let config = {
  endpoint: 'https://backoffice-fancy-oyster-2gt.spcf.app',
  apiKey: 'YOUR_API_KEY_HERE',
  watchDirs: [
    'C:\\Users\\shell\\Documents\\office\\backoffice\\data\\staging\\BOOutBox',
    'C:\\Users\\shell\\Documents\\office\\backoffice\\data\\staging\\FuelOutBox'
  ],
  deleteAfterUpload: false,
  syncTodayOnStartup: true,
  concurrency: 5
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
  } catch (e) {}
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

// Track uploaded files
let uploadedFiles = new Set();
if (fs.existsSync(STATE_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    uploadedFiles = new Set(raw.uploaded || []);
  } catch (e) {}
}

let saveTimeout = null;
function saveStateDebounced() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    try {
      const arr = Array.from(uploadedFiles).slice(-30000);
      fs.writeFileSync(STATE_FILE, JSON.stringify({ uploaded: arr, lastUpdated: new Date().toISOString() }, null, 2));
    } catch (e) {}
  }, 1000);
}

// Queue system with parallel workers
const queue = [];
let activeWorkers = 0;
let totalProcessed = 0;
const MAX_CONCURRENCY = config.concurrency || 5;

function enqueueFile(filePath) {
  const fileName = path.basename(filePath);
  if (uploadedFiles.has(fileName)) return;
  if (!queue.includes(filePath)) {
    queue.push(filePath);
    processQueue();
  }
}

function processQueue() {
  while (activeWorkers < MAX_CONCURRENCY && queue.length > 0) {
    const filePath = queue.shift();
    activeWorkers++;
    uploadSingleFile(filePath).finally(() => {
      activeWorkers--;
      processQueue();
    });
  }
}

async function uploadSingleFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const fileName = path.basename(filePath);

  if (uploadedFiles.has(fileName)) return;

  try {
    const xmlContent = fs.readFileSync(filePath);
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const formData = new globalThis.FormData();
    formData.append('xml_file', blob, fileName);

    const response = await fetch(`${config.endpoint}/api/upload-xml`, {
      method: 'POST',
      body: formData,
      headers: {
        'x-api-key': config.apiKey,
      },
      signal: AbortSignal.timeout(20000)
    });

    if (response.ok) {
      const data = await response.json();
      totalProcessed++;
      const detail = data.result?.imported ? `(${data.result.imported} txs)` : (data.result?.status || 'ok');
      log(`[${new Date().toLocaleTimeString()}] ✅ [#${totalProcessed}] ${fileName} -> ${detail}`);
      uploadedFiles.add(fileName);
      saveStateDebounced();

      if (config.deleteAfterUpload) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    } else {
      const errorText = await response.text();
      log(`[${new Date().toLocaleTimeString()}] ❌ Failed ${fileName}: HTTP ${response.status} - ${errorText}`);
    }
  } catch (err) {
    log(`[${new Date().toLocaleTimeString()}] ⚠️ Error ${fileName}: ${err.message}`);
  }
}

// Filter existing directories
const validDirs = config.watchDirs.filter(dir => {
  try {
    return fs.existsSync(dir);
  } catch (e) {
    return false;
  }
});

log('====================================================');
log('🚀 Passport POS -> Cloud Sync Agent');
log(`📡 Cloud Endpoint : ${config.endpoint}`);
log(`👀 Active Watch Dirs (${validDirs.length}):`);
validDirs.forEach(d => log(`   - ${d}`));
log(`📦 Previously Synced Files in Cache: ${uploadedFiles.size}`);
log('====================================================');

// 1. Scan for today's and yesterday's files
if (config.syncTodayOnStartup) {
  const now = new Date();
  const d0 = now.toISOString().slice(2, 10).replace(/-/g, ''); // "260817"
  const d1 = new Date(now.getTime() - 86400000).toISOString().slice(2, 10).replace(/-/g, ''); // "260816"
  
  log(`🔍 Scanning for today (${d0}) and yesterday (${d1}) files...`);
  
  let foundCount = 0;
  for (const dir of validDirs) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.toLowerCase().endsWith('.xml')) {
          if ((entry.includes(d0) || entry.includes(d1)) && !uploadedFiles.has(entry)) {
            const fullPath = path.join(dir, entry);
            enqueueFile(fullPath);
            foundCount++;
          }
        }
      }
    } catch (e) {}
  }
  log(`📋 Queued ${foundCount} recent files for syncing.`);
}

// 2. Start realtime watcher for new additions
const watcher = chokidar.watch(validDirs, {
  persistent: true,
  ignoreInitial: true,
  depth: 0,
  awaitWriteFinish: {
    stabilityThreshold: 1500,
    pollInterval: 200
  }
});

watcher.on('add', filePath => {
  if (filePath.toLowerCase().endsWith('.xml')) {
    log(`[${new Date().toLocaleTimeString()}] 📥 New POS transaction detected: ${path.basename(filePath)}`);
    enqueueFile(filePath);
  }
});

watcher.on('change', filePath => {
  if (filePath.toLowerCase().endsWith('.xml')) {
    enqueueFile(filePath);
  }
});

watcher.on('error', err => {
  log(`Watcher error: ${err.message}`);
});

log('⚡ Real-time watcher active. Ready for new transactions.');
