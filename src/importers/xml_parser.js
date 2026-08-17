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

// Unwraps NAXML "mixed content" fields: an element with BOTH an attribute and text,
// e.g. <TransactionTotalGrandAmount direction="Collected">30.01</TransactionTotalGrandAmount>
// or <PromotionID type="10000001">Savings</PromotionID>.
// With charkey: '_', xml2js can't collapse these to a plain string -- it returns
// { direction: "Collected", _: "30.01" } instead. Left unwrapped, parseFloat() on that
// object silently returns NaN (masked by `|| 0` fallbacks throughout this file), and
// passing the raw object into a DB bind parameter throws at insert time (better-sqlite3
// rejects object params), silently dropping the whole transaction in the per-tx catch block.
// Plain fields with no attribute (the common case) pass through unchanged.
function textVal(field) {
  if (field && typeof field === 'object' && !Array.isArray(field) && '_' in field) {
    return field._;
  }
  return field;
}

// Detects RestrictedSalesDetail > CustomerID > CashierBypassedFlag="yes" on an age/ID-restricted
// item (e.g. tobacco). This block only appears on lines that actually triggered a restriction
// check -- normal items carry a benign SalesRestrictFlag="no" instead. Returns a loss-prevention
// event object, or null if no bypass occurred (or no restriction applied at all).
function checkAgeVerificationBypass(sourceLine, description, merchandiseCode) {
  const detail = sourceLine && sourceLine.RestrictedSalesDetail;
  const customerId = detail && detail.CustomerID;
  if (!customerId) return null;
  const flag = customerId.CashierBypassedFlag;
  const bypassed = flag && (flag.value === 'yes' || flag === 'yes');
  if (!bypassed) return null;
  const birthDate = textVal(customerId.BirthDate) || '';
  return {
    event_type: 'age_verification_bypassed',
    severity: 'warning',
    description: `Cashier bypassed age/ID verification for "${description || 'restricted item'}"` +
      (merchandiseCode ? ` (dept ${merchandiseCode})` : '') +
      (birthDate ? ` -- customer birth date on file: ${birthDate}` : ' -- no birth date on file'),
    amount: 0
  };
}

