const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let config = {
  passportPath: 'C:\\Users\\sandh\\Downloads\\passport\\Management',
  storeId: '1'
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const loaded = JSON.parse(raw);
      config = { ...config, ...loaded };
    }
  } catch (e) {
    console.error('Failed to load config:', e.message);
  }
  return config;
}

function getConfig() {
  return config;
}

function getPassportPaths() {
  const base = config.passportPath;
  return {
    base,
    boOutbox: path.join(base, 'BOOutbox'),
    boInboxPending: path.join(base, 'BOInBox', 'Pending'),
    boInboxHolding: path.join(base, 'BOInBox', 'HoldingArea'),
    fuelInboxPending: path.join(base, 'FuelPriceManagement', 'BOInBox', 'Pending'),
    fuelOutbox: path.join(base, 'FuelPriceManagement', 'BOOutBox'),
    deadLetter: path.join(base, 'DeadLetter'),
    archive: path.join(base, 'ArchiveDir'),
    auditLogs: path.join(base, 'AuditLogs'),
    captured: path.join(base, 'CapturedXML')
  };
}

loadConfig();

module.exports = { loadConfig, getConfig, getPassportPaths, CONFIG_PATH };
