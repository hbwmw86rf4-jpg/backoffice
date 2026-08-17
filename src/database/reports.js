const { getDb } = require('./schema');

function getVoidedTransactions(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT t.*, ti.description, ti.upc, ti.total_amount as item_amount
    FROM transactions t
    LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
    WHERE t.business_date BETWEEN ? AND ? AND t.is_voided = 1
    ORDER BY t.event_date DESC, t.event_time DESC
  `).all(start, end);
}

function getCashierDeletions(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT lpe.*
    FROM loss_prevention_events lpe
    WHERE lpe.event_type = 'cashier_deletion'
      AND date(lpe.created_at) BETWEEN ? AND ?
    ORDER BY lpe.created_at DESC
  `).all(start, end);
}

function getPriceChangeReport(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT ph.*, pb.name, pb.upc, d.name as department
    FROM price_history ph
    JOIN pricebook pb ON ph.pricebook_id = pb.id
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE date(ph.changed_at) BETWEEN ? AND ?
    ORDER BY ph.changed_at DESC
  `).all(start, end);
}

function getMonthlyFuelReconciliation(year, month) {
  const db = getDb();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const salesByGrade = db.prepare(`
    SELECT
      ti.fuel_grade_id,
      ti.description as grade_name,
      COALESCE(SUM(ti.quantity), 0) as total_gallons,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COALESCE(AVG(ti.unit_price), 0) as avg_selling_price
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ? AND ti.item_type = 'fuel'
    GROUP BY ti.fuel_grade_id, ti.description
  `).all(startDate, endDate);
  const deliveries = db.prepare(`
    SELECT fuel_grade, COALESCE(SUM(gallons_delivered), 0) as total_delivered, COALESCE(SUM(total_cost), 0) as total_cost
    FROM fuel_deliveries WHERE delivery_date BETWEEN ? AND ?
    GROUP BY fuel_grade
  `).all(startDate, endDate);
  const readings = db.prepare(`
    SELECT tank_id, fuel_grade, COALESCE(AVG(current_level), 0) as avg_level
    FROM tank_readings WHERE reading_date BETWEEN ? AND ?
    GROUP BY tank_id, fuel_grade
  `).all(startDate, endDate);
  const recon = db.prepare('SELECT * FROM fuel_reconciliation WHERE recon_date BETWEEN ? AND ?').all(startDate, endDate);
  return { salesByGrade, deliveries, readings, recon, startDate, endDate };
}

function getFuelMarginReport(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT
      ti.fuel_grade_id,
      ti.description as grade_name,
      COALESCE(SUM(ti.quantity), 0) as total_gallons,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COALESCE(AVG(ti.unit_price), 0) as avg_selling_price,
      (SELECT COALESCE(AVG(fd.cost_per_gallon), 0) FROM fuel_deliveries fd WHERE fd.fuel_grade = ti.description AND fd.delivery_date BETWEEN ? AND ?) as avg_cost
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ? AND ti.item_type = 'fuel'
    GROUP BY ti.fuel_grade_id, ti.description
  `).all(start, end, start, end);
}

