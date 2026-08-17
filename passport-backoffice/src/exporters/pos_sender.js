const fs = require('fs');
const path = require('path');
const { Builder } = require('xml2js');
const { getDb, saveDb } = require('../database/schema');
const { getPassportPaths } = require('../config');

const passportPaths = getPassportPaths();
const BOINBOX_PENDING = passportPaths.boInboxPending;
const BOOUTBOX_DIR = passportPaths.boOutbox;
const FUEL_INBOX_PENDING = passportPaths.fuelInboxPending;
const FUEL_OUTBOX_DIR = passportPaths.fuelOutbox;
const DEAD_LETTER_DIR = passportPaths.deadLetter;
const ARCHIVE_DIR = passportPaths.archive;

const NAXML_NS = 'http://www.naxml.org/POSBO/Vocabulary/2003-10-16';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createBuilder() {
  return new Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '\t', newline: '\n' },
    headless: false
  });
}

function buildTransmissionHeader(storeId) {
  return {
    StoreLocationID: storeId || '1',
    VendorName: 'BackOffice',
    VendorModelVersion: '1.0'
  };
}

function writeXmlToFile(xmlObj, targetDir, filename) {
  ensureDir(targetDir);
  const builder = createBuilder();
  const xmlContent = builder.buildObject(xmlObj);
  const filePath = path.join(targetDir, filename);

  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, xmlContent, 'utf-8');
  fs.renameSync(tmpPath, filePath);

  return { filePath, filename };
}

