try {
  const {initializeDatabase, getDb} = require('./src/database/schema');
  initializeDatabase();
  console.log('DB OK');
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('Tables:', tables.length);
} catch(e) {
  console.error('FAIL:', e.message);
  console.error(e.stack);
}
