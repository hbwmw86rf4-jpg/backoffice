const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const xml2js = require('xml2js');
const { getPassportPaths } = require('../config');

const passportPaths = getPassportPaths();
const BOOUTBOX_DIR = passportPaths.boOutbox;
const FUEL_OUTBOX_DIR = passportPaths.fuelOutbox;
const DEAD_LETTER_DIR = passportPaths.deadLetter;

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
      } catch (e) {
        console.error('Failed to log ACK:', e.message);
      }
    }

    emit('ack', { filename, status, message, subtype: classification.subtype });
  } catch (e) {
    console.error(`Error processing ACK ${filename}:`, e.message);
  }
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

    emit('dead_letter', { filename, action, message, sourceFile });
  } catch (e) {
    console.error(`Error processing dead letter ${filename}:`, e.message);
  }
}

async function processJournalFile(filePath, filename) {
  try {
    console.log(`[JOURNAL] Processing ${filename}...`);

    const xmlParser = require('../importers/xml_parser');
    const result = await xmlParser.importXmlFile(filePath);

    console.log(`[JOURNAL] ${filename}: ${result.status} - ${result.message || result.recordsImported + ' records'}`);

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

    emit('movement', { filename, subtype, businessDate });
  } catch (e) {
    console.error(`Error processing movement ${filename}:`, e.message);
  }
}

async function handleNewFile(filePath) {
  const filename = path.basename(filePath);

  if (filename.endsWith('.tmp')) return;

  try {
    await new Promise(resolve => setTimeout(resolve, 500));

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

function start() {
  if (isRunning) {
    console.log('Watcher already running');
    return;
  }

  isRunning = true;

  const boOutboxWatcher = chokidar.watch('**/*.xml', {
    cwd: BOOUTBOX_DIR,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });

  boOutboxWatcher.on('add', (relativePath) => {
    const fullPath = path.join(BOOUTBOX_DIR, relativePath);
    console.log(`[BOOutbox] New file: ${relativePath}`);
    handleNewFile(fullPath);
  });

  boOutboxWatcher.on('error', (error) => {
    console.error('[BOOutbox] Watcher error:', error.message);
  });

  watchers.push(boOutboxWatcher);

  if (fs.existsSync(FUEL_OUTBOX_DIR)) {
    const fuelWatcher = chokidar.watch('**/*.xml', {
      cwd: FUEL_OUTBOX_DIR,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    fuelWatcher.on('add', (relativePath) => {
      const fullPath = path.join(FUEL_OUTBOX_DIR, relativePath);
      console.log(`[FuelOutBox] New file: ${relativePath}`);
      handleNewFile(fullPath);
    });

    fuelWatcher.on('error', (error) => {
      console.error('[FuelOutBox] Watcher error:', error.message);
    });

    watchers.push(fuelWatcher);
  }

  console.log('POS file watcher started');
  console.log(`  Watching: ${BOOUTBOX_DIR}`);
  console.log(`  Watching: ${FUEL_OUTBOX_DIR}`);
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
    boOutboxExists: fs.existsSync(BOOUTBOX_DIR),
    fuelOutboxExists: fs.existsSync(FUEL_OUTBOX_DIR)
  };
}

module.exports = {
  start,
  stop,
  on,
  getStatus,
  classifyFile,
  BOOUTBOX_DIR,
  FUEL_OUTBOX_DIR,
  DEAD_LETTER_DIR
};