function logSend(filename, fileType, count, status, extra) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO import_log (filename, file_type, records_imported, status, error_message)
      VALUES (?, ?, ?, ?, ?)
    `).run(filename, fileType, count, status, extra || null);
    saveDb();
  } catch (e) {
    console.error('Failed to log send:', e.message);
  }
}

// ─── ITT.xml: Item Maintenance (price changes, item add/update) ──────────────
function generateITTXml(items, options = {}) {
  const ittDetails = items.map(item => ({
    RecordAction: { $: { type: 'addchange' } },
    ItemCode: {
      POSCodeFormat: { $: { format: 'upcA' } },
      POSCode: String(item.upc || item.code || ''),
      POSCodeModifier: { $: { name: (item.pos_code_modifier_name || '0') + '-Pack' }, _: String(item.pos_code_modifier || '0') }
    },
    ITTData: {
      ActiveFlag: { $: { value: item.is_active !== false ? 'Yes' : 'No' } },
      MerchandiseCode: String(item.merchandise_code || item.department_id || '1'),
      RegularSellPrice: parseFloat(item.price || 0).toFixed(4),
      Description: (item.name || item.description || '').substring(0, 40),
      SellingUnits: parseFloat(item.selling_units || 1).toFixed(2),
      TaxStrategyId: String(item.tax_strategy_id || item.tax_level_id || '101'),
      DiscountableFlg: item.discountable !== false ? '1' : '0',
      FoodStampableFlg: item.food_stampable ? '1' : '0',
      SalesRestrictCode: String(item.sales_restrict_code || '1002')
    }
  }));

  return {
    'NAXML-MaintenanceRequest': {
      $: { version: '3.4' },
      ItemMaintenance: {
        TableAction: { $: { type: 'update' } },
        RecordAction: { $: { type: 'addchange' } },
        ITTDetail: ittDetails.length === 1 ? ittDetails[0] : ittDetails
      }
    }
  };
}

function generateMnfXml(attachedFiles) {
  return {
    FileList: {
      File: attachedFiles.length === 1 ? attachedFiles[0] : attachedFiles
    }
  };
}

function sendPriceChangesToPOS(items, options = {}) {
  if (!items || items.length === 0) {
    return { success: false, message: 'No items to send' };
  }

  const ts = Date.now();
  const ittFilename = `ITT${ts}.xml`;
  const mnfFilename = `MNF${ts}.xml`;

  const ittXml = generateITTXml(items, options);
  writeXmlToFile(ittXml, BOINBOX_PENDING, ittFilename);

  const mnfXml = generateMnfXml([ittFilename]);
  writeXmlToFile(mnfXml, BOINBOX_PENDING, mnfFilename);

  logSend(ittFilename, 'naxml_sent', items.length, 'success');

  return {
    success: true,
    message: `Sent ${items.length} item(s) to POS`,
    filename: ittFilename,
    itemCount: items.length
  };
}

// ─── ILT.xml: Item List Maintenance (promotional lists) ──────────────────────
function generateILTXml(itemList, options = {}) {
  const storeId = options.storeId || '1';
  const listId = options.listId || 'LIST' + Date.now();
  const listName = options.listName || 'Item List';

  const listItems = itemList.map(item => ({
    ListItem: {
      ItemCode: {
        POSCodeFormat: { $: { format: 'upcA' } },
        POSCode: String(item.upc || item.code || '').padStart(12, '0'),
        POSCodeModifier: String(item.pos_code_modifier || '0')
      },
      Description: (item.name || item.description || '').substring(0, 40),
      Price: parseFloat(item.price || 0).toFixed(2),
      Quantity: String(item.quantity || '1')
    }
  }));

  return {
    'NAXML-MaintenanceRequest': {
      $: { version: '3.4', xmlns: NAXML_NS },
      TransmissionHeader: buildTransmissionHeader(storeId),
      ItemListMaintenance: {
        TableAction: { $: { type: 'update' } },
        RecordAction: { $: { type: 'addchange' } },
        ListID: listId,
        ListName: listName,
        EffectiveDate: options.effectiveDate || new Date().toLocaleDateString('en-CA'),
        ExpirationDate: options.expirationDate || '',
        ILTDetail: listItems.length === 1 ? listItems[0] : listItems
      }
    }
  };
}

function sendItemListToPOS(itemList, options = {}) {
  if (!itemList || itemList.length === 0) {
    return { success: false, message: 'No items in list' };
  }

  const filename = 'ILT.xml';
  const xml = generateILTXml(itemList, options);
  const result = writeXmlToFile(xml, BOINBOX_PENDING, filename);

  logSend(filename, 'naxml_sent', itemList.length, 'success');

  return {
    success: true,
    message: `Sent ${itemList.length} item(s) in list via ILT.xml`,
    filename: result.filename,
    filePath: result.filePath
  };
}

// ─── CBT.xml: Combo Maintenance (combo/bundle promotions) ────────────────────
function generateCBTXml(combo, options = {}) {
  const storeId = options.storeId || '1';

  const comboItems = combo.items.map(item => ({
    ComboItem: {
      ItemCode: {
        POSCodeFormat: { $: { format: 'upcA' } },
        POSCode: String(item.upc || item.code || '').padStart(12, '0'),
        POSCodeModifier: String(item.pos_code_modifier || '0')
      },
      Description: (item.name || item.description || '').substring(0, 40),
      Quantity: String(item.quantity || '1')
    }
  }));

  return {
    'NAXML-MaintenanceRequest': {
      $: { version: '3.4', xmlns: NAXML_NS },
      TransmissionHeader: buildTransmissionHeader(storeId),
      ComboMaintenance: {
        TableAction: { $: { type: 'update' } },
        RecordAction: { $: { type: 'addchange' } },
        ComboID: combo.comboId || 'COMBO' + Date.now(),
        ComboName: combo.name || 'Combo Deal',
        EffectiveDate: options.effectiveDate || new Date().toLocaleDateString('en-CA'),
        ExpirationDate: options.expirationDate || '',
        ComboPrice: parseFloat(combo.comboPrice || 0).toFixed(2),
        CBTDetail: comboItems.length === 1 ? comboItems[0] : comboItems
      }
    }
  };
}

function sendComboToPOS(combo, options = {}) {
  const filename = 'CBT.xml';
  const xml = generateCBTXml(combo, options);
  const result = writeXmlToFile(xml, BOINBOX_PENDING, filename);

  logSend(filename, 'naxml_sent', combo.items.length, 'success');

  return {
    success: true,
    message: `Sent combo "${combo.name}" via CBT.xml`,
    filename: result.filename,
    filePath: result.filePath
  };
}

// ─── MMT.xml: Mix & Match Maintenance ────────────────────────────────────────
function generateMMTXml(promo, options = {}) {
  const storeId = options.storeId || '1';

  const mmItems = promo.items.map(item => ({
    MixMatchItem: {
      ItemCode: {
        POSCodeFormat: { $: { format: 'upcA' } },
        POSCode: String(item.upc || item.code || '').padStart(12, '0'),
        POSCodeModifier: String(item.pos_code_modifier || '0')
      },
      Description: (item.name || item.description || '').substring(0, 40)
    }
  }));

  return {
    'NAXML-MaintenanceRequest': {
      $: { version: '3.4', xmlns: NAXML_NS },
      TransmissionHeader: buildTransmissionHeader(storeId),
      MixMatchMaintenance: {
        TableAction: { $: { type: 'update' } },
        RecordAction: { $: { type: 'addchange' } },
        MixMatchID: promo.mixMatchId || 'MM' + Date.now(),
        MixMatchName: promo.name || 'Mix & Match',
        EffectiveDate: options.effectiveDate || new Date().toLocaleDateString('en-CA'),
        ExpirationDate: options.expirationDate || '',
        MixMatchType: promo.type || 'BuyXGetY',
        RequiredQuantity: String(promo.requiredQty || '2'),
        DiscountAmount: parseFloat(promo.discountAmount || 0).toFixed(2),
        DiscountType: promo.discountType || 'fixed',
        MMTDetail: mmItems.length === 1 ? mmItems[0] : mmItems
      }
    }
  };
}

function sendMixMatchToPOS(promo, options = {}) {
  const filename = 'MMT.xml';
  const xml = generateMMTXml(promo, options);
  const result = writeXmlToFile(xml, BOINBOX_PENDING, filename);

  logSend(filename, 'naxml_sent', promo.items.length, 'success');

  return {
    success: true,
    message: `Sent mix & match "${promo.name}" via MMT.xml`,
    filename: result.filename,
    filePath: result.filePath
  };
}

// ─── FGT.xml: Fuel Grade Transfer (fuel price changes) ──────────────────────
function generateFGTXml(fuelPrices, options = {}) {
  const storeId = options.storeId || '1';

  const fuelDetails = fuelPrices.map(fp => ({
    FuelGradeID: String(fp.fuel_grade_id || fp.grade_id || '1'),
    FuelPrice: parseFloat(fp.price || 0).toFixed(3),
    FuelPriceLevel: String(fp.price_level || '1'),
    PricingMode: String(fp.pricing_mode || '0')
  }));

  return {
    'NAXML-MaintenanceRequest': {
      $: { version: '3.4', xmlns: NAXML_NS },
      TransmissionHeader: buildTransmissionHeader(storeId),
      FuelGradeTransfer: {
        TableAction: { $: { type: 'update' } },
        RecordAction: { $: { type: 'addchange' } },
        FGTDetail: fuelDetails.length === 1 ? fuelDetails[0] : fuelDetails
      }
    }
  };
}

function sendFuelPricesToPOS(fuelPrices, options = {}) {
  if (!fuelPrices || fuelPrices.length === 0) {
    return { success: false, message: 'No fuel prices to send' };
  }

  const filename = 'FGT.xml';
  const xml = generateFGTXml(fuelPrices, options);
  const result = writeXmlToFile(xml, FUEL_INBOX_PENDING, filename);

  logSend(filename, 'naxml_fuel_sent', fuelPrices.length, 'success');

  return {
    success: true,
    message: `Sent ${fuelPrices.length} fuel price(s) via FGT.xml`,
    filename: result.filename,
    filePath: result.filePath
  };
}

// ─── MCT.xml: Merchandise Code Maintenance (department updates) ─────────────
function generateMCTXml(departments, options = {}) {
  const storeId = options.storeId || '1';

  const mctDetails = departments.map(dept => ({
    RecordAction: { $: { type: 'addchange' } },
    MerchandiseCode: String(dept.code || dept.id || '1'),
    MerchandiseCodeDescription: (dept.name || dept.description || '').substring(0, 40),
    MerchandiseCodeStatus: dept.is_active !== false ? 'Active' : 'Inactive'
  }));

  return {
    'NAXML-MaintenanceRequest': {
      $: { version: '3.4', xmlns: NAXML_NS },
      TransmissionHeader: buildTransmissionHeader(storeId),
      MerchandiseCodeMaintenance: {
        TableAction: { $: { type: 'update' } },
        RecordAction: { $: { type: 'addchange' } },
        MCTDetail: mctDetails.length === 1 ? mctDetails[0] : mctDetails
      }
    }
  };
}

function sendDepartmentsToPOS(departments, options = {}) {
  if (!departments || departments.length === 0) {
    return { success: false, message: 'No departments to send' };
  }

  const filename = 'MCT.xml';
  const xml = generateMCTXml(departments, options);
  const result = writeXmlToFile(xml, BOINBOX_PENDING, filename);

  logSend(filename, 'naxml_sent', departments.length, 'success');

  return {
    success: true,
    message: `Sent ${departments.length} department(s) via MCT.xml`,
    filename: result.filename,
    filePath: result.filePath
  };
}

// ─── ACK File Checking ──────────────────────────────────────────────────────
function checkAckFiles() {
  const results = { acks: [], deadLetters: [], errors: [] };

  if (!fs.existsSync(BOOUTBOX_DIR)) return results;

  const files = fs.readdirSync(BOOUTBOX_DIR);

  for (const file of files) {
    const upper = file.toUpperCase();
    const filePath = path.join(BOOUTBOX_DIR, file);

    if (upper.includes('ACK')) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const statusMatch = content.match(/<STATUSCODE>(.*?)<\/STATUSCODE>/);
        const messageMatch = content.match(/<STATUSMESSAGE>(.*?)<\/STATUSMESSAGE>/);
        results.acks.push({
          filename: file,
          status: statusMatch ? statusMatch[1] : 'Unknown',
          message: messageMatch ? messageMatch[1] : '',
          rawContent: content.substring(0, 500)
        });
      } catch (e) {
        results.errors.push({ filename: file, error: e.message });
      }
    }
  }

  if (fs.existsSync(DEAD_LETTER_DIR)) {
    const deadFiles = fs.readdirSync(DEAD_LETTER_DIR);
    for (const file of deadFiles) {
      if (file.endsWith('.xml')) {
        try {
          const content = fs.readFileSync(path.join(DEAD_LETTER_DIR, file), 'utf-8');
          const actionMatch = content.match(/<ACTION>(.*?)<\/ACTION>/);
          const messageMatch = content.match(/<MESSAGE>(.*?)<\/MESSAGE>/);
          const fileMatch = content.match(/<FILE>(.*?)<\/FILE>/);
          results.deadLetters.push({
            filename: file,
            action: actionMatch ? actionMatch[1] : '',
            message: messageMatch ? messageMatch[1] : '',
            sourceFile: fileMatch ? fileMatch[1] : ''
          });
        } catch (e) {
          results.errors.push({ filename: file, error: e.message });
        }
      }
    }
  }

  return results;
}

// ─── Pending Price Changes (from DB) ────────────────────────────────────────
function getPendingPriceChanges() {
  const db = getDb();
  const lastSync = db.prepare('SELECT MAX(last_sync_at) as ts FROM pos_sync_log').get();
  const since = lastSync && lastSync.ts ? lastSync.ts : '1970-01-01';

  // Get all items modified since last sync
  const items = db.prepare(`
    SELECT pb.*, d.name as department, tr.name as tax_rate_name, tr.rate as tax_rate,
           pb.price as new_price
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    LEFT JOIN tax_rates tr ON pb.tax_rate_id = tr.id
    WHERE pb.last_updated > ?
    ORDER BY pb.last_updated DESC
    LIMIT 500
  `).all(since);

  // Also get price history for old/new price display
  const itemsWithHistory = items.map(item => {
    const ph = db.prepare('SELECT old_price, new_price FROM price_history WHERE pricebook_id = ? ORDER BY changed_at DESC LIMIT 1').get(item.id);
    return {
      ...item,
      old_price: ph ? ph.old_price : item.price,
      new_price: ph ? ph.new_price : item.price,
      changed_at: item.last_updated
    };
  });

  return itemsWithHistory;
}

function getSendHistory() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM import_log
    WHERE file_type LIKE 'naxml%'
    ORDER BY imported_at DESC
    LIMIT 50
  `).all();
}

