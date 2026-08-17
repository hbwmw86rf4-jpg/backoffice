const { getDb, saveDb } = require('./schema');

// Supplier CRUD
function getSuppliers() {
  const db = getDb();
  return db.prepare('SELECT * FROM suppliers ORDER BY name').all();
}

function addSupplier(supplier) {
  const db = getDb();
  const result = db.prepare('INSERT INTO suppliers (supplier_id, name, contact_name, phone, email, address, lead_time_days, payment_terms, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(supplier.supplier_id, supplier.name, supplier.contact_name, supplier.phone, supplier.email, supplier.address, supplier.lead_time_days || 7, supplier.payment_terms || 30, supplier.notes);
  saveDb();
  return { id: result.lastInsertRowid };
}

function updateSupplier(id, supplier) {
  const db = getDb();
  db.prepare('UPDATE suppliers SET name=?, contact_name=?, phone=?, email=?, address=?, lead_time_days=?, payment_terms=?, is_active=?, notes=? WHERE id=?').run(supplier.name, supplier.contact_name, supplier.phone, supplier.email, supplier.address, supplier.lead_time_days, supplier.payment_terms, supplier.is_active ? 1 : 0, supplier.notes, id);
  saveDb();
  return { success: true };
}

function deleteSupplier(id) {
  const db = getDb();
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  saveDb();
}

// Supplier Items (Matrix)
function getSupplierItems(supplierId) {
  const db = getDb();
  return db.prepare('SELECT si.*, pb.name, pb.upc, pb.cost as internal_cost FROM supplier_items si JOIN pricebook pb ON si.pricebook_id = pb.id WHERE si.supplier_id = ? ORDER BY pb.name').all(supplierId);
}

function addSupplierItem(supplierId, pricebookId, supplierUpc, supplierCost, packSize, isPrimary) {
  const db = getDb();
  const result = db.prepare('INSERT OR REPLACE INTO supplier_items (supplier_id, pricebook_id, supplier_upc, supplier_cost, pack_size, is_primary) VALUES (?, ?, ?, ?, ?, ?)').run(supplierId, pricebookId, supplierUpc, supplierCost || 0, packSize || 1, isPrimary ? 1 : 0);
  saveDb();
  return { id: result.lastInsertRowid };
}

function removeSupplierItem(id) {
  const db = getDb();
  db.prepare('DELETE FROM supplier_items WHERE id = ?').run(id);
  saveDb();
}

function getBestSupplierForItem(pricebookId) {
  const db = getDb();
  return db.prepare('SELECT si.*, s.name as supplier_name FROM supplier_items si JOIN suppliers s ON si.supplier_id = s.id WHERE si.pricebook_id = ? AND s.is_active = 1 ORDER BY si.supplier_cost ASC LIMIT 1').get(pricebookId);
}

// Purchase Orders
function getPurchaseOrders(status) {
  const db = getDb();
  let sql = 'SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id';
  const params = [];
  if (status) { sql += ' WHERE po.status = ?'; params.push(status); }
  sql += ' ORDER BY po.order_date DESC';
  return db.prepare(sql).all(...params);
}

function getPurchaseOrder(id) {
  const db = getDb();
  const po = db.prepare('SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?').get(id);
  if (!po) return null;
  po.items = db.prepare('SELECT poi.*, pb.name, pb.upc FROM purchase_order_items poi LEFT JOIN pricebook pb ON poi.pricebook_id = pb.id WHERE poi.po_id = ?').all(id);
  return po;
}

function createPurchaseOrder(po) {
  const db = getDb();
  const poNum = 'PO-' + Date.now();
  const result = db.prepare('INSERT INTO purchase_orders (po_number, supplier_id, order_date, expected_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(poNum, po.supplier_id, po.order_date, po.expected_date, po.notes, po.created_by);
  const poId = result.lastInsertRowid;
  if (po.items && po.items.length > 0) {
    const insertItem = db.prepare('INSERT INTO purchase_order_items (po_id, pricebook_id, description, quantity_ordered, unit_cost, total_cost) VALUES (?, ?, ?, ?, ?, ?)');
    let total = 0;
    po.items.forEach(item => {
      const itemTotal = (item.quantity || 0) * (item.unit_cost || 0);
      insertItem.run(poId, item.pricebook_id, item.description, item.quantity, item.unit_cost, itemTotal);
      total += itemTotal;
    });
    db.prepare('UPDATE purchase_orders SET total_amount = ? WHERE id = ?').run(total, poId);
  }
  saveDb();
  return { id: poId, po_number: poNum };
}

function receivePurchaseOrder(poId, receivedItems, receivedBy) {
  const db = getDb();
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId);
  if (!po) return { error: 'PO not found' };
  receivedItems.forEach(item => {
    db.prepare('UPDATE purchase_order_items SET quantity_received = ? WHERE id = ?').run(item.quantity_received, item.po_item_id);
    if (item.quantity_received > 0) {
      db.prepare("INSERT INTO stock_movements (movement_date, movement_type, pricebook_id, quantity, unit_cost, total_cost, reference_type, reference_id, created_by) VALUES (date('now'), 'receive', ?, ?, ?, ?, 'po', ?, ?)").run(item.pricebook_id, item.quantity_received, item.unit_cost, item.quantity_received * item.unit_cost, poId, receivedBy);
    }
  });
  db.prepare("UPDATE purchase_orders SET status = 'received', received_date = date('now') WHERE id = ?").run(poId);
  saveDb();
  return { success: true };
}

function getPOsBySupplier(supplierId) {
  const db = getDb();
  return db.prepare('SELECT * FROM purchase_orders WHERE supplier_id = ? ORDER BY order_date DESC').all(supplierId);
}

// Supplier Deliveries
function addSupplierDelivery(delivery) {
  const db = getDb();
  const result = db.prepare('INSERT INTO supplier_deliveries (po_id, supplier_id, delivery_date, delivery_time, invoice_number, invoice_amount, received_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(delivery.po_id, delivery.supplier_id, delivery.delivery_date, delivery.delivery_time, delivery.invoice_number, delivery.invoice_amount, delivery.received_by, delivery.notes);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getSupplierDeliveries(startDate, endDate, supplierId) {
  const db = getDb();
  let sql = 'SELECT sd.*, s.name as supplier_name, po.po_number FROM supplier_deliveries sd LEFT JOIN suppliers s ON sd.supplier_id = s.id LEFT JOIN purchase_orders po ON sd.po_id = po.id WHERE 1=1';
  const params = [];
  if (startDate) { sql += ' AND sd.delivery_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND sd.delivery_date <= ?'; params.push(endDate); }
  if (supplierId) { sql += ' AND sd.supplier_id = ?'; params.push(supplierId); }
  sql += ' ORDER BY sd.delivery_date DESC';
  return db.prepare(sql).all(...params);
}

// Supplier Returns
function addSupplierReturn(returnData) {
  const db = getDb();
  const result = db.prepare('INSERT INTO supplier_returns (return_date, supplier_id, pricebook_id, quantity, unit_cost, total_cost, reason, return_type, processed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(returnData.return_date, returnData.supplier_id, returnData.pricebook_id, returnData.quantity, returnData.unit_cost, (returnData.quantity || 0) * (returnData.unit_cost || 0), returnData.reason, returnData.return_type || 'damaged', returnData.processed_by);
  db.prepare("INSERT INTO stock_movements (movement_date, movement_type, pricebook_id, quantity, unit_cost, total_cost, reference_type, reference_id, created_by) VALUES (?, 'return_out', ?, ?, ?, ?, 'supplier_return', ?, ?)").run(returnData.return_date, returnData.pricebook_id, -returnData.quantity, returnData.unit_cost, Math.abs(returnData.quantity) * returnData.unit_cost, result.lastInsertRowid, returnData.processed_by);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getSupplierReturns(startDate, endDate, supplierId) {
  const db = getDb();
  let sql = 'SELECT sr.*, s.name as supplier_name, pb.name as item_name, pb.upc FROM supplier_returns sr LEFT JOIN suppliers s ON sr.supplier_id = s.id LEFT JOIN pricebook pb ON sr.pricebook_id = pb.id WHERE 1=1';
  const params = [];
  if (startDate) { sql += ' AND sr.return_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND sr.return_date <= ?'; params.push(endDate); }
  if (supplierId) { sql += ' AND sr.supplier_id = ?'; params.push(supplierId); }
  sql += ' ORDER BY sr.return_date DESC';
  return db.prepare(sql).all(...params);
}

// EDI
function createEdiDocument(doc) {
  const db = getDb();
  const docNum = 'EDI-' + Date.now();
  const result = db.prepare('INSERT INTO edi_documents (doc_type, direction, document_number, supplier_id, raw_data) VALUES (?, ?, ?, ?, ?)').run(doc.doc_type, doc.direction, docNum, doc.supplier_id, doc.raw_data);
  saveDb();
  return { id: result.lastInsertRowid, document_number: docNum };
}

function getEdiDocuments(filters = {}) {
  const db = getDb();
  let sql = 'SELECT ed.*, s.name as supplier_name FROM edi_documents ed LEFT JOIN suppliers s ON ed.supplier_id = s.id WHERE 1=1';
  const params = [];
  if (filters.doc_type) { sql += ' AND ed.doc_type = ?'; params.push(filters.doc_type); }
  if (filters.direction) { sql += ' AND ed.direction = ?'; params.push(filters.direction); }
  if (filters.status) { sql += ' AND ed.status = ?'; params.push(filters.status); }
  sql += ' ORDER BY ed.created_at DESC';
  return db.prepare(sql).all(...params);
}

function updateEdiStatus(id, status, errorMessage) {
  const db = getDb();
  if (status === 'sent') {
    db.prepare("UPDATE edi_documents SET status = ?, sent_at = datetime('now') WHERE id = ?").run(status, id);
  } else if (status === 'received') {
    db.prepare("UPDATE edi_documents SET status = ?, received_at = datetime('now') WHERE id = ?").run(status, id);
  } else if (status === 'ack_received') {
    db.prepare("UPDATE edi_documents SET status = 'ack_received', ack_received = 1 WHERE id = ?").run(id);
  } else {
    db.prepare('UPDATE edi_documents SET status = ?, error_message = ? WHERE id = ?').run(status, errorMessage, id);
  }
  saveDb();
  return { success: true };
}

module.exports = {
  getSuppliers, addSupplier, updateSupplier, deleteSupplier,
  getSupplierItems, addSupplierItem, removeSupplierItem, getBestSupplierForItem,
  getPurchaseOrders, getPurchaseOrder, createPurchaseOrder, receivePurchaseOrder, getPOsBySupplier,
  addSupplierDelivery, getSupplierDeliveries,
  addSupplierReturn, getSupplierReturns,
  createEdiDocument, getEdiDocuments, updateEdiStatus
};