function normalizeUpc(upc) {
  if (!upc) return '00000000000';
  let str = String(upc).trim();
  if (str.length <= 11) {
    return str.padStart(11, '0');
  }
  if (str.length === 12 && str.startsWith('0')) {
    return str.substring(1, 12);
  }
  return str;
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

  let saleEvents = [];
  for (const key in report) {
    if (key.endsWith('Event')) {
      const events = Array.isArray(report[key]) ? report[key] : [report[key]];
      saleEvents = saleEvents.concat(events);
    }
  }
  
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
      is_voided: 0,
      gross_amount: 0,
      net_amount: 0,
      tax_amount: 0,
      total_amount: 0
    };

    const detailGroup = event.TransactionDetailGroup || {};
    const lines = Array.isArray(detailGroup.TransactionLine) ? detailGroup.TransactionLine : [detailGroup.TransactionLine];
    const items = [];
    const payments = [];
    const lossPreventionEvents = [];

    for (const line of lines) {
      if (!line) continue;

      if (line.FuelLine) {
        const fuel = line.FuelLine;
        const promo = fuel.Promotion || {};
        const isVoid = fuel.VoidFlag && (fuel.VoidFlag.value === 'yes' || fuel.VoidFlag === 'yes') || (line.status === 'voided');
        if (isVoid) tx.is_voided = 1;
        // Any non-'normal' status (voided, cancel, or any future value) means this line
        // should NOT count toward sales totals -- e.g. a fuel prepay placeholder gets
        // status="cancel" once superseded by the real FuelLine fulfillment. Without this,
        // the cancelled placeholder and the real fuel line both count, doubling the total.
        const isExcluded = isVoid || (line.status !== 'normal');
        const isReturn = fuel.ReturnFlag && (fuel.ReturnFlag.value === 'yes' || fuel.ReturnFlag === 'yes');
        let multiplier = 1;
        if (isExcluded) multiplier = 0;
        else if (isReturn) multiplier = -1;

        if (multiplier !== 0) {
          items.push({
            item_type: 'fuel',
            upc: normalizeUpc(textVal(fuel.MerchandiseCode)),
            description: textVal(fuel.Description) || 'FUEL',
            merchandise_code: textVal(fuel.MerchandiseCode) || '1024',
            quantity: (parseFloat(textVal(fuel.SalesQuantity)) || 0) * multiplier,
            unit_price: parseFloat(textVal(fuel.ActualSalesPrice)) || 0,
            total_amount: (parseFloat(textVal(fuel.SalesAmount)) || 0) * multiplier,
            tax_level_id: fuel.ItemTax ? (textVal(fuel.ItemTax.TaxLevelID) || '') : '',
            fuel_grade_id: textVal(fuel.FuelGradeID) || '',
            fuel_position_id: textVal(fuel.FuelPositionID) || '',
            price_tier_code: textVal(fuel.PriceTierCode) || '',
            service_level: textVal(fuel.ServiceLevelCode) || '',
            promotion_id: textVal(promo.PromotionID) || '',
            promotion_reason: textVal(promo.PromotionReason) || '',
            promotion_amount: (parseFloat(textVal(promo.PromotionAmount)) || 0) * multiplier,
            regular_price: parseFloat(textVal(fuel.RegularSellPrice)) || 0
          });
        }
      } else if (line.FuelPrepayLine) {
        const prepay = line.FuelPrepayLine;
        const isVoid = prepay.VoidFlag && (prepay.VoidFlag.value === 'yes' || prepay.VoidFlag === 'yes') || (line.status === 'voided');
        if (isVoid) tx.is_voided = 1;
        const isExcluded = isVoid || (line.status !== 'normal');
        const isReturn = prepay.ReturnFlag && (prepay.ReturnFlag.value === 'yes' || prepay.ReturnFlag === 'yes');
        let multiplier = 1;
        if (isExcluded) multiplier = 0;
        else if (isReturn) multiplier = -1;

        if (multiplier !== 0) {
          const posId = textVal(prepay.FuelPositionID) || '';
          items.push({
            item_type: 'fuel',
            upc: '00000000000',
            description: posId ? `FUEL PREPAY (Pump ${posId})` : 'FUEL PREPAY',
            merchandise_code: textVal(prepay.MerchandiseCode) || '1024',
            quantity: 0,
            unit_price: 0,
            total_amount: (parseFloat(textVal(prepay.SalesAmount)) || 0) * multiplier,
            tax_level_id: prepay.ItemTax ? (textVal(prepay.ItemTax.TaxLevelID) || '') : '',
            fuel_grade_id: textVal(prepay.FuelGradeID) || '',
            fuel_position_id: posId,
            price_tier_code: '',
            service_level: '',
            promotion_id: '',
            promotion_reason: '',
            promotion_amount: 0,
            regular_price: 0
          });
        }
      } else if (line.MerchandiseCodeLine) {
        const merch = line.MerchandiseCodeLine;
        const isVoid = merch.VoidFlag && (merch.VoidFlag.value === 'yes' || merch.VoidFlag === 'yes') || (line.status === 'voided');
        if (isVoid) tx.is_voided = 1;
        const isExcluded = isVoid || (line.status !== 'normal');
        const isReturn = merch.ReturnFlag && (merch.ReturnFlag.value === 'yes' || merch.ReturnFlag === 'yes');
        let multiplier = 1;
        if (isExcluded) multiplier = 0;
        else if (isReturn) multiplier = -1;

        if (multiplier !== 0) {
          const merchCode = textVal(merch.MerchandiseCode) || '';
          const rawQty = parseFloat(textVal(merch.SalesQuantity)) || 1;
          const rawAmt = parseFloat(textVal(merch.SalesAmount)) || 0;
          // ActualSalesPrice can represent the EXTENDED total rather than a true per-unit
          // price on multi-quantity lines (e.g. a "2 for $1.78" ring where ActualSalesPrice
          // equals SalesAmount, not the $0.89 unit price). SalesAmount/SalesQuantity is
          // unambiguous and matches RegularSellPrice in that case -- use it as primary.
          const unitPrice = rawQty !== 0 ? (rawAmt / rawQty) : (parseFloat(textVal(merch.ActualSalesPrice)) || 0);
          items.push({
            item_type: 'cstore',
            upc: normalizeUpc(merchCode),
            description: textVal(merch.Description) || (merchCode ? `Dept ${merchCode}` : 'Open Sale'),
            merchandise_code: merchCode,
            quantity: rawQty * multiplier,
            unit_price: unitPrice,
            total_amount: rawAmt * multiplier,
            tax_level_id: merch.ItemTax ? (textVal(merch.ItemTax.TaxLevelID) || '') : '',
            fuel_grade_id: '',
            fuel_position_id: '',
            price_tier_code: '',
            service_level: '',
            promotion_id: '',
            promotion_reason: '',
            promotion_amount: 0,
            regular_price: parseFloat(textVal(merch.RegularSellPrice)) || 0
          });
          const bypassEvent = checkAgeVerificationBypass(merch, textVal(merch.Description), merchCode);
          if (bypassEvent) lossPreventionEvents.push(bypassEvent);
        }
      } else if (line.ItemLine) {
        const item = line.ItemLine;
        const code = item.ItemCode || {};
        const isVoid = item.VoidFlag && (item.VoidFlag.value === 'yes' || item.VoidFlag === 'yes') || (line.status === 'voided');
        if (isVoid) tx.is_voided = 1;
        const isExcluded = isVoid || (line.status !== 'normal');
        const isReturn = item.ReturnFlag && (item.ReturnFlag.value === 'yes' || item.ReturnFlag === 'yes');
        let multiplier = 1;
        if (isExcluded) multiplier = 0;
        else if (isReturn) multiplier = -1;

        if (multiplier !== 0) {
          const rawQty = parseFloat(textVal(item.SalesQuantity)) || 0;
          const rawAmt = parseFloat(textVal(item.SalesAmount)) || 0;
          const unitPrice = rawQty !== 0 ? (rawAmt / rawQty) : (parseFloat(textVal(item.ActualSalesPrice)) || 0);
          items.push({
            item_type: 'cstore',
            upc: normalizeUpc(textVal(code.POSCode)),
            description: textVal(item.Description) || '',
            merchandise_code: textVal(item.MerchandiseCode) || '',
            quantity: rawQty * multiplier,
            unit_price: unitPrice,
            total_amount: rawAmt * multiplier,
            tax_level_id: item.ItemTax ? (textVal(item.ItemTax.TaxLevelID) || '') : '',
            fuel_grade_id: '',
            fuel_position_id: '',
            price_tier_code: '',
            service_level: '',
            promotion_id: '',
            promotion_reason: '',
            promotion_amount: 0,
            regular_price: parseFloat(textVal(item.RegularSellPrice)) || 0
          });
          const bypassEvent = checkAgeVerificationBypass(item, textVal(item.Description), textVal(item.MerchandiseCode));
          if (bypassEvent) lossPreventionEvents.push(bypassEvent);
        }
      } else if (line.TenderInfo) {
        const tender = line.TenderInfo;
        const auth = tender.Authorization || {};
        const tenderCode = tender.Tender ? (textVal(tender.Tender.TenderCode) || '') : '';
        const tenderSubCode = tender.Tender ? (textVal(tender.Tender.TenderSubCode) || '') : '';
        
        // Determine outside sale from tender type
        if (tenderCode === 'outsideCredit' || tenderCode === 'outsideDebit' || 
            tenderSubCode === 'outsideCredit' || tenderSubCode === 'outsideDebit') {
          tx.is_outside_sale = 1;
        }

        payments.push({
          tender_code: tenderCode,
          tender_sub_code: tenderSubCode,
          amount: parseFloat(textVal(tender.TenderAmount)) || 0,
          authorization_code: textVal(auth.ApprovalReferenceCode) || '',
          provider_id: textVal(auth.ProviderID) || '',
          reference_number: textVal(auth.ReferenceNumber) || '',
          auth_date: textVal(auth.AuthorizationDate) || '',
          auth_time: textVal(auth.AuthorizationTime) || ''
        });
      } else if (line.TransactionTax) {
        // Sum across all TransactionTax lines -- a transaction can have one per
        // distinct tax level (e.g. a taxable snack + fuel in the same sale), and
        // overwriting here would silently drop every tax line but the last.
        tx.tax_amount = (tx.tax_amount || 0) + (parseFloat(textVal(line.TransactionTax.TaxCollectedAmount)) || 0);
      }
    }

    if (event.TransactionSummary) {
      const summary = event.TransactionSummary;
      tx.gross_amount = parseFloat(textVal(summary.TransactionTotalGrossAmount)) || 0;
      tx.net_amount = parseFloat(textVal(summary.TransactionTotalNetAmount)) || 0;
      tx.total_amount = parseFloat(textVal(summary.TransactionTotalGrandAmount)) || 0;
      if (!tx.tax_amount) {
        tx.tax_amount = parseFloat(textVal(summary.TransactionTotalTaxNetAmount)) || 0;
      }
    }

    // Filter out transactions with no actual items or payments after void processing
    if (items.length > 0 || payments.length > 0) {
      transactions.push({ tx, items, payments, lossPreventionEvents });
    }
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
      INSERT OR IGNORE INTO transactions (store_id, transaction_id, cashier_id, register_id, till_id, business_date, event_date, event_time, gross_amount, net_amount, tax_amount, total_amount, is_outside_sale, is_training, is_voided, source_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO transaction_items (transaction_id, item_type, upc, description, merchandise_code, quantity, unit_price, total_amount, tax_level_id, tax_amount, fuel_grade_id, fuel_position_id, price_tier_code, service_level, promotion_id, promotion_reason, promotion_amount, regular_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPayment = db.prepare(`
      INSERT INTO payments (transaction_id, tender_code, tender_sub_code, amount, authorization_code, provider_id, reference_number, auth_date, auth_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLossEvent = db.prepare(`
      INSERT INTO loss_prevention_events (event_type, severity, cashier_id, register_id, description, amount, transaction_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const importAll = db.transaction(() => {
      for (const { tx, items, payments, lossPreventionEvents } of transactions) {
        try {
          const result = insertTx.run(
            tx.store_id, tx.transaction_id, tx.cashier_id, tx.register_id, tx.till_id,
            tx.business_date, tx.event_date, tx.event_time,
            tx.gross_amount, tx.net_amount, tx.tax_amount, tx.total_amount,
            tx.is_outside_sale, tx.is_training, tx.is_voided, filename
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
            db.prepare('DELETE FROM loss_prevention_events WHERE transaction_id = ?').run(txId);
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

            for (const lossEvent of (lossPreventionEvents || [])) {
              insertLossEvent.run(lossEvent.event_type, lossEvent.severity, tx.cashier_id, tx.register_id,
                lossEvent.description, lossEvent.amount || 0, txId);
            }

            importedCount++;
          }
        } catch (txError) {
          console.error('Transaction import error:', txError.stack || txError.message);
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
