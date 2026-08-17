const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, getDb, saveDb } = require('./database/schema');
const { importXmlFile, importAllXmlFiles } = require('./importers/xml_parser');
const { importPricebook } = require('./importers/pricebook_import');
const groups = require('./database/groups');
const tankgauge = require('./database/tankgauge');
const exportModule = require('./database/export');
const posSender = require('./exporters/pos_sender');
const lossPrevention = require('./database/loss_prevention');
const reports = require('./database/reports');
const inventoryEnhanced = require('./database/inventory_enhanced');
const financial = require('./database/financial');
const suppliers = require('./database/suppliers');
const lottery = require('./database/lottery');
const scheduledPrices = require('./database/scheduled_prices');
const posWatcher = require('./watchers/pos_watcher');
const { getPassportPaths } = require('./config');

let mainWindow;
const DATA_DIR = path.join(__dirname, '..', 'data');
const paths = getPassportPaths();
const BOOUTBOX_DIR = paths.boOutbox;

function getLocalDate() {
  return new Date().toLocaleDateString('en-CA');
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'data', 'icon.png');
  const winOpts = {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Passport Back Office'
  };
  if (fs.existsSync(iconPath)) winOpts.icon = iconPath;
  mainWindow = new BrowserWindow(winOpts);

  mainWindow.loadFile(path.join(__dirname, 'views', 'dashboard.html'));
  mainWindow.setMenuBarVisibility(false);

  // Enable right-click context menu
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Cut', role: 'cut', enabled: params.selectionText.length > 0 },
      { label: 'Copy', role: 'copy', enabled: params.selectionText.length > 0 },
      { label: 'Paste', role: 'paste', enabled: params.isEditable },
      { label: 'Select All', role: 'selectAll' }
    ]);
    menu.popup({ window: mainWindow });
  });

  mainWindow.webContents.on('crashed', (e) => {
    console.error('Renderer process crashed:', e);
  });

  mainWindow.webContents.on('console-message', (e) => {
    if (e.level >= 2) console.error('RENDERER ERROR:', e.message);
  });
}

app.whenReady().then(async () => {
  try {
    console.log('Initializing database...');
    initializeDatabase();
    console.log('Database initialized.');
  } catch (err) {
    console.error('DB INIT ERROR:', err.message);
    console.error(err.stack);
  }
  try {
    console.log('Creating window...');
    createWindow();
    console.log('Window created.');
  } catch (err) {
    console.error('WINDOW ERROR:', err.message);
    console.error(err.stack);
  }
  try {
    posWatcher.start();
    posWatcher.on('ack', (data) => {
      console.log('ACK received:', data.filename, data.status);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pos-ack', data);
      }
    });
    posWatcher.on('dead_letter', (data) => {
      console.log('Dead letter:', data.filename, data.message);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pos-dead-letter', data);
      }
    });
    posWatcher.on('journal', (data) => {
      console.log('Journal processed:', data.filename);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pos-journal', data);
      }
    });
    posWatcher.on('movement', (data) => {
      console.log('Movement report:', data.filename, data.subtype);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pos-movement', data);
      }
    });
  } catch (err) {
    console.error('WATCHER ERROR:', err.message);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('search-items', async (event, query, limit) => {
  const db = getDb();
  if (!db) return [];
  const max = limit || 25;
  if (/^\d+$/.test(query) && query.length > 0 && query.length < 10) {
    const byId = db.prepare(`
      SELECT pb.id, pb.upc, pb.name, pb.price, pb.cost, pb.department_id,
             pb.is_active, d.name as department_name
      FROM pricebook pb
      LEFT JOIN departments d ON pb.department_id = d.id
      WHERE pb.id = ?
    `).get(parseInt(query));
    if (byId) return [byId];
  }
  const q = `%${query}%`;
  return db.prepare(`
    SELECT pb.id, pb.upc, pb.name, pb.price, pb.cost, pb.department_id,
           pb.is_active, d.name as department_name
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE pb.upc LIKE ? OR pb.name LIKE ?
    ORDER BY pb.name ASC
    LIMIT ?
  `).all(q, q, max);
});

ipcMain.handle('get-departments', async () => {
  const db = getDb();
  if (!db) return [];
  return db.prepare('SELECT * FROM departments ORDER BY name').all();
});

ipcMain.handle('import-xml', async (event, filePath) => {
  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select XML File',
      filters: [{ name: 'XML Files', extensions: ['xml'] }],
      properties: ['openFile']
    });
    if (result.canceled) return { status: 'canceled' };
    filePath = result.filePaths[0];
  }
  return importXmlFile(filePath);
});