function sendAllPendingChanges(options = {}) {
  const pending = getPendingPriceChanges();
  if (pending.length === 0) {
    return { success: true, message: 'No pending changes to send', sent: 0 };
  }
  const result = sendPriceChangesToPOS(pending, options);
  if (result.success) {
    const db = getDb();
    db.prepare('INSERT INTO pos_sync_log (last_sync_at) VALUES (CURRENT_TIMESTAMP)').run();
  }
  return result;
}

function sendGroupPricesToPOS(groupId, options = {}) {
  const db = getDb();
  const items = db.prepare(`
    SELECT pb.*, d.name as department_name
    FROM group_items gi
    JOIN pricebook pb ON gi.pricebook_id = pb.id
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE gi.group_id = ?
  `).all(groupId);

  if (items.length === 0) {
    return { success: false, message: 'No items in group' };
  }
  return sendPriceChangesToPOS(items, options);
}

// ─── Scheduled Price Changes ────────────────────────────────────────────────
function applyScheduledPriceChanges() {
  const db = getDb();
  const now = new Date().toISOString();

  const due = db.prepare(`
    SELECT spc.*, pb.upc, pb.name, pb.cost, pb.department_id
    FROM scheduled_price_changes spc
    JOIN pricebook pb ON spc.pricebook_id = pb.id
    WHERE spc.effective_date <= ? AND spc.status = 'pending'
    ORDER BY spc.effective_date ASC
  `).all(now);

  if (due.length === 0) {
    return { success: true, message: 'No scheduled changes due', applied: 0 };
  }

  const updateStmt = db.prepare('UPDATE pricebook SET price = ? WHERE id = ?');
  const statusStmt = db.prepare('UPDATE scheduled_price_changes SET status = ? WHERE id = ?');
  const historyStmt = db.prepare(`
    INSERT INTO price_history (pricebook_id, old_price, new_price, changed_by, change_reason)
    VALUES (?, ?, ?, ?, ?)
  `);

  const itemsToSend = [];

  const applyAll = db.transaction(() => {
    for (const change of due) {
      const oldPrice = db.prepare('SELECT price FROM pricebook WHERE id = ?').get(change.pricebook_id);
      const oldVal = oldPrice ? oldPrice.price : 0;

      updateStmt.run(change.new_price, change.pricebook_id);
      statusStmt.run('applied', change.id);
      historyStmt.run(change.pricebook_id, oldVal, change.new_price, 'scheduled', 'Scheduled price change');

      itemsToSend.push({
        upc: change.upc,
        name: change.name,
        cost: change.cost,
        price: change.new_price,
        department_id: change.department_id,
        merchandise_code: change.merchandise_code
      });
    }
  });

  applyAll();

  if (itemsToSend.length > 0) {
    const result = sendPriceChangesToPOS(itemsToSend);
    return {
      success: true,
      message: `Applied ${itemsToSend.length} scheduled price change(s) and sent to POS`,
      applied: itemsToSend.length,
      sendResult: result
    };
  }

  return { success: true, message: `Applied ${itemsToSend.length} scheduled changes`, applied: itemsToSend.length };
}

module.exports = {
  sendPriceChangesToPOS,
  sendItemListToPOS,
  sendComboToPOS,
  sendMixMatchToPOS,
  sendFuelPricesToPOS,
  sendDepartmentsToPOS,
  checkAckFiles,
  getPendingPriceChanges,
  getSendHistory,
  sendAllPendingChanges,
  sendGroupPricesToPOS,
  applyScheduledPriceChanges,
  generateITTXml,
  generateILTXml,
  generateCBTXml,
  generateMMTXml,
  generateFGTXml,
  generateMCTXml,
  BOINBOX_PENDING,
  BOOUTBOX_DIR,
  FUEL_INBOX_PENDING,
  FUEL_OUTBOX_DIR,
  DEAD_LETTER_DIR
};
