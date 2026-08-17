const { getDb, saveDb } = require('./schema');

function addStockMovement(movement) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO stock_movements (movement_date, movement_type, pricebook_id, quantity, unit_cost, total_cost, reference_type, reference_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    movement.movement_date, movement.movement_type, movement.pricebook_id,
    movement.quantity, movement.unit_cost || 0, (movement.quantity || 0) * (movement.unit_cost || 0),
    movement.reference_type, movement.reference_id, movement.notes, movement.created_by
  );
  saveDb();
  return { id: result.lastInsertRowid };
}

function getStockMovements(pricebookId, startDate, endDate) {
  const db = getDb();
  let sql = `
    SELECT sm.*, pb.name, pb.upc
    FROM stock_movements sm
    JOIN pricebook pb ON sm.pricebook_id = pb.id
    WHERE 1=1
  `;
  const params = [];
  if (pricebookId) { sql += ' AND sm.pricebook_id = ?'; params.push(pricebookId); }
  if (startDate) { sql += ' AND sm.movement_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND sm.movement_date <= ?'; params.push(endDate); }
  sql += ' ORDER BY sm.created_at DESC';
  return db.prepare(sql).all(...params);
}

function getInventoryDiscrepancy(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  const expected = db.prepare(`
    SELECT
      sm.pricebook_id,
      pb.name, pb.upc,
      SUM(CASE WHEN sm.movement_type IN ('receive', 'return_out', 'adjustment_up', 'sale_return') THEN sm.quantity ELSE 0 END) as total_in,
      SUM(CASE WHEN sm.movement_type IN ('sale', 'return_in', 'adjustment_down', 'damage', 'shrink') THEN sm.quantity ELSE 0 END) as total_out,
      SUM(CASE WHEN sm.movement_type IN ('receive', 'return_out', 'adjustment_up', 'sale_return') THEN sm.quantity ELSE -sm.quantity END) as net_movement
    FROM stock_movements sm
    JOIN pricebook pb ON sm.pricebook_id = pb.id
    WHERE sm.movement_date BETWEEN ? AND ?
    GROUP BY sm.pricebook_id
    HAVING net_movement != 0
  `).all(start, end);
  return expected;
}

function getItemReturns(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT sm.*, pb.name, pb.upc
    FROM stock_movements sm
    JOIN pricebook pb ON sm.pricebook_id = pb.id
    WHERE sm.movement_date BETWEEN ? AND ? AND sm.movement_type IN ('return_in', 'return_out')
    ORDER BY sm.movement_date DESC
  `).all(start, end);
}

function getItemTransfers(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT sm.*, pb.name, pb.upc
    FROM stock_movements sm
    JOIN pricebook pb ON sm.pricebook_id = pb.id
    WHERE sm.movement_date BETWEEN ? AND ? AND sm.movement_type = 'transfer'
    ORDER BY sm.movement_date DESC
  `).all(start, end);
}

