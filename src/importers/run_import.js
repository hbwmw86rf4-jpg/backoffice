const path = require('path');
const { initializeDatabase, getDb } = require('../database/schema');
const { importAllXmlFiles } = require('./xml_parser');
const { importPricebook } = require('./pricebook_import');
const { getPassportPaths } = require('../config');

const paths = getPassportPaths();
const BOOUTBOX_DIR = paths.boOutbox;
const PRICEBOOK_PATH = process.argv[2] || '';

async function runImport() {
  console.log('Initializing database...');
  initializeDatabase();

  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name));

  if (PRICEBOOK_PATH) {
    console.log('\nImporting pricebook from:', PRICEBOOK_PATH);
    const pricebookResult = importPricebook(PRICEBOOK_PATH);
    console.log('Pricebook result:', pricebookResult);
  } else {
    console.log('\nNo pricebook path specified. Usage: node run_import.js [pricebook.xlsx]');
  }

  console.log('\nImporting XML transactions from:', BOOUTBOX_DIR);
  const xmlResult = await importAllXmlFiles(BOOUTBOX_DIR);
  console.log('XML import result:', xmlResult);

  console.log('\nImport complete!');
}

runImport().catch(console.error);
