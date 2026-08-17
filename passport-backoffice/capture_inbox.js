const fs = require('fs');
const path = require('path');
const os = require('os');

const INBOX_DIR = '\\\\10.5.48.2\\XMLGateway\\BOInBox\\Pending';
const CAPTURE_DIR = path.join(os.homedir(), 'Desktop', 'CapturedXML');

console.log('=== BOInBox Capture Tool ===\n');
console.log(`Source: ${INBOX_DIR}`);
console.log(`Dest:   ${CAPTURE_DIR}\n`);

// Test access
try {
  const test = fs.readdirSync(INBOX_DIR);
  console.log(`Source accessible. ${test.length} files currently in folder:`);
  test.forEach(f => console.log(`  - ${f}`));
} catch (e) {
  console.error(`Cannot read source folder: ${e.message}`);
  console.error('\nTrying Z: drive fallback...');
  try {
    const test2 = fs.readdirSync('Z:\\BOInBox\\Pending');
    console.log(`Z: drive works. ${test2.length} files currently in folder:`);
    test2.forEach(f => console.log(`  - ${f}`));
  } catch (e2) {
    console.error(`Z: drive also failed: ${e2.message}`);
    console.error('\nCannot access any source folder. Exiting.');
    process.exit(1);
  }
}

if (!fs.existsSync(CAPTURE_DIR)) fs.mkdirSync(CAPTURE_DIR, { recursive: true });

const seen = new Set();
let copies = 0;

console.log('\nWatching for new files... Make your price change now.\n');

setInterval(() => {
  try {
    const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.xml'));
    for (const filename of files) {
      if (seen.has(filename)) continue;
      seen.add(filename);
      try {
        const content = fs.readFileSync(path.join(INBOX_DIR, filename), 'utf-8');
        const dest = path.join(CAPTURE_DIR, filename);
        fs.writeFileSync(dest, content, 'utf-8');
        copies++;
        console.log(`[${copies}] CAPTURED: ${filename} (${content.length} bytes)`);
        console.log(content);
        console.log('');
      } catch (e) {
        console.error(`Error reading ${filename}: ${e.message}`);
      }
    }
  } catch (e) {
    // silent retry
  }
}, 50);
