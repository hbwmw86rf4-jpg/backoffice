const { getDb, saveDb } = require('./schema');

function addTankReading(reading) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO tank_readings (tank_id, fuel_grade, reading_date, reading_time, current_level, tank_capacity, temperature, water_level, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reading.tank_id, reading.fuel_grade, reading.reading_date, reading.reading_time || '',
      reading.current_level, reading.tank_capacity || 0, reading.temperature || null,
      reading.water_level || 0, reading.source || 'manual');
  saveDb();
  return { id: result.lastInsertRowid };
}

function getTankReadings(tankId, startDate, endDate) {
  const db = getDb();
  let query = 'SELECT * FROM tank_readings WHERE 1=1';
  const params = [];

  if (tankId) {
    query += ' AND tank_id = ?';
    params.push(tankId);
  }
  if (startDate) {
    query += ' AND reading_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND reading_date <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY reading_date DESC, reading_time DESC';

  return db.prepare(query).all(...params);
}

function addFuelDelivery(delivery) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO fuel_deliveries (delivery_date, delivery_time, fuel_grade, gallons_delivered, cost_per_gallon, total_cost, supplier, invoice_number, tank_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(delivery.delivery_date, delivery.delivery_time || '', delivery.fuel_grade,
      delivery.gallons_delivered, delivery.cost_per_gallon || 0, delivery.total_cost || 0,
      delivery.supplier || '', delivery.invoice_number || '', delivery.tank_id || '');
  saveDb();
  return { id: result.lastInsertRowid };
}

function getFuelDeliveries(startDate, endDate) {
  const db = getDb();
  let query = 'SELECT * FROM fuel_deliveries WHERE 1=1';
  const params = [];

  if (startDate) {
    query += ' AND delivery_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND delivery_date <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY delivery_date DESC, delivery_time DESC';

  return db.prepare(query).all(...params);
}

function getTankStatus() {
  const db = getDb();

  const tanks = db.prepare(`
    SELECT DISTINCT tank_id, fuel_grade
    FROM tank_readings
    ORDER BY tank_id
  `).all();

  const tankStatus = [];

  for (const tank of tanks) {
    const latestReading = db.prepare(`
      SELECT * FROM tank_readings
      WHERE tank_id = ? AND fuel_grade = ?
      ORDER BY reading_date DESC, reading_time DESC
      LIMIT 1
    `).get(tank.tank_id, tank.fuel_grade);

    const { total_delivered } = db.prepare(`
      SELECT COALESCE(SUM(gallons_delivered), 0) as total_delivered
      FROM fuel_deliveries
      WHERE tank_id = ? AND fuel_grade = ? AND delivery_date >= ?
    `).get(tank.tank_id, tank.fuel_grade, latestReading ? latestReading.reading_date : '2000-01-01');

    const { total_sold } = db.prepare(`
      SELECT COALESCE(SUM(ti.quantity), 0) as total_sold
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE ti.item_type = 'fuel' AND ti.fuel_grade_id = ?
        AND t.event_date >= ?
    `).get(tank.fuel_grade, latestReading ? latestReading.reading_date : '2000-01-01');

    const calculatedLevel = latestReading ?
      (latestReading.current_level + total_delivered - total_sold) : 0;

    tankStatus.push({
      ...tank,
      latest_reading: latestReading,
      total_delivered,
      total_sold,
      calculated_level,
      percent_full: latestReading && latestReading.tank_capacity > 0 ?
        (calculatedLevel / latestReading.tank_capacity * 100).toFixed(1) : 0
    });
  }

  return tankStatus;
}

function getFuelSalesByGrade(startDate, endDate) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;

  return db.prepare(`
    SELECT
      ti.fuel_grade_id,
      ti.description as grade_name,
      COALESCE(SUM(ti.quantity), 0) as total_gallons,
      COALESCE(SUM(ti.total_amount), 0) as total_sales,
      COALESCE(AVG(ti.unit_price), 0) as avg_price
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'fuel'
    GROUP BY ti.fuel_grade_id, ti.description
  `).all(start, end);
}

module.exports = {
  addTankReading, getTankReadings, addFuelDelivery, getFuelDeliveries,
  getTankStatus, getFuelSalesByGrade
};
