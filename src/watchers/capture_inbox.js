const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const INBOX_DIR = '\\10.5.48.2\XMLGateway';
const CAPTURE_DIR = '\\10.5.48.2\XMLGateway';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(CAPTURE_DIR);

const watcher = chokidar.watch('*.xml', {
  cwd: INBOX_DIR,
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 50
  }
});

watcher.on('add', (filename) => {
  const src = path.join(INBOX_DIR, filename);
  const dest = path.join(CAPTURE_DIR, filename);

  try {
    const content = fs.readFileSync(src, 'utf-8');
    fs.writeFileSync(dest, content, 'utf-8');
    console.log(`[CAPTURED] ${filename} (${content.length} bytes)`);
    console.log(content.substring(0, 2000));
    console.log('---');
  } catch (e) {
    console.error(`[ERROR] Could not capture ${filename}: ${e.message}`);
  }
});

watcher.on('error', (error) => {
  console.error('[WATCHER ERROR]', error.message);
});

console.log(`Watching ${INBOX_DIR} for new files...`);
console.log(`Captured files will be saved to ${CAPTURE_DIR}`);
