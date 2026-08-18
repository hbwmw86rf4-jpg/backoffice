const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Configuration
const CONFIG_FILE = path.join(__dirname, 'agent_config.json');
const STATE_FILE = path.join(__dirname, 'agent_state.json');
const LOCK_FILE = path.join(__dirname, 'agent.lock');
const LOG_FILE = path.join(__dirname, 'agent.log');

// --- Singleton Enforcement (PID Lockfile) ---
function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const existingPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      if (existingPid && isPidRunning(existingPid)) {
        console.log(`[Agent] Another instance is already running (PID ${existingPid}). Exiting.`);
        process.exit(0);
      }
    } catch (e) {}
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const current = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      if (current === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) {}
}

process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
process.on('uncaughtException', (err) => {
  log(`[FATAL] Uncaught exception: ${err.stack || err.message}`);
  releaseLock();
  process.exit(1);
});

acquireLock();

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
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {}
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
      const detail = data.result?.recordsImported !== undefined ? `(${data.result.recordsImported} txs)` : (data.result?.status || 'ok');
      log(`✅ [#${totalProcessed}] ${fileName} -> ${detail}`);
      uploadedFiles.add(fileName);
      saveStateDebounced();

      if (config.deleteAfterUpload) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    } else {
      const errorText = await response.text();
      log(`❌ Failed ${fileName}: HTTP ${response.status} - ${errorText}`);
    }
  } catch (err) {
    log(`⚠️ Error ${fileName}: ${err.message}`);
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
log('🚀 Passport POS -> Cloud Sync Agent (PID ' + process.pid + ')');
log(`📡 Cloud Endpoint : ${config.endpoint}`);
log(`👀 Active Watch Dirs (${validDirs.length}):`);
validDirs.forEach(d => log(`   - ${d}`));
log(`📦 Previously Synced Files in Cache: ${uploadedFiles.size}`);
log('====================================================');

// 1. Scan for today's and yesterday's files
if (config.syncTodayOnStartup) {
  const now = new Date();
  const d0 = now.toISOString().slice(2, 10).replace(/-/g, '');
  const d1 = new Date(now.getTime() - 86400000).toISOString().slice(2, 10).replace(/-/g, '');
  const d2 = new Date(now.getTime() - 172800000).toISOString().slice(2, 10).replace(/-/g, '');
  
  log(`🔍 Scanning for recent files (${d0}, ${d1}, ${d2})...`);
  
  let foundCount = 0;
  for (const dir of validDirs) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.toLowerCase().endsWith('.xml')) {
          if ((entry.includes(d0) || entry.includes(d1) || entry.includes(d2)) && !uploadedFiles.has(entry)) {
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
    log(`📥 New POS transaction detected: ${path.basename(filePath)}`);
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
