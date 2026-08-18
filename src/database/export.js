const { getDb } = require('./schema');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function exportToCSV(data, filename) {
  if (!data || data.length === 0) {
    return { error: 'No data to export' };
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  const exportDir = path.join(__dirname, '..', '..', 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const filePath = path.join(exportDir, filename);
  XLSX.writeFile(wb, filePath);
  return { success: true, filePath, records: data.length };
}

async function exportToExcel(data, filename, sheetName) {
  if (!data || data.length === 0) {
    return { error: 'No data to export' };
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Data');

  const exportDir = path.join(__dirname, '..', '..', 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const filePath = path.join(exportDir, filename);
  XLSX.writeFile(wb, filePath);
  return { success: true, filePath, records: data.length };
}

async function generatePDF(data, filename, options) {
  const PDFDocument = require('pdfkit');
  const exportDir = path.join(__dirname, '..', '..', 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const filePath = path.join(exportDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'letter', layout: 'landscape' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    if (options.title) {
      doc.fontSize(18).font('Helvetica-Bold').text(options.title, { align: 'center' });
      doc.moveDown(0.5);
    }

    if (options.subtitle) {
      doc.fontSize(12).font('Helvetica').text(options.subtitle, { align: 'center' });
      doc.moveDown(1);
    }

    if (options.date) {
      doc.fontSize(10).text(`Date: ${options.date}`, { align: 'right' });
      doc.moveDown(0.5);
    }

    if (data && data.length > 0) {
      const headers = Object.keys(data[0]);
      const colWidth = (doc.page.width - 60) / headers.length;

      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        doc.text(header, 30 + (i * colWidth), doc.y, { width: colWidth - 5, continued: false });
      });
      doc.moveDown(0.3);
      doc.moveTo(30, doc.y).lineTo(doc.page.width - 30, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font('Helvetica').fontSize(7);
      data.forEach(row => {
        if (doc.y > doc.page.height - 50) {
          doc.addPage();
        }
        headers.forEach((header, i) => {
          let value = row[header];
          if (typeof value === 'number') {
            if (header.includes('amount') || header.includes('price') || header.includes('cost') || header.includes('sales') || header.includes('total')) {
              value = '$' + value.toFixed(2);
            } else {
              value = value.toFixed(2);
            }
          }
          doc.text(String(value || ''), 30 + (i * colWidth), doc.y, { width: colWidth - 5, continued: false });
        });
        doc.moveDown(0.2);
      });
    } else {
      doc.text('No data available');
    }

    doc.end();
    stream.on('finish', () => resolve({ success: true, filePath }));
    stream.on('error', reject);
  });
}

function exportSalesReport(date, format) {
  const db = getDb();
  const data = db.prepare(`
    SELECT
      transaction_id,
      cashier_id,
      register_id,
      event_time,
      gross_amount,
      net_amount,
      tax_amount,
      total_amount
    FROM transactions
    WHERE business_date = ? AND COALESCE(is_voided, 0) = 0 AND COALESCE(is_training, 0) = 0
    ORDER BY event_time
  `).all(date);

  const filename = `sales_report_${date}.${format}`;
  if (format === 'csv') {
    return exportToCSV(data, filename);
  } else if (format === 'xlsx') {
    return exportToExcel(data, filename, 'Sales');
  } else if (format === 'pdf') {
    return generatePDF(data, filename, { title: 'Sales Report', date: date });
  }
}

function exportFuelReport(startDate, endDate, format) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  const data = db.prepare(`
    SELECT
      ti.fuel_grade_id,
      ti.description as grade_name,
      ti.fuel_position_id as pump,
      ti.quantity as gallons,
      ti.unit_price as ppg,
      ti.total_amount as sales,
      t.business_date,
      t.event_time
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'fuel' AND COALESCE(t.is_voided, 0) = 0 AND COALESCE(t.is_training, 0) = 0
    ORDER BY t.business_date, t.event_time
  `).all(start, end);

  const filename = `fuel_report_${start}_${end}.${format}`;
  if (format === 'csv') {
    return exportToCSV(data, filename);
  } else if (format === 'xlsx') {
    return exportToExcel(data, filename, 'Fuel');
  } else if (format === 'pdf') {
    return generatePDF(data, filename, { title: 'Fuel Sales Report', startDate: start, endDate: end });
  }
}

function exportCStoreReport(startDate, endDate, format) {
  const db = getDb();
  const start = startDate || new Date().toLocaleDateString('en-CA');
  const end = endDate || start;
  const data = db.prepare(`
    SELECT
      ti.upc,
      ti.description,
      d.name as department,
      ti.quantity as qty,
      ti.unit_price as price,
      ti.total_amount as sales,
      t.business_date,
      t.event_time
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    LEFT JOIN pricebook pb ON ti.upc = pb.upc
    LEFT JOIN departments d ON pb.department_id = d.id
    WHERE t.business_date BETWEEN ? AND ?
      AND ti.item_type = 'cstore' AND COALESCE(t.is_voided, 0) = 0 AND COALESCE(t.is_training, 0) = 0
    ORDER BY t.business_date, t.event_time
  `).all(start, end);

  const filename = `cstore_report_${start}_${end}.${format}`;
  if (format === 'csv') {
    return exportToCSV(data, filename);
  } else if (format === 'xlsx') {
    return exportToExcel(data, filename, 'C-Store');
  } else if (format === 'pdf') {
    return generatePDF(data, filename, { title: 'C-Store Sales Report', startDate: start, endDate: end });
  }
}

function exportPricebook(format) {
  const db = getDb();
  const data = db.prepare(`
    SELECT
      pb.upc,
      pb.name,
      d.name as department,
      pb.vendor,
      pb.cost,
      pb.price,
      ROUND((pb.price - pb.cost) / pb.price * 100, 1) as margin_pct
    FROM pricebook pb
    LEFT JOIN departments d ON pb.department_id = d.id
    ORDER BY d.name, pb.name
  `).all();

  const filename = `pricebook_export.${format}`;
  if (format === 'csv') {
    return exportToCSV(data, filename);
  } else if (format === 'xlsx') {
    return exportToExcel(data, filename, 'Pricebook');
  } else if (format === 'pdf') {
    return generatePDF(data, filename, { title: 'Pricebook Export' });
  }
}

function exportPaymentReport(date, format) {
  const db = getDb();
  const data = db.prepare(`
    SELECT
      p.tender_code,
      p.tender_sub_code,
      COUNT(*) as count,
      SUM(p.amount) as total,
      p.provider_id
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.id
    WHERE t.business_date = ? AND t.is_voided = 0 AND t.is_training = 0
    GROUP BY p.tender_code, p.tender_sub_code, p.provider_id
    ORDER BY total DESC
  `).all(date);

  const filename = `payment_report_${date}.${format}`;
  if (format === 'csv') {
    return exportToCSV(data, filename);
  } else if (format === 'xlsx') {
    return exportToExcel(data, filename, 'Payments');
  } else if (format === 'pdf') {
    return generatePDF(data, filename, { title: 'Payment Report', date: date });
  }
}

module.exports = {
  exportToCSV, exportToExcel, generatePDF,
  exportSalesReport, exportFuelReport, exportCStoreReport,
  exportPricebook, exportPaymentReport
};
