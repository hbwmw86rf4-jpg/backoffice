const { getDb, saveDb } = require('./schema');

function addScheduledPriceChange(change) {
  const db = getDb();
  const result = db.prepare('INSERT INTO scheduled_price_changes (pricebook_id, old_price, new_price, effective_date, effective_time, expiration_date, expiration_time, is_recurring, recurrence_pattern, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(change.pricebook_id, change.old_price, change.new_price, change.effective_date, change.effective_time || '00:00', change.expiration_date, change.expiration_time || '23:59', change.is_recurring ? 1 : 0, change.recurrence_pattern, change.created_by);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getScheduledPriceChanges(status) {
  const db = getDb();
  let sql = `SELECT spc.*, pb.name, pb.upc, d.name as department
    FROM scheduled_price_changes spc
    JOIN pricebook pb ON spc.pricebook_id = pb.id
    LEFT JOIN departments d ON pb.department_id = d.id`;
  const params = [];
  if (status) { sql += ' WHERE spc.status = ?'; params.push(status); }
  sql += ' ORDER BY spc.effective_date DESC, spc.effective_time DESC';
  return db.prepare(sql).all(...params);
}

function applyScheduledPriceChanges() {
  const db = getDb();
  const now = new Date();
  const today = now.toLocaleDateString('en-CA');
  const currentTime = now.toTimeString().slice(0, 5);
  const pending = db.prepare("SELECT * FROM scheduled_price_changes WHERE status = 'scheduled' AND (effective_date < ? OR (effective_date = ? AND effective_time <= ?))").all(today, today, currentTime);
  let applied = 0;
  pending.forEach(change => {
    db.prepare('UPDATE pricebook SET price = ?, last_updated = datetime("now") WHERE id = ?').run(change.new_price, change.pricebook_id);
    db.prepare('INSERT INTO price_history (pricebook_id, old_price, new_price, change_type) VALUES (?, ?, ?, ?)').run(change.pricebook_id, change.old_price, change.new_price, 'scheduled');
    if (change.is_recurring && change.expiration_date) {
      db.prepare("UPDATE scheduled_price_changes SET status = 'applied', applied_at = datetime('now') WHERE id = ?").run(change.id);
    } else {
      db.prepare("UPDATE scheduled_price_changes SET status = 'applied', applied_at = datetime('now') WHERE id = ?").run(change.id);
    }
    applied++;
  });
  saveDb();
  return { applied };
}

function cancelScheduledPriceChange(id) {
  const db = getDb();
  db.prepare("UPDATE scheduled_price_changes SET status = 'cancelled' WHERE id = ?").run(id);
  saveDb();
  return { success: true };
}

function deleteScheduledPriceChange(id) {
  const db = getDb();
  db.prepare('DELETE FROM scheduled_price_changes WHERE id = ?').run(id);
  saveDb();
}

module.exports = { addScheduledPriceChange, getScheduledPriceChanges, applyScheduledPriceChanges, cancelScheduledPriceChange, deleteScheduledPriceChange };
