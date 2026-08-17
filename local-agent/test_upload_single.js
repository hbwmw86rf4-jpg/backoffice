const fs = require('fs');
const path = require('path');

async function test() {
  const dir = 'C:\\Users\\shell\\Documents\\office\\backoffice\\data\\staging\\BOOutBox';
  const entries = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.xml') && f.includes('260817'));
  console.log(`Found ${entries.length} files for today (260817). Sample:`, entries.slice(0, 3));

  if (entries.length === 0) return;

  const testFile = path.join(dir, entries[0]);
  console.log(`Uploading ${testFile}...`);

  const xmlContent = fs.readFileSync(testFile);
  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const formData = new FormData();
  formData.append('xml_file', blob, entries[0]);

  try {
    console.log('Sending fetch request...');
    const res = await fetch('https://backoffice-fancy-oyster-2gt.spcf.app/api/upload-xml', {
      method: 'POST',
      body: formData
    });
    console.log('Status:', res.status);
    const body = await res.text();
    console.log('Body:', body);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

test();