function getVendorSalesReport(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT
      COALESCE(pb.vendor, 'Store Item') as vendor,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COUNT(DISTINCT t.id) as transaction_count
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN pricebook pb ON ti.upc = pb.upc
    WHERE t.business_date BETWEEN ? AND ? AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) NOT IN (14, 15, 17, 23, 88888, 99994, 99998, 99999)
    GROUP BY COALESCE(pb.vendor, 'Store Item')
    ORDER BY total_sales DESC
  `).all(start, end);
}

function getCategorySalesReport(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT
      COALESCE(
        d.name,
        CASE CAST(ti.merchandise_code AS INTEGER)
          WHEN 1 THEN 'Edible'
          WHEN 2 THEN 'Non-Edible'
          WHEN 3 THEN 'Snacks'
          WHEN 4 THEN 'Fountain'
          WHEN 5 THEN 'Cigs'
          WHEN 6 THEN 'HBA'
          WHEN 7 THEN 'Fountain'
          WHEN 8 THEN 'Edible'
          WHEN 9 THEN 'Soda'
          WHEN 10 THEN 'Hot Food'
          WHEN 11 THEN 'Deli'
          WHEN 12 THEN 'Auto Parts'
          WHEN 13 THEN 'Candy'
          WHEN 14 THEN 'Instant Lottery'
          WHEN 15 THEN 'Online Lottery'
          WHEN 16 THEN 'Fountain'
          WHEN 17 THEN 'Gas Card'
          WHEN 18 THEN 'Edible'
          WHEN 19 THEN 'HBA'
          WHEN 20 THEN 'Vapes etc'
          WHEN 21 THEN 'Snacks'
          WHEN 23 THEN 'Edible'
          WHEN 24 THEN 'Hot Food'
          WHEN 25 THEN 'Beer'
          ELSE 'Uncategorized'
        END
      ) as category,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN pricebook pb ON ti.upc = pb.upc
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE t.business_date BETWEEN ? AND ? AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) NOT IN (14, 15, 88888, 99994, 99998, 99999)
    GROUP BY category
    ORDER BY total_sales DESC
  `).all(start, end);
}

function getManufacturerSalesReport(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT
      COALESCE(pb.vendor, 'Unknown') as manufacturer,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN pricebook pb ON ti.upc = pb.upc
    WHERE t.business_date BETWEEN ? AND ? AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) NOT IN (14, 15, 88888, 99994, 99998, 99999)
    GROUP BY pb.vendor
    ORDER BY total_sales DESC
  `).all(start, end);
}

function getDepartmentAnalysis(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT
      COALESCE(
        d.name,
        CASE CAST(ti.merchandise_code AS INTEGER)
          WHEN 1 THEN 'Edible'
          WHEN 2 THEN 'Non-Edible'
          WHEN 3 THEN 'Snacks'
          WHEN 4 THEN 'Fountain'
          WHEN 5 THEN 'Cigs'
          WHEN 6 THEN 'HBA'
          WHEN 7 THEN 'Fountain'
          WHEN 8 THEN 'Edible'
          WHEN 9 THEN 'Soda'
          WHEN 10 THEN 'Hot Food'
          WHEN 11 THEN 'Deli'
          WHEN 12 THEN 'Auto Parts'
          WHEN 13 THEN 'Candy'
          WHEN 14 THEN 'Instant Lottery'
          WHEN 15 THEN 'Online Lottery'
          WHEN 16 THEN 'Fountain'
          WHEN 17 THEN 'Gas Card'
          WHEN 18 THEN 'Edible'
          WHEN 19 THEN 'HBA'
          WHEN 20 THEN 'Vapes etc'
          WHEN 21 THEN 'Snacks'
          WHEN 23 THEN 'Edible'
          WHEN 24 THEN 'Hot Food'
          WHEN 25 THEN 'Beer'
          ELSE 'Uncategorized'
        END
      ) as department,
      COALESCE(d.category, 'General') as category,
      COUNT(DISTINCT ti.upc) as unique_items,
      COALESCE(SUM(ti.quantity), 0) as total_qty,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COALESCE(AVG(ti.unit_price), 0) as avg_price,
      COALESCE(SUM(ti.promotion_amount), 0) as total_promotions,
      COUNT(DISTINCT t.id) as transaction_count
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN pricebook pb ON ti.upc = pb.upc
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE t.business_date BETWEEN ? AND ? AND ti.item_type = 'cstore'
      AND CAST(ti.merchandise_code AS INTEGER) NOT IN (14, 15, 88888, 99994, 99998, 99999)
    GROUP BY department
    ORDER BY total_sales DESC
  `).all(start, end);
}

module.exports = {
  getVoidedTransactions, getCashierDeletions, getPriceChangeReport,
  getMonthlyFuelReconciliation, getFuelMarginReport, getVendorSalesReport,
  getCategorySalesReport, getManufacturerSalesReport, getDepartmentAnalysis
};
