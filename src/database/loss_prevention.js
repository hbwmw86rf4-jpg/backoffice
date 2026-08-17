const { getDb, saveDb } = require('./schema');

function logEvent(event) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO loss_prevention_events (event_type, severity, cashier_id, register_id, description, amount, transaction_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(event.event_type, event.severity || 'info', event.cashier_id, event.register_id, event.description, event.amount || 0, event.transaction_id);
  return { id: result.lastInsertRowid };
}

function getEvents(filters = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM loss_prevention_events WHERE 1=1';
  const params = [];
  if (filters.event_type) { sql += ' AND event_type = ?'; params.push(filters.event_type); }
  if (filters.severity) { sql += ' AND severity = ?'; params.push(filters.severity); }
  if (filters.cashier_id) { sql += ' AND cashier_id = ?'; params.push(filters.cashier_id); }
  if (filters.start_date) { sql += ' AND created_at >= ?'; params.push(filters.start_date); }
  if (filters.end_date) { sql += ' AND created_at <= ?'; params.push(filters.end_date + ' 23:59:59'); }
  if (filters.resolved !== undefined) { sql += ' AND resolved = ?'; params.push(filters.resolved ? 1 : 0); }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
  return db.prepare(sql).all(...params);
}

function resolveEvent(id, resolvedBy) {
  const db = getDb();
  db.prepare('UPDATE loss_prevention_events SET resolved = 1, resolved_by = ?, resolved_at = datetime("now") WHERE id = ?').run(resolvedBy, id);
  saveDb();
  return { success: true };
}

function getEventSummary(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  const byType = db.prepare(`
    SELECT event_type, severity, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
    FROM loss_prevention_events
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY event_type, severity
    ORDER BY count DESC
  `).all(start, end);
  const unresolved = db.prepare('SELECT COUNT(*) as count FROM loss_prevention_events WHERE resolved = 0').get();
  const recentAlerts = db.prepare('SELECT * FROM loss_prevention_events WHERE resolved = 0 ORDER BY created_at DESC LIMIT 10').all();
  return { byType, unresolved: unresolved.count, recentAlerts };
}

function getCashierAuditSummary(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT
      cashier_id,
      COUNT(*) as total_events,
      SUM(CASE WHEN event_type = 'voided_transaction' THEN 1 ELSE 0 END) as voids,
      SUM(CASE WHEN event_type = 'cashier_deletion' THEN 1 ELSE 0 END) as deletions,
      SUM(CASE WHEN event_type = 'large_sale' THEN 1 ELSE 0 END) as large_sales,
      SUM(CASE WHEN event_type = 'no_sale' THEN 1 ELSE 0 END) as no_sales,
      SUM(CASE WHEN event_type = 'refund' THEN 1 ELSE 0 END) as refunds,
      SUM(CASE WHEN event_type = 'discount_given' THEN 1 ELSE 0 END) as discounts,
      SUM(amount) as total_flagged_amount
    FROM loss_prevention_events
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY cashier_id
    ORDER BY total_events DESC
  `).all(start, end);
}

function checkThresholdAlerts() {
  const db = getDb();
  const alerts = [];
  const largeVoids = db.prepare(`
    SELECT cashier_id, COUNT(*) as count, SUM(amount) as total
    FROM loss_prevention_events
    WHERE event_type = 'voided_transaction' AND date(created_at) = date('now')
    GROUP BY cashier_id HAVING count > 5 OR total > 500
  `).all();
  largeVoids.forEach(v => {
    alerts.push({ type: 'excessive_voids', cashier_id: v.cashier_id, count: v.count, total: v.total });
  });
  const largeRefunds = db.prepare(`
    SELECT cashier_id, COUNT(*) as count, SUM(amount) as total
    FROM loss_prevention_events
    WHERE event_type = 'refund' AND date(created_at) = date('now')
    GROUP BY cashier_id HAVING count > 3 OR total > 200
  `).all();
  largeRefunds.forEach(r => {
    alerts.push({ type: 'excessive_refunds', cashier_id: r.cashier_id, count: r.count, total: r.total });
  });
  const noSales = db.prepare(`
    SELECT cashier_id, COUNT(*) as count
    FROM loss_prevention_events
    WHERE event_type = 'no_sale' AND date(created_at) = date('now')
    GROUP BY cashier_id HAVING count > 10
  `).all();
  noSales.forEach(n => {
    alerts.push({ type: 'excessive_no_sales', cashier_id: n.cashier_id, count: n.count });
  });
  return alerts;
}

module.exports = { logEvent, getEvents, resolveEvent, getEventSummary, getCashierAuditSummary, checkThresholdAlerts };