ipcMain.handle('import-all-xml', async (event, directory) => {
  const dir = directory || BOOUTBOX_DIR;
  return await importAllXmlFiles(dir);
});

ipcMain.handle('import-pricebook', async (event, filePath) => {
  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Pricebook File',
      filters: [
        { name: 'Excel Files', extensions: ['xls', 'xlsx'] },
        { name: 'CSV Files', extensions: ['csv'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled) return { status: 'canceled' };
    filePath = result.filePaths[0];
  }
  return importPricebook(filePath);
});

ipcMain.handle('get-dashboard-data', async (event, date) => {
  const db = getDb();
  const targetDate = date || getLocalDate();

  const sales = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      COALESCE(SUM(gross_amount), 0) as total_gross,
      COALESCE(SUM(net_amount), 0) as total_net,
      COALESCE(SUM(tax_amount), 0) as total_tax,
      COALESCE(SUM(total_amount), 0) as total_collected
    FROM transactions WHERE business_date = ?
  `).get(targetDate) || { total_transactions: 0, total_gross: 0, total_net: 0, total_tax: 0, total_collected: 0 };

  const fuel = db.prepare(`
    SELECT
      COALESCE(SUM(ti.total_amount), 0) as fuel_sales,
      COALESCE(SUM(ti.quantity), 0) as fuel_gallons
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = ? AND ti.item_type = 'fuel'
  `).get(targetDate) || { fuel_sales: 0, fuel_gallons: 0 };

  const cstore = db.prepare(`
    SELECT
      COALESCE(SUM(ti.total_amount), 0) as cstore_sales,
      COUNT(DISTINCT ti.upc) as unique_items
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date = ? AND ti.item_type = 'cstore'
  `).get(targetDate) || { cstore_sales: 0, unique_items: 0 };

  const payments = db.prepare(`
    SELECT
      tender_code,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.id
    WHERE t.business_date = ?
    GROUP BY tender_code
  `).all(targetDate);

  const topCashiers = db.prepare(`
    SELECT
      cashier_id,
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as total_sales
    FROM transactions
    WHERE business_date = ?
    GROUP BY cashier_id
    ORDER BY total_sales DESC
    LIMIT 5
  `).all(targetDate);

  const hourlySales = db.prepare(`
    SELECT
      SUBSTR(event_time, 1, 2) as hour,
      COUNT(*) as transactions,
      COALESCE(SUM(total_amount), 0) as sales
    FROM transactions
    WHERE business_date = ?
    GROUP BY SUBSTR(event_time, 1, 2)
    ORDER BY hour
  `).all(targetDate);

  return {
    date: targetDate,
    sales,
    fuel,
    cstore,
    payments,
    topCashiers,
    hourlySales
  };
});

ipcMain.handle('get-fuel-report', async (event, startDate, endDate) => {
  const db = getDb();
  const start = startDate || getLocalDate();
  const end = endDate || start;

  const byGrade = db.prepare(`
    SELECT
      ti.fuel_grade_id,
      ti.description as grade_name,
      COUNT(*) as transactions,
      COALESCE(SUM(ti.quantity), 0) as total_gallons,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COALESCE(AVG(ti.unit_price), 0) as avg_price,
      COALESCE(SUM(ti.promotion_amount), 0) as total_promotions
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'fuel'
    GROUP BY ti.fuel_grade_id, ti.description
    ORDER BY total_sales DESC
  `).all(start, end);

  const byPosition = db.prepare(`
    SELECT
      ti.fuel_position_id,
      COUNT(*) as transactions,
      COALESCE(SUM(ti.quantity), 0) as total_gallons,
      COALESCE(SUM(ti.total_amount), 0) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'fuel'
    GROUP BY ti.fuel_position_id
    ORDER BY ti.fuel_position_id
  `).all(start, end);

  const dailyTrend = db.prepare(`
    SELECT
      t.business_date,
      COALESCE(SUM(ti.quantity), 0) as gallons,
      COALESCE(SUM(ti.total_amount), 0) as sales,
      COALESCE(AVG(ti.unit_price), 0) as avg_price
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'fuel'
    GROUP BY t.business_date
    ORDER BY t.business_date
  `).all(start, end);

  return { byGrade, byPosition, dailyTrend };
});

ipcMain.handle('get-cstore-report', async (event, startDate, endDate) => {
  const db = getDb();
  const start = startDate || getLocalDate();
  const end = endDate || start;

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'cstore'
  `).get(start, end);

  const byDepartment = db.prepare(`
    SELECT
      COALESCE(d.name, 'Dept ' || ti.merchandise_code, 'Uncategorized') as department,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN pricebook pb ON ti.upc = pb.upc
    LEFT JOIN departments d ON d.id = COALESCE(pb.department_id, CAST(ti.merchandise_code AS INTEGER))
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'cstore'
    GROUP BY COALESCE(d.id, CAST(ti.merchandise_code AS INTEGER))
    ORDER BY total_sales DESC
  `).all(start, end);

  const topItems = db.prepare(`
    SELECT
      ti.upc,
      ti.description,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COUNT(*) as transaction_count
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'cstore'
    GROUP BY ti.upc, ti.description
    ORDER BY total_sales DESC
    LIMIT 20
  `).all(start, end);

  const dailyTrend = db.prepare(`
    SELECT
      t.business_date,
      COALESCE(SUM(ti.total_amount), 0) as sales,
      COUNT(DISTINCT ti.upc) as unique_items
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'cstore'
    GROUP BY t.business_date
    ORDER BY t.business_date
  `).all(start, end);

  return { totals, byDepartment, topItems, dailyTrend };
});

