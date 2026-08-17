const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'backoffice.db');
let db = null;

function getDb() {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = DELETE');

  return db;
}

function saveDb() {
  if (!db) return;
  db.pragma('wal_checkpoint(TRUNCATE)');
}

function initializeDatabase() {
  const database = getDb();

  try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT UNIQUE NOT NULL,
      name TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'cashier',
      hourly_rate REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      hire_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS tax_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rate REAL NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pricebook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upc TEXT NOT NULL,
      name TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id),
      vendor TEXT,
      cost REAL DEFAULT 0,
      price REAL DEFAULT 0,
      tax_rate_id INTEGER REFERENCES tax_rates(id),
      age_restriction INTEGER,
      is_active INTEGER DEFAULT 1,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(upc)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT,
      transaction_id TEXT NOT NULL,
      cashier_id TEXT,
      register_id TEXT,
      till_id TEXT,
      business_date DATE NOT NULL,
      event_date DATE NOT NULL,
      event_time TEXT NOT NULL,
      gross_amount REAL DEFAULT 0,
      net_amount REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      is_outside_sale INTEGER DEFAULT 0,
      is_training INTEGER DEFAULT 0,
      source_file TEXT,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, transaction_id, event_date)
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id),
      item_type TEXT NOT NULL,
      upc TEXT,
      description TEXT,
      merchandise_code TEXT,
      quantity REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      tax_level_id TEXT,
      tax_amount REAL DEFAULT 0,
      fuel_grade_id TEXT,
      fuel_position_id TEXT,
      price_tier_code TEXT,
      service_level TEXT,
      promotion_id TEXT,
      promotion_reason TEXT,
      promotion_amount REAL DEFAULT 0,
      regular_price REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id),
      tender_code TEXT NOT NULL,
      tender_sub_code TEXT,
      amount REAL DEFAULT 0,
      authorization_code TEXT,
      provider_id TEXT,
      reference_number TEXT,
      auth_date DATE,
      auth_time TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT,
      shift_date DATE NOT NULL,
      shift_number INTEGER,
      register_id TEXT,
      cashier_id TEXT,
      total_sales REAL DEFAULT 0,
      total_transactions INTEGER DEFAULT 0,
      fuel_sales REAL DEFAULT 0,
      cstore_sales REAL DEFAULT 0,
      credit_sales REAL DEFAULT 0,
      debit_sales REAL DEFAULT 0,
      cash_sales REAL DEFAULT 0,
      tax_collected REAL DEFAULT 0,
      discounts_given REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      records_imported INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_message TEXT,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      upc_prefix TEXT,
      category TEXT,
      website TEXT
    );

    CREATE TABLE IF NOT EXISTS item_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      group_type TEXT DEFAULT 'manual',
      condition_type TEXT,
      condition_value TEXT,
      price_adjustment_type TEXT DEFAULT 'percentage',
      price_adjustment_value REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES item_groups(id) ON DELETE CASCADE,
      pricebook_id INTEGER REFERENCES pricebook(id) ON DELETE CASCADE,
      UNIQUE(group_id, pricebook_id)
    );

    CREATE TABLE IF NOT EXISTS tank_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tank_id TEXT NOT NULL,
      fuel_grade TEXT NOT NULL,
      reading_date DATE NOT NULL,
      reading_time TEXT,
      current_level REAL DEFAULT 0,
      tank_capacity REAL DEFAULT 0,
      temperature REAL,
      water_level REAL DEFAULT 0,
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fuel_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_date DATE NOT NULL,
      delivery_time TEXT,
      fuel_grade TEXT NOT NULL,
      gallons_delivered REAL DEFAULT 0,
      cost_per_gallon REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      supplier TEXT,
      invoice_number TEXT,
      tank_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pricebook_id INTEGER REFERENCES pricebook(id),
      old_price REAL,
      new_price REAL,
      change_type TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loss_prevention_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      cashier_id TEXT,
      register_id TEXT,
      description TEXT,
      amount REAL DEFAULT 0,
      transaction_id INTEGER,
      resolved INTEGER DEFAULT 0,
      resolved_by TEXT,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendor_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT NOT NULL,
      business_date DATE,
      total_sales REAL DEFAULT 0,
      total_qty REAL DEFAULT 0,
      total_transactions INTEGER DEFAULT 0,
      unique_items INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fuel_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recon_date DATE NOT NULL,
      tank_id TEXT,
      fuel_grade TEXT,
      book_gallons REAL DEFAULT 0,
      physical_gallons REAL DEFAULT 0,
      variance_gallons REAL DEFAULT 0,
      book_amount REAL DEFAULT 0,
      physical_amount REAL DEFAULT 0,
      variance_amount REAL DEFAULT 0,
      cost_per_gallon REAL DEFAULT 0,
      notes TEXT,
      reconciled_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_book (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_date DATE UNIQUE NOT NULL,
      opening_cash REAL DEFAULT 0,
      closing_cash REAL DEFAULT 0,
      expected_cash REAL DEFAULT 0,
      cash_variance REAL DEFAULT 0,
      total_sales REAL DEFAULT 0,
      total_fuel_sales REAL DEFAULT 0,
      total_cstore_sales REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      total_payments REAL DEFAULT 0,
      paid_in REAL DEFAULT 0,
      paid_out REAL DEFAULT 0,
      safe_drops REAL DEFAULT 0,
      deposits REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      closed_by TEXT,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_date DATE NOT NULL,
      movement_type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      reason TEXT,
      register_id TEXT,
      cashier_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payment_handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handover_date DATE NOT NULL,
      from_cashier TEXT,
      to_cashier TEXT,
      register_id TEXT,
      till_id TEXT,
      cash_amount REAL DEFAULT 0,
      card_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      credit_limit REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      payment_terms INTEGER DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      discount_percent REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      invoice_date DATE NOT NULL,
      due_date DATE,
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER REFERENCES customers(id),
      invoice_id INTEGER REFERENCES customer_invoices(id),
      payment_date DATE NOT NULL,
      amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      reference_number TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      lead_time_days INTEGER DEFAULT 7,
      payment_terms INTEGER DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER REFERENCES suppliers(id),
      pricebook_id INTEGER REFERENCES pricebook(id),
      supplier_upc TEXT,
      supplier_cost REAL DEFAULT 0,
      pack_size INTEGER DEFAULT 1,
      is_primary INTEGER DEFAULT 0,
      UNIQUE(supplier_id, pricebook_id)
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      order_date DATE NOT NULL,
      expected_date DATE,
      received_date DATE,
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
      pricebook_id INTEGER REFERENCES pricebook(id),
      description TEXT,
      quantity_ordered REAL DEFAULT 0,
      quantity_received REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      UNIQUE(po_id, pricebook_id)
    );

    CREATE TABLE IF NOT EXISTS supplier_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER REFERENCES purchase_orders(id),
      supplier_id INTEGER REFERENCES suppliers(id),
      delivery_date DATE NOT NULL,
      delivery_time TEXT,
      invoice_number TEXT,
      invoice_amount REAL DEFAULT 0,
      received_by TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_date DATE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      pricebook_id INTEGER REFERENCES pricebook(id),
      quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      reason TEXT,
      return_type TEXT DEFAULT 'damaged',
      processed_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_date DATE NOT NULL,
      movement_type TEXT NOT NULL,
      pricebook_id INTEGER REFERENCES pricebook(id),
      quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS item_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pricebook_id INTEGER REFERENCES pricebook(id) ON DELETE CASCADE,
      barcode TEXT NOT NULL,
      barcode_type TEXT DEFAULT 'UPC',
      is_primary INTEGER DEFAULT 0,
      UNIQUE(pricebook_id, barcode)
    );

    CREATE TABLE IF NOT EXISTS pack_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pricebook_id INTEGER REFERENCES pricebook(id) ON DELETE CASCADE,
      pack_size INTEGER NOT NULL,
      pack_price REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      description TEXT,
      UNIQUE(pricebook_id, pack_size)
    );

    CREATE TABLE IF NOT EXISTS lottery_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_date DATE NOT NULL,
      game_name TEXT,
      ticket_number TEXT,
      sale_amount REAL DEFAULT 0,
      payout_amount REAL DEFAULT 0,
      commission REAL DEFAULT 0,
      register_id TEXT,
      cashier_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lottery_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recon_date DATE NOT NULL,
      game_name TEXT,
      beginning_inventory INTEGER DEFAULT 0,
      tickets_received INTEGER DEFAULT 0,
      tickets_sold INTEGER DEFAULT 0,
      tickets_returned INTEGER DEFAULT 0,
      ending_inventory INTEGER DEFAULT 0,
      total_sales REAL DEFAULT 0,
      total_payouts REAL DEFAULT 0,
      reconciled_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_price_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pricebook_id INTEGER REFERENCES pricebook(id),
      old_price REAL,
      new_price REAL,
      effective_date DATE NOT NULL,
      effective_time TEXT DEFAULT '00:00',
      expiration_date DATE,
      expiration_time TEXT DEFAULT '23:59',
      is_recurring INTEGER DEFAULT 0,
      recurrence_pattern TEXT,
      status TEXT DEFAULT 'scheduled',
      applied_at DATETIME,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS edi_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT NOT NULL,
      direction TEXT NOT NULL,
      document_number TEXT,
      supplier_id INTEGER REFERENCES suppliers(id),
      status TEXT DEFAULT 'pending',
      sent_at DATETIME,
      received_at DATETIME,
      ack_received INTEGER DEFAULT 0,
      error_message TEXT,
      raw_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date DATE NOT NULL,
      entry_number TEXT UNIQUE NOT NULL,
      description TEXT,
      debit_account TEXT,
      credit_account TEXT,
      amount REAL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      exported INTEGER DEFAULT 0,
      exported_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(business_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_cashier ON transactions(cashier_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_register ON transactions(register_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_items_upc ON transaction_items(upc);
    CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_pricebook_upc ON pricebook(upc);
    CREATE INDEX IF NOT EXISTS idx_pricebook_department ON pricebook(department_id);
    CREATE INDEX IF NOT EXISTS idx_shift_summaries_date ON shift_summaries(shift_date);
    CREATE INDEX IF NOT EXISTS idx_brands_upc_prefix ON brands(upc_prefix);
    CREATE INDEX IF NOT EXISTS idx_item_groups_name ON item_groups(name);
    CREATE INDEX IF NOT EXISTS idx_group_items_group ON group_items(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_items_pricebook ON group_items(pricebook_id);
    CREATE INDEX IF NOT EXISTS idx_tank_readings_date ON tank_readings(reading_date);
    CREATE INDEX IF NOT EXISTS idx_tank_readings_tank ON tank_readings(tank_id);
    CREATE INDEX IF NOT EXISTS idx_fuel_deliveries_date ON fuel_deliveries(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_price_history_pricebook ON price_history(pricebook_id);
    CREATE INDEX IF NOT EXISTS idx_lp_events_type ON loss_prevention_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_lp_events_cashier ON loss_prevention_events(cashier_id);
    CREATE INDEX IF NOT EXISTS idx_lp_events_date ON loss_prevention_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_fuel_recon_date ON fuel_reconciliation(recon_date);
    CREATE INDEX IF NOT EXISTS idx_daily_book_date ON daily_book(book_date);
    CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON cash_movements(movement_date);
    CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_handover_date ON payment_handovers(handover_date);
    CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON customer_invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON customer_invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_suppliers_supplier_id ON suppliers(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier ON supplier_items(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_items_pricebook ON supplier_items(pricebook_id);
    CREATE INDEX IF NOT EXISTS idx_pos_number ON purchase_orders(po_number);
    CREATE INDEX IF NOT EXISTS idx_pos_supplier ON purchase_orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_pos_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_deliveries_date ON supplier_deliveries(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_supplier_returns_date ON supplier_returns(return_date);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_pricebook ON stock_movements(pricebook_id);
    CREATE INDEX IF NOT EXISTS idx_item_barcodes_pricebook ON item_barcodes(pricebook_id);
    CREATE INDEX IF NOT EXISTS idx_item_barcodes_barcode ON item_barcodes(barcode);
    CREATE INDEX IF NOT EXISTS idx_pack_pricing_pricebook ON pack_pricing(pricebook_id);
    CREATE INDEX IF NOT EXISTS idx_lottery_sales_date ON lottery_sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_lottery_recon_date ON lottery_reconciliation(recon_date);
    CREATE INDEX IF NOT EXISTS idx_scheduled_prices_date ON scheduled_price_changes(effective_date);
    CREATE INDEX IF NOT EXISTS idx_scheduled_prices_status ON scheduled_price_changes(status);
    CREATE INDEX IF NOT EXISTS idx_edi_documents_type ON edi_documents(doc_type);
    CREATE INDEX IF NOT EXISTS idx_edi_documents_status ON edi_documents(status);
    CREATE TABLE IF NOT EXISTS pos_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_number ON journal_entries(entry_number);
  `);

  // Normalize existing UPCs: strip leading zeros
  database.exec(`
    UPDATE pricebook SET upc = CASE
      WHEN length(upc) > 1 AND substr(upc, 1, 1) = '0' THEN ltrim(upc, '0')
      ELSE upc
    END;
    UPDATE transaction_items SET upc = CASE
      WHEN length(upc) > 1 AND substr(upc, 1, 1) = '0' THEN ltrim(upc, '0')
      ELSE upc
    END;
  `);

  // Migration: add tax_rate_id and age_restriction to pricebook if missing
  const cols = database.prepare("PRAGMA table_info(pricebook)").all().map(c => c.name);
  if (!cols.includes('tax_rate_id')) {
    database.exec("ALTER TABLE pricebook ADD COLUMN tax_rate_id INTEGER REFERENCES tax_rates(id)");
  }
  if (!cols.includes('age_restriction')) {
    database.exec("ALTER TABLE pricebook ADD COLUMN age_restriction INTEGER");
  }

  // Seed default tax rates if empty
  const taxCount = database.prepare('SELECT COUNT(*) as c FROM tax_rates').get().c;
  if (taxCount === 0) {
    const ins = database.prepare('INSERT INTO tax_rates (name, rate) VALUES (?, ?)');
    ins.run('Non-Taxable', 0);
    ins.run('Low Tax (1%)', 1);
    ins.run('High Tax (7.25%)', 7.25);
  }

  // Get tax rate IDs
  const taxRates = {};
  database.prepare('SELECT id, name FROM tax_rates').all().forEach(r => {
    taxRates[r.name] = r.id;
  });

  // Department -> tax rate mapping
  const deptTaxMap = {
    'non-taxable': taxRates['Non-Taxable'],
    'cash card': taxRates['Non-Taxable'],
    'gas card': taxRates['Non-Taxable'],
    'groc': taxRates['Non-Taxable'],
    'grocery': taxRates['Non-Taxable'],
    'instant lottery': taxRates['Non-Taxable'],
    'machine lotto': taxRates['Non-Taxable'],
    'porters': taxRates['Non-Taxable'],
    'fuel': taxRates['Non-Taxable'],
    'gasoline': taxRates['Non-Taxable'],
    'diesel': taxRates['Non-Taxable'],
    'deli': taxRates['Low Tax (1%)'],
    'edible': taxRates['Low Tax (1%)'],
    'auto parts': taxRates['High Tax (7.25%)'],
    'beer': taxRates['High Tax (7.25%)'],
    'candy': taxRates['High Tax (7.25%)'],
    'cig cartons': taxRates['High Tax (7.25%)'],
    'cigs': taxRates['High Tax (7.25%)'],
    'cigarettes': taxRates['High Tax (7.25%)'],
    'fountain': taxRates['High Tax (7.25%)'],
    'hba': taxRates['High Tax (7.25%)'],
    'hot food': taxRates['High Tax (7.25%)'],
    'liquor': taxRates['High Tax (7.25%)'],
    'non-edible': taxRates['High Tax (7.25%)'],
    'sc': taxRates['High Tax (7.25%)'],
    'snacks': taxRates['High Tax (7.25%)'],
    'soda': taxRates['High Tax (7.25%)'],
    'tobacco': taxRates['High Tax (7.25%)'],
    'vapes': taxRates['High Tax (7.25%)'],
    'vape': taxRates['High Tax (7.25%)'],
    'electronic cigarettes': taxRates['High Tax (7.25%)']
  };

  // Auto-assign tax rates to items without one, based on department
  const updateTax = database.prepare('UPDATE pricebook SET tax_rate_id = ? WHERE id = ?');
  const itemsWithoutTax = database.prepare(`
    SELECT pb.id, d.name as dept_name
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE pb.tax_rate_id IS NULL
  `).all();

  let assigned = 0;
  for (const item of itemsWithoutTax) {
    if (!item.dept_name) continue;
    const rateId = deptTaxMap[item.dept_name.toLowerCase()];
    if (rateId) {
      updateTax.run(rateId, item.id);
      assigned++;
    }
  }
  if (assigned > 0) {
    console.log(`Auto-assigned tax rates to ${assigned} items based on department`);
  }

  console.log('Database initialized successfully');
  } catch (e) {
    console.error('DATABASE INIT ERROR:', e.message);
  }
}

module.exports = { getDb, initializeDatabase, saveDb, DB_PATH };
