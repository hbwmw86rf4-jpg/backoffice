const { getDb, saveDb } = require('./schema');

// Daily Book
function getDailyBook(date) {
  const db = getDb();
  return db.prepare('SELECT * FROM daily_book WHERE book_date = ?').get(date);
}

function createDailyBook(date) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM daily_book WHERE book_date = ?').get(date);
  if (existing) return existing;
  const sales = db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions WHERE business_date = ? AND is_voided = 0 AND is_training = 0').get(date);
  const fuelSales = db.prepare(`
    SELECT COALESCE(SUM(ti.total_amount), 0) as total
    FROM transaction_items ti JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = ? AND ti.item_type = 'fuel' AND t.is_voided = 0 AND t.is_training = 0
  `).get(date);
  const cstoreSales = db.prepare(`
    SELECT COALESCE(SUM(ti.total_amount), 0) as total
    FROM transaction_items ti JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = ? AND ti.item_type = 'cstore' AND t.is_voided = 0 AND t.is_training = 0
  `).get(date);
  const tax = db.prepare('SELECT COALESCE(SUM(tax_amount), 0) as total FROM transactions WHERE business_date = ? AND is_voided = 0 AND is_training = 0').get(date);
  const payments = db.prepare(`
    SELECT COALESCE(SUM(p.amount), 0) as total
    FROM payments p JOIN transactions t ON p.transaction_id = t.id
    WHERE t.business_date = ? AND t.is_voided = 0 AND t.is_training = 0
  `).get(date);
  const paidIn = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'paid_in'").get(date);
  const paidOut = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'paid_out'").get(date);
  const safeDrops = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'safe_drop'").get(date);

  const result = db.prepare(`
    INSERT INTO daily_book (book_date, total_sales, total_fuel_sales, total_cstore_sales, total_tax, total_payments, paid_in, paid_out, safe_drops)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(date, sales.total, fuelSales.total, cstoreSales.total, tax.total, payments.total, paidIn.total, paidOut.total, safeDrops.total);
  saveDb();
  return db.prepare('SELECT * FROM daily_book WHERE id = ?').get(result.lastInsertRowid);
}

function closeDailyBook(date, closingCash, closedBy) {
  const db = getDb();
  const book = db.prepare('SELECT * FROM daily_book WHERE book_date = ?').get(date);
  if (!book) return { error: 'No daily book found' };
  const expectedCash = (book.total_sales - book.total_payments) + book.paid_in - book.paid_out - book.safe_drops;
  const variance = closingCash - expectedCash;
  db.prepare(`
    UPDATE daily_book SET closing_cash = ?, expected_cash = ?, cash_variance = ?, status = 'closed', closed_by = ?, closed_at = datetime('now')
    WHERE book_date = ?
  `).run(closingCash, expectedCash, variance, closedBy, date);
  saveDb();
  return db.prepare('SELECT * FROM daily_book WHERE book_date = ?').get(date);
}

function getXReport(date) {
  const db = getDb();
  const sales = db.prepare('SELECT COUNT(*) as transactions, COALESCE(SUM(total_amount), 0) as total, COALESCE(SUM(gross_amount), 0) as gross, COALESCE(SUM(tax_amount), 0) as tax FROM transactions WHERE business_date = ? AND is_voided = 0 AND is_training = 0').get(date);
  const payments = db.prepare("SELECT tender_code, COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments p JOIN transactions t ON p.transaction_id = t.id WHERE t.business_date = ? AND t.is_voided = 0 AND t.is_training = 0 GROUP BY tender_code ORDER BY total DESC").all(date);
  const cash = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments p JOIN transactions t ON p.transaction_id = t.id WHERE t.business_date = ? AND p.tender_code = 'cash' AND t.is_voided = 0 AND t.is_training = 0").get(date);
  return { date, sales, payments, cashCollected: cash.total };
}

function getZReport(date) {
  const xReport = getXReport(date);
  const book = getDailyBook(date);
  return { ...xReport, book };
}

// Cash Control
function addCashMovement(movement) {
  const db = getDb();
  const result = db.prepare('INSERT INTO cash_movements (movement_date, movement_type, amount, reason, register_id, cashier_id) VALUES (?, ?, ?, ?, ?, ?)').run(movement.movement_date, movement.movement_type, movement.amount, movement.reason, movement.register_id, movement.cashier_id);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getCashMovements(startDate, endDate, type) {
  const db = getDb();
  let sql = 'SELECT * FROM cash_movements WHERE movement_date BETWEEN ? AND ?';
  const params = [startDate, endDate];
  if (type) { sql += ' AND movement_type = ?'; params.push(type); }
  sql += ' ORDER BY movement_date DESC, created_at DESC';
  return db.prepare(sql).all(...params);
}

function getCashSummary(date) {
  const db = getDb();
  const sales = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments p JOIN transactions t ON p.transaction_id = t.id WHERE t.business_date = ? AND p.tender_code = 'cash' AND t.is_voided = 0 AND t.is_training = 0").get(date);
  const paidIn = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'paid_in'").get(date);
  const paidOut = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'paid_out'").get(date);
  const safeDrops = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'safe_drop'").get(date);
  const deposits = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE movement_date = ? AND movement_type = 'deposit'").get(date);
  return { date, cashSales: sales.total, paidIn: paidIn.total, paidOut: paidOut.total, safeDrops: safeDrops.total, deposits: deposits.total, expectedInDrawer: sales.total + paidIn.total - paidOut.total - safeDrops.total };
}

function addPaymentHandover(handover) {
  const db = getDb();
  const result = db.prepare('INSERT INTO payment_handovers (handover_date, from_cashier, to_cashier, register_id, till_id, cash_amount, card_amount, total_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(handover.handover_date, handover.from_cashier, handover.to_cashier, handover.register_id, handover.till_id, handover.cash_amount, handover.card_amount, (handover.cash_amount || 0) + (handover.card_amount || 0), handover.notes);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getPaymentHandovers(date) {
  const db = getDb();
  return db.prepare('SELECT * FROM payment_handovers WHERE handover_date = ? ORDER BY created_at DESC').all(date);
}

// Accounts Receivable
function getCustomers() {
  const db = getDb();
  return db.prepare('SELECT * FROM customers ORDER BY name').all();
}

function addCustomer(customer) {
  const db = getDb();
  const result = db.prepare('INSERT INTO customers (customer_id, name, phone, email, address, credit_limit, payment_terms, discount_percent, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(customer.customer_id, customer.name, customer.phone, customer.email, customer.address, customer.credit_limit || 0, customer.payment_terms || 30, customer.discount_percent || 0, customer.notes);
  saveDb();
  return { id: result.lastInsertRowid };
}

function updateCustomer(id, customer) {
  const db = getDb();
  db.prepare('UPDATE customers SET name=?, phone=?, email=?, address=?, credit_limit=?, payment_terms=?, discount_percent=?, is_active=?, notes=? WHERE id=?').run(customer.name, customer.phone, customer.email, customer.address, customer.credit_limit, customer.payment_terms, customer.discount_percent, customer.is_active ? 1 : 0, customer.notes, id);
  saveDb();
  return { success: true };
}

function getCustomerInvoices(customerId) {
  const db = getDb();
  if (customerId) {
    return db.prepare('SELECT ci.*, c.name as customer_name FROM customer_invoices ci JOIN customers c ON ci.customer_id = c.id WHERE ci.customer_id = ? ORDER BY ci.invoice_date DESC').all(customerId);
  }
  return db.prepare('SELECT ci.*, c.name as customer_name FROM customer_invoices ci JOIN customers c ON ci.customer_id = c.id ORDER BY ci.invoice_date DESC').all();
}

function createInvoice(invoice) {
  const db = getDb();
  const invNum = 'INV-' + Date.now();
  const result = db.prepare('INSERT INTO customer_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal, tax_amount, discount_amount, total_amount, balance, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(invNum, invoice.customer_id, invoice.invoice_date, invoice.due_date, invoice.subtotal, invoice.tax_amount || 0, invoice.discount_amount || 0, invoice.total_amount, invoice.total_amount, invoice.notes);
  db.prepare('UPDATE customers SET current_balance = current_balance + ? WHERE id = ?').run(invoice.total_amount, invoice.customer_id);
  saveDb();
  return { id: result.lastInsertRowid, invoice_number: invNum };
}

function addCustomerPayment(payment) {
  const db = getDb();
  const result = db.prepare('INSERT INTO customer_payments (customer_id, invoice_id, payment_date, amount, payment_method, reference_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(payment.customer_id, payment.invoice_id, payment.payment_date, payment.amount, payment.payment_method || 'cash', payment.reference_number, payment.notes);
  if (payment.invoice_id) {
    db.prepare('UPDATE customer_invoices SET amount_paid = amount_paid + ?, balance = balance - ? WHERE id = ?').run(payment.amount, payment.amount, payment.invoice_id);
  }
  db.prepare('UPDATE customers SET current_balance = current_balance - ? WHERE id = ?').run(payment.amount, payment.customer_id);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getCustomerAging() {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, COALESCE(SUM(ci.balance), 0) as total_balance,
      SUM(CASE WHEN date(ci.due_date) < date('now', '-90 days') THEN ci.balance ELSE 0 END) as over_90,
      SUM(CASE WHEN date(ci.due_date) BETWEEN date('now', '-90 days') AND date('now', '-60 days') THEN ci.balance ELSE 0 END) as days_60_90,
      SUM(CASE WHEN date(ci.due_date) BETWEEN date('now', '-60 days') AND date('now', '-30 days') THEN ci.balance ELSE 0 END) as days_30_60,
      SUM(CASE WHEN date(ci.due_date) >= date('now', '-30 days') THEN ci.balance ELSE 0 END) as days_0_30
    FROM customers c
    LEFT JOIN customer_invoices ci ON c.id = ci.customer_id AND ci.balance > 0
    WHERE c.is_active = 1
    GROUP BY c.id
    HAVING total_balance > 0
    ORDER BY total_balance DESC
  `).all();
}

