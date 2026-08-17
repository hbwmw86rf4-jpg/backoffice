const { getDb, saveDb } = require('./schema');
const brandsData = require('../data/brands.json');

function createGroup(group) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO item_groups (name, description, group_type, condition_type, condition_value, price_adjustment_type, price_adjustment_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(group.name, group.description, group.group_type || 'manual', group.condition_type, group.condition_value, group.price_adjustment_type || 'percentage', group.price_adjustment_value || 0);
  saveDb();
  return { id: result.lastInsertRowid };
}

function updateGroup(id, group) {
  const db = getDb();
  db.prepare(`
    UPDATE item_groups SET name = ?, description = ?, condition_type = ?, condition_value = ?, price_adjustment_type = ?, price_adjustment_value = ?
    WHERE id = ?
  `).run(group.name, group.description, group.condition_type, group.condition_value, group.price_adjustment_type, group.price_adjustment_value, id);
  saveDb();
  return { success: true };
}

function deleteGroup(id) {
  const db = getDb();
  db.prepare('DELETE FROM group_items WHERE group_id = ?').run(id);
  db.prepare('DELETE FROM item_groups WHERE id = ?').run(id);
  saveDb();
  return { success: true };
}

function getGroups() {
  const db = getDb();
  return db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM group_items WHERE group_id = g.id) as item_count
    FROM item_groups g
    ORDER BY g.name
  `).all();
}

function getGroupItems(groupId) {
  const db = getDb();
  return db.prepare(`
    SELECT pb.*, d.name as department, gi.id as group_item_id
    FROM group_items gi
    JOIN pricebook pb ON gi.pricebook_id = pb.id
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE gi.group_id = ?
    ORDER BY pb.name
  `).all(groupId);
}

function addItemsToGroup(groupId, pricebookIds) {
  const db = getDb();
  let added = 0;
  const stmt = db.prepare('INSERT OR IGNORE INTO group_items (group_id, pricebook_id) VALUES (?, ?)');
  for (const pbId of pricebookIds) {
    stmt.run(groupId, pbId);
    added++;
  }
  saveDb();
  return { added };
}

function removeItemFromGroup(groupId, pricebookId) {
  const db = getDb();
  db.prepare('DELETE FROM group_items WHERE group_id = ? AND pricebook_id = ?').run(groupId, pricebookId);
  saveDb();
  return { success: true };
}

function populateGroupFromCondition(groupId) {
  const db = getDb();
  const group = db.prepare('SELECT * FROM item_groups WHERE id = ?').get(groupId);
  if (!group) return { error: 'Group not found' };

  db.prepare('DELETE FROM group_items WHERE group_id = ?').run(groupId);

  let query = 'SELECT id FROM pricebook WHERE 1=1';
  const params = [];

  if (group.condition_type === 'department' && group.condition_value) {
    query += ' AND department_id IN (SELECT id FROM departments WHERE name = ?)';
    params.push(group.condition_value);
  } else if (group.condition_type === 'brand' && group.condition_value) {
    const brand = getBrandByName(group.condition_value);
    if (brand && brand.upc_prefix) {
      query += ' AND upc LIKE ?';
      params.push(brand.upc_prefix + '%');
    }
  } else if (group.condition_type === 'price_min' && group.condition_value) {
    query += ' AND price >= ?';
    params.push(parseFloat(group.condition_value));
  } else if (group.condition_type === 'price_max' && group.condition_value) {
    query += ' AND price <= ?';
    params.push(parseFloat(group.condition_value));
  } else if (group.condition_type === 'upc_prefix' && group.condition_value) {
    query += ' AND upc LIKE ?';
    params.push(group.condition_value + '%');
  } else if (group.condition_type === 'vendor' && group.condition_value) {
    query += ' AND vendor LIKE ?';
    params.push('%' + group.condition_value + '%');
  } else if (group.condition_type === 'name_contains' && group.condition_value) {
    query += ' AND name LIKE ?';
    params.push('%' + group.condition_value + '%');
  }

  const rows = db.prepare(query).all(...params);
  const insertStmt = db.prepare('INSERT OR IGNORE INTO group_items (group_id, pricebook_id) VALUES (?, ?)');
  let added = 0;
  for (const row of rows) {
    insertStmt.run(groupId, row.id);
    added++;
  }
  saveDb();
  return { added };
}

function batchUpdatePrices(groupId, adjustmentType, adjustmentValue) {
  const db = getDb();
  const items = db.prepare(`
    SELECT gi.pricebook_id, pb.price, pb.cost
    FROM group_items gi
    JOIN pricebook pb ON gi.pricebook_id = pb.id
    WHERE gi.group_id = ?
  `).all(groupId);

  const updateStmt = db.prepare('UPDATE pricebook SET price = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?');
  const histStmt = db.prepare('INSERT INTO price_history (pricebook_id, old_price, new_price, change_type) VALUES (?, ?, ?, ?)');

  let updated = 0;
  for (const item of items) {
    let newPrice = item.price;
    if (adjustmentType === 'percentage') {
      newPrice = item.price * (1 + adjustmentValue / 100);
    } else if (adjustmentType === 'fixed_amount') {
      newPrice = item.price + adjustmentValue;
    } else if (adjustmentType === 'set_price') {
      newPrice = adjustmentValue;
    } else if (adjustmentType === 'markup_cost') {
      newPrice = item.cost * (1 + adjustmentValue / 100);
    }

    newPrice = Math.round(newPrice * 100) / 100;

    histStmt.run(item.pricebook_id, item.price, newPrice, adjustmentType);
    updateStmt.run(newPrice, item.pricebook_id);
    updated++;
  }

  saveDb();
  return { updated, adjustmentType, adjustmentValue };
}

function getAllBrands() {
  const brands = [];
  for (const [category, brandList] of Object.entries(brandsData)) {
    for (const brand of brandList) {
      brands.push({ ...brand, category });
    }
  }
  return brands;
}

function getBrandByName(name) {
  const brands = getAllBrands();
  return brands.find(b => b.name.toLowerCase() === name.toLowerCase());
}

function autoAssignBrands() {
  const db = getDb();
  const brands = getAllBrands();
  let assigned = 0;

  const selectStmt = db.prepare('SELECT id FROM pricebook WHERE upc LIKE ? AND (vendor = ? OR vendor IS NULL OR vendor = ?)');
  const updateStmt = db.prepare('UPDATE pricebook SET vendor = ? WHERE id = ?');

  for (const brand of brands) {
    for (const prefix of brand.upc_prefixes) {
      const rows = selectStmt.all(prefix + '%', '', brand.name);
      for (const row of rows) {
        updateStmt.run(brand.name, row.id);
        assigned++;
      }
    }
  }
  saveDb();
  return { assigned };
}

module.exports = {
  createGroup, updateGroup, deleteGroup, getGroups, getGroupItems,
  addItemsToGroup, removeItemFromGroup, populateGroupFromCondition,
  batchUpdatePrices, getAllBrands, autoAssignBrands
};