ipcMain.handle('get-payments-report', async (event, date) => {
  const db = getDb();
  const targetDate = date || getLocalDate();

  const byType = db.prepare(`
    SELECT
      p.tender_code,
      p.tender_sub_code,
      COUNT(*) as count,
      COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.id
    WHERE t.business_date = ?
    GROUP BY p.tender_code, p.tender_sub_code
    ORDER BY total DESC
  `).all(targetDate);

  const byProvider = db.prepare(`
    SELECT
      p.provider_id,
      COUNT(*) as count,
      COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.id
    WHERE t.business_date = ?
    GROUP BY p.provider_id
    ORDER BY total DESC
  `).all(targetDate);

  return { byType, byProvider, date: targetDate };
});

ipcMain.handle('get-cashier-report', async (event, startDate, endDate) => {
  const db = getDb();
  const start = startDate || getLocalDate();
  const end = endDate || start;

  const cashiers = db.prepare(`
    SELECT
      t.cashier_id,
      COUNT(*) as total_transactions,
      COALESCE(SUM(t.total_amount), 0) as total_sales,
      COALESCE(AVG(t.total_amount), 0) as avg_sale,
      MIN(t.event_time) as first_sale,
      MAX(t.event_time) as last_sale
    FROM transactions t
    WHERE t.business_date BETWEEN ? AND ?
    GROUP BY t.cashier_id
    ORDER BY total_sales DESC
  `).all(start, end);

  const cashierItems = db.prepare(`
    SELECT
      t.cashier_id,
      ti.item_type,
      COALESCE(SUM(ti.total_amount), 0) as sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
    GROUP BY t.cashier_id, ti.item_type
  `).all(start, end);

  return { cashiers, cashierItems };
});

ipcMain.handle('get-employees', async () => {
  const db = getDb();
  return db.prepare('SELECT * FROM employees ORDER BY name').all();
});

