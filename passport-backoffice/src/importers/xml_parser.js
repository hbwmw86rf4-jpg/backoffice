const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { getDb, saveDb } = require('../database/schema');

const parser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  attrkey: '$',
  charkey: '_'
});

function normalizeUpc(upc) {
  if (!upc) return '';
  return String(upc).trim().replace(/^0+/, '').padStart(1, '0');
}

function parseNAXML(xmlContent) {
  return parser.parseStringPromise(xmlContent);
}

function extractTransactionData(parsed) {
  const journal = parsed['NAXML-POSJournal'];
  if (!journal) return null;

  const header = journal.TransmissionHeader || {};
  const report = journal.JournalReport || {};
  const journalHeader = report.JournalHeader || {};

  const saleEvents = Array.isArray(report.SaleEvent) ? report.SaleEvent : [report.SaleEvent];
  const transactions = [];

  for (const event of saleEvents) {
    if (!event) continue;

    const tx = {
      store_id: header.StoreLocationID || '1',
      transaction_id: event.TransactionID || '',
      cashier_id: event.CashierID || '',
      register_id: event.RegisterID || '',
      till_id: event.TillID || '',
      business_date: event.BusinessDate || journalHeader.BeginDate || '',
      event_date: event.EventStartDate || '',
      event_time: event.EventStartTime || '',
      is_outside_sale: event.OutsideSalesFlag && event.OutsideSalesFlag.value === 'yes' ? 1 : 0,
      is_training: event.TrainingModeFlag && event.TrainingModeFlag.value === 'yes' ? 1 : 0,
      gross_amount: 0,
      net_amount: 0,
      tax_amount: 0,
      total_amount: 0
    };

    const detailGroup = event.TransactionDetailGroup || {};
    const lines = Array.isArray(detailGroup.TransactionLine) ? detailGroup.TransactionLine : [detailGroup.TransactionLine];
    const items = [];
    const payments = [];

    for (const line of lines) {
      if (!line) continue;

      if (line.FuelLine) {
        const fuel = line.FuelLine;
        const promo = fuel.Promotion || {};
        items.push({
          item_type: 'fuel',
          upc: normalizeUpc(fuel.MerchandiseCode),
          description: fuel.Description || '',
          merchandise_code: fuel.MerchandiseCode || '',
          quantity: parseFloat(fuel.SalesQuantity) || 0,
          unit_price: parseFloat(fuel.ActualSalesPrice) || 0,
          total_amount: parseFloat(fuel.SalesAmount) || 0,
          tax_level_id: fuel.ItemTax ? (fuel.ItemTax.TaxLevelID || '') : '',
          fuel_grade_id: fuel.FuelGradeID || '',
          fuel_position_id: fuel.FuelPositionID || '',
          price_tier_code: fuel.PriceTierCode || '',
          service_level: fuel.ServiceLevelCode || '',
          promotion_id: promo.PromotionID || '',
          promotion_reason: promo.PromotionReason || '',
          promotion_amount: parseFloat(promo.PromotionAmount) || 0,
          regular_price: parseFloat(fuel.RegularSellPrice) || 0
        });
      } else if (line.ItemLine) {
        const item = line.ItemLine;
        const code = item.ItemCode || {};
        items.push({
          item_type: 'cstore',
          upc: normalizeUpc(code.POSCode),
          description: item.Description || '',
          merchandise_code: item.MerchandiseCode || '',
          quantity: parseFloat(item.SalesQuantity) || 0,
          unit_price: parseFloat(item.ActualSalesPrice) || 0,
          total_amount: parseFloat(item.SalesAmount) || 0,
          tax_level_id: item.ItemTax ? (item.ItemTax.TaxLevelID || '') : '',
          fuel_grade_id: '',
          fuel_position_id: '',
          price_tier_code: '',
          service_level: '',
          promotion_id: '',
          promotion_reason: '',
          promotion_amount: 0,
          regular_price: parseFloat(item.RegularSellPrice) || 0
        });
      } else if (line.TenderInfo) {
        const tender = line.TenderInfo;
        const auth = tender.Authorization || {};
        payments.push({
          tender_code: tender.Tender ? (tender.Tender.TenderCode || '') : '',
          tender_sub_code: tender.Tender ? (tender.Tender.TenderSubCode || '') : '',
          amount: parseFloat(tender.TenderAmount) || 0,
          authorization_code: auth.ApprovalReferenceCode || '',
          provider_id: auth.ProviderID || '',
          reference_number: auth.ReferenceNumber || '',
          auth_date: auth.AuthorizationDate || '',
          auth_time: auth.AuthorizationTime || ''
        });
      } else if (line.TransactionTax) {
        tx.tax_amount = parseFloat(line.TransactionTax.TaxCollectedAmount) || 0;
      }
    }

    if (event.TransactionSummary) {
      const summary = event.TransactionSummary;
      tx.gross_amount = parseFloat(summary.TransactionTotalGrossAmount) || 0;
      tx.net_amount = parseFloat(summary.TransactionTotalNetAmount) || 0;
      tx.total_amount = parseFloat(summary.TransactionTotalGrandAmount) || 0;
      if (!tx.tax_amount) {
        tx.tax_amount = parseFloat(summary.TransactionTotalTaxNetAmount) || 0;
      }
    }

    transactions.push({ tx, items, payments });
  }

  return transactions;
}