function getPerishedItems(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT sm.*, pb.name, pb.upc
    FROM stock_movements sm
    JOIN pricebook pb ON sm.pricebook_id = pb.id
    WHERE sm.movement_date BETWEEN ? AND ? AND sm.movement_type IN ('damage', 'shrink', 'expire')
    ORDER BY sm.movement_date DESC
  `).all(start, end);
}

function calculateValuation(method = 'weighted_average') {
  const db = getDb();
  if (method === 'weighted_average') {
    return db.prepare(`
      SELECT
        pb.id, pb.upc, pb.name, pb.price,
        COALESCE(SUM(sm.quantity), 0) as total_qty,
        CASE WHEN COALESCE(SUM(sm.quantity), 0) > 0
          THEN COALESCE(SUM(sm.total_cost), 0) / COALESCE(SUM(sm.quantity), 1)
          ELSE pb.cost END as avg_cost,
        COALESCE(SUM(sm.quantity), 0) * CASE WHEN COALESCE(SUM(sm.quantity), 0) > 0
          THEN COALESCE(SUM(sm.total_cost), 0) / COALESCE(SUM(sm.quantity), 1)
          ELSE pb.cost END as total_value
      FROM pricebook pb
      LEFT JOIN stock_movements sm ON pb.id = sm.pricebook_id
      WHERE pb.is_active = 1
      GROUP BY pb.id
      ORDER BY total_value DESC
    `).all();
  }
  if (method === 'fifo') {
    return db.prepare(`
      SELECT
        pb.id, pb.upc, pb.name, pb.price, pb.cost,
        (SELECT COALESCE(SUM(sm.quantity), 0) FROM stock_movements sm WHERE sm.pricebook_id = pb.id AND sm.movement_type IN ('receive', 'return_out', 'adjustment_up')) as total_qty,
        pb.cost as unit_cost,
        (SELECT COALESCE(SUM(sm.quantity), 0) FROM stock_movements sm WHERE sm.pricebook_id = pb.id AND sm.movement_type IN ('receive', 'return_out', 'adjustment_up')) * pb.cost as total_value
      FROM pricebook pb WHERE pb.is_active = 1
      ORDER BY total_value DESC
    `).all();
  }
  return db.prepare('SELECT id, upc, name, cost as unit_cost, price, 0 as total_qty, 0 as total_value FROM pricebook WHERE is_active = 1').all();
}

function getReorderAlerts() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM (
      SELECT pb.*, d.name as department,
        (SELECT COALESCE(SUM(sm.quantity), 0) FROM stock_movements sm WHERE sm.pricebook_id = pb.id AND sm.movement_type IN ('receive', 'return_out', 'adjustment_up')) -
        (SELECT COALESCE(SUM(sm.quantity), 0) FROM stock_movements sm WHERE sm.pricebook_id = pb.id AND sm.movement_type IN ('sale', 'return_in', 'adjustment_down', 'damage', 'shrink')) as current_stock
      FROM pricebook pb
      LEFT JOIN departments d ON pb.department_id = d.id
      WHERE pb.is_active = 1
    ) sub
    WHERE sub.current_stock <= 10 OR sub.current_stock IS NULL
    ORDER BY sub.current_stock ASC
    LIMIT 50
  `).all();
}

function getItemBarcodes(pricebookId) {
  const db = getDb();
  return db.prepare('SELECT * FROM item_barcodes WHERE pricebook_id = ?').all(pricebookId);
}

function addBarcode(pricebookId, barcode, barcodeType = 'UPC', isPrimary = false) {
  const db = getDb();
  const result = db.prepare('INSERT OR REPLACE INTO item_barcodes (pricebook_id, barcode, barcode_type, is_primary) VALUES (?, ?, ?, ?)').run(pricebookId, barcode, barcodeType, isPrimary ? 1 : 0);
  saveDb();
  return { id: result.lastInsertRowid };
}

function removeBarcode(id) {
  const db = getDb();
  db.prepare('DELETE FROM item_barcodes WHERE id = ?').run(id);
  saveDb();
}

function getPackPricing(pricebookId) {
  const db = getDb();
  return db.prepare('SELECT * FROM pack_pricing WHERE pricebook_id = ? ORDER BY pack_size').all(pricebookId);
}

function addPackPricing(pricebookId, packSize, packPrice, description) {
  const db = getDb();
  const unitPrice = packSize > 0 ? packPrice / packSize : 0;
  const result = db.prepare('INSERT OR REPLACE INTO pack_pricing (pricebook_id, pack_size, pack_price, unit_price, description) VALUES (?, ?, ?, ?, ?)').run(pricebookId, packSize, packPrice, unitPrice, description);
  saveDb();
  return { id: result.lastInsertRowid };
}

function removePackPricing(id) {
  const db = getDb();
  db.prepare('DELETE FROM pack_pricing WHERE id = ?').run(id);
  saveDb();
}

module.exports = {
  addStockMovement, getStockMovements, getInventoryDiscrepancy,
  getItemReturns, getItemTransfers, getPerishedItems,
  calculateValuation, getReorderAlerts,
  getItemBarcodes, addBarcode, removeBarcode,
  getPackPricing, addPackPricing, removePackPricing
};