ipcMain.handle('add-employee', async (event, employee) => {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO employees (employee_id, name, role, hourly_rate, hire_date) VALUES (?, ?, ?, ?, ?)
  `).run(
    employee.employee_id, employee.name, employee.role || 'cashier',
    employee.hourly_rate || 0, employee.hire_date || getLocalDate()
  );
  return { id: result.lastInsertRowid };
});

ipcMain.handle('update-employee', async (event, id, employee) => {
  const db = getDb();
  db.prepare(`
    UPDATE employees SET name = ?, role = ?, hourly_rate = ?, is_active = ? WHERE id = ?
  `).run(employee.name, employee.role, employee.hourly_rate, employee.is_active ? 1 : 0, id);
  saveDb();
  return { success: true };
});

ipcMain.handle('delete-employee', async (event, id) => {
  const db = getDb();
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  saveDb();
  return { success: true };
});

ipcMain.handle('get-pricebook', async (event, limit, offset) => {
  const db = getDb();
  const lim = limit || 100;
  const off = offset || 0;

  const items = db.prepare(`
    SELECT pb.*, d.name as department
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    ORDER BY pb.name
    LIMIT ? OFFSET ?
  `).all(lim, off);

  const { count: total } = db.prepare('SELECT COUNT(*) as count FROM pricebook').get();

  return { items, total };
});

ipcMain.handle('get-pricebook-item', async (event, id) => {
  const db = getDb();
  return db.prepare(`
    SELECT pb.*, d.name as department, tr.name as tax_rate_name, tr.rate as tax_rate
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    LEFT JOIN tax_rates tr ON pb.tax_rate_id = tr.id
    WHERE pb.id = ?
  `).get(id);
});

ipcMain.handle('update-pricebook-item', async (event, id, updates) => {
  const db = getDb();
  const fields = [];
  const values = [];

  // Get old price BEFORE updating
  let oldPrice = null;
  if (updates.price !== undefined) {
    const old = db.prepare('SELECT price FROM pricebook WHERE id = ?').get(id);
    if (old) oldPrice = old.price;
  }

  const allowed = ['upc', 'name', 'department_id', 'vendor', 'cost', 'price', 'tax_rate_id', 'age_restriction', 'is_active'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) return { success: false, error: 'No fields to update' };

  fields.push('last_updated = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE pricebook SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // Track price changes
  if (updates.price !== undefined && oldPrice !== null && oldPrice !== updates.price) {
    db.prepare('INSERT INTO price_history (pricebook_id, old_price, new_price, changed_by) VALUES (?, ?, ?, ?)').run(id, oldPrice, updates.price, 'backoffice_user');
  }

  return { success: true };
});

ipcMain.handle('add-pricebook-item', async (event, item) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM pricebook WHERE upc = ?').get(item.upc);
  if (existing) {
    return { success: false, error: `UPC ${item.upc} already exists. Edit the existing item instead.` };
  }
  const result = db.prepare(`
    INSERT INTO pricebook (upc, name, department_id, vendor, cost, price, tax_rate_id, age_restriction, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(item.upc, item.name, item.department_id || null, item.vendor || null, item.cost || 0, item.price || 0, item.tax_rate_id || null, item.age_restriction || null, item.is_active !== undefined ? item.is_active : 1);
  db.prepare('INSERT INTO price_history (pricebook_id, old_price, new_price, changed_by, change_reason) VALUES (?, 0, ?, ?, ?)').run(result.lastInsertRowid, item.price || 0, 'backoffice_user', 'new_item');
  return { success: true, id: result.lastInsertRowid };
});

ipcMain.handle('delete-pricebook-item', async (event, id) => {
  const db = getDb();
  db.prepare('DELETE FROM price_history WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM group_items WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM supplier_items WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM item_barcodes WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM pack_pricing WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM stock_movements WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM purchase_order_items WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_price_changes WHERE pricebook_id = ?').run(id);
  db.prepare('DELETE FROM pricebook WHERE id = ?').run(id);
  return { success: true };
});

// === BULK UPDATES ===
ipcMain.handle('search-items-filtered', async (event, filters) => {
  const db = getDb();
  let sql = `
    SELECT pb.id, pb.upc, pb.name, pb.cost, pb.price, pb.vendor,
           pb.tax_rate_id, pb.age_restriction, pb.is_active,
           d.name as department, d.id as department_id,
           tr.name as tax_rate_name, tr.rate as tax_rate
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    LEFT JOIN tax_rates tr ON pb.tax_rate_id = tr.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.name) { sql += ' AND pb.name LIKE ?'; params.push(`%${filters.name}%`); }
  if (filters.upc) { sql += ' AND pb.upc LIKE ?'; params.push(`%${filters.upc}%`); }
  if (filters.department) { sql += ' AND d.name = ?'; params.push(filters.department); }
  if (filters.tax_rate_id) { sql += ' AND pb.tax_rate_id = ?'; params.push(filters.tax_rate_id); }
  if (filters.age_restriction !== undefined && filters.age_restriction !== '') { sql += ' AND pb.age_restriction = ?'; params.push(filters.age_restriction); }
  if (filters.min_price !== undefined && filters.min_price !== '') { sql += ' AND pb.price >= ?'; params.push(parseFloat(filters.min_price)); }
  if (filters.max_price !== undefined && filters.max_price !== '') { sql += ' AND pb.price <= ?'; params.push(parseFloat(filters.max_price)); }
  if (filters.min_cost !== undefined && filters.min_cost !== '') { sql += ' AND pb.cost >= ?'; params.push(parseFloat(filters.min_cost)); }
  if (filters.max_cost !== undefined && filters.max_cost !== '') { sql += ' AND pb.cost <= ?'; params.push(parseFloat(filters.max_cost)); }
  if (filters.vendor) { sql += ' AND pb.vendor LIKE ?'; params.push(`%${filters.vendor}%`); }
  if (filters.is_active !== undefined && filters.is_active !== '') { sql += ' AND pb.is_active = ?'; params.push(filters.is_active); }

  sql += ' ORDER BY pb.name ASC LIMIT 500';
  return db.prepare(sql).all(...params);
});

ipcMain.handle('bulk-update-items', async (event, updates) => {
  const db = getDb();
  const stmts = {
    department_id: db.prepare('UPDATE pricebook SET department_id = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'),
    tax_rate_id: db.prepare('UPDATE pricebook SET tax_rate_id = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'),
    age_restriction: db.prepare('UPDATE pricebook SET age_restriction = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'),
    price: db.prepare('UPDATE pricebook SET price = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'),
    cost: db.prepare('UPDATE pricebook SET cost = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'),
    vendor: db.prepare('UPDATE pricebook SET vendor = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?'),
    is_active: db.prepare('UPDATE pricebook SET is_active = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?')
  };

  let count = 0;
  for (const item of updates) {
    for (const [field, value] of Object.entries(item.changes)) {
      if (stmts[field]) {
        stmts[field].run(value, item.id);
        count++;
        if (field === 'price') {
          const old = db.prepare('SELECT price FROM pricebook WHERE id = ?').get(item.id);
          if (old) {
            db.prepare('INSERT INTO price_history (pricebook_id, old_price, new_price, changed_by, change_reason) VALUES (?, ?, ?, ?, ?)').run(item.id, old.price, value, 'bulk_update', 'bulk_edit');
          }
        }
      }
    }
  }
  return { success: true, updated: count };
});

ipcMain.handle('get-departments-list', async () => {
  const db = getDb();
  return db.prepare('SELECT * FROM departments ORDER BY name').all();
});

ipcMain.handle('get-tax-rates', async () => {
  const db = getDb();
  return db.prepare('SELECT * FROM tax_rates ORDER BY rate').all();
});

ipcMain.handle('add-tax-rate', async (event, rate) => {
  const db = getDb();
  const result = db.prepare('INSERT INTO tax_rates (name, rate) VALUES (?, ?)').run(rate.name, rate.rate);
  return { success: true, id: result.lastInsertRowid };
});

ipcMain.handle('update-tax-rate', async (event, id, updates) => {
  const db = getDb();
  db.prepare('UPDATE tax_rates SET name = ?, rate = ?, is_active = ? WHERE id = ?').run(updates.name, updates.rate, updates.is_active !== undefined ? updates.is_active : 1, id);
  return { success: true };
});

ipcMain.handle('delete-tax-rate', async (event, id) => {
  const db = getDb();
  db.prepare('UPDATE pricebook SET tax_rate_id = NULL WHERE tax_rate_id = ?').run(id);
  db.prepare('DELETE FROM tax_rates WHERE id = ?').run(id);
  return { success: true };
});

ipcMain.handle('reassign-tax-rates', async () => {
  const db = getDb();
  const taxRates = {};
  db.prepare('SELECT id, name FROM tax_rates').all().forEach(r => { taxRates[r.name] = r.id; });

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

  const items = db.prepare(`
    SELECT pb.id, d.name as dept_name
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE pb.tax_rate_id IS NULL
  `).all();

  const updateTax = db.prepare('UPDATE pricebook SET tax_rate_id = ? WHERE id = ?');
  let assigned = 0;
  for (const item of items) {
    if (!item.dept_name) continue;
    const rateId = deptTaxMap[item.dept_name.toLowerCase()];
    if (rateId) { updateTax.run(rateId, item.id); assigned++; }
  }
  return { assigned };
});

ipcMain.handle('get-import-log', async () => {
  const db = getDb();
  return db.prepare('SELECT * FROM import_log ORDER BY imported_at DESC LIMIT 50').all();
});

ipcMain.handle('get-shift-report', async (event, date) => {
  const db = getDb();
  const targetDate = date || getLocalDate();

  const shifts = db.prepare(`
    SELECT
      register_id,
      till_id,
      MIN(event_time) as shift_start,
      MAX(event_time) as shift_end,
      COUNT(*) as transactions,
      COALESCE(SUM(gross_amount), 0) as gross,
      COALESCE(SUM(tax_amount), 0) as tax,
      COALESCE(SUM(total_amount), 0) as total
    FROM transactions
    WHERE business_date = ?
    GROUP BY register_id, till_id
    ORDER BY register_id, shift_start
  `).all(targetDate);

  return { shifts, date: targetDate };
});

ipcMain.handle('get-dates-with-data', async () => {
  const db = getDb();
  return db.prepare('SELECT DISTINCT business_date FROM transactions ORDER BY business_date DESC LIMIT 30')
    .all()
    .map(r => r.business_date);
});

// Groups
ipcMain.handle('get-groups', async () => groups.getGroups());
ipcMain.handle('get-group-items', async (event, groupId) => groups.getGroupItems(groupId));
ipcMain.handle('create-group', async (event, group) => groups.createGroup(group));
ipcMain.handle('update-group', async (event, id, group) => groups.updateGroup(id, group));
ipcMain.handle('delete-group', async (event, id) => groups.deleteGroup(id));
ipcMain.handle('add-items-to-group', async (event, groupId, pricebookIds) => groups.addItemsToGroup(groupId, pricebookIds));
ipcMain.handle('remove-item-from-group', async (event, groupId, pricebookId) => groups.removeItemFromGroup(groupId, pricebookId));
ipcMain.handle('populate-group-from-condition', async (event, groupId) => groups.populateGroupFromCondition(groupId));
ipcMain.handle('batch-update-prices', async (event, groupId, adjustmentType, adjustmentValue) => groups.batchUpdatePrices(groupId, adjustmentType, adjustmentValue));
ipcMain.handle('get-all-brands', async () => groups.getAllBrands());
ipcMain.handle('auto-assign-brands', async () => groups.autoAssignBrands());

// Tank Gauge
ipcMain.handle('add-tank-reading', async (event, reading) => tankgauge.addTankReading(reading));
ipcMain.handle('get-tank-readings', async (event, tankId, startDate, endDate) => tankgauge.getTankReadings(tankId, startDate, endDate));
ipcMain.handle('add-fuel-delivery', async (event, delivery) => tankgauge.addFuelDelivery(delivery));
ipcMain.handle('get-fuel-deliveries', async (event, startDate, endDate) => tankgauge.getFuelDeliveries(startDate, endDate));
ipcMain.handle('get-tank-status', async () => tankgauge.getTankStatus());
ipcMain.handle('get-fuel-sales-by-grade', async (event, startDate, endDate) => tankgauge.getFuelSalesByGrade(startDate, endDate));

// Exports
ipcMain.handle('export-sales-report', async (event, date, format) => exportModule.exportSalesReport(date, format));
ipcMain.handle('export-fuel-report', async (event, startDate, endDate, format) => exportModule.exportFuelReport(startDate, endDate, format));
ipcMain.handle('export-cstore-report', async (event, startDate, endDate, format) => exportModule.exportCStoreReport(startDate, endDate, format));
ipcMain.handle('export-pricebook', async (event, format) => exportModule.exportPricebook(format));
ipcMain.handle('export-payment-report', async (event, date, format) => exportModule.exportPaymentReport(date, format));

// Search pricebook
ipcMain.handle('search-pricebook', async (event, query) => {
  const db = getDb();
  return db.prepare(`
    SELECT pb.*, d.name as department
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE pb.name LIKE ? OR pb.upc LIKE ?
    ORDER BY pb.name
    LIMIT 100
  `).all('%' + query + '%', '%' + query + '%');
});

// Send to POS
ipcMain.handle('send-prices-to-pos', async (event, items, options) => {
  return posSender.sendPriceChangesToPOS(items, options);
});

ipcMain.handle('send-item-list-to-pos', async (event, itemList, options) => {
  return posSender.sendItemListToPOS(itemList, options);
});

ipcMain.handle('send-combo-to-pos', async (event, combo, options) => {
  return posSender.sendComboToPOS(combo, options);
});

ipcMain.handle('send-mixmatch-to-pos', async (event, promo, options) => {
  return posSender.sendMixMatchToPOS(promo, options);
});

ipcMain.handle('send-all-pending', async (event, options) => {
  return posSender.sendAllPendingChanges(options);
});

ipcMain.handle('send-group-to-pos', async (event, groupId, options) => {
  return posSender.sendGroupPricesToPOS(groupId, options);
});

ipcMain.handle('get-pending-changes', async () => {
  return posSender.getPendingPriceChanges();
});

ipcMain.handle('get-send-history', async () => {
  return posSender.getSendHistory();
});

ipcMain.handle('check-ack-files', async () => {
  return posSender.checkAckFiles();
});

ipcMain.handle('send-fuel-prices-to-pos', async (event, fuelPrices, options) => {
  return posSender.sendFuelPricesToPOS(fuelPrices, options);
});

ipcMain.handle('send-departments-to-pos', async (event, departments, options) => {
  return posSender.sendDepartmentsToPOS(departments, options);
});

ipcMain.handle('send-all-pending-to-pos', async (event, options) => {
  return posSender.sendAllPendingChanges(options);
});

ipcMain.handle('get-watcher-status', async () => {
  return posWatcher.getStatus();
});

// === LOSS PREVENTION ===
ipcMain.handle('lp-log-event', async (event, evt) => lossPrevention.logEvent(evt));
ipcMain.handle('lp-get-events', async (event, filters) => lossPrevention.getEvents(filters));
ipcMain.handle('lp-resolve-event', async (event, id, resolvedBy) => lossPrevention.resolveEvent(id, resolvedBy));
ipcMain.handle('lp-get-summary', async (event, startDate, endDate) => lossPrevention.getEventSummary(startDate, endDate));
ipcMain.handle('lp-get-cashier-audit', async (event, startDate, endDate) => lossPrevention.getCashierAuditSummary(startDate, endDate));
ipcMain.handle('lp-check-thresholds', async () => lossPrevention.checkThresholdAlerts());

// === ADDITIONAL REPORTS ===
ipcMain.handle('get-voided-transactions', async (event, startDate, endDate) => reports.getVoidedTransactions(startDate, endDate));
ipcMain.handle('get-cashier-deletions', async (event, startDate, endDate) => reports.getCashierDeletions(startDate, endDate));
ipcMain.handle('get-price-change-report', async (event, startDate, endDate) => reports.getPriceChangeReport(startDate, endDate));
ipcMain.handle('get-monthly-fuel-recon', async (event, year, month) => reports.getMonthlyFuelReconciliation(year, month));
ipcMain.handle('get-fuel-margin-report', async (event, startDate, endDate) => reports.getFuelMarginReport(startDate, endDate));
ipcMain.handle('get-vendor-sales-report', async (event, startDate, endDate) => reports.getVendorSalesReport(startDate, endDate));
ipcMain.handle('get-category-sales-report', async (event, startDate, endDate) => reports.getCategorySalesReport(startDate, endDate));
ipcMain.handle('get-manufacturer-sales-report', async (event, startDate, endDate) => reports.getManufacturerSalesReport(startDate, endDate));
ipcMain.handle('get-department-analysis', async (event, startDate, endDate) => reports.getDepartmentAnalysis(startDate, endDate));

// === INVENTORY ENHANCED ===
ipcMain.handle('add-stock-movement', async (event, movement) => inventoryEnhanced.addStockMovement(movement));
ipcMain.handle('get-stock-movements', async (event, pricebookId, startDate, endDate) => inventoryEnhanced.getStockMovements(pricebookId, startDate, endDate));
ipcMain.handle('get-inventory-discrepancy', async (event, startDate, endDate) => inventoryEnhanced.getInventoryDiscrepancy(startDate, endDate));
ipcMain.handle('get-item-returns', async (event, startDate, endDate) => inventoryEnhanced.getItemReturns(startDate, endDate));
ipcMain.handle('get-item-transfers', async (event, startDate, endDate) => inventoryEnhanced.getItemTransfers(startDate, endDate));
ipcMain.handle('get-perished-items', async (event, startDate, endDate) => inventoryEnhanced.getPerishedItems(startDate, endDate));
ipcMain.handle('calculate-valuation', async (event, method) => inventoryEnhanced.calculateValuation(method));
ipcMain.handle('get-reorder-alerts', async () => inventoryEnhanced.getReorderAlerts());
ipcMain.handle('get-item-barcodes', async (event, pricebookId) => inventoryEnhanced.getItemBarcodes(pricebookId));
ipcMain.handle('add-barcode', async (event, pricebookId, barcode, type, isPrimary) => inventoryEnhanced.addBarcode(pricebookId, barcode, type, isPrimary));
ipcMain.handle('remove-barcode', async (event, id) => inventoryEnhanced.removeBarcode(id));
ipcMain.handle('get-pack-pricing', async (event, pricebookId) => inventoryEnhanced.getPackPricing(pricebookId));
ipcMain.handle('add-pack-pricing', async (event, pricebookId, packSize, packPrice, description) => inventoryEnhanced.addPackPricing(pricebookId, packSize, packPrice, description));
ipcMain.handle('remove-pack-pricing', async (event, id) => inventoryEnhanced.removePackPricing(id));

// === FINANCIAL (Daily Book, Cash Control, AR) ===
ipcMain.handle('get-daily-book', async (event, date) => financial.getDailyBook(date));
ipcMain.handle('create-daily-book', async (event, date) => financial.createDailyBook(date));
ipcMain.handle('close-daily-book', async (event, date, closingCash, closedBy) => financial.closeDailyBook(date, closingCash, closedBy));
ipcMain.handle('get-x-report', async (event, date) => financial.getXReport(date));
ipcMain.handle('get-z-report', async (event, date) => financial.getZReport(date));
ipcMain.handle('add-cash-movement', async (event, movement) => financial.addCashMovement(movement));
ipcMain.handle('get-cash-movements', async (event, startDate, endDate, type) => financial.getCashMovements(startDate, endDate, type));
ipcMain.handle('get-cash-summary', async (event, date) => financial.getCashSummary(date));
ipcMain.handle('add-payment-handover', async (event, handover) => financial.addPaymentHandover(handover));
ipcMain.handle('get-payment-handovers', async (event, date) => financial.getPaymentHandovers(date));
ipcMain.handle('get-customers', async () => financial.getCustomers());
ipcMain.handle('add-customer', async (event, customer) => financial.addCustomer(customer));
ipcMain.handle('update-customer', async (event, id, customer) => financial.updateCustomer(id, customer));
ipcMain.handle('get-customer-invoices', async (event, customerId) => financial.getCustomerInvoices(customerId));
ipcMain.handle('create-invoice', async (event, invoice) => financial.createInvoice(invoice));
ipcMain.handle('add-customer-payment', async (event, payment) => financial.addCustomerPayment(payment));
ipcMain.handle('get-customer-aging', async () => financial.getCustomerAging());
ipcMain.handle('create-journal-entry', async (event, entry) => financial.createJournalEntry(entry));
ipcMain.handle('get-journal-entries', async (event, startDate, endDate) => financial.getJournalEntries(startDate, endDate));
ipcMain.handle('generate-daily-journal', async (event, date) => financial.generateDailyJournalEntries(date));

// === SUPPLIERS & PO ===
ipcMain.handle('get-suppliers', async () => suppliers.getSuppliers());
ipcMain.handle('add-supplier', async (event, supplier) => suppliers.addSupplier(supplier));
ipcMain.handle('update-supplier', async (event, id, supplier) => suppliers.updateSupplier(id, supplier));
ipcMain.handle('delete-supplier', async (event, id) => suppliers.deleteSupplier(id));
ipcMain.handle('get-supplier-items', async (event, supplierId) => suppliers.getSupplierItems(supplierId));
ipcMain.handle('add-supplier-item', async (event, supplierId, pricebookId, upc, cost, packSize, isPrimary) => suppliers.addSupplierItem(supplierId, pricebookId, upc, cost, packSize, isPrimary));
ipcMain.handle('remove-supplier-item', async (event, id) => suppliers.removeSupplierItem(id));
ipcMain.handle('get-best-supplier', async (event, pricebookId) => suppliers.getBestSupplierForItem(pricebookId));
ipcMain.handle('get-purchase-orders', async (event, status) => suppliers.getPurchaseOrders(status));
ipcMain.handle('get-purchase-order', async (event, id) => suppliers.getPurchaseOrder(id));
ipcMain.handle('create-purchase-order', async (event, po) => suppliers.createPurchaseOrder(po));
ipcMain.handle('receive-purchase-order', async (event, poId, items, receivedBy) => suppliers.receivePurchaseOrder(poId, items, receivedBy));
ipcMain.handle('add-supplier-delivery', async (event, delivery) => suppliers.addSupplierDelivery(delivery));
ipcMain.handle('get-supplier-deliveries', async (event, startDate, endDate, supplierId) => suppliers.getSupplierDeliveries(startDate, endDate, supplierId));
ipcMain.handle('add-supplier-return', async (event, returnData) => suppliers.addSupplierReturn(returnData));
ipcMain.handle('get-supplier-returns', async (event, startDate, endDate, supplierId) => suppliers.getSupplierReturns(startDate, endDate, supplierId));

// === EDI ===
ipcMain.handle('create-edi-document', async (event, doc) => suppliers.createEdiDocument(doc));
ipcMain.handle('get-edi-documents', async (event, filters) => suppliers.getEdiDocuments(filters));
ipcMain.handle('update-edi-status', async (event, id, status, errorMsg) => suppliers.updateEdiStatus(id, status, errorMsg));

// === LOTTERY ===
ipcMain.handle('add-lottery-sale', async (event, sale) => lottery.addLotterySale(sale));
ipcMain.handle('get-lottery-sales', async (event, startDate, endDate) => lottery.getLotterySales(startDate, endDate));
ipcMain.handle('get-lottery-summary', async (event, startDate, endDate) => lottery.getLotterySummary(startDate, endDate));
ipcMain.handle('add-lottery-reconciliation', async (event, recon) => lottery.addLotteryReconciliation(recon));
ipcMain.handle('get-lottery-reconciliations', async (event, startDate, endDate) => lottery.getLotteryReconciliations(startDate, endDate));
ipcMain.handle('get-lottery-recon-summary', async (event, date) => lottery.getLotteryReconciliationSummary(date));

// === SCHEDULED PRICE CHANGES ===
ipcMain.handle('add-scheduled-price', async (event, change) => scheduledPrices.addScheduledPriceChange(change));
ipcMain.handle('get-scheduled-prices', async (event, status) => scheduledPrices.getScheduledPriceChanges(status));
ipcMain.handle('apply-scheduled-prices', async () => scheduledPrices.applyScheduledPriceChanges());
ipcMain.handle('cancel-scheduled-price', async (event, id) => scheduledPrices.cancelScheduledPriceChange(id));
ipcMain.handle('delete-scheduled-price', async (event, id) => scheduledPrices.deleteScheduledPriceChange(id));

console.log('Passport Back Office started');

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
