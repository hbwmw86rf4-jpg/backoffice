const path = require('path');
const { initializeDatabase, getDb } = require('../database/schema');
const { importAllXmlFiles } = require('./xml_parser');
const { importPricebook } = require('./pricebook_import');

const BOOUTBOX_DIR = 'C:\\Users\\sandh\\Downloads\\passport\\Management\\BOOutbox';
const PRICEBOOK_PATH = 'C:\\Users\\sandh\\Downloads\\myReport-8-7-26.xls';

async function runImport() {
  console.log('Initializing database...');
  initializeDatabase();

  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name));

  console.log('\nImporting pricebook...');
  const pricebookResult = importPricebook(PRICEBOOK_PATH);
  console.log('Pricebook result:', pricebookResult);

  console.log('\nImporting XML transactions...');
  const xmlResult = await importAllXmlFiles(BOOUTBOX_DIR);
  console.log('XML import result:', xmlResult);

  console.log('\nImport complete!');
}

runImport().catch(console.error);
