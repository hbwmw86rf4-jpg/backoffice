const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AGENT_SCRIPT = path.join(__dirname, 'agent.js');
const WATCHDOG_LOG = path.join(__dirname, 'watchdog.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] [Watchdog] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(WATCHDOG_LOG, line);
  } catch (e) {}
}

log('🚀 Starting Passport Cloud Sync Watchdog Supervisor...');

let restartCount = 0;
let child = null;

function startAgent() {
  log(`Spawning agent.js process (Spawn #${++restartCount})...`);

  child = spawn(process.execPath, [AGENT_SCRIPT], {
    cwd: __dirname,
    stdio: 'inherit',
    windowsHide: true
  });

  child.on('error', (err) => {
    log(`Failed to spawn child process: ${err.message}`);
  });

  child.on('exit', (code, signal) => {
    log(`agent.js exited with code ${code}, signal ${signal}. Restarting in 3 seconds...`);
    child = null;
    setTimeout(startAgent, 3000);
  });
}

process.on('SIGINT', () => {
  log('Stopping watchdog and child process...');
  if (child) child.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Stopping watchdog and child process...');
  if (child) child.kill('SIGTERM');
  process.exit(0);
});

startAgent();
