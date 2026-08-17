const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const xml2js = require('xml2js');
const { getPassportPaths } = require('../config');

const passportPaths = getPassportPaths();

// Remote UNC paths (used for BOInBox writes and DeadLetter monitoring only)
const UNC_BOOUTBOX_DIR = passportPaths.boOutbox;
const BOINBOX_DIR = passportPaths.boInboxPending;
const DEAD_LETTER_DIR = passportPaths.deadLetter;

// Local staging directories — populated by sync_booutbox_v2.bat (robocopy)
// The watcher reads from here, never directly from UNC
const LOCAL_STAGING_BASE = path.join(__dirname, '..', '..', 'data', 'staging');
const BOOUTBOX_DIR = path.join(LOCAL_STAGING_BASE, 'BOOutBox');
const FUEL_OUTBOX_DIR = path.join(LOCAL_STAGING_BASE, 'FuelOutBox');

const parser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  attrkey: '$',
  charkey: '_'
});

let db = null;
let watchers = [];
let eventHandlers = {};
let isRunning = false;
let processedFiles = new Set();

function getDb() {
  if (!db) {
    try {
      const schema = require('../database/schema');
      db = schema.getDb;
    } catch (e) {
      console.error('Failed to load database:', e.message);
    }
  }
  return db ? db() : null;
}

function loadProcessedFiles() {
  const database = getDb();
  if (!database) return;
  try {
    const rows = database.prepare('SELECT filename FROM processed_files').all();
    processedFiles = new Set(rows.map(r => r.filename));
    console.log(`[CACHE] Loaded ${processedFiles.size} processed filenames`);
  } catch (e) {
    console.error('[CACHE] Failed to load processed files:', e.message);
  }
}

function markProcessed(filename, fileType) {
  processedFiles.add(filename);
  const database = getDb();
  if (database) {
    try {
      database.prepare('INSERT OR IGNORE INTO processed_files (filename, file_type) VALUES (?, ?)').run(filename, fileType || 'unknown');
    } catch (e) {
      console.error('[CACHE] Failed to mark processed:', e.message);
    }
  }
}

function isProcessed(filename) {
  return processedFiles.has(filename);
}

function parseXmlFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      parser.parseString(content, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function classifyFile(filename) {
  const upper = filename.toUpperCase();
  if (upper.startsWith('ITTACK')) return { type: 'ack', subtype: 'itt' };
  if (upper.startsWith('ITT-EVTACK')) return { type: 'ack', subtype: 'itt_evt' };
  if (upper.startsWith('ILTACK')) return { type: 'ack', subtype: 'ilt' };
  if (upper.startsWith('MMTACK')) return { type: 'ack', subtype: 'mmt' };
  if (upper.startsWith('FGTACK')) return { type: 'ack', subtype: 'fgt' };
  if (upper.startsWith('DEAD')) return { type: 'dead_letter' };
  if (upper.startsWith('PJR') || upper.startsWith('CPJR')) return { type: 'journal' };
  if (upper.startsWith('FGM')) return { type: 'movement', subtype: 'fuel_grade' };
  if (upper.startsWith('ISM')) return { type: 'movement', subtype: 'item_sales' };
  if (upper.startsWith('FPM')) return { type: 'movement', subtype: 'fuel_product' };
  if (upper.startsWith('MCM')) return { type: 'movement', subtype: 'merchandise_code' };
  if (upper.startsWith('MSM')) return { type: 'movement', subtype: 'misc_summary' };
  return { type: 'unknown' };
}

async function processAckFile(filePath, filename, parsed) {
  try {
    const root = parsed['NAXML-MovementReport'] || parsed['NAXML-POSJournal'] || {};
    const ack = root.ACKHEADER || {};
    const status = ack.STATUSCODE || 'Unknown';
    const message = ack.STATUSMESSAGE || '';
    const classification = classifyFile(filename);

    console.log(`[ACK] ${filename}: ${status} - ${message}`);

    const database = getDb();
    if (database) {
      try {
        database.prepare(`
          INSERT INTO import_log (filename, file_type, records_imported, status, error_message)
          VALUES (?, ?, ?, ?, ?)
        `).run(filename, `ack_${classification.subtype}`, 0, status.toLowerCase(), message);

        const sourceFilename = extractSourceFilename(filename);
        if (sourceFilename) {
          database.prepare(`
            UPDATE pos_sync_log
            SET ack_received = 1, ack_status = ?, ack_message = ?, ack_at = CURRENT_TIMESTAMP
            WHERE filename = ? AND ack_received = 0
          `).run(status, message, sourceFilename);
        }
      } catch (e) {
        console.error('Failed to log ACK:', e.message);
      }
    }

    markProcessed(filename, 'ack');
    emit('ack', { filename, status, message, subtype: classification.subtype });
  } catch (e) {
    console.error(`Error processing ACK ${filename}:`, e.message);
  }
}

function extractSourceFilename(ackFilename) {
  const upper = ackFilename.toUpperCase();
  if (upper.startsWith('ITTACK')) return ackFilename.replace(/ACK/i, '');
  if (upper.startsWith('ITT-EVTACK')) return ackFilename.replace(/-EVTACK/i, '');
  if (upper.startsWith('ILTACK')) return ackFilename.replace(/ACK/i, '');
  if (upper.startsWith('MMTACK')) return ackFilename.replace(/ACK/i, '');
  if (upper.startsWith('FGTACK')) return ackFilename.replace(/ACK/i, '');
  return null;
}

async function processDeadLetter(filePath, filename, parsed) {
  try {
    const root = parsed['NAXML-MovementReport'] || {};
    const detail = root.DETAIL || {};
    const action = detail.ACTION || '';
    const message = detail.MESSAGE || '';
    const sourceFile = detail.FILE || '';

    console.log(`[DEAD LETTER] ${filename}: ${action} - ${message} (source: ${sourceFile})`);

    const database = getDb();
    if (database) {
      try {
        database.prepare(`
          INSERT INTO import_log (filename, file_type, records_imported, status, error_message)
          VALUES (?, ?, ?, ?, ?)
        `).run(filename, 'dead_letter', 0, 'fatal_error', `${action}: ${message} (source: ${sourceFile})`);
      } catch (e) {
        console.error('Failed to log dead letter:', e.message);
      }
    }

    markProcessed(filename, 'dead_letter');
    emit('dead_letter', { filename, action, message, sourceFile });
  } catch (e) {
    console.error(`Error processing dead letter ${filename}:`, e.message);
  }
}

async function processJournalFile(filePath, filename) {
  try {
    const xmlParser = require('../importers/xml_parser');
    const result = await xmlParser.importXmlFile(filePath);

    const logType = result.status === 'skipped' ? 'journal_skip' : 'journal';
    markProcessed(filename, logType);
    console.log(`[JOURNAL] ${filename}: ${result.status} - ${result.message || (result.recordsImported || 0) + ' records'}`);

    emit('journal', { filename, ...result });
  } catch (e) {
    console.error(`Error processing journal ${filename}:`, e.message);
  }
}

async function processMovementFile(filePath, filename, parsed, subtype) {
  try {
    const root = parsed['NAXML-MovementReport'] || {};
    const header = root.TransmissionHeader || {};
    const businessDate = root[subtype === 'fuel_grade' ? 'FuelGradeMovement' : '']
      ? (root.FuelGradeMovement.MovementHeader || {}).BusinessDate || ''
      : '';

    console.log(`[MOVEMENT] ${filename} (${subtype})`);

    const database = getDb();
    if (database) {
      try {
        database.prepare(`
          INSERT INTO import_log (filename, file_type, records_imported, status, error_message)
          VALUES (?, ?, ?, ?, ?)
        `).run(filename, `movement_${subtype}`, 0, 'success', JSON.stringify({ businessDate }));
      } catch (e) {
        console.error('Failed to log movement:', e.message);
      }
    }

    markProcessed(filename, `movement_${subtype}`);
    emit('movement', { filename, subtype, businessDate });
  } catch (e) {
    console.error(`Error processing movement ${filename}:`, e.message);
  }
}

async function handleNewFile(filePath, isScanMode) {
  const filename = path.basename(filePath);

  if (filename.endsWith('.tmp')) return;

  if (isProcessed(filename)) {
    if (!isScanMode) {
      console.log(`[SKIP] ${filename} - already processed`);
    }
    return;
  }

  try {
    if (!isScanMode) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const classification = classifyFile(filename);
    const parsed = await parseXmlFile(filePath);

    switch (classification.type) {
      case 'ack':
        await processAckFile(filePath, filename, parsed);
        break;
      case 'dead_letter':
        await processDeadLetter(filePath, filename, parsed);
        break;
      case 'journal':
        await processJournalFile(filePath, filename);
        break;
      case 'movement':
        await processMovementFile(filePath, filename, parsed, classification.subtype);
        break;
      default:
        console.log(`[UNKNOWN] ${filename}`);
        markProcessed(filename, 'unknown');
        emit('unknown', { filename });
    }
  } catch (e) {
    console.error(`Error handling ${filename}:`, e.message);
    emit('error', { filename, error: e.message });
  }
}

function emit(event, data) {
  if (eventHandlers[event]) {
    for (const handler of eventHandlers[event]) {
      try {
        handler(data);
      } catch (e) {
        console.error(`Event handler error for ${event}:`, e.message);
      }
    }
  }
}

function on(event, handler) {
  if (!eventHandlers[event]) {
    eventHandlers[event] = [];
  }
  eventHandlers[event].push(handler);
}

// ─── Local Staging Setup ──────────────────────────────────────────────────────
function ensureLocalDirs() {
  if (!fs.existsSync(LOCAL_STAGING_BASE)) fs.mkdirSync(LOCAL_STAGING_BASE, { recursive: true });
  if (!fs.existsSync(BOOUTBOX_DIR)) fs.mkdirSync(BOOUTBOX_DIR, { recursive: true });
  if (!fs.existsSync(FUEL_OUTBOX_DIR)) fs.mkdirSync(FUEL_OUTBOX_DIR, { recursive: true });
}

function start() {
  if (isRunning) {
    console.log('Watcher already running');
    return;
  }

  isRunning = true;

  // Ensure local staging directories exist
  ensureLocalDirs();
  console.log('[STAGING] Local staging directories ready');
  console.log(`  Local BOOutBox: ${BOOUTBOX_DIR}`);
  console.log(`  Local FuelOutBox: ${FUEL_OUTBOX_DIR}`);
  console.log(`  Synced by: sync_booutbox_v2.bat (Task Scheduler)`);

  // Now watch local staging directories (fast, reliable, no UNC issues)
  const watcherOpts = {
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    ignorePermissionErrors: true,
    ignored: /(^|[\/\\])\.(?!$)|\.tmp$|\.log$|DumpStack/i,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  };

  const boOutboxWatcher = chokidar.watch('*.xml', {
    cwd: BOOUTBOX_DIR,
    ...watcherOpts
  });

  boOutboxWatcher.on('add', (relativePath) => {
    const fullPath = path.join(BOOUTBOX_DIR, relativePath);
    console.log(`[BOOutbox] New file: ${relativePath}`);
    handleNewFile(fullPath, false);
  });

  boOutboxWatcher.on('error', (error) => {
    if (!error.message.includes('EBUSY') && !error.message.includes('EPERM')) {
      console.error('[BOOutbox] Watcher error:', error.message);
    }
  });

  watchers.push(boOutboxWatcher);

  const fuelWatcher = chokidar.watch('*.xml', {
    cwd: FUEL_OUTBOX_DIR,
    ...watcherOpts
  });

  fuelWatcher.on('add', (relativePath) => {
    const fullPath = path.join(FUEL_OUTBOX_DIR, relativePath);
    console.log(`[FuelOutBox] New file: ${relativePath}`);
    handleNewFile(fullPath, false);
  });

  fuelWatcher.on('error', (error) => {
    if (!error.message.includes('EBUSY') && !error.message.includes('EPERM')) {
      console.error('[FuelOutBox] Watcher error:', error.message);
    }
  });

  watchers.push(fuelWatcher);

  // BOInBox and DeadLetter stay on UNC (these are outbound/monitoring, not parsed)
  const isUNC = UNC_BOOUTBOX_DIR.startsWith('\\\\');
  const uncWatcherOpts = {
    ...watcherOpts,
    ...(isUNC ? { usePolling: true, interval: 3000 } : {})
  };

  if (fs.existsSync(BOINBOX_DIR)) {
    const boInboxWatcher = chokidar.watch('*.xml', {
      cwd: BOINBOX_DIR,
      ...uncWatcherOpts,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 500
      }
    });

    boInboxWatcher.on('add', (relativePath) => {
      console.log(`[BOInBox] File created: ${relativePath}`);
      emit('boinbox_add', { filename: path.basename(relativePath), relativePath });
    });

    boInboxWatcher.on('unlink', (relativePath) => {
      console.log(`[BOInBox] File removed: ${relativePath} (POS picked up)`);
      emit('boinbox_remove', { filename: path.basename(relativePath), relativePath });
    });

    boInboxWatcher.on('error', (error) => {
      if (!error.message.includes('EBUSY') && !error.message.includes('EPERM')) {
        console.error('[BOInBox] Watcher error:', error.message);
      }
    });

    watchers.push(boInboxWatcher);
  }

  if (fs.existsSync(DEAD_LETTER_DIR)) {
    const deadLetterWatcher = chokidar.watch('*.mnf', {
      cwd: DEAD_LETTER_DIR,
      ...uncWatcherOpts,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 500
      }
    });

    deadLetterWatcher.on('add', (relativePath) => {
      const fullPath = path.join(DEAD_LETTER_DIR, relativePath);
      console.log(`[DeadLetter] Auto-deleting PDI manifest file: ${relativePath}`);
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.error(`[DeadLetter] Failed to delete ${relativePath}:`, e.message);
      }
    });

    deadLetterWatcher.on('error', (error) => {
      if (!error.message.includes('EBUSY') && !error.message.includes('EPERM')) {
        console.error('[DeadLetter] Watcher error:', error.message);
      }
    });

    watchers.push(deadLetterWatcher);
  }

  console.log('POS file watcher started');
  console.log(`  Watching (local): ${BOOUTBOX_DIR}`);
  console.log(`  Watching (local): ${FUEL_OUTBOX_DIR}`);
  console.log(`  Watching (UNC): ${BOINBOX_DIR}`);
  console.log(`  Watching (UNC): ${DEAD_LETTER_DIR} (for .mnf auto-cleanup)`);
}

