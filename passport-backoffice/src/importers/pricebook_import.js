const XLSX = require('xlsx');
const { getDb, saveDb } = require('../database/schema');

function normalizeUpc(upc) {
  if (!upc) return '';
  return String(upc).trim().replace(/^0+/, '').padStart(1, '0');
}

function importPricebook(filePath) {
  const db = getDb();
  console.log(`Importing pricebook from ${filePath}...`);

  try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let headerRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i][0] === 'Scan Code') {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) {
      console.log('Could not find header row (Scan Code)');
      return { status: 'error', message: 'Header row not found' };
    }

    let importedCount = 0;
    const departments = new Map();

    const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name) VALUES (?)');
    const getDeptId = db.prepare('SELECT id FROM departments WHERE name = ?');
    const upsertItem = db.prepare(`
      INSERT OR REPLACE INTO pricebook (upc, name, department_id, vendor, cost, price, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const importAll = db.transaction(() => {
      for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;

        const upc = normalizeUpc(row[0]);
        const name = String(row[1] || '').trim();
        const deptName = String(row[2] || '').trim();
        const vendor = String(row[3] || '').trim();
        const cost = parseFloat(row[5]) || 0;
        const price = parseFloat(row[6]) || 0;

        if (!upc || !name) continue;

        if (!departments.has(deptName)) {
          insertDept.run(deptName);
          const dept = getDeptId.get(deptName);
          if (dept) {
            departments.set(deptName, dept.id);
          }
        }

        const deptId = departments.get(deptName);

        upsertItem.run(upc, name, deptId, vendor, cost, price);
        importedCount++;
      }
    });

    importAll();

    const filename = filePath.split(/[/\\]/).pop();
    db.prepare('INSERT INTO import_log (filename, file_type, records_imported, status) VALUES (?, ?, ?, ?)').run(filename, 'pricebook', importedCount, 'success');
    saveDb();

    console.log(`Imported ${importedCount} items from pricebook`);
    return { status: 'success', recordsImported: importedCount };
  } catch (error) {
    console.error('Pricebook import error:', error.message);
    return { status: 'error', message: error.message };
  }
}

module.exports = { importPricebook };