async function importXmlFile(filePath) {
  const db = getDb();
  const filename = path.basename(filePath);

  try {
    const existing = db.prepare('SELECT id FROM import_log WHERE filename = ? AND status = ?').get(filename, 'success');
    if (existing) {
      console.log(`Skipping ${filename} - already imported`);
      return { status: 'skipped', message: 'Already imported' };
    }

    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = await parseNAXML(xmlContent);
    const transactions = extractTransactionData(parsed);

    if (!transactions || transactions.length === 0) {
      db.prepare('INSERT INTO import_log (filename, file_type, status, error_message) VALUES (?, ?, ?, ?)').run(filename, 'naxml', 'error', 'No transactions found');
      saveDb();
      return { status: 'error', message: 'No transactions found' };
    }

    let importedCount = 0;

    const insertTx = db.prepare(`
      INSERT OR IGNORE INTO transactions (store_id, transaction_id, cashier_id, register_id, till_id, business_date, event_date, event_time, gross_amount, net_amount, tax_amount, total_amount, is_outside_sale, is_training, source_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO transaction_items (transaction_id, item_type, upc, description, merchandise_code, quantity, unit_price, total_amount, tax_level_id, tax_amount, fuel_grade_id, fuel_position_id, price_tier_code, service_level, promotion_id, promotion_reason, promotion_amount, regular_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPayment = db.prepare(`
      INSERT INTO payments (transaction_id, tender_code, tender_sub_code, amount, authorization_code, provider_id, reference_number, auth_date, auth_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const importAll = db.transaction(() => {
      for (const { tx, items, payments } of transactions) {
        try {
          const result = insertTx.run(
            tx.store_id, tx.transaction_id, tx.cashier_id, tx.register_id, tx.till_id,
            tx.business_date, tx.event_date, tx.event_time,
            tx.gross_amount, tx.net_amount, tx.tax_amount, tx.total_amount,
            tx.is_outside_sale, tx.is_training, filename
          );

          let txId = result.lastInsertRowid;
          if (!txId) {
            const existing = db.prepare('SELECT id FROM transactions WHERE register_id = ? AND transaction_id = ? AND business_date = ?').get(tx.register_id, tx.transaction_id, tx.business_date);
            if (existing) {
              txId = existing.id;
            }
          }

          if (txId) {
            db.prepare('DELETE FROM transaction_items WHERE transaction_id = ?').run(txId);
            db.prepare('DELETE FROM payments WHERE transaction_id = ?').run(txId);
            for (const item of items) {
              insertItem.run(txId, item.item_type, item.upc, item.description, item.merchandise_code,
                item.quantity, item.unit_price, item.total_amount,
                item.tax_level_id, item.tax_amount || 0,
                item.fuel_grade_id, item.fuel_position_id, item.price_tier_code,
                item.service_level, item.promotion_id, item.promotion_reason,
                item.promotion_amount, item.regular_price);
            }

            for (const payment of payments) {
              insertPayment.run(txId, payment.tender_code, payment.tender_sub_code, payment.amount,
                payment.authorization_code, payment.provider_id, payment.reference_number,
                payment.auth_date, payment.auth_time);
            }

            importedCount++;
          }
        } catch (txError) {
          console.error('Transaction import error:', txError.message);
        }
      }
    });

    importAll();

    db.prepare('INSERT INTO import_log (filename, file_type, records_imported, status) VALUES (?, ?, ?, ?)').run(filename, 'naxml', importedCount, 'success');
    saveDb();
    console.log(`Imported ${importedCount} transactions from ${filename}`);
    return { status: 'success', recordsImported: importedCount };
  } catch (error) {
    console.error(`Error importing ${filename}:`, error.message);
    try {
      db.prepare('INSERT INTO import_log (filename, file_type, status, error_message) VALUES (?, ?, ?, ?)').run(filename, 'naxml', 'error', error.message);
      saveDb();
    } catch (e) { }
    return { status: 'error', message: error.message };
  }
}

async function importAllXmlFiles(directory) {
  const files = fs.readdirSync(directory).filter(f => f.endsWith('.xml'));
  let totalImported = 0;

  for (const file of files) {
    const filePath = path.join(directory, file);
    const result = await importXmlFile(filePath);
    if (result.status === 'success') {
      totalImported += result.recordsImported;
    }
  }

  return { totalFiles: files.length, totalImported };
}

module.exports = { parseNAXML, extractTransactionData, importXmlFile, importAllXmlFiles };