async function scanExisting(dir, label) {
  if (!fs.existsSync(dir)) {
    console.log(`[${label}] Directory does not exist: ${dir}`);
    return { found: 0, processed: 0, skipped: 0, errors: 0 };
  }

  const files = fs.readdirSync(dir).filter(f => f.toUpperCase().endsWith('.XML'));
  console.log(`[${label}] Found ${files.length} XML files`);
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const filename of files) {
    if (isProcessed(filename)) {
      skipped++;
      continue;
    }

    const fullPath = path.join(dir, filename);
    try {
      await handleNewFile(fullPath, true);
      processed++;
    } catch (e) {
      console.error(`[${label}] Error processing ${filename}:`, e.message);
      errors++;
    }
  }

  console.log(`[${label}] Done: ${processed} new, ${skipped} skipped, ${errors} errors`);
  return { found: files.length, processed, skipped, errors };
}

async function scanAll() {
  console.log('=== Scanning all BOOutBox directories ===');
  loadProcessedFiles();
  const boResult = await scanExisting(BOOUTBOX_DIR, 'BOOutBox');
  const fuelResult = await scanExisting(FUEL_OUTBOX_DIR, 'FuelOutBox');
  return { boOutbox: boResult, fuelOutbox: fuelResult };
}

function stop() {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers = [];
  isRunning = false;
  console.log('POS file watcher stopped');
}

function getStatus() {
  return {
    isRunning,
    watchers: watchers.length,
    localBoOutboxExists: fs.existsSync(BOOUTBOX_DIR),
    boInboxExists: fs.existsSync(BOINBOX_DIR),
    fuelOutboxExists: fs.existsSync(FUEL_OUTBOX_DIR),
    processedFilesCount: processedFiles.size
  };
}

module.exports = {
  start,
  stop,
  on,
  getStatus,
  scanAll,
  classifyFile,
  isProcessed,
  BOOUTBOX_DIR,
  FUEL_OUTBOX_DIR,
  DEAD_LETTER_DIR
};
