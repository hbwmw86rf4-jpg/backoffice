const { getDb, saveDb } = require('./schema');

function addLotterySale(sale) {
  const db = getDb();
  const result = db.prepare('INSERT INTO lottery_sales (sale_date, game_name, ticket_number, sale_amount, payout_amount, commission, register_id, cashier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(sale.sale_date, sale.game_name, sale.ticket_number, sale.sale_amount || 0, sale.payout_amount || 0, sale.commission || 0, sale.register_id, sale.cashier_id);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getLotterySales(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare(`
    SELECT ls.*, e.name as cashier_name
    FROM lottery_sales ls
    LEFT JOIN employees e ON ls.cashier_id = e.employee_id
    WHERE ls.sale_date BETWEEN ? AND ?
    ORDER BY ls.sale_date DESC, ls.created_at DESC
  `).all(start, end);
}

function getLotterySummary(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  const byGame = db.prepare(`
    SELECT game_name, COUNT(*) as tickets_sold, COALESCE(SUM(sale_amount), 0) as total_sales, COALESCE(SUM(payout_amount), 0) as total_payouts, COALESCE(SUM(commission), 0) as total_commission
    FROM lottery_sales WHERE sale_date BETWEEN ? AND ?
    GROUP BY game_name ORDER BY total_sales DESC
  `).all(start, end);
  const totals = db.prepare(`
    SELECT COUNT(*) as total_tickets, COALESCE(SUM(sale_amount), 0) as total_sales, COALESCE(SUM(payout_amount), 0) as total_payouts, COALESCE(SUM(commission), 0) as total_commission
    FROM lottery_sales WHERE sale_date BETWEEN ? AND ?
  `).get(start, end);
  return { byGame, totals, startDate: start, endDate: end };
}

function addLotteryReconciliation(recon) {
  const db = getDb();
  const result = db.prepare('INSERT INTO lottery_reconciliation (recon_date, game_name, beginning_inventory, tickets_received, tickets_sold, tickets_returned, ending_inventory, total_sales, total_payouts, reconciled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(recon.recon_date, recon.game_name, recon.beginning_inventory || 0, recon.tickets_received || 0, recon.tickets_sold || 0, recon.tickets_returned || 0, recon.ending_inventory || 0, recon.total_sales || 0, recon.total_payouts || 0, recon.reconciled_by);
  saveDb();
  return { id: result.lastInsertRowid };
}

function getLotteryReconciliations(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  return db.prepare('SELECT * FROM lottery_reconciliation WHERE recon_date BETWEEN ? AND ? ORDER BY recon_date DESC').all(start, end);
}

function getLotteryReconciliationSummary(date) {
  const db = getDb();
  const sales = db.prepare('SELECT game_name, COALESCE(SUM(tickets_sold), 0) as sold, COALESCE(SUM(total_sales), 0) as sales, COALESCE(SUM(total_payouts), 0) as payouts FROM lottery_reconciliation WHERE recon_date = ? GROUP BY game_name').all(date);
  const totals = db.prepare('SELECT COALESCE(SUM(tickets_sold), 0) as sold, COALESCE(SUM(total_sales), 0) as sales, COALESCE(SUM(total_payouts), 0) as payouts, COALESCE(SUM(total_sales) - SUM(total_payouts), 0) as net FROM lottery_reconciliation WHERE recon_date = ?').get(date);
  return { date, byGame: sales, totals };
}

module.exports = { addLotterySale, getLotterySales, getLotterySummary, addLotteryReconciliation, getLotteryReconciliations, getLotteryReconciliationSummary };