// Journal Entries (QuickBooks)
function createJournalEntry(entry) {
  const db = getDb();
  const entryNum = 'JE-' + Date.now();
  const result = db.prepare('INSERT INTO journal_entries (entry_date, entry_number, description, debit_account, credit_account, amount, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.entry_date, entryNum, entry.description, entry.debit_account, entry.credit_account, entry.amount, entry.reference_type, entry.reference_id);
  saveDb();
  return { id: result.lastInsertRowid, entry_number: entryNum };
}

function getJournalEntries(startDate, endDate) {
  const db = getDb();
  let sql = 'SELECT * FROM journal_entries WHERE 1=1';
  const params = [];
  if (startDate) { sql += ' AND entry_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND entry_date <= ?'; params.push(endDate); }
  sql += ' ORDER BY entry_date DESC, id DESC';
  return db.prepare(sql).all(...params);
}

function generateDailyJournalEntries(date) {
  const db = getDb();
  const book = db.prepare('SELECT * FROM daily_book WHERE book_date = ?').get(date);
  if (!book) return { error: 'No daily book for this date' };
  const entries = [];
  if (book.total_sales > 0) {
    entries.push(createJournalEntry({ entry_date: date, description: 'Daily Sales Revenue', debit_account: 'Cash/AR', credit_account: 'Sales Revenue', amount: book.total_sales }));
  }
  if (book.total_tax > 0) {
    entries.push(createJournalEntry({ entry_date: date, description: 'Sales Tax Collected', debit_account: 'Cash/AR', credit_account: 'Sales Tax Payable', amount: book.total_tax }));
  }
  if (book.total_fuel_sales > 0) {
    entries.push(createJournalEntry({ entry_date: date, description: 'Fuel Sales', debit_account: 'Cash/AR', credit_account: 'Fuel Sales Revenue', amount: book.total_fuel_sales }));
  }
  if (book.total_cstore_sales > 0) {
    entries.push(createJournalEntry({ entry_date: date, description: 'C-Store Sales', debit_account: 'Cash/AR', credit_account: 'C-Store Sales Revenue', amount: book.total_cstore_sales }));
  }
  if (book.cash_variance !== 0) {
    const acct = book.cash_variance > 0 ? 'Cash Over' : 'Cash Short';
    entries.push(createJournalEntry({ entry_date: date, description: 'Cash Variance', debit_account: acct, credit_account: 'Cash', amount: Math.abs(book.cash_variance) }));
  }
  return entries;
}

module.exports = {
  getDailyBook, createDailyBook, closeDailyBook, getXReport, getZReport,
  addCashMovement, getCashMovements, getCashSummary,
  addPaymentHandover, getPaymentHandovers,
  getCustomers, addCustomer, updateCustomer,
  getCustomerInvoices, createInvoice, addCustomerPayment, getCustomerAging,
  createJournalEntry, getJournalEntries, generateDailyJournalEntries
};
