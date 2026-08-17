// Universal IPC bridge (works in Electron desktop app AND in Web Browser)
const isElectron = typeof window !== 'undefined' && typeof window.require === 'function';

const ipcRenderer = isElectron ?
  window.require('electron').ipcRenderer :
  {
    invoke: async (channel, ...args) => {
      const res = await fetch('/api/ipc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, args })
      });
      if (res.status === 401) {
        window.location.replace('/login.html');
        throw new Error('Unauthorized');
      }
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `IPC Error: ${res.statusText}`);
      }
      return await res.json();
    }
  };

let currentDate = new Date().toLocaleDateString('en-CA');

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function checkAuth() {
  if (isElectron) {
    const label = document.getElementById('currentUserLabel');
    if (label) label.textContent = 'Store Manager';
    return;
  }
  try {
    const res = await fetch('/api/auth-status');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.replace('/login.html');
    } else if (data.user && data.user.username) {
      const label = document.getElementById('currentUserLabel');
      if (label) label.textContent = data.user.username;
    }
  } catch (e) {
    console.warn('Auth check error:', e);
  }
}

function initializeApp() {
  checkAuth();
  setupNavigation();
  setupDateControls();
  setupEventListeners();
  loadDashboard();
  loadDatesWithData();

  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    if (isElectron) {
      signOutBtn.style.display = 'none';
    } else {
      signOutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.replace('/login.html');
      });
    }
  }
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${view}`).classList.add('active');
      loadViewData(view);
    });
  });
}

function setupDateControls() {
  document.getElementById('reportDate').value = currentDate;

  document.getElementById('prevDate').addEventListener('click', () => {
    currentDate = addDays(currentDate, -1);
    document.getElementById('reportDate').value = currentDate;
    refreshCurrentView();
  });

  document.getElementById('nextDate').addEventListener('click', () => {
    currentDate = addDays(currentDate, 1);
    document.getElementById('reportDate').value = currentDate;
    refreshCurrentView();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    currentDate = new Date().toLocaleDateString('en-CA');
    document.getElementById('reportDate').value = currentDate;
    refreshCurrentView();
  });

  document.getElementById('reportDate').addEventListener('change', (e) => {
    currentDate = e.target.value;
    refreshCurrentView();
  });
}

function setupEventListeners() {
  document.getElementById('importSingleXml').addEventListener('click', async () => {
    const status = document.getElementById('xmlImportStatus');
    status.className = 'import-status loading';
    status.textContent = 'Importing...';
    const result = await ipcRenderer.invoke('import-xml');
    if (result.status === 'success') {
      status.className = 'import-status success';
      status.textContent = `Imported ${result.recordsImported} transactions`;
    } else if (result.status === 'canceled') {
      status.style.display = 'none';
    } else {
      status.className = 'import-status error';
      status.textContent = `Error: ${result.message}`;
    }
    loadImportLog();
  });

  document.getElementById('importAllXml').addEventListener('click', async () => {
    const status = document.getElementById('xmlImportStatus');
    status.className = 'import-status loading';
    status.textContent = 'Importing all XML files...';
    const result = await ipcRenderer.invoke('import-all-xml');
    status.className = 'import-status success';
    status.textContent = `Processed ${result.totalFiles} files, imported ${result.totalImported} transactions`;
    loadImportLog();
    loadDashboard();
  });

  document.getElementById('importPricebookFile').addEventListener('click', async () => {
    const status = document.getElementById('pricebookImportStatus');
    status.className = 'import-status loading';
    status.textContent = 'Importing pricebook...';
    const result = await ipcRenderer.invoke('import-pricebook');
    if (result.status === 'success') {
      status.className = 'import-status success';
      status.textContent = `Imported ${result.recordsImported} items`;
    } else if (result.status === 'canceled') {
      status.style.display = 'none';
    } else {
      status.className = 'import-status error';
      status.textContent = `Error: ${result.message}`;
    }
    loadImportLog();
    loadInventory();
  });

  document.getElementById('importPricebookBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('import-pricebook');
    if (result.status === 'success') {
      loadInventory();
    }
  });

  document.getElementById('loadFuelReport').addEventListener('click', () => {
    loadFuelReport();
  });

  document.getElementById('loadCstoreReport').addEventListener('click', () => {
    loadCstoreReport();
  });

  document.getElementById('loadPaymentReport').addEventListener('click', () => {
    loadPaymentReport();
  });

  document.getElementById('loadCashierReport').addEventListener('click', () => {
    loadCashierReport();
  });

  document.getElementById('loadShiftReport').addEventListener('click', () => {
    loadShiftReport();
  });

  document.getElementById('addEmployeeBtn').addEventListener('click', () => {
    openEmployeeModal();
  });

  document.getElementById('employeeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveEmployee();
  });

  document.getElementById('inventorySearch').addEventListener('input', debounce((e) => {
    inventoryPage = 0;
    loadInventoryPage();
  }, 300));

  document.getElementById('inventoryPageSize').addEventListener('change', () => {
    inventoryPageSize = parseInt(document.getElementById('inventoryPageSize').value) || 100;
    inventoryPage = 0;
    loadInventoryPage();
  });

  document.getElementById('editItemForm').addEventListener('submit', saveEditItem);
  document.getElementById('editItemCost').addEventListener('input', updateEditMargin);
  document.getElementById('editItemPrice').addEventListener('input', updateEditMargin);

  document.getElementById('addNewItemBtn').addEventListener('click', async () => {
    document.getElementById('editItemId').value = '';
    document.getElementById('editItemUpc').value = '';
    document.getElementById('editItemName').value = '';
    document.getElementById('editItemVendor').value = '';
    document.getElementById('editItemCost').value = '0';
    document.getElementById('editItemPrice').value = '0';
    document.getElementById('editItemActive').value = '1';
    document.getElementById('editItemAgeRestriction').value = '';

    const depts = await ipcRenderer.invoke('get-departments-list');
    const deptSelect = document.getElementById('editItemDept');
    deptSelect.innerHTML = '<option value="">-- None --</option>' + depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    const taxRates = await ipcRenderer.invoke('get-tax-rates');
    const taxSelect = document.getElementById('editItemTaxRate');
    taxSelect.innerHTML = '<option value="">-- None --</option>' + taxRates.map(t => `<option value="${t.id}">${t.name} (${t.rate}%)</option>`).join('');

    updateEditMargin();
    document.getElementById('editItemDeleteBtn').style.display = 'none';
    document.getElementById('editItemError').style.display = 'none';
    document.getElementById('editItemModalTitle').textContent = 'New Item';
    document.getElementById('editItemModal').style.display = 'flex';
  });

  // Tax Rates
  document.getElementById('addTaxRateBtn').addEventListener('click', () => openTaxRateModal());
  document.getElementById('taxRateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('taxRateId').value;
    const data = {
      name: document.getElementById('taxRateName').value.trim(),
      rate: parseFloat(document.getElementById('taxRateValue').value) || 0
    };
    if (!data.name) { alert('Name is required.'); return; }
    if (id) {
      await ipcRenderer.invoke('update-tax-rate', parseInt(id), data);
    } else {
      await ipcRenderer.invoke('add-tax-rate', data);
    }
    closeTaxRateModal();
    loadTaxRates();
  });

  document.getElementById('reassignTaxBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('reassign-tax-rates');
    alert(`Assigned tax rates to ${result.assigned} items.`);
    loadTaxRates();
  });

  // Bulk Updates
  document.getElementById('bulkSearchBtn').addEventListener('click', searchBulkItems);
  document.getElementById('bulkSaveBtn').addEventListener('click', () => saveBulkChanges(false));
  document.getElementById('bulkSendBtn').addEventListener('click', () => saveBulkChanges(true));
  document.getElementById('bulkSelectAll').addEventListener('change', (e) => {
    document.querySelectorAll('.bulk-check').forEach(cb => { cb.checked = e.target.checked; });
  });
  document.querySelectorAll('.bulk-col-apply').forEach(btn => {
    btn.addEventListener('click', () => applyBulkColumn(btn.dataset.col));
  });

  // Group item search
  document.getElementById('groupItemSearchBtn').addEventListener('click', async () => {
    const filters = {
      name: document.getElementById('groupItemSearchInput').value.trim(),
      department: document.getElementById('groupItemSearchDept').value,
      tax_rate_id: document.getElementById('groupItemSearchTax').value || undefined,
      min_price: document.getElementById('groupItemSearchMinPrice').value,
      max_price: document.getElementById('groupItemSearchMaxPrice').value,
      age_restriction: document.getElementById('groupItemSearchAge').value
    };
    const items = await ipcRenderer.invoke('search-items-filtered', filters);
    const results = document.getElementById('groupItemResults');
    results.innerHTML = items.slice(0, 50).map(i => `
      <div style="display:flex; align-items:center; padding:4px 6px; border-bottom:1px solid #e5e7eb; cursor:pointer;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">
        <span style="flex:1;">${i.name} (${i.upc})</span>
        <span style="color:#6b7280; margin-right:8px;">${formatCurrency(i.price)}</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="addGroupItem(${i.id}, '${i.upc}', '${(i.name||'').replace(/'/g, "\\'")}')">Add</button>
      </div>
    `).join('') || '<div style="padding:8px; color:#9ca3af;">No items found</div>';
  });

  // Promo item search
  document.getElementById('promoItemSearchBtn').addEventListener('click', async () => {
    const filters = {
      name: document.getElementById('promoItemSearchInput').value.trim(),
      department: document.getElementById('promoItemSearchDept').value,
      tax_rate_id: document.getElementById('promoItemSearchTax').value || undefined,
      min_price: document.getElementById('promoItemSearchMinPrice').value,
      max_price: document.getElementById('promoItemSearchMaxPrice').value,
      age_restriction: document.getElementById('promoItemSearchAge').value
    };
    const items = await ipcRenderer.invoke('search-items-filtered', filters);
    const results = document.getElementById('promoItemResults');
    results.innerHTML = items.slice(0, 50).map(i => `
      <div style="display:flex; align-items:center; padding:4px 6px; border-bottom:1px solid #e5e7eb; cursor:pointer;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">
        <span style="flex:1;">${i.name} (${i.upc})</span>
        <span style="color:#6b7280; margin-right:8px;">${formatCurrency(i.price)}</span>
        <button type="button" class="btn btn-sm btn-primary" onclick="addPromoItem(${i.id}, '${i.upc}', '${(i.name||'').replace(/'/g, "\\'")}')">Add</button>
      </div>
    `).join('') || '<div style="padding:8px; color:#9ca3af;">No items found</div>';
  });

  // Load bulk filters on init
  initBulkUpdates();

  // Groups
  const groupCatFilter = document.getElementById('groupCategoryFilter');
  if (groupCatFilter) {
    groupCatFilter.addEventListener('change', () => loadGroups());
  }

  const groupSearchInp = document.getElementById('groupSearchInput');
  if (groupSearchInp) {
    groupSearchInp.addEventListener('input', () => filterGroupsTable());
  }

  const seedBtn = document.getElementById('seedRetailGroupsBtn');
  if (seedBtn) {
    seedBtn.addEventListener('click', seedRetailGroupsAction);
  }

  const createGrpBtn = document.getElementById('createGroupBtn');
  if (createGrpBtn) {
    createGrpBtn.addEventListener('click', () => openGroupModal());
  }

  const grpForm = document.getElementById('groupForm');
  if (grpForm) {
    grpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveGroup();
    });
  }

  const refreshGrpBtn = document.getElementById('refreshGroupItemsBtn');
  if (refreshGrpBtn) {
    refreshGrpBtn.addEventListener('click', async () => {
      if (currentGroupId) {
        await ipcRenderer.invoke('populate-group-from-condition', currentGroupId);
        viewGroupItems(currentGroupId, currentGroupName);
      }
    });
  }

  const batchBtn = document.getElementById('batchUpdateBtn');
  if (batchBtn) {
    batchBtn.addEventListener('click', executeBatchPriceUpdate);
  }

  // Tank Gauge
  document.getElementById('addTankReadingBtn').addEventListener('click', openTankReadingModal);
  document.getElementById('tankReadingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTankReading();
  });
  document.getElementById('addFuelDeliveryBtn').addEventListener('click', openFuelDeliveryModal);
  document.getElementById('fuelDeliveryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveFuelDelivery();
  });
  document.getElementById('refreshTankStatusBtn').addEventListener('click', loadTankGauge);

  // Exports
  document.getElementById('exportSalesBtn').addEventListener('click', exportSales);
  document.getElementById('exportFuelBtn').addEventListener('click', exportFuel);
  document.getElementById('exportCstoreBtn').addEventListener('click', exportCStore);
  document.getElementById('exportPricebookBtn').addEventListener('click', exportPricebookData);
  document.getElementById('exportPaymentBtn').addEventListener('click', exportPayments);

  // Send to POS
  document.getElementById('scanOutboxBtn').addEventListener('click', scanOutbox);
  document.getElementById('refreshPendingBtn').addEventListener('click', loadPendingChanges);
  document.getElementById('sendAllPendingBtn').addEventListener('click', sendAllPending);
  document.getElementById('checkAckBtn').addEventListener('click', checkAckFiles);
  document.getElementById('refreshPosSyncLogBtn').addEventListener('click', loadPosSyncLog);

  // Promotions
  document.getElementById('createComboBtn').addEventListener('click', () => openPromoModal('combo'));
  document.getElementById('createMixMatchBtn').addEventListener('click', () => openPromoModal('mixmatch'));
  document.getElementById('createItemListBtn').addEventListener('click', () => openPromoModal('itemlist'));
  document.getElementById('promoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePromo();
  });
  document.getElementById('promoType').addEventListener('change', updatePromoForm);
}

function loadViewData(view) {
  switch (view) {
    case 'dashboard': loadDashboard(); break;
    case 'groups': loadGroups(); break;
    case 'fuel': loadFuelReport(); break;
    case 'cstore': loadCstoreReport(); break;
    case 'payments': loadPaymentReport(); break;
    case 'cashiers': loadCashierReport(); break;
    case 'shifts': loadShiftReport(); break;
    case 'employees': loadEmployees(); break;
    case 'inventory': loadInventory(); break;
    case 'import': loadImportLog(); break;
    case 'sendtopos': loadPendingChanges(); loadSendHistory(); break;
    case 'possynclog': loadPosSyncLog(); break;
    case 'promotions': loadPromotions(); break;
  }
}

function refreshCurrentView() {
  const activeView = document.querySelector('.nav-item.active');
  if (activeView) {
    loadViewData(activeView.dataset.view);
  }
}

async function loadDashboard() {
  const data = await ipcRenderer.invoke('get-dashboard-data', currentDate);

  document.getElementById('totalSales').textContent = formatCurrency(data.sales.total_collected);
  document.getElementById('fuelSales').textContent = formatCurrency(data.fuel.fuel_sales);
  document.getElementById('cstoreSales').textContent = formatCurrency(data.cstore.cstore_sales);
  document.getElementById('totalTx').textContent = data.sales.total_transactions;
  document.getElementById('totalGallons').textContent = formatNumber(data.fuel.fuel_gallons);
  document.getElementById('totalTax').textContent = formatCurrency(data.sales.total_tax);

  renderPaymentChart(data.payments);
  renderHourlyChart(data.hourlySales);
  renderCashierChart(data.topCashiers);
}

function renderPaymentChart(payments) {
  const container = document.getElementById('paymentChart');
  if (!payments || payments.length === 0) {
    container.innerHTML = '<div class="empty-state">No payment data</div>';
    return;
  }

  const maxTotal = Math.max(...payments.map(p => p.total));
  container.innerHTML = payments.map(p => {
    const pct = (p.total / maxTotal) * 100;
    const cssClass = getPaymentClass(p.tender_code);
    return `
      <div class="chart-bar">
        <div class="chart-bar-label">${formatPaymentType(p.tender_code)}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill ${cssClass}" style="width:${pct}%">${p.count}</div>
        </div>
        <div class="chart-bar-value">${formatCurrency(p.total)}</div>
      </div>
    `;
  }).join('');
}

function renderHourlyChart(hourly) {
  const container = document.getElementById('hourlyChart');
  if (!hourly || hourly.length === 0) {
    container.innerHTML = '<div class="empty-state">No hourly data</div>';
    return;
  }

  const maxSales = Math.max(...hourly.map(h => h.sales));
  container.innerHTML = hourly.map(h => {
    const pct = (h.sales / maxSales) * 100;
    return `
      <div class="chart-bar">
        <div class="chart-bar-label">${h.hour}:00</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill fuel" style="width:${pct}%">${h.transactions}</div>
        </div>
        <div class="chart-bar-value">${formatCurrency(h.sales)}</div>
      </div>
    `;
  }).join('');
}

function renderCashierChart(cashiers) {
  const container = document.getElementById('cashierChart');
  if (!cashiers || cashiers.length === 0) {
    container.innerHTML = '<div class="empty-state">No cashier data</div>';
    return;
  }

  const maxSales = Math.max(...cashiers.map(c => c.total_sales));
  container.innerHTML = cashiers.map(c => {
    const pct = (c.total_sales / maxSales) * 100;
    return `
      <div class="chart-bar">
        <div class="chart-bar-label">#${c.cashier_id}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill cstore" style="width:${pct}%">${c.transactions}</div>
        </div>
        <div class="chart-bar-value">${formatCurrency(c.total_sales)}</div>
      </div>
    `;
  }).join('');
}

async function loadFuelReport() {
  const startDate = document.getElementById('fuelStartDate').value || currentDate;
  const endDate = document.getElementById('fuelEndDate').value || currentDate;

  const data = await ipcRenderer.invoke('get-fuel-report', startDate, endDate);

  let totalGallons = 0, totalSales = 0, totalPrice = 0, totalPromos = 0;
  data.byGrade.forEach(g => {
    totalGallons += g.total_gallons;
    totalSales += g.total_sales;
    totalPrice += g.avg_price * g.total_gallons;
    totalPromos += g.total_promotions;
  });

  document.getElementById('fuelTotalSales').textContent = formatCurrency(totalSales);
  document.getElementById('fuelTotalGallons').textContent = formatNumber(totalGallons);
  document.getElementById('fuelAvgPrice').textContent = totalGallons > 0 ? formatCurrency(totalPrice / totalGallons) : '$0.00';
  document.getElementById('fuelPromotions').textContent = formatCurrency(Math.abs(totalPromos));

  const tbody = document.querySelector('#fuelGradeTable tbody');
  tbody.innerHTML = data.byGrade.map(g => `
    <tr>
      <td>${g.grade_name || 'Grade ' + g.fuel_grade_id}</td>
      <td>${g.transactions}</td>
      <td>${formatNumber(g.total_gallons)}</td>
      <td>${formatCurrency(g.total_sales)}</td>
      <td>${formatCurrency(g.avg_price)}</td>
      <td>${formatCurrency(Math.abs(g.total_promotions))}</td>
    </tr>
  `).join('');
}

async function loadCstoreReport() {
  const startDate = document.getElementById('cstoreStartDate').value || currentDate;
  const endDate = document.getElementById('cstoreEndDate').value || currentDate;

  const data = await ipcRenderer.invoke('get-cstore-report', startDate, endDate);

  document.getElementById('cstoreTotalSales').textContent = formatCurrency(data.totals.total_sales);
  document.getElementById('cstoreUniqueItems').textContent = data.totals.unique_items;

  renderDeptChart(data.byDepartment);

  const tbody = document.querySelector('#cstoreItemTable tbody');
  tbody.innerHTML = data.topItems.map(i => `
    <tr>
      <td>${i.upc}</td>
      <td>${i.description}</td>
      <td>${formatNumber(i.total_qty)}</td>
      <td>${formatCurrency(i.total_sales)}</td>
      <td>${i.transaction_count}</td>
    </tr>
  `).join('');
}

function renderDeptChart(departments) {
  const container = document.getElementById('deptChart');
  if (!departments || departments.length === 0) {
    container.innerHTML = '<div class="empty-state">No department data</div>';
    return;
  }

  const maxSales = Math.max(...departments.map(d => d.total_sales));
  const colors = ['fuel', 'cstore', 'credit', 'debit', 'cash', 'other'];
  container.innerHTML = departments.map((d, i) => {
    const pct = (d.total_sales / maxSales) * 100;
    return `
      <div class="chart-bar">
        <div class="chart-bar-label">${d.department}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill ${colors[i % colors.length]}" style="width:${pct}%">${d.unique_items}</div>
        </div>
        <div class="chart-bar-value">${formatCurrency(d.total_sales)}</div>
      </div>
    `;
  }).join('');
}

async function loadPaymentReport() {
  const date = document.getElementById('paymentDate').value || currentDate;
  const data = await ipcRenderer.invoke('get-payments-report', date);

  const tbody = document.querySelector('#paymentTable tbody');
  tbody.innerHTML = data.byType.map(p => `
    <tr>
      <td>${formatPaymentType(p.tender_code)}</td>
      <td>${p.tender_sub_code || '-'}</td>
      <td>${p.count}</td>
      <td>${formatCurrency(p.total)}</td>
    </tr>
  `).join('');
}

async function loadCashierReport() {
  const startDate = document.getElementById('cashierStartDate').value || currentDate;
  const endDate = document.getElementById('cashierEndDate').value || currentDate;

  const data = await ipcRenderer.invoke('get-cashier-report', startDate, endDate);

  const tbody = document.querySelector('#cashierTable tbody');
  tbody.innerHTML = data.cashiers.map(c => `
    <tr>
      <td>${c.cashier_id}</td>
      <td>${c.total_transactions}</td>
      <td>${formatCurrency(c.total_sales)}</td>
      <td>${formatCurrency(c.avg_sale)}</td>
      <td>${c.first_sale}</td>
      <td>${c.last_sale}</td>
    </tr>
  `).join('');
}

async function loadShiftReport() {
  const date = document.getElementById('shiftDate').value || currentDate;
  const data = await ipcRenderer.invoke('get-shift-report', date);

  const tbody = document.querySelector('#shiftTable tbody');
  tbody.innerHTML = data.shifts.map(s => `
    <tr>
      <td>${s.register_id}</td>
      <td>${s.till_id}</td>
      <td>${s.shift_start}</td>
      <td>${s.shift_end}</td>
      <td>${s.transactions}</td>
      <td>${formatCurrency(s.gross)}</td>
      <td>${formatCurrency(s.tax)}</td>
      <td>${formatCurrency(s.total)}</td>
    </tr>
  `).join('');
}

let allEmployees = [];
async function loadEmployees() {
  allEmployees = await ipcRenderer.invoke('get-employees');
  renderEmployeeTable(allEmployees);
}

function renderEmployeeTable(employees) {
  const tbody = document.querySelector('#employeeTable tbody');
  tbody.innerHTML = employees.map(e => `
    <tr>
      <td>${e.employee_id}</td>
      <td>${e.name}</td>
      <td>${e.role}</td>
      <td>${formatCurrency(e.hourly_rate)}/hr</td>
      <td>${e.is_active ? 'Active' : 'Inactive'}</td>
      <td>${e.hire_date || '-'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editEmployee(${e.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEmployee(${e.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

function openEmployeeModal(employee = null) {
  const modal = document.getElementById('employeeModal');
  const title = document.getElementById('employeeModalTitle');
  const form = document.getElementById('employeeForm');

  if (employee) {
    title.textContent = 'Edit Employee';
    document.getElementById('employeeId').value = employee.id;
    document.getElementById('empId').value = employee.employee_id;
    document.getElementById('empName').value = employee.name;
    document.getElementById('empRole').value = employee.role;
    document.getElementById('empRate').value = employee.hourly_rate;
    document.getElementById('empHireDate').value = employee.hire_date || '';
  } else {
    title.textContent = 'Add Employee';
    form.reset();
    document.getElementById('employeeId').value = '';
  }

  modal.style.display = 'flex';
}

function closeEmployeeModal() {
  document.getElementById('employeeModal').style.display = 'none';
}

async function saveEmployee() {
  const id = document.getElementById('employeeId').value;
  const employee = {
    employee_id: document.getElementById('empId').value,
    name: document.getElementById('empName').value,
    role: document.getElementById('empRole').value,
    hourly_rate: parseFloat(document.getElementById('empRate').value) || 0,
    hire_date: document.getElementById('empHireDate').value,
    is_active: true
  };

  if (id) {
    await ipcRenderer.invoke('update-employee', parseInt(id), employee);
  } else {
    await ipcRenderer.invoke('add-employee', employee);
  }

  closeEmployeeModal();
  loadEmployees();
}

async function editEmployee(id) {
  const employee = allEmployees.find(e => e.id === id);
  if (employee) openEmployeeModal(employee);
}

async function deleteEmployee(id) {
  if (confirm('Delete this employee?')) {
    await ipcRenderer.invoke('delete-employee', id);
    loadEmployees();
  }
}

let allInventoryItems = [];
let inventoryData = [];
let inventoryPage = 0;
let inventoryPageSize = 100;
let inventoryTotal = 0;

async function loadInventory() {
  inventoryPage = 0;
  inventoryPageSize = parseInt(document.getElementById('inventoryPageSize').value) || 100;
  const depts = await ipcRenderer.invoke('get-departments');
  document.getElementById('totalDepts').textContent = depts.length;
  await loadInventoryPage();
}

async function loadInventoryPage() {
  const query = document.getElementById('inventorySearch').value;
  if (query) {
    const items = await ipcRenderer.invoke('search-pricebook', query);
    inventoryData = items;
    inventoryTotal = items.length;
    document.getElementById('totalSkus').textContent = inventoryTotal;
    renderInventoryTable(items);
    renderInventoryPagination();
  } else {
    const data = await ipcRenderer.invoke('get-pricebook', inventoryPageSize, inventoryPage * inventoryPageSize);
    inventoryData = data.items;
    inventoryTotal = data.total;
    document.getElementById('totalSkus').textContent = inventoryTotal;
    renderInventoryTable(data.items);
    renderInventoryPagination();
  }
}

function renderInventoryPagination() {
  const container = document.getElementById('inventoryPagination');
  const totalPages = Math.ceil(inventoryTotal / inventoryPageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const start = inventoryPage * inventoryPageSize + 1;
  const end = Math.min((inventoryPage + 1) * inventoryPageSize, inventoryTotal);

  container.innerHTML = `
    <button class="btn btn-sm btn-secondary" ${inventoryPage === 0 ? 'disabled' : ''} onclick="goInventoryPage(0)">First</button>
    <button class="btn btn-sm btn-secondary" ${inventoryPage === 0 ? 'disabled' : ''} onclick="goInventoryPage(${inventoryPage - 1})">Prev</button>
    <span class="pagination-info">Showing ${start}-${end} of ${inventoryTotal} (Page ${inventoryPage + 1} of ${totalPages})</span>
    <button class="btn btn-sm btn-secondary" ${inventoryPage >= totalPages - 1 ? 'disabled' : ''} onclick="goInventoryPage(${inventoryPage + 1})">Next</button>
    <button class="btn btn-sm btn-secondary" ${inventoryPage >= totalPages - 1 ? 'disabled' : ''} onclick="goInventoryPage(${totalPages - 1})">Last</button>
  `;
}

function goInventoryPage(page) {
  inventoryPage = page;
  loadInventoryPage();
}

function renderInventoryTable(items) {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = items.map(i => {
    const margin = i.price > 0 ? ((i.price - i.cost) / i.price * 100).toFixed(1) : 0;
    const status = i.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">Inactive</span>';
    return `
      <tr onclick="openEditItem(${i.id})" style="cursor:pointer" title="Click to edit">
        <td>${i.upc}</td>
        <td>${i.name}</td>
        <td>${i.department || '-'}</td>
        <td>${formatCurrency(i.cost)}</td>
        <td>${formatCurrency(i.price)}</td>
        <td>${margin}%</td>
        <td>${status}</td>
      </tr>
    `;
  }).join('');
}

async function openEditItem(id) {
  const item = await ipcRenderer.invoke('get-pricebook-item', id);
  if (!item) return;

  document.getElementById('editItemId').value = item.id;
  document.getElementById('editItemUpc').value = item.upc || '';
  document.getElementById('editItemName').value = item.name || '';
  document.getElementById('editItemVendor').value = item.vendor || '';
  document.getElementById('editItemCost').value = item.cost || 0;
  document.getElementById('editItemPrice').value = item.price || 0;
  document.getElementById('editItemActive').value = item.is_active;
  document.getElementById('editItemAgeRestriction').value = item.age_restriction || '';

  // Load departments
  const depts = await ipcRenderer.invoke('get-departments-list');
  const deptSelect = document.getElementById('editItemDept');
  deptSelect.innerHTML = '<option value="">-- None --</option>' + depts.map(d => `<option value="${d.id}" ${d.id === item.department_id ? 'selected' : ''}>${d.name}</option>`).join('');

  // Load tax rates
  const taxRates = await ipcRenderer.invoke('get-tax-rates');
  const taxSelect = document.getElementById('editItemTaxRate');
  taxSelect.innerHTML = '<option value="">-- None --</option>' + taxRates.map(t => `<option value="${t.id}" ${t.id === item.tax_rate_id ? 'selected' : ''}>${t.name} (${t.rate}%)</option>`).join('');

  updateEditMargin();
  document.getElementById('editItemDeleteBtn').style.display = 'inline-block';
  document.getElementById('editItemError').style.display = 'none';
  document.getElementById('editItemModalTitle').textContent = `Edit: ${item.name}`;
  document.getElementById('editItemModal').style.display = 'flex';
}

function updateEditMargin() {
  const cost = parseFloat(document.getElementById('editItemCost').value) || 0;
  const price = parseFloat(document.getElementById('editItemPrice').value) || 0;
  const margin = price > 0 ? ((price - cost) / price * 100).toFixed(1) : 0;
  document.getElementById('editItemMargin').textContent = `Margin: ${margin}%`;
}

function closeEditItemModal() {
  document.getElementById('editItemModal').style.display = 'none';
}

async function deleteEditItem() {
  const id = document.getElementById('editItemId').value;
  if (!id) return;
  if (!confirm('Delete this item? This cannot be undone.')) return;
  await ipcRenderer.invoke('delete-pricebook-item', parseInt(id));
  closeEditItemModal();
  loadInventoryPage();
}

async function saveEditItem(e) {
  e.preventDefault();
  const idVal = document.getElementById('editItemId').value;
  const data = {
    upc: document.getElementById('editItemUpc').value.trim(),
    name: document.getElementById('editItemName').value.trim(),
    department_id: document.getElementById('editItemDept').value ? parseInt(document.getElementById('editItemDept').value) : null,
    vendor: document.getElementById('editItemVendor').value.trim() || null,
    cost: parseFloat(document.getElementById('editItemCost').value) || 0,
    price: parseFloat(document.getElementById('editItemPrice').value) || 0,
    tax_rate_id: document.getElementById('editItemTaxRate').value ? parseInt(document.getElementById('editItemTaxRate').value) : null,
    age_restriction: document.getElementById('editItemAgeRestriction').value ? parseInt(document.getElementById('editItemAgeRestriction').value) : null,
    is_active: parseInt(document.getElementById('editItemActive').value)
  };

  if (!data.upc || !data.name) {
    alert('UPC and Name are required.');
    return;
  }

  if (idVal) {
    await ipcRenderer.invoke('update-pricebook-item', parseInt(idVal), data);
  } else {
    const result = await ipcRenderer.invoke('add-pricebook-item', data);
    if (!result.success) {
      document.getElementById('editItemError').textContent = result.error;
      document.getElementById('editItemError').style.display = 'block';
      return;
    }
  }
  closeEditItemModal();
  loadInventoryPage();
}

async function loadDatesWithData() {
  const dates = await ipcRenderer.invoke('get-dates-with-data');
  if (dates.length > 0 && !dates.includes(currentDate)) {
    currentDate = dates[0];
    document.getElementById('reportDate').value = currentDate;
  }
}

function formatCurrency(amount) {
  return '$' + (parseFloat(amount) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatNumber(num) {
  return (parseFloat(num) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPaymentType(code) {
  const types = {
    'creditCards': 'Credit Card',
    'debitCards': 'Debit Card',
    'cash': 'Cash',
    'outsideCredit': 'Outside Credit',
    'outsideDebit': 'Outside Debit',
    'checks': 'Check',
    'giftCards': 'Gift Card',
    'lottery': 'Lottery',
    'other': 'Other'
  };
  return types[code] || code;
}

function getPaymentClass(code) {
  if (code.includes('credit')) return 'credit';
  if (code.includes('debit')) return 'debit';
  if (code === 'cash') return 'cash';
  return 'other';
}

function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}

// Tank Gauge
let tankStatusData = [];

async function loadTankGauge() {
  tankStatusData = await ipcRenderer.invoke('get-tank-status');
  renderTankStatus();
  loadRecentDeliveries();
  loadFuelGradeChart();
}

function renderTankStatus() {
  const container = document.getElementById('tankStatusContainer');
  if (tankStatusData.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No tank data</h3><p>Add tank readings to track fuel levels</p></div>';
    return;
  }

  container.innerHTML = tankStatusData.map(tank => {
    const percent = parseFloat(tank.percent_full) || 0;
    const color = percent > 50 ? '#22c55e' : percent > 25 ? '#eab308' : '#ef4444';
    return `
      <div class="stat-card">
        <div class="stat-label">Tank ${tank.tank_id} - ${tank.fuel_grade}</div>
        <div class="stat-value" style="color: ${color}">${percent}%</div>
        <div style="margin-top: 10px; background: #f1f5f9; border-radius: 4px; height: 20px; overflow: hidden;">
          <div style="width: ${percent}%; height: 100%; background: ${color}; transition: width 0.3s;"></div>
        </div>
        <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
          ${tank.calculated_level.toFixed(0)} / ${tank.latest_reading ? tank.latest_reading.tank_capacity : 0} gal
        </div>
      </div>
    `;
  }).join('');
}

async function loadRecentDeliveries() {
  const deliveries = await ipcRenderer.invoke('get-fuel-deliveries');
  const tbody = document.querySelector('#deliveriesTable tbody');
  tbody.innerHTML = deliveries.slice(0, 10).map(d => `
    <tr>
      <td>${d.delivery_date}</td>
      <td>${d.fuel_grade}</td>
      <td>${formatNumber(d.gallons_delivered)}</td>
      <td>${formatCurrency(d.cost_per_gallon)}</td>
      <td>${formatCurrency(d.total_cost)}</td>
      <td>${d.supplier || '-'}</td>
    </tr>
  `).join('');
}

async function loadFuelGradeChart() {
  const sales = await ipcRenderer.invoke('get-fuel-sales-by-grade', currentDate, currentDate);
  const container = document.getElementById('fuelGradeChart');

  if (!sales || sales.length === 0) {
    container.innerHTML = '<div class="empty-state">No fuel sales data</div>';
    return;
  }

  const maxGallons = Math.max(...sales.map(s => s.total_gallons));
  container.innerHTML = sales.map(s => {
    const pct = (s.total_gallons / maxGallons) * 100;
    return `
      <div class="chart-bar">
        <div class="chart-bar-label">${s.grade_name}</div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill fuel" style="width:${pct}%">${s.total_gallons.toFixed(0)}</div>
        </div>
        <div class="chart-bar-value">${formatCurrency(s.total_sales)}</div>
      </div>
    `;
  }).join('');
}

function openTankReadingModal() {
  document.getElementById('tankReadingForm').reset();
  document.getElementById('readingDate').value = currentDate;
  document.getElementById('tankReadingModal').style.display = 'flex';
}

function closeTankReadingModal() {
  document.getElementById('tankReadingModal').style.display = 'none';
}

async function saveTankReading() {
  const reading = {
    tank_id: document.getElementById('tankId').value,
    fuel_grade: document.getElementById('fuelGrade').value,
    reading_date: document.getElementById('readingDate').value,
    reading_time: document.getElementById('readingTime').value,
    current_level: parseFloat(document.getElementById('currentLevel').value),
    tank_capacity: parseFloat(document.getElementById('tankCapacity').value) || 0,
    temperature: parseFloat(document.getElementById('temperature').value) || null,
    water_level: parseFloat(document.getElementById('waterLevel').value) || 0
  };

  await ipcRenderer.invoke('add-tank-reading', reading);
  closeTankReadingModal();
  loadTankGauge();
}

function openFuelDeliveryModal() {
  document.getElementById('fuelDeliveryForm').reset();
  document.getElementById('deliveryDate').value = currentDate;
  document.getElementById('fuelDeliveryModal').style.display = 'flex';
}

function closeFuelDeliveryModal() {
  document.getElementById('fuelDeliveryModal').style.display = 'none';
}

async function saveFuelDelivery() {
  const delivery = {
    delivery_date: document.getElementById('deliveryDate').value,
    delivery_time: document.getElementById('deliveryTime').value,
    fuel_grade: document.getElementById('deliveryGrade').value,
    gallons_delivered: parseFloat(document.getElementById('gallonsDelivered').value),
    cost_per_gallon: parseFloat(document.getElementById('costPerGallon').value) || 0,
    total_cost: parseFloat(document.getElementById('totalCost').value) || 0,
    supplier: document.getElementById('supplier').value,
    invoice_number: document.getElementById('invoiceNumber').value,
    tank_id: document.getElementById('deliveryTankId').value
  };

  await ipcRenderer.invoke('add-fuel-delivery', delivery);
  closeFuelDeliveryModal();
  loadTankGauge();
}

// Exports
async function exportSales() {
  const date = document.getElementById('exportSalesDate').value || currentDate;
  const format = document.getElementById('exportSalesFormat').value;
  showExportStatus('Generating sales report...');
  const result = await ipcRenderer.invoke('export-sales-report', date, format);
  showExportStatus(result.success ? `Exported to: ${result.filePath}` : `Error: ${result.error}`, result.success);
}

async function exportFuel() {
  const startDate = document.getElementById('exportFuelStart').value || currentDate;
  const endDate = document.getElementById('exportFuelEnd').value || currentDate;
  const format = document.getElementById('exportFuelFormat').value;
  showExportStatus('Generating fuel report...');
  const result = await ipcRenderer.invoke('export-fuel-report', startDate, endDate, format);
  showExportStatus(result.success ? `Exported to: ${result.filePath}` : `Error: ${result.error}`, result.success);
}

async function exportCStore() {
  const startDate = document.getElementById('exportCstoreStart').value || currentDate;
  const endDate = document.getElementById('exportCstoreEnd').value || currentDate;
  const format = document.getElementById('exportCstoreFormat').value;
  showExportStatus('Generating C-Store report...');
  const result = await ipcRenderer.invoke('export-cstore-report', startDate, endDate, format);
  showExportStatus(result.success ? `Exported to: ${result.filePath}` : `Error: ${result.error}`, result.success);
}

async function exportPricebookData() {
  const format = document.getElementById('exportPricebookFormat').value;
  showExportStatus('Generating pricebook export...');
  const result = await ipcRenderer.invoke('export-pricebook', format);
  showExportStatus(result.success ? `Exported to: ${result.filePath}` : `Error: ${result.error}`, result.success);
}

async function exportPayments() {
  const date = document.getElementById('exportPaymentDate').value || currentDate;
  const format = document.getElementById('exportPaymentFormat').value;
  showExportStatus('Generating payment report...');
  const result = await ipcRenderer.invoke('export-payment-report', date, format);
  showExportStatus(result.success ? `Exported to: ${result.filePath}` : `Error: ${result.error}`, result.success);
}

function showExportStatus(message, success) {
  const status = document.getElementById('exportStatus');
  status.style.display = 'block';
  status.className = `import-status ${success === false ? 'error' : 'success'}`;
  status.textContent = message;
}

async function loadInventoryFull() {
  inventoryPage = 0;
  inventoryPageSize = parseInt(document.getElementById('inventoryPageSize').value) || 100;
  await loadInventoryPage();
}

// Send to POS
async function scanOutbox() {
  const btn = document.getElementById('scanOutboxBtn');
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  try {
    const result = await ipcRenderer.invoke('scan-all-outbox');
    const msg = `BOOutBox: ${result.boOutbox.processed} processed, FuelOutBox: ${result.fuelOutbox.processed} processed`;
    alert(msg);
    await loadPendingChanges();
  } catch (e) {
    alert('Scan error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan BOOutBox';
  }
}

async function loadPendingChanges() {
  const changes = await ipcRenderer.invoke('get-pending-changes');
  document.getElementById('pendingCount').textContent = changes.length;
  const tbody = document.querySelector('#pendingChangesTable tbody');
  tbody.innerHTML = changes.map(c => `
    <tr>
      <td>${c.upc}</td>
      <td>${c.name}</td>
      <td>${c.department || '-'}</td>
      <td>${formatCurrency(c.old_price)}</td>
      <td>${formatCurrency(c.new_price)}</td>
      <td>${c.changed_at}</td>
      <td><button class="btn btn-sm btn-primary" onclick="sendSingleItem(${JSON.stringify(c).replace(/"/g, '&quot;')})">Send</button></td>
    </tr>
  `).join('');
}

async function loadSendHistory() {
  const history = await ipcRenderer.invoke('get-send-history');
  if (history.length > 0) {
    const lastSend = history[0];
    document.getElementById('lastSendTime').textContent = lastSend.imported_at;
  }
  const tbody = document.querySelector('#sendHistoryTable tbody');
  tbody.innerHTML = history.map(h => `
    <tr>
      <td>${h.imported_at}</td>
      <td>${h.filename}</td>
      <td>${h.file_type}</td>
      <td>${h.records_imported}</td>
      <td>${h.status}</td>
    </tr>
  `).join('');
}

async function sendAllPending() {
  const status = document.getElementById('sendStatus');
  status.style.display = 'block';
  status.className = 'import-status loading';
  status.textContent = 'Sending price changes to POS...';

  const result = await ipcRenderer.invoke('send-all-pending');

  if (result.success) {
    status.className = 'import-status success';
    status.textContent = result.message;
    loadPendingChanges();
    loadSendHistory();
  } else {
    status.className = 'import-status error';
    status.textContent = result.message || 'Error sending to POS';
  }
}

async function sendSingleItem(item) {
  const status = document.getElementById('sendStatus');
  status.style.display = 'block';
  status.className = 'import-status loading';
  status.textContent = 'Sending item to POS...';

  const result = await ipcRenderer.invoke('send-prices-to-pos', [item]);

  if (result.success) {
    status.className = 'import-status success';
    status.textContent = result.message;
    loadPendingChanges();
    loadSendHistory();
  } else {
    status.className = 'import-status error';
    status.textContent = result.message || 'Error sending item';
  }
}

async function checkAckFiles() {
  const result = await ipcRenderer.invoke('check-ack-files');
  const container = document.getElementById('ackResults');
  const content = document.getElementById('ackContent');
  container.style.display = 'block';

  if (result.acks.length === 0) {
    content.innerHTML = '<div class="empty-state">No ACK or deadletter files found</div>';
  } else {
    content.innerHTML = result.acks.map(f => `
      <div class="import-card">
        <h4>${f.filename}</h4>
        <pre style="max-height: 200px; overflow: auto; background: #f1f5f9; padding: 10px; border-radius: 4px;">${f.rawContent}</pre>
      </div>
    `).join('');
  }
}

async function loadPosSyncLog() {
  const log = await ipcRenderer.invoke('get-pos-sync-log', 200);

  const totalSends = log.length;
  const acksReceived = log.filter(l => l.ack_received === 1).length;
  const pendingAck = log.filter(l => l.ack_received === 0).length;

  document.getElementById('posSyncTotalSends').textContent = totalSends;
  document.getElementById('posSyncAcksReceived').textContent = acksReceived;
  document.getElementById('posSyncPendingAck').textContent = pendingAck;

  const tbody = document.querySelector('#posSyncLogTable tbody');
  tbody.innerHTML = log.map(l => `
    <tr>
      <td>${l.sent_at}</td>
      <td>${l.filename}</td>
      <td>${l.file_type}</td>
      <td>${l.item_count}</td>
      <td>${l.ack_received ? '<span class="status-success">' + (l.ack_status || 'OK') + '</span>' : '<span class="status-pending">Pending</span>'}</td>
      <td>${l.ack_message || '-'}</td>
      <td>${l.ack_at || '-'}</td>
    </tr>
  `).join('');
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Promotions
let promoData = { combos: [], mixMatch: [] };

async function loadPromotions() {
  const history = await ipcRenderer.invoke('get-send-history');
  document.getElementById('sentPromos').textContent = history.filter(h => h.file_type === 'naxml_sent' && (h.filename.includes('CBT') || h.filename.includes('MMT'))).length;
  
  const pending = await ipcRenderer.invoke('get-pending-changes');
  document.getElementById('activePromos').textContent = pending.length;
}

function openPromoModal(type) {
  const modal = document.getElementById('promoModal');
  const title = document.getElementById('promoModalTitle');
  
  document.getElementById('promoForm').reset();
  document.getElementById('promoType').value = type;
  document.getElementById('promoId').value = '';
  promoSelectedItems = [];
  document.getElementById('promoSelectedItems').innerHTML = '';
  document.getElementById('promoSelectedCount').textContent = '0';
  document.getElementById('promoItemResults').innerHTML = '';
  
  if (type === 'combo') {
    title.textContent = 'Create Combo Deal';
    document.getElementById('comboPriceGroup').style.display = 'block';
    document.getElementById('mixMatchTypeGroup').style.display = 'none';
    document.getElementById('requiredQtyGroup').style.display = 'none';
    document.getElementById('discountGroup').style.display = 'none';
  } else if (type === 'mixmatch') {
    title.textContent = 'Create Mix & Match';
    document.getElementById('comboPriceGroup').style.display = 'none';
    document.getElementById('mixMatchTypeGroup').style.display = 'block';
    document.getElementById('requiredQtyGroup').style.display = 'block';
    document.getElementById('discountGroup').style.display = 'block';
  } else {
    title.textContent = 'Create Item List';
    document.getElementById('comboPriceGroup').style.display = 'none';
    document.getElementById('mixMatchTypeGroup').style.display = 'none';
    document.getElementById('requiredQtyGroup').style.display = 'none';
    document.getElementById('discountGroup').style.display = 'none';
  }

  Promise.all([ipcRenderer.invoke('get-departments-list'), ipcRenderer.invoke('get-tax-rates')]).then(([depts, taxRates]) => {
    const deptSel = document.getElementById('promoItemSearchDept');
    deptSel.innerHTML = '<option value="">All Depts</option>' + depts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    const taxSel = document.getElementById('promoItemSearchTax');
    taxSel.innerHTML = '<option value="">All Tax</option>' + taxRates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  });
  
  modal.style.display = 'flex';
}

function closePromoModal() {
  document.getElementById('promoModal').style.display = 'none';
}

function updatePromoForm() {
  const type = document.getElementById('promoType').value;
  openPromoModal(type);
}

async function savePromo() {
  const type = document.getElementById('promoType').value;
  const name = document.getElementById('promoName').value;

  let items;
  if (promoSelectedItems.length > 0) {
    items = promoSelectedItems.map(i => ({ upc: i.upc, name: i.name, quantity: 1 }));
  } else {
    // Fallback to textarea
    const upcLines = document.getElementById('promoSelectedUpcs').value.split('\n').filter(l => l.trim());
    if (upcLines.length === 0) {
      alert('Please search and add at least one item');
      return;
    }
    items = upcLines.map(upc => ({ upc: upc.trim(), name: '', quantity: 1 }));
  }
  const options = {
    effectiveDate: document.getElementById('promoStartDate').value || new Date().toLocaleDateString('en-CA'),
    expirationDate: document.getElementById('promoEndDate').value || ''
  };
  
  let result;
  if (type === 'combo') {
    result = await ipcRenderer.invoke('send-combo-to-pos', {
      name,
      comboPrice: parseFloat(document.getElementById('comboPrice').value) || 0,
      items,
      expirationDate: options.expirationDate
    }, options);
  } else if (type === 'mixmatch') {
    result = await ipcRenderer.invoke('send-mixmatch-to-pos', {
      name,
      type: document.getElementById('mixMatchType').value,
      requiredQty: parseInt(document.getElementById('requiredQty').value) || 2,
      discountAmount: parseFloat(document.getElementById('discountAmount').value) || 0,
      discountType: 'fixed',
      items,
      expirationDate: options.expirationDate
    }, options);
  } else {
    result = await ipcRenderer.invoke('send-item-list-to-pos', items, {
      listName: name,
      ...options
    });
  }
  
  if (result.success) {
    alert(result.message);
    closePromoModal();
    loadPromotions();
  } else {
    alert('Error: ' + (result.message || 'Failed to send'));
  }
}

// Update loadViewData to include new views
const originalLoadViewData = loadViewData;
loadViewData = function(view) {
  originalLoadViewData(view);
  switch (view) {
    case 'groups': loadGroups(); break;
    case 'bulkupdate': searchBulkItems(); break;
    case 'tankgauge': loadTankGauge(); break;
    case 'dailybook': loadDailyBook(); break;
    case 'cashcontrol': loadCashControl(); break;
    case 'suppliers': loadSuppliers(); break;
    case 'purchaseorders': loadPurchaseOrders(); break;
    case 'accountsreceivable': loadAccountsReceivable(); break;
    case 'stockmanagement': loadStockManagement(); break;
    case 'lottery': loadLottery(); break;
    case 'scheduledprices': loadScheduledPrices(); break;
    case 'lossprevention': loadLossPrevention(); break;
    case 'extrareports': loadExtraReports(); break;
    case 'edi': loadEDI(); break;
    case 'taxrates': loadTaxRates(); break;
    case 'accounting': loadAccounting(); break;
  }
};

// === DAILY BOOK ===
async function loadDailyBook() {
  const book = await ipcRenderer.invoke('get-daily-book', currentDate);
  if (book) {
    document.getElementById('dbTotalSales').textContent = formatCurrency(book.total_sales);
    document.getElementById('dbFuelSales').textContent = formatCurrency(book.total_fuel_sales);
    document.getElementById('dbCstoreSales').textContent = formatCurrency(book.total_cstore_sales);
    document.getElementById('dbTax').textContent = formatCurrency(book.total_tax);
    document.getElementById('dbPaidIn').textContent = formatCurrency(book.paid_in);
    document.getElementById('dbPaidOut').textContent = formatCurrency(book.paid_out);
    document.getElementById('dbSafeDrops').textContent = formatCurrency(book.safe_drops);
    document.getElementById('dbStatus').innerHTML = `<span class="status-badge ${book.status}">${book.status.toUpperCase()}</span>`;
  }
  const xReport = await ipcRenderer.invoke('get-x-report', currentDate);
  const xDiv = document.getElementById('xReportContent');
  xDiv.innerHTML = `<p><strong>Transactions:</strong> ${xReport.sales.transactions}</p><p><strong>Gross Sales:</strong> ${formatCurrency(xReport.sales.gross)}</p><p><strong>Tax:</strong> ${formatCurrency(xReport.sales.tax)}</p><p><strong>Net Total:</strong> ${formatCurrency(xReport.sales.total)}</p><p><strong>Cash Collected:</strong> ${formatCurrency(xReport.cashCollected)}</p>`;
  const cash = await ipcRenderer.invoke('get-cash-summary', currentDate);
  const cashDiv = document.getElementById('cashReconContent');
  cashDiv.innerHTML = `<p><strong>Cash Sales:</strong> ${formatCurrency(cash.cashSales)}</p><p><strong>Paid In:</strong> +${formatCurrency(cash.paidIn)}</p><p><strong>Paid Out:</strong> -${formatCurrency(cash.paidOut)}</p><p><strong>Safe Drops:</strong> -${formatCurrency(cash.safeDrops)}</p><hr><p><strong>Expected in Drawer:</strong> ${formatCurrency(cash.expectedInDrawer)}</p>`;
}

document.getElementById('createDailyBookBtn').addEventListener('click', async () => {
  await ipcRenderer.invoke('create-daily-book', currentDate);
  loadDailyBook();
});

document.getElementById('closeDailyBookBtn').addEventListener('click', () => {
  document.getElementById('closeBookModal').style.display = 'flex';
});

function closeBookModal() { document.getElementById('closeBookModal').style.display = 'none'; }

document.getElementById('closeBookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const closingCash = parseFloat(document.getElementById('closingCash').value);
  const closedBy = document.getElementById('closedBy').value;
  await ipcRenderer.invoke('close-daily-book', currentDate, closingCash, closedBy);
  closeBookModal();
  loadDailyBook();
});

document.getElementById('printXReportBtn').addEventListener('click', async () => {
  const x = await ipcRenderer.invoke('get-x-report', currentDate);
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>X Report - ${currentDate}</title><style>body{font-family:monospace;padding:40px}h1{font-size:18px}table{width:100%;border-collapse:collapse}td{padding:4px 0}td:last-child{text-align:right}</style></head><body><h1>X REPORT</h1><p>Date: ${currentDate}</p><hr><p>Transactions: ${x.sales.transactions}</p><p>Gross: ${formatCurrency(x.sales.gross)}</p><p>Tax: ${formatCurrency(x.sales.tax)}</p><p>Total: ${formatCurrency(x.sales.total)}</p><p>Cash: ${formatCurrency(x.cashCollected)}</p><hr><h2>Tenders</h2><table>${x.payments.map(p => `<tr><td>${formatPaymentType(p.tender_code)}</td><td>${p.count}</td><td>${formatCurrency(p.total)}</td></tr>`).join('')}</table><script>window.print();window.close();<\/script></body></html>`);
});

// === CASH CONTROL ===
async function loadCashControl() {
  const cash = await ipcRenderer.invoke('get-cash-summary', currentDate);
  document.getElementById('ccCashSales').textContent = formatCurrency(cash.cashSales);
  document.getElementById('ccPaidIn').textContent = formatCurrency(cash.paidIn);
  document.getElementById('ccPaidOut').textContent = formatCurrency(cash.paidOut);
  document.getElementById('ccSafeDrops').textContent = formatCurrency(cash.safeDrops);
  document.getElementById('ccExpected').textContent = formatCurrency(cash.expectedInDrawer);
  const handovers = await ipcRenderer.invoke('get-payment-handovers', currentDate);
  const tbody = document.querySelector('#handoversTable tbody');
  tbody.innerHTML = handovers.map(h => `<tr><td>${h.handover_date}</td><td>${h.from_cashier}</td><td>${h.to_cashier}</td><td>${h.register_id||'-'}</td><td>${formatCurrency(h.cash_amount)}</td><td>${formatCurrency(h.card_amount)}</td><td>${formatCurrency(h.total_amount)}</td><td>${h.notes||'-'}</td></tr>`).join('');
}

document.getElementById('addCashMovementBtn').addEventListener('click', () => {
  document.getElementById('cmDate').value = currentDate;
  document.getElementById('cashMovementModal').style.display = 'flex';
});
function closeCashMovementModal() { document.getElementById('cashMovementModal').style.display = 'none'; }
document.getElementById('cashMovementForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await ipcRenderer.invoke('add-cash-movement', { movement_date: document.getElementById('cmDate').value, movement_type: document.getElementById('cmType').value, amount: parseFloat(document.getElementById('cmAmount').value), reason: document.getElementById('cmReason').value, register_id: document.getElementById('cmRegister').value, cashier_id: document.getElementById('cmCashier').value });
  closeCashMovementModal();
  loadCashControl();
});

document.getElementById('addHandoverBtn').addEventListener('click', () => {
  document.getElementById('hoDate').value = currentDate;
  document.getElementById('handoverModal').style.display = 'flex';
});
function closeHandoverModal() { document.getElementById('handoverModal').style.display = 'none'; }
document.getElementById('handoverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await ipcRenderer.invoke('add-payment-handover', { handover_date: document.getElementById('hoDate').value, from_cashier: document.getElementById('hoFrom').value, to_cashier: document.getElementById('hoTo').value, register_id: document.getElementById('hoRegister').value, till_id: document.getElementById('hoTill').value, cash_amount: parseFloat(document.getElementById('hoCash').value)||0, card_amount: parseFloat(document.getElementById('hoCard').value)||0, notes: document.getElementById('hoNotes').value });
  closeHandoverModal();
  loadCashControl();
});

document.getElementById('loadCashMovements').addEventListener('click', async () => {
  const s = document.getElementById('ccStartDate').value || currentDate;
  const e = document.getElementById('ccEndDate').value || currentDate;
  const movements = await ipcRenderer.invoke('get-cash-movements', s, e);
  const tbody = document.querySelector('#cashMovementsTable tbody');
  tbody.innerHTML = movements.map(m => `<tr><td>${m.movement_date}</td><td>${m.movement_type}</td><td>${formatCurrency(m.amount)}</td><td>${m.reason||'-'}</td><td>${m.register_id||'-'}</td><td>${m.cashier_id||'-'}</td></tr>`).join('');
});

// === SUPPLIERS ===
let allSuppliers = [];
let currentSupplierId = null;

async function loadSuppliers() {
  allSuppliers = await ipcRenderer.invoke('get-suppliers');
  const tbody = document.querySelector('#suppliersTable tbody');
  tbody.innerHTML = allSuppliers.map(s => `<tr><td>${s.supplier_id}</td><td>${s.name}</td><td>${s.contact_name||'-'}</td><td>${s.phone||'-'}</td><td>${s.lead_time_days}d</td><td>${s.payment_terms}d</td><td>${s.is_active?'Active':'Inactive'}</td><td><button class="btn btn-sm btn-primary" onclick="viewSupplierItems(${s.id},'${s.name}')">Items</button> <button class="btn btn-sm btn-secondary" onclick="editSupplier(${s.id})">Edit</button></td></tr>`).join('');
}

document.getElementById('addSupplierBtn').addEventListener('click', () => { document.getElementById('supplierForm').reset(); document.getElementById('supplierId').value = ''; document.getElementById('supplierModalTitle').textContent = 'Add Supplier'; document.getElementById('supplierModal').style.display = 'flex'; });
function closeSupplierModal() { document.getElementById('supplierModal').style.display = 'none'; }
document.getElementById('supplierForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('supplierId').value;
  const data = { supplier_id: document.getElementById('supSupplierId').value, name: document.getElementById('supName').value, contact_name: document.getElementById('supContact').value, phone: document.getElementById('supPhone').value, email: document.getElementById('supEmail').value, address: document.getElementById('supAddress').value, lead_time_days: parseInt(document.getElementById('supLeadTime').value)||7, payment_terms: parseInt(document.getElementById('supTerms').value)||30, notes: document.getElementById('supNotes').value, is_active: true };
  if (id) { await ipcRenderer.invoke('update-supplier', parseInt(id), data); } else { await ipcRenderer.invoke('add-supplier', data); }
  closeSupplierModal();
  loadSuppliers();
});

async function editSupplier(id) {
  const s = allSuppliers.find(x => x.id === id);
  if (!s) return;
  document.getElementById('supplierId').value = s.id;
  document.getElementById('supSupplierId').value = s.supplier_id;
  document.getElementById('supName').value = s.name;
  document.getElementById('supContact').value = s.contact_name||'';
  document.getElementById('supPhone').value = s.phone||'';
  document.getElementById('supEmail').value = s.email||'';
  document.getElementById('supAddress').value = s.address||'';
  document.getElementById('supLeadTime').value = s.lead_time_days;
  document.getElementById('supTerms').value = s.payment_terms;
  document.getElementById('supNotes').value = s.notes||'';
  document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
  document.getElementById('supplierModal').style.display = 'flex';
}

async function viewSupplierItems(supplierId, name) {
  currentSupplierId = supplierId;
  document.getElementById('supplierItemsContainer').style.display = 'block';
  document.getElementById('supplierItemsTitle').textContent = `Items: ${name}`;
  const items = await ipcRenderer.invoke('get-supplier-items', supplierId);
  const tbody = document.querySelector('#supplierItemsTable tbody');
  tbody.innerHTML = items.map(i => `<tr><td>${i.upc}</td><td>${i.name}</td><td>${i.supplier_upc||'-'}</td><td>${formatCurrency(i.supplier_cost)}</td><td>${i.pack_size}</td><td>${i.is_primary?'Yes':'No'}</td><td><button class="btn btn-sm btn-danger" onclick="removeSupplierItem(${i.id})">Remove</button></td></tr>`).join('');
}

async function removeSupplierItem(id) {
  if (confirm('Remove this item?')) { await ipcRenderer.invoke('remove-supplier-item', id); viewSupplierItems(currentSupplierId, document.getElementById('supplierItemsTitle').textContent.replace('Items: ','')); }
}

// === PURCHASE ORDERS ===
let allPOs = [];
async function loadPurchaseOrders() {
  allPOs = await ipcRenderer.invoke('get-purchase-orders');
  document.getElementById('pendingPOs').textContent = allPOs.filter(p => p.status === 'pending').length;
  document.getElementById('receivedPOs').textContent = allPOs.filter(p => p.status === 'received').length;
  const tbody = document.querySelector('#poTable tbody');
  tbody.innerHTML = allPOs.map(p => `<tr><td>${p.po_number}</td><td>${p.supplier_name||'-'}</td><td>${p.order_date}</td><td>${p.expected_date||'-'}</td><td>${formatCurrency(p.total_amount)}</td><td><span class="status-badge ${p.status}">${p.status}</span></td><td><button class="btn btn-sm btn-primary" onclick="viewPO(${p.id})">View</button></td></tr>`).join('');
}

document.getElementById('createPOBtn').addEventListener('click', async () => {
  const suppliers = await ipcRenderer.invoke('get-suppliers');
  const sel = document.getElementById('poSupplier');
  sel.innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('poOrderDate').value = currentDate;
  document.getElementById('poForm').reset();
  document.getElementById('poOrderDate').value = currentDate;
  document.getElementById('poModal').style.display = 'flex';
});
function closePOModal() { document.getElementById('poModal').style.display = 'none'; }
document.getElementById('poForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const itemsText = document.getElementById('poItems').value.trim();
  const items = itemsText ? itemsText.split('\n').filter(l => l.trim()).map(line => { const [upc,qty,cost] = line.split(','); return { pricebook_id: 0, description: upc, quantity: parseFloat(qty)||0, unit_cost: parseFloat(cost)||0 }; }) : [];
  await ipcRenderer.invoke('create-purchase-order', { supplier_id: parseInt(document.getElementById('poSupplier').value), order_date: document.getElementById('poOrderDate').value, expected_date: document.getElementById('poExpectedDate').value, notes: document.getElementById('poNotes').value, items });
  closePOModal();
  loadPurchaseOrders();
});

async function viewPO(id) {
  const po = await ipcRenderer.invoke('get-purchase-order', id);
  if (!po) return;
  document.getElementById('poDetailContainer').style.display = 'block';
  document.getElementById('poDetailTitle').textContent = `PO: ${po.po_number} - ${po.supplier_name}`;
  const tbody = document.querySelector('#poDetailTable tbody');
  tbody.innerHTML = po.items.map(i => `<tr><td>${i.name||i.description}</td><td>${i.upc||'-'}</td><td>${i.quantity_ordered}</td><td>${i.quantity_received}</td><td>${formatCurrency(i.unit_cost)}</td><td>${formatCurrency(i.total_cost)}</td></tr>`).join('');
}

// === ACCOUNTS RECEIVABLE ===
let allCustomers = [];
async function loadAccountsReceivable() {
  allCustomers = await ipcRenderer.invoke('get-customers');
  document.getElementById('arActiveCustomers').textContent = allCustomers.filter(c => c.is_active).length;
  const aging = await ipcRenderer.invoke('get-customer-aging');
  let totalOutstanding = 0;
  aging.forEach(a => totalOutstanding += a.total_balance);
  document.getElementById('arTotalOutstanding').textContent = formatCurrency(totalOutstanding);
  const tbody = document.querySelector('#agingTable tbody');
  tbody.innerHTML = aging.map(a => `<tr><td>${a.name}</td><td>${formatCurrency(a.days_0_30)}</td><td>${formatCurrency(a.days_30_60)}</td><td>${formatCurrency(a.days_60_90)}</td><td>${formatCurrency(a.over_90)}</td><td>${formatCurrency(a.total_balance)}</td></tr>`).join('');
  const invoices = await ipcRenderer.invoke('get-customer-invoices');
  const invTbody = document.querySelector('#invoicesTable tbody');
  invTbody.innerHTML = invoices.slice(0, 50).map(i => `<tr><td>${i.invoice_number}</td><td>${i.customer_name}</td><td>${i.invoice_date}</td><td>${i.due_date||'-'}</td><td>${formatCurrency(i.total_amount)}</td><td>${formatCurrency(i.amount_paid)}</td><td>${formatCurrency(i.balance)}</td><td><span class="status-badge ${i.status}">${i.status}</span></td></tr>`).join('');
}

document.getElementById('addCustomerBtn').addEventListener('click', () => { document.getElementById('customerForm').reset(); document.getElementById('custId').value = ''; document.getElementById('customerModalTitle').textContent = 'Add Customer'; document.getElementById('customerModal').style.display = 'flex'; });
function closeCustomerModal() { document.getElementById('customerModal').style.display = 'none'; }
document.getElementById('customerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('custId').value;
  const data = { customer_id: document.getElementById('custCustomerId').value, name: document.getElementById('custName').value, phone: document.getElementById('custPhone').value, email: document.getElementById('custEmail').value, address: document.getElementById('custAddress').value, credit_limit: parseFloat(document.getElementById('custCreditLimit').value)||0, payment_terms: parseInt(document.getElementById('custTerms').value)||30, discount_percent: parseFloat(document.getElementById('custDiscount').value)||0, notes: document.getElementById('custNotes').value, is_active: true };
  if (id) { await ipcRenderer.invoke('update-customer', parseInt(id), data); } else { await ipcRenderer.invoke('add-customer', data); }
  closeCustomerModal();
  loadAccountsReceivable();
});

document.getElementById('createInvoiceBtn').addEventListener('click', async () => {
  const sel = document.getElementById('invCustomer');
  sel.innerHTML = allCustomers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('invDate').value = currentDate;
  document.getElementById('invoiceForm').reset();
  document.getElementById('invDate').value = currentDate;
  document.getElementById('invoiceModal').style.display = 'flex';
});
function closeInvoiceModal() { document.getElementById('invoiceModal').style.display = 'none'; }
document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const subtotal = parseFloat(document.getElementById('invSubtotal').value)||0;
  const tax = parseFloat(document.getElementById('invTax').value)||0;
  const discount = parseFloat(document.getElementById('invDiscount').value)||0;
  await ipcRenderer.invoke('create-invoice', { customer_id: parseInt(document.getElementById('invCustomer').value), invoice_date: document.getElementById('invDate').value, due_date: document.getElementById('invDueDate').value, subtotal, tax_amount: tax, discount_amount: discount, total_amount: subtotal + tax - discount, notes: document.getElementById('invNotes').value });
  closeInvoiceModal();
  loadAccountsReceivable();
});

document.getElementById('recordPaymentBtn').addEventListener('click', async () => {
  const sel = document.getElementById('cpCustomer');
  sel.innerHTML = allCustomers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('cpDate').value = currentDate;
  document.getElementById('custPaymentForm').reset();
  document.getElementById('cpDate').value = currentDate;
  document.getElementById('custPaymentModal').style.display = 'flex';
});
function closeCustPaymentModal() { document.getElementById('custPaymentModal').style.display = 'none'; }
document.getElementById('cpCustomer').addEventListener('change', async () => {
  const custId = document.getElementById('cpCustomer').value;
  const invoices = await ipcRenderer.invoke('get-customer-invoices', parseInt(custId));
  const openInvoices = invoices.filter(i => i.balance > 0);
  const sel = document.getElementById('cpInvoice');
  sel.innerHTML = '<option value="">Select invoice...</option>' + openInvoices.map(i => `<option value="${i.id}">${i.invoice_number} (${formatCurrency(i.balance)})</option>`).join('');
});
document.getElementById('custPaymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await ipcRenderer.invoke('add-customer-payment', { customer_id: parseInt(document.getElementById('cpCustomer').value), invoice_id: document.getElementById('cpInvoice').value ? parseInt(document.getElementById('cpInvoice').value) : null, payment_date: document.getElementById('cpDate').value, amount: parseFloat(document.getElementById('cpAmount').value), payment_method: document.getElementById('cpMethod').value, reference_number: document.getElementById('cpReference').value });
  closeCustPaymentModal();
  loadAccountsReceivable();
});

// === STOCK MANAGEMENT ===
async function loadStockManagement() {
  const alerts = await ipcRenderer.invoke('get-reorder-alerts');
  document.getElementById('lowStockCount').textContent = alerts.length;
  const valuation = await ipcRenderer.invoke('calculate-valuation', 'weighted_average');
  let totalVal = 0;
  valuation.forEach(v => totalVal += v.total_value || 0);
  document.getElementById('totalInventoryValue').textContent = formatCurrency(totalVal);
  const tbody = document.querySelector('#reorderTable tbody');
  tbody.innerHTML = alerts.map(a => `<tr><td>${a.upc}</td><td>${a.name}</td><td>${a.department||'-'}</td><td>${a.current_stock!==null?a.current_stock:'N/A'}</td><td>${formatCurrency(a.price)}</td></tr>`).join('');
  const movements = await ipcRenderer.invoke('get-stock-movements', null, currentDate, currentDate);
  const movTbody = document.querySelector('#stockMovementsTable tbody');
  movTbody.innerHTML = movements.map(m => `<tr><td>${m.movement_date}</td><td>${m.movement_type}</td><td>${m.upc}</td><td>${m.name}</td><td>${m.quantity}</td><td>${formatCurrency(m.unit_cost)}</td><td>${formatCurrency(m.total_cost)}</td><td>${m.notes||'-'}</td></tr>`).join('');
}

function showStockTab(tab) {
  document.querySelectorAll('.stock-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('stockTab-' + tab).classList.add('active');
  document.querySelectorAll('#view-stockmanagement .tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (tab === 'discrepancy') loadDiscrepancy();
  if (tab === 'returns') loadReturns();
  if (tab === 'transfers') loadTransfers();
  if (tab === 'perished') loadPerished();
}

async function loadDiscrepancy() {
  const data = await ipcRenderer.invoke('get-inventory-discrepancy', currentDate, currentDate);
  const tbody = document.querySelector('#discrepancyTable tbody');
  tbody.innerHTML = data.map(d => `<tr><td>${d.upc}</td><td>${d.name}</td><td>${d.total_in}</td><td>${d.total_out}</td><td style="color:${d.net_movement<0?'red':'green'}">${d.net_movement}</td></tr>`).join('');
}
async function loadReturns() {
  const data = await ipcRenderer.invoke('get-item-returns', currentDate, currentDate);
  const tbody = document.querySelector('#returnsTable tbody');
  tbody.innerHTML = data.map(r => `<tr><td>${r.movement_date}</td><td>${r.movement_type}</td><td>${r.upc}</td><td>${r.name}</td><td>${r.quantity}</td><td>${formatCurrency(r.unit_cost)}</td><td>${formatCurrency(r.total_cost)}</td></tr>`).join('');
}
async function loadTransfers() {
  const data = await ipcRenderer.invoke('get-item-transfers', currentDate, currentDate);
  const tbody = document.querySelector('#transfersTable tbody');
  tbody.innerHTML = data.map(t => `<tr><td>${t.movement_date}</td><td>${t.upc}</td><td>${t.name}</td><td>${t.quantity}</td><td>${formatCurrency(t.unit_cost)}</td><td>${formatCurrency(t.total_cost)}</td><td>${t.notes||'-'}</td></tr>`).join('');
}
async function loadPerished() {
  const data = await ipcRenderer.invoke('get-perished-items', currentDate, currentDate);
  const tbody = document.querySelector('#perishedTable tbody');
  tbody.innerHTML = data.map(p => `<tr><td>${p.movement_date}</td><td>${p.movement_type}</td><td>${p.upc}</td><td>${p.name}</td><td>${p.quantity}</td><td>${formatCurrency(p.unit_cost)}</td><td>${formatCurrency(p.total_cost)}</td><td>${p.notes||'-'}</td></tr>`).join('');
}

document.getElementById('addStockMovementBtn').addEventListener('click', () => { document.getElementById('stkDate').value = currentDate; document.getElementById('stockMovementForm').reset(); document.getElementById('stkDate').value = currentDate; const itemInput = document.getElementById('stkItem'); delete itemInput.dataset.selectedItemId; delete itemInput.dataset.selectedItemUpc; delete itemInput.dataset.selectedItemCost; delete itemInput.dataset.selectedItemName; document.getElementById('stockMovementModal').style.display = 'flex'; });
function closeStockMovementModal() { document.getElementById('stockMovementModal').style.display = 'none'; }
document.getElementById('stockMovementForm').removeEventListener('submit', window._stkFormHandler);
window._stkFormHandler = async (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  const itemInput = document.getElementById('stkItem');
  const pricebookId = itemInput.dataset.selectedItemId || 0;
  await ipcRenderer.invoke('add-stock-movement', { movement_date: document.getElementById('stkDate').value, movement_type: document.getElementById('stkType').value, pricebook_id: parseInt(pricebookId), upc: itemInput.dataset.selectedItemUpc || itemInput.value, quantity: parseFloat(document.getElementById('stkQuantity').value), unit_cost: parseFloat(document.getElementById('stkCost').value)||0, notes: document.getElementById('stkNotes').value, created_by: 'user' });
  closeStockMovementModal();
  loadStockManagement();
};
document.getElementById('stockMovementForm').addEventListener('submit', window._stkFormHandler);

document.getElementById('loadStockMovements').addEventListener('click', async () => {
  const s = document.getElementById('smStartDate').value || currentDate;
  const e = document.getElementById('smEndDate').value || currentDate;
  const movements = await ipcRenderer.invoke('get-stock-movements', null, s, e);
  const tbody = document.querySelector('#stockMovementsTable tbody');
  tbody.innerHTML = movements.map(m => `<tr><td>${m.movement_date}</td><td>${m.movement_type}</td><td>${m.upc}</td><td>${m.name}</td><td>${m.quantity}</td><td>${formatCurrency(m.unit_cost)}</td><td>${formatCurrency(m.total_cost)}</td><td>${m.notes||'-'}</td></tr>`).join('');
});

// === LOTTERY ===
async function loadLottery() {
  const summary = await ipcRenderer.invoke('get-lottery-summary', currentDate, currentDate);
  document.getElementById('lotteryTotalSales').textContent = formatCurrency(summary.totals.total_sales);
  document.getElementById('lotteryTotalPayouts').textContent = formatCurrency(summary.totals.total_payouts);
  document.getElementById('lotteryNetCommission').textContent = formatCurrency(summary.totals.total_commission);
  document.getElementById('lotteryTicketsSold').textContent = summary.totals.total_tickets;
  const chart = document.getElementById('lotteryGameChart');
  if (summary.byGame.length > 0) {
    const maxSales = Math.max(...summary.byGame.map(g => g.total_sales));
    chart.innerHTML = summary.byGame.map(g => `<div class="chart-bar"><div class="chart-bar-label">${g.game_name}</div><div class="chart-bar-track"><div class="chart-bar-fill fuel" style="width:${(g.total_sales/maxSales)*100}%">${g.tickets_sold}</div></div><div class="chart-bar-value">${formatCurrency(g.total_sales)}</div></div>`).join('');
  } else { chart.innerHTML = '<div class="empty-state">No lottery data</div>'; }
  const sales = await ipcRenderer.invoke('get-lottery-sales', currentDate, currentDate);
  const tbody = document.querySelector('#lotterySalesTable tbody');
  tbody.innerHTML = sales.map(s => `<tr><td>${s.sale_date}</td><td>${s.game_name}</td><td>${s.ticket_number||'-'}</td><td>${formatCurrency(s.sale_amount)}</td><td>${formatCurrency(s.payout_amount)}</td><td>${formatCurrency(s.commission)}</td><td>${s.cashier_id||'-'}</td></tr>`).join('');
  const recons = await ipcRenderer.invoke('get-lottery-reconciliations', currentDate, currentDate);
  const reconTbody = document.querySelector('#lotteryReconTable tbody');
  reconTbody.innerHTML = recons.map(r => `<tr><td>${r.recon_date}</td><td>${r.game_name}</td><td>${r.beginning_inventory}</td><td>${r.tickets_received}</td><td>${r.tickets_sold}</td><td>${r.tickets_returned}</td><td>${r.ending_inventory}</td><td>${formatCurrency(r.total_sales)}</td><td>${formatCurrency(r.total_payouts)}</td></tr>`).join('');
}

document.getElementById('addLotterySaleBtn').addEventListener('click', () => { document.getElementById('lsDate').value = currentDate; document.getElementById('lotterySaleForm').reset(); document.getElementById('lsDate').value = currentDate; document.getElementById('lotterySaleModal').style.display = 'flex'; });
function closeLotterySaleModal() { document.getElementById('lotterySaleModal').style.display = 'none'; }
document.getElementById('lotterySaleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await ipcRenderer.invoke('add-lottery-sale', { sale_date: document.getElementById('lsDate').value, game_name: document.getElementById('lsGame').value, ticket_number: document.getElementById('lsTicket').value, sale_amount: parseFloat(document.getElementById('lsSaleAmount').value)||0, payout_amount: parseFloat(document.getElementById('lsPayoutAmount').value)||0, commission: parseFloat(document.getElementById('lsCommission').value)||0, register_id: document.getElementById('lsRegister').value, cashier_id: document.getElementById('lsCashier').value });
  closeLotterySaleModal();
  loadLottery();
});

document.getElementById('addLotteryReconBtn').addEventListener('click', () => { document.getElementById('lrDate').value = currentDate; document.getElementById('lotteryReconForm').reset(); document.getElementById('lrDate').value = currentDate; document.getElementById('lotteryReconModal').style.display = 'flex'; });
function closeLotteryReconModal() { document.getElementById('lotteryReconModal').style.display = 'none'; }
document.getElementById('lotteryReconForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await ipcRenderer.invoke('add-lottery-reconciliation', { recon_date: document.getElementById('lrDate').value, game_name: document.getElementById('lrGame').value, beginning_inventory: parseInt(document.getElementById('lrBegInv').value)||0, tickets_received: parseInt(document.getElementById('lrReceived').value)||0, tickets_sold: parseInt(document.getElementById('lrSold').value)||0, tickets_returned: parseInt(document.getElementById('lrReturned').value)||0, ending_inventory: parseInt(document.getElementById('lrEndInv').value)||0, total_sales: parseFloat(document.getElementById('lrSales').value)||0, total_payouts: parseFloat(document.getElementById('lrPayouts').value)||0 });
  closeLotteryReconModal();
  loadLottery();
});

// === SCHEDULED PRICE CHANGES ===
async function loadScheduledPrices() {
  const changes = await ipcRenderer.invoke('get-scheduled-prices');
  const tbody = document.querySelector('#scheduledPricesTable tbody');
  tbody.innerHTML = changes.map(c => `<tr><td>${c.upc}</td><td>${c.name}</td><td>${c.department||'-'}</td><td>${formatCurrency(c.old_price)}</td><td>${formatCurrency(c.new_price)}</td><td>${c.effective_date} ${c.effective_time||''}</td><td>${c.expiration_date||'-'}</td><td><span class="status-badge ${c.status}">${c.status}</span></td><td>${c.status==='scheduled'?`<button class="btn btn-sm btn-danger" onclick="cancelScheduledPrice(${c.id})">Cancel</button>`:''}</td></tr>`).join('');
}

document.getElementById('addScheduledPriceBtn').addEventListener('click', () => { document.getElementById('spEffDate').value = currentDate; document.getElementById('scheduledPriceForm').reset(); document.getElementById('spEffDate').value = currentDate; const itemInput = document.getElementById('spItem'); delete itemInput.dataset.selectedItemId; delete itemInput.dataset.selectedItemUpc; delete itemInput.dataset.selectedItemCost; delete itemInput.dataset.selectedItemPrice; delete itemInput.dataset.selectedItemName; document.getElementById('scheduledPriceModal').style.display = 'flex'; });
function closeScheduledPriceModal() { document.getElementById('scheduledPriceModal').style.display = 'none'; }
document.getElementById('scheduledPriceForm').removeEventListener('submit', window._spFormHandler);
window._spFormHandler = async (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  const itemInput = document.getElementById('spItem');
  const pricebookId = itemInput.dataset.selectedItemId || 0;
  await ipcRenderer.invoke('add-scheduled-price', { pricebook_id: parseInt(pricebookId), upc: itemInput.dataset.selectedItemUpc || itemInput.value, old_price: parseFloat(itemInput.dataset.selectedItemCost || 0), new_price: parseFloat(document.getElementById('spNewPrice').value), effective_date: document.getElementById('spEffDate').value, effective_time: document.getElementById('spEffTime').value, expiration_date: document.getElementById('spExpDate').value, expiration_time: document.getElementById('spExpTime').value });
  closeScheduledPriceModal();
  loadScheduledPrices();
};
document.getElementById('scheduledPriceForm').addEventListener('submit', window._spFormHandler);

document.getElementById('applyScheduledBtn').addEventListener('click', async () => {
  if (confirm('Apply all scheduled price changes that are due?')) {
    const result = await ipcRenderer.invoke('apply-scheduled-prices');
    alert(`Applied ${result.applied} price changes`);
    loadScheduledPrices();
  }
});

async function cancelScheduledPrice(id) {
  if (confirm('Cancel this scheduled price change?')) { await ipcRenderer.invoke('cancel-scheduled-price', id); loadScheduledPrices(); }
}

// === LOSS PREVENTION ===
async function loadLossPrevention() {
  const summary = await ipcRenderer.invoke('lp-get-summary', currentDate, currentDate);
  document.getElementById('lpUnresolved').textContent = summary.unresolved;
  const events = await ipcRenderer.invoke('lp-get-events', { start_date: currentDate + ' 00:00', end_date: currentDate + ' 23:59' });
  let voids = 0, refunds = 0, flagged = 0;
  events.forEach(e => { if (e.event_type === 'voided_transaction') voids++; if (e.event_type === 'refund') { refunds++; flagged += e.amount; } });
  document.getElementById('lpTodayVoids').textContent = voids;
  document.getElementById('lpTodayRefunds').textContent = refunds;
  document.getElementById('lpFlaggedAmount').textContent = formatCurrency(flagged);
  const tbody = document.querySelector('#lpEventsTable tbody');
  tbody.innerHTML = events.map(e => `<tr><td>${e.created_at}</td><td>${e.event_type}</td><td>${e.severity}</td><td>${e.cashier_id||'-'}</td><td>${e.register_id||'-'}</td><td>${formatCurrency(e.amount)}</td><td>${e.description||'-'}</td><td>${e.resolved?'Resolved':'Open'}</td><td>${!e.resolved?`<button class="btn btn-sm btn-primary" onclick="resolveLPEvent(${e.id})">Resolve</button>`:''}</td></tr>`).join('');
  const audit = await ipcRenderer.invoke('lp-get-cashier-audit', currentDate, currentDate);
  const auditTbody = document.querySelector('#cashierAuditTable tbody');
  auditTbody.innerHTML = audit.map(a => `<tr><td>${a.cashier_id}</td><td>${a.total_events}</td><td>${a.voids}</td><td>${a.deletions}</td><td>${a.large_sales}</td><td>${a.no_sales}</td><td>${a.refunds}</td><td>${a.discounts}</td><td>${formatCurrency(a.total_flagged_amount)}</td></tr>`).join('');
}

function showLPTab(tab) {
  document.querySelectorAll('.lp-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('lpTab-' + tab).classList.add('active');
  document.querySelectorAll('#view-lossprevention .tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

async function resolveLPEvent(id) {
  await ipcRenderer.invoke('lp-resolve-event', id, 'user');
  loadLossPrevention();
}

document.getElementById('refreshLPEventsBtn').addEventListener('click', loadLossPrevention);
document.getElementById('checkThresholdsBtn').addEventListener('click', async () => {
  const alerts = await ipcRenderer.invoke('lp-check-thresholds');
  const container = document.getElementById('lpAlerts');
  const content = document.getElementById('lpAlertsContent');
  if (alerts.length > 0) {
    container.style.display = 'block';
    content.innerHTML = alerts.map(a => `<div class="alert-card ${a.type.includes('void')?'warning':'danger'}"><strong>${a.type.replace(/_/g,' ').toUpperCase()}</strong>: Cashier #${a.cashier_id} - ${a.count} occurrences${a.total?`, ${formatCurrency(a.total)} total`:''}</div>`).join('');
  } else {
    container.style.display = 'block';
    content.innerHTML = '<div class="alert-card info">No threshold alerts detected</div>';
  }
});

// === EXTRA REPORTS ===
let currentExtraTab = 'vendor';
async function loadExtraReports() {
  const s = document.getElementById('extraStartDate').value || currentDate;
  const e = document.getElementById('extraEndDate').value || currentDate;
  if (currentExtraTab === 'vendor') {
    const data = await ipcRenderer.invoke('get-vendor-sales-report', s, e);
    document.querySelector('#vendorSalesTable tbody').innerHTML = data.map(d => `<tr><td>${d.vendor}</td><td>${d.unique_items}</td><td>${formatNumber(d.total_qty)}</td><td>${formatCurrency(d.total_sales)}</td><td>${d.transaction_count}</td></tr>`).join('');
  } else if (currentExtraTab === 'category') {
    const data = await ipcRenderer.invoke('get-category-sales-report', s, e);
    document.querySelector('#categorySalesTable tbody').innerHTML = data.map(d => `<tr><td>${d.category}</td><td>${d.unique_items}</td><td>${formatNumber(d.total_qty)}</td><td>${formatCurrency(d.total_sales)}</td></tr>`).join('');
  } else if (currentExtraTab === 'manufacturer') {
    const data = await ipcRenderer.invoke('get-manufacturer-sales-report', s, e);
    document.querySelector('#mfrSalesTable tbody').innerHTML = data.map(d => `<tr><td>${d.manufacturer}</td><td>${d.unique_items}</td><td>${formatNumber(d.total_qty)}</td><td>${formatCurrency(d.total_sales)}</td></tr>`).join('');
  } else if (currentExtraTab === 'deptanalysis') {
    const data = await ipcRenderer.invoke('get-department-analysis', s, e);
    document.querySelector('#deptAnalysisTable tbody').innerHTML = data.map(d => `<tr><td>${d.department||'-'}</td><td>${d.category||'-'}</td><td>${d.unique_items}</td><td>${formatNumber(d.total_qty)}</td><td>${formatCurrency(d.total_sales)}</td><td>${formatCurrency(d.avg_price)}</td><td>${formatCurrency(d.total_promotions)}</td><td>${d.transaction_count}</td></tr>`).join('');
  } else if (currentExtraTab === 'pricelog') {
    const data = await ipcRenderer.invoke('get-price-change-report', s, e);
    document.querySelector('#priceChangeLogTable tbody').innerHTML = data.map(d => `<tr><td>${d.changed_at}</td><td>${d.upc}</td><td>${d.name}</td><td>${d.department||'-'}</td><td>${formatCurrency(d.old_price)}</td><td>${formatCurrency(d.new_price)}</td><td>${d.change_type}</td></tr>`).join('');
  } else if (currentExtraTab === 'fuelmargin') {
    const data = await ipcRenderer.invoke('get-fuel-margin-report', s, e);
    document.querySelector('#fuelMarginTable tbody').innerHTML = data.map(d => {
      const marginPerGal = d.avg_selling_price - d.avg_cost;
      const marginPct = d.avg_selling_price > 0 ? ((marginPerGal/d.avg_selling_price)*100).toFixed(1) : 0;
      return `<tr><td>${d.grade_name||'Grade '+d.fuel_grade_id}</td><td>${formatNumber(d.total_gallons)}</td><td>${formatCurrency(d.total_sales)}</td><td>${formatCurrency(d.avg_selling_price)}</td><td>${formatCurrency(d.avg_cost)}</td><td>${formatCurrency(marginPerGal)}</td><td>${marginPct}%</td></tr>`;
    }).join('');
  } else if (currentExtraTab === 'fuelrecon') {
    const data = await ipcRenderer.invoke('get-fuel-report', s, e);
    document.querySelector('#fuelReconTable tbody').innerHTML = data.byGrade.map(g => `<tr><td>${g.grade_name||'Grade '+g.fuel_grade_id}</td><td>${formatNumber(g.total_gallons)}</td><td>${formatCurrency(g.total_sales)}</td><td>${formatCurrency(g.avg_price)}</td><td>-</td><td>-</td></tr>`).join('');
  }
}

function showReportTab(tab) {
  currentExtraTab = tab;
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('reportTab-' + tab).classList.add('active');
  document.querySelectorAll('#view-extrareports .tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  loadExtraReports();
}

document.getElementById('loadExtraReport').addEventListener('click', loadExtraReports);

// === EDI ===
async function loadEDI() {
  const docs = await ipcRenderer.invoke('get-edi-documents');
  document.getElementById('ediPending').textContent = docs.filter(d => d.status === 'pending').length;
  document.getElementById('ediSent').textContent = docs.filter(d => d.status === 'sent').length;
  document.getElementById('ediAcks').textContent = docs.filter(d => d.ack_received).length;
  const tbody = document.querySelector('#ediDocsTable tbody');
  tbody.innerHTML = docs.map(d => `<tr><td>${d.created_at}</td><td>${d.document_number}</td><td>${d.doc_type}</td><td>${d.direction}</td><td>${d.supplier_name||'-'}</td><td>${d.status}</td><td>${d.ack_received?'Yes':'No'}</td><td>${d.status==='sent'?`<button class="btn btn-sm btn-primary" onclick="ackEdi(${d.id})">Mark ACK</button>`:''}</td></tr>`).join('');
}

document.getElementById('createEdiDocBtn').addEventListener('click', async () => {
  const suppliers = await ipcRenderer.invoke('get-suppliers');
  document.getElementById('ediSupplier').innerHTML = suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('ediDocForm').reset();
  document.getElementById('ediDocModal').style.display = 'flex';
});
function closeEdiDocModal() { document.getElementById('ediDocModal').style.display = 'none'; }
document.getElementById('ediDocForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await ipcRenderer.invoke('create-edi-document', { doc_type: document.getElementById('ediDocType').value, direction: document.getElementById('ediDirection').value, supplier_id: parseInt(document.getElementById('ediSupplier').value), raw_data: document.getElementById('ediData').value });
  closeEdiDocModal();
  loadEDI();
});

async function ackEdi(id) {
  await ipcRenderer.invoke('update-edi-status', id, 'ack_received');
  loadEDI();
}

// === ACCOUNTING ===
async function loadAccounting() {
  const entries = await ipcRenderer.invoke('get-journal-entries', document.getElementById('jeStartDate').value, document.getElementById('jeEndDate').value);
  const tbody = document.querySelector('#journalTable tbody');
  tbody.innerHTML = entries.map(e => `<tr><td>${e.entry_date}</td><td>${e.entry_number}</td><td>${e.description}</td><td>${e.debit_account}</td><td>${e.credit_account}</td><td>${formatCurrency(e.amount)}</td><td>${e.exported?'Yes':'No'}</td></tr>`).join('');
}

document.getElementById('loadJournalBtn').addEventListener('click', loadAccounting);

document.getElementById('generateJournalBtn').addEventListener('click', async () => {
  if (confirm(`Generate journal entries for ${currentDate}?`)) {
    const entries = await ipcRenderer.invoke('generate-daily-journal', currentDate);
    if (entries.error) { alert(entries.error); } else { alert(`Generated ${entries.length} journal entries`); loadAccounting(); }
  }
});

document.getElementById('exportJournalBtn').addEventListener('click', () => {
  alert('QuickBooks export: Generate journal entries then import the IIF file into QuickBooks. Use the Journal Entries view to review before exporting.');
});

// === ITEM PICKER ===
let itemPickerCallback = null;
let itemPickerSelected = null;
let itemPickerMode = 'single'; // 'single' or 'multi'
let itemPickerMultiItems = [];

function openItemPicker(callback, mode) {
  itemPickerCallback = callback;
  itemPickerMode = mode || 'single';
  itemPickerSelected = null;
  itemPickerMultiItems = [];
  document.getElementById('itemPickerSearch').value = '';
  document.getElementById('itemPickerResults').innerHTML = '';
  document.getElementById('itemPickerSelected').style.display = 'none';
  document.getElementById('itemPickerConfirmBtn').disabled = true;
  if (itemPickerMode === 'multi') {
    document.getElementById('itemPickerModal').querySelector('.modal-header h3').textContent = 'Select Items (click to add)';
  } else {
    document.getElementById('itemPickerModal').querySelector('.modal-header h3').textContent = 'Select Item';
  }
  document.getElementById('itemPickerModal').style.display = 'flex';
  setTimeout(() => document.getElementById('itemPickerSearch').focus(), 100);
}

function closeItemPicker() {
  document.getElementById('itemPickerModal').style.display = 'none';
  itemPickerCallback = null;
  itemPickerSelected = null;
}

let itemPickerSearchTimeout = null;
document.getElementById('itemPickerSearch').addEventListener('input', (e) => {
  clearTimeout(itemPickerSearchTimeout);
  const query = e.target.value.trim();
  if (query.length < 1) {
    document.getElementById('itemPickerResults').innerHTML = '';
    return;
  }
  itemPickerSearchTimeout = setTimeout(async () => {
    const items = await ipcRenderer.invoke('search-items', query, 25);
    const container = document.getElementById('itemPickerResults');
    if (items.length === 0) {
      container.innerHTML = '<div style="padding:12px;color:#9ca3af;text-align:center">No items found</div>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="item-picker-result" data-id="${item.id}" onclick="selectItemPickerItem(${item.id})">
        <span class="item-picker-result-upc">${item.upc || '-'}</span>
        <span class="item-picker-result-info">
          <span class="item-picker-result-name">${item.name || item.description || 'Unnamed'}</span>
          <span class="item-picker-result-dept">${item.department_name || ''}</span>
        </span>
        <span class="item-picker-result-price">$${parseFloat(item.price || 0).toFixed(2)}</span>
      </div>
    `).join('');
  }, 200);
});

document.getElementById('itemPickerSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeItemPicker(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = document.querySelector('.item-picker-result');
    if (first) first.click();
  }
});

function selectItemPickerItem(id) {
  ipcRenderer.invoke('search-items', '', 1).then(() => {});
  ipcRenderer.invoke('search-items', id, 1).then(items => {
    if (items.length === 0) return;
    const item = items[0];
    itemPickerSelected = item;
    document.getElementById('itemPickerSelName').textContent = item.name || item.description || 'Unnamed';
    document.getElementById('itemPickerSelUpc').textContent = 'UPC: ' + (item.upc || '-');
    document.getElementById('itemPickerSelDept').textContent = item.department_name || '';
    document.getElementById('itemPickerSelPrice').textContent = 'Price: $' + parseFloat(item.price || 0).toFixed(2);
    document.getElementById('itemPickerSelCost').textContent = 'Cost: $' + parseFloat(item.cost || 0).toFixed(2);
    document.getElementById('itemPickerSelected').style.display = 'block';
    document.getElementById('itemPickerConfirmBtn').disabled = false;
    document.querySelectorAll('.item-picker-result').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.item-picker-result[data-id="${id}"]`).classList.add('selected');
  });
}

function confirmItemPicker() {
  if (!itemPickerSelected) return;
  if (itemPickerMode === 'multi') {
    itemPickerMultiItems.push(itemPickerSelected);
    document.getElementById('itemPickerSearch').value = '';
    document.getElementById('itemPickerResults').innerHTML = '';
    document.getElementById('itemPickerSelected').style.display = 'none';
    document.getElementById('itemPickerConfirmBtn').disabled = true;
    itemPickerSelected = null;
    if (itemPickerCallback) itemPickerCallback(itemPickerMultiItems);
    return;
  }
  if (itemPickerCallback) itemPickerCallback(itemPickerSelected);
  closeItemPicker();
}

function addItemPickerTrigger(inputId, mode) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const existing = input.parentNode.querySelector('.item-picker-trigger');
  if (existing) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item-picker-trigger';
  btn.innerHTML = '&#128269;';
  btn.title = 'Look up item';
  btn.addEventListener('click', () => {
    openItemPicker((item) => {
      if (mode === 'multi') {
        appendItemToField(inputId, item[item.length - 1]);
      } else {
        input.value = item.upc || '';
        input.dataset.selectedItemId = item.id;
        input.dataset.selectedItemName = item.name || '';
        input.dataset.selectedItemUpc = item.upc || '';
        input.dataset.selectedItemCost = item.cost || '';
        input.dataset.selectedItemPrice = item.price || '';
        input.dataset.selectedItemDept = item.department_id || '';
        input.dataset.selectedItemMerchCode = item.merchandise_code || '';
        input.dataset.selectedItemTax = item.tax_level_id || '';
        const costField = input.dataset.costTarget;
        if (costField) {
          const costEl = document.getElementById(costField);
          if (costEl && !costEl.value) costEl.value = parseFloat(item.cost || 0).toFixed(2);
        }
      }
    }, mode);
  });
  input.parentNode.style.display = 'flex';
  input.parentNode.style.alignItems = 'center';
  input.parentNode.insertBefore(btn, input.nextSibling);
}

function appendItemToField(textareaId, item) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  const current = ta.value.trim();
  if (textareaId === 'poItems') {
    const line = `${item.upc || ''},1,${parseFloat(item.cost || 0).toFixed(2)}`;
    ta.value = current ? current + '\n' + line : line;
  } else {
    ta.value = current ? current + '\n' + (item.upc || '') : (item.upc || '');
  }
}

// === TAX RATES ===

async function loadTaxRates() {
  const rates = await ipcRenderer.invoke('get-tax-rates');
  const tbody = document.querySelector('#taxRatesTable tbody');
  tbody.innerHTML = rates.map(r => {
    const status = r.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">Inactive</span>';
    return `
      <tr>
        <td>${r.name}</td>
        <td>${r.rate}%</td>
        <td>${status}</td>
        <td>-</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="openTaxRateModal(${r.id})">Edit</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openTaxRateModal(id) {
  if (id) {
    const rates = await ipcRenderer.invoke('get-tax-rates');
    const rate = rates.find(r => r.id === id);
    if (!rate) return;
    document.getElementById('taxRateId').value = rate.id;
    document.getElementById('taxRateName').value = rate.name;
    document.getElementById('taxRateValue').value = rate.rate;
    document.getElementById('taxRateModalTitle').textContent = 'Edit Tax Rate';
    document.getElementById('taxRateDeleteBtn').style.display = 'inline-block';
  } else {
    document.getElementById('taxRateId').value = '';
    document.getElementById('taxRateName').value = '';
    document.getElementById('taxRateValue').value = '';
    document.getElementById('taxRateModalTitle').textContent = 'New Tax Rate';
    document.getElementById('taxRateDeleteBtn').style.display = 'none';
  }
  document.getElementById('taxRateModal').style.display = 'flex';
}

function closeTaxRateModal() {
  document.getElementById('taxRateModal').style.display = 'none';
}

async function deleteTaxRate() {
  const id = document.getElementById('taxRateId').value;
  if (!id) return;
  if (!confirm('Delete this tax rate? Items using it will be set to no tax.')) return;
  await ipcRenderer.invoke('delete-tax-rate', parseInt(id));
  closeTaxRateModal();
  loadTaxRates();
}

// === BULK UPDATES ===

let bulkItems = [];
let groupSelectedItems = [];
let promoSelectedItems = [];

function addGroupItem(id, upc, name) {
  if (groupSelectedItems.find(i => i.id === id)) return;
  groupSelectedItems.push({ id, upc, name });
  renderGroupSelectedItems();
}

function removeGroupItem(id) {
  groupSelectedItems = groupSelectedItems.filter(i => i.id !== id);
  renderGroupSelectedItems();
}

function renderGroupSelectedItems() {
  document.getElementById('groupSelectedIds').value = groupSelectedItems.map(i => i.id).join(',');
  document.getElementById('groupSelectedCount').textContent = groupSelectedItems.length;
  document.getElementById('groupSelectedItems').innerHTML = groupSelectedItems.map(i =>
    `<div style="display:flex; align-items:center; padding:3px 6px; border-bottom:1px solid #e5e7eb;">
      <span style="flex:1;">${i.name} (${i.upc})</span>
      <button type="button" onclick="removeGroupItem(${i.id})" style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:16px;">&times;</button>
    </div>`
  ).join('');
}

function addPromoItem(id, upc, name) {
  if (promoSelectedItems.find(i => i.id === id)) return;
  promoSelectedItems.push({ id, upc, name });
  renderPromoSelectedItems();
}

function removePromoItem(id) {
  promoSelectedItems = promoSelectedItems.filter(i => i.id !== id);
  renderPromoSelectedItems();
}

function renderPromoSelectedItems() {
  document.getElementById('promoSelectedUpcs').value = promoSelectedItems.map(i => i.upc).join('\n');
  document.getElementById('promoSelectedCount').textContent = promoSelectedItems.length;
  document.getElementById('promoSelectedItems').innerHTML = promoSelectedItems.map(i =>
    `<div style="display:flex; align-items:center; padding:3px 6px; border-bottom:1px solid #e5e7eb;">
      <span style="flex:1;">${i.name} (${i.upc})</span>
      <button type="button" onclick="removePromoItem(${i.id})" style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:16px;">&times;</button>
    </div>`
  ).join('');
}

async function loadBulkUpdatesFilters() {
  const depts = await ipcRenderer.invoke('get-departments-list');
  const taxRates = await ipcRenderer.invoke('get-tax-rates');

  const deptSelects = [document.getElementById('bulkFilterDept'), document.getElementById('bulkColDept')];
  deptSelects.forEach(sel => {
    if (!sel) return;
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    depts.forEach(d => { const o = document.createElement('option'); o.value = d.name; o.textContent = d.name; sel.appendChild(o); });
  });

  const taxSelects = [document.getElementById('bulkFilterTax'), document.getElementById('bulkColTax')];
  taxSelects.forEach(sel => {
    if (!sel) return;
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    taxRates.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = `${t.name} (${t.rate}%)`; sel.appendChild(o); });
  });
}

async function searchBulkItems() {
  const filters = {
    name: document.getElementById('bulkFilterName').value.trim(),
    upc: document.getElementById('bulkFilterUpc').value.trim(),
    department: document.getElementById('bulkFilterDept').value,
    tax_rate_id: document.getElementById('bulkFilterTax').value || undefined,
    min_price: document.getElementById('bulkFilterMinPrice').value,
    max_price: document.getElementById('bulkFilterMaxPrice').value,
    min_cost: document.getElementById('bulkFilterMinCost').value,
    max_cost: document.getElementById('bulkFilterMaxCost').value,
    age_restriction: document.getElementById('bulkFilterAge').value,
    vendor: document.getElementById('bulkFilterVendor').value.trim()
  };

  bulkItems = await ipcRenderer.invoke('search-items-filtered', filters);
  document.getElementById('bulkResultCount').textContent = `${bulkItems.length} item(s) found`;
  renderBulkTable();
}

function renderBulkTable() {
  const tbody = document.querySelector('#bulkUpdateTable tbody');
  tbody.innerHTML = bulkItems.map((item, idx) => {
    const margin = item.price > 0 ? ((item.price - item.cost) / item.price * 100).toFixed(1) : 0;
    return `
      <tr data-idx="${idx}">
        <td><input type="checkbox" class="bulk-check" data-idx="${idx}" checked></td>
        <td>${item.upc}</td>
        <td><input type="text" class="bulk-field" data-idx="${idx}" data-field="name" value="${(item.name || '').replace(/"/g, '&quot;')}" style="width:100%; padding:4px; border:1px solid #e5e7eb; border-radius:3px; font-size:13px;"></td>
        <td>
          <select class="bulk-field" data-idx="${idx}" data-field="department_id" style="width:100%; padding:4px; border:1px solid #e5e7eb; border-radius:3px; font-size:13px;">
            <option value="">--</option>
          </select>
        </td>
        <td>
          <select class="bulk-field" data-idx="${idx}" data-field="tax_rate_id" style="width:100%; padding:4px; border:1px solid #e5e7eb; border-radius:3px; font-size:13px;">
            <option value="">--</option>
          </select>
        </td>
        <td style="text-align:right; padding:4px;">${formatCurrency(item.cost)}</td>
        <td style="text-align:right; padding:4px;">${formatCurrency(item.price)}</td>
        <td><input type="number" class="bulk-field bulk-new-price" data-idx="${idx}" data-field="price" step="0.01" min="0" value="${item.price || ''}" style="width:80px; padding:4px; border:1px solid #e5e7eb; border-radius:3px; font-size:13px;"></td>
        <td>
          <select class="bulk-field" data-idx="${idx}" data-field="age_restriction" style="width:100%; padding:4px; border:1px solid #e5e7eb; border-radius:3px; font-size:13px;">
            <option value="">None</option>
            <option value="18">18+</option>
            <option value="21">21+</option>
          </select>
        </td>
        <td><input type="text" class="bulk-field" data-idx="${idx}" data-field="vendor" value="${(item.vendor || '').replace(/"/g, '&quot;')}" style="width:100%; padding:4px; border:1px solid #e5e7eb; border-radius:3px; font-size:13px;"></td>
        <td style="text-align:right; padding:4px;">${margin}%</td>
      </tr>
    `;
  }).join('');

  // Populate dropdowns per row
  const depts = bulkDepts;
  const taxRates = bulkTaxRates;
  tbody.querySelectorAll('[data-field="department_id"]').forEach(sel => {
    const idx = parseInt(sel.dataset.idx);
    const cur = bulkItems[idx].department_id;
    sel.innerHTML = '<option value="">--</option>' + depts.map(d => `<option value="${d.id}" ${d.id === cur ? 'selected' : ''}>${d.name}</option>`).join('');
  });
  tbody.querySelectorAll('[data-field="tax_rate_id"]').forEach(sel => {
    const idx = parseInt(sel.dataset.idx);
    const cur = bulkItems[idx].tax_rate_id;
    sel.innerHTML = '<option value="">--</option>' + taxRates.map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${t.name}</option>`).join('');
  });
  tbody.querySelectorAll('[data-field="age_restriction"]').forEach(sel => {
    const idx = parseInt(sel.dataset.idx);
    const cur = bulkItems[idx].age_restriction;
    sel.innerHTML = '<option value="">None</option><option value="18" ${cur===18?"selected":""}>18+</option><option value="21" ${cur===21?"selected":""}>21+</option>';
  });
}

let bulkDepts = [];
let bulkTaxRates = [];

async function initBulkUpdates() {
  bulkDepts = await ipcRenderer.invoke('get-departments-list');
  bulkTaxRates = await ipcRenderer.invoke('get-tax-rates');
  loadBulkUpdatesFilters();
}

function applyBulkColumn(col) {
  const checked = document.querySelectorAll('.bulk-check:checked');
  if (col === 'department') {
    const val = document.getElementById('bulkColDept').value;
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const sel = document.querySelector(`.bulk-field[data-idx="${idx}"][data-field="department_id"]`);
      if (sel) sel.value = val;
    });
  } else if (col === 'tax_rate') {
    const val = document.getElementById('bulkColTax').value;
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const sel = document.querySelector(`.bulk-field[data-idx="${idx}"][data-field="tax_rate_id"]`);
      if (sel) sel.value = val;
    });
  } else if (col === 'price') {
    const val = document.getElementById('bulkColPrice').value;
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const inp = document.querySelector(`.bulk-field[data-idx="${idx}"][data-field="price"]`);
      if (inp) inp.value = val;
    });
  } else if (col === 'age') {
    const val = document.getElementById('bulkColAge').value;
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const sel = document.querySelector(`.bulk-field[data-idx="${idx}"][data-field="age_restriction"]`);
      if (sel) sel.value = val;
    });
  } else if (col === 'vendor') {
    const val = document.getElementById('bulkColVendor').value;
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const inp = document.querySelector(`.bulk-field[data-idx="${idx}"][data-field="vendor"]`);
      if (inp) inp.value = val;
    });
  }
}

function collectBulkChanges() {
  const changes = [];
  const checked = document.querySelectorAll('.bulk-check:checked');
  checked.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const item = bulkItems[idx];
    const itemChanges = {};
    const fields = ['name', 'department_id', 'tax_rate_id', 'age_restriction', 'price', 'vendor'];
    fields.forEach(f => {
      const el = document.querySelector(`.bulk-field[data-idx="${idx}"][data-field="${f}"]`);
      if (!el) return;
      let val = el.value;
      if (['department_id', 'tax_rate_id', 'age_restriction'].includes(f)) {
        val = val ? parseInt(val) : null;
      } else if (f === 'price') {
        val = parseFloat(val) || 0;
      }
      if (val !== item[f]) itemChanges[f] = val;
    });
    if (Object.keys(itemChanges).length > 0) {
      changes.push({ id: item.id, changes: itemChanges });
    }
  });
  return changes;
}

async function saveBulkChanges(sendToPos) {
  const changes = collectBulkChanges();
  if (changes.length === 0) {
    alert('No changes to save.');
    return;
  }
  const result = await ipcRenderer.invoke('bulk-update-items', changes);
  if (result.success) {
    if (sendToPos) {
      const items = changes.map(c => {
        const item = bulkItems.find(b => b.id === c.id);
        return { ...item, ...c.changes };
      });
      const posResult = await ipcRenderer.invoke('send-prices-to-pos', items);
      loadPendingChanges();
      loadSendHistory();
      const statusEl = document.getElementById('bulkResultCount');
      statusEl.textContent = `Saved ${changes.length} item(s) & sent to POS. Check "Send to POS" tab.`;
      statusEl.style.color = '#16a34a';
      setTimeout(() => { statusEl.style.color = '#6b7280'; }, 5000);
    } else {
      const statusEl = document.getElementById('bulkResultCount');
      statusEl.textContent = `Saved ${result.updated} field(s) across ${changes.length} item(s).`;
      statusEl.style.color = '#16a34a';
      setTimeout(() => { statusEl.style.color = '#6b7280'; }, 5000);
      loadPendingChanges();
    }
    searchBulkItems();
  }
}

function initItemPickers() {
  addItemPickerTrigger('stkItem', 'single');
  addItemPickerTrigger('spItem', 'single');
  addItemPickerTrigger('promoItems', 'multi');
  addItemPickerTrigger('poItems', 'multi');
}

setTimeout(initItemPickers, 100);

// ==========================================
// ITEM GROUPS & PRICE MANAGEMENT
// ==========================================

let currentGroupId = null;
let currentGroupName = '';
let allLoadedGroups = [];

async function loadGroups() {
  const category = document.getElementById('groupCategoryFilter')?.value || 'All';
  try {
    allLoadedGroups = await ipcRenderer.invoke('get-groups', category);
  } catch (e) {
    console.error('Error fetching groups:', e);
    allLoadedGroups = [];
  }

  // Update stats
  const totalGroupsEl = document.getElementById('totalGroups');
  if (totalGroupsEl) totalGroupsEl.textContent = allLoadedGroups.length;

  const totalItems = allLoadedGroups.reduce((acc, g) => acc + (g.item_count || 0), 0);
  const totalGroupedItemsEl = document.getElementById('totalGroupedItems');
  if (totalGroupedItemsEl) totalGroupedItemsEl.textContent = totalItems;

  renderGroupsTable(allLoadedGroups);
}

function getCategoryBadge(cat) {
  const c = cat || 'General';
  let bg = '#e2e8f0';
  let color = '#334155';
  if (c === 'Cigarettes') { bg = '#fee2e2'; color = '#991b1b'; }
  else if (c === 'Tobacco & Smokeless') { bg = '#fef3c7'; color = '#92400e'; }
  else if (c === 'Beverages') { bg = '#dbeafe'; color = '#1e40af'; }
  else if (c === 'Energy Drinks') { bg = '#f3e8ff'; color = '#6b21a8'; }
  else if (c === 'Snacks') { bg = '#ffedd5'; color = '#9a3412'; }
  else if (c === 'Beer & Malt') { bg = '#ecfdf5'; color = '#065f46'; }

  return `<span style="display:inline-block; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:600; background:${bg}; color:${color};">${escapeHtml(c)}</span>`;
}

function filterGroupsTable() {
  const q = (document.getElementById('groupSearchInput')?.value || '').toLowerCase().trim();
  if (!q) {
    renderGroupsTable(allLoadedGroups);
    return;
  }
  const filtered = allLoadedGroups.filter(g => 
    (g.name || '').toLowerCase().includes(q) || 
    (g.description || '').toLowerCase().includes(q) ||
    (g.category || '').toLowerCase().includes(q)
  );
  renderGroupsTable(filtered);
}

function renderGroupsTable(groupsList) {
  const tbody = document.querySelector('#groupsTable tbody');
  if (!tbody) return;

  if (!groupsList || groupsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No groups found for the selected category. Click "⚡ Seed / Refresh Groups" to load all standard manufacturer price groups.</td></tr>';
    return;
  }

  tbody.innerHTML = groupsList.map(g => `
    <tr style="cursor:pointer;" onclick="viewGroupItems(${g.id}, '${escapeHtml(g.name).replace(/'/g, "\\'")}')" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <td>${getCategoryBadge(g.category)}</td>
      <td style="font-weight:600; color:#1e293b;">${escapeHtml(g.name)}</td>
      <td style="font-size:12px; color:#64748b;">${escapeHtml(g.description || '-')}</td>
      <td style="text-align:center;"><span style="display:inline-block; min-width:28px; padding:2px 8px; border-radius:10px; background:#e0e7ff; color:#3730a3; font-weight:700; font-size:12px;">${g.item_count || 0}</span></td>
      <td style="font-size:12px; color:#475569;">${g.price_adjustment_type || 'percentage'}: ${g.price_adjustment_value || 0}</td>
      <td style="text-align:right;" onclick="event.stopPropagation();">
        <button class="btn btn-sm btn-primary" onclick="viewGroupItems(${g.id}, '${escapeHtml(g.name).replace(/'/g, "\\'")}')">View Items</button>
        <button class="btn btn-sm" style="background:#fee2e2; color:#ef4444; margin-left:4px;" onclick="deleteGroupAction(${g.id}, '${escapeHtml(g.name).replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function viewGroupItems(groupId, groupName) {
  currentGroupId = groupId;
  currentGroupName = groupName;

  const container = document.getElementById('groupItemsContainer');
  const title = document.getElementById('groupItemsTitle');
  const tbody = document.querySelector('#groupItemsTable tbody');

  if (container) container.style.display = 'block';
  if (title) title.textContent = `Items in: ${groupName}`;

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">Loading group items...</td></tr>';

  try {
    const items = await ipcRenderer.invoke('get-group-items', groupId);
    if (title) title.textContent = `Items in: ${groupName} (${items.length} items)`;

    if (!items || items.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">No items currently in this group. Click "Refresh Matching" or add items.</td></tr>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = items.map(item => {
        const price = parseFloat(item.price) || 0;
        const cost = parseFloat(item.cost) || 0;
        const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : '0.0';
        return `
          <tr>
            <td style="font-family:monospace; font-weight:600; color:#334155;">${escapeHtml(item.upc || '-')}</td>
            <td style="font-weight:600;">${escapeHtml(item.name || '-')}</td>
            <td style="color:#64748b; font-size:12px;">${escapeHtml(item.department || '-')}</td>
            <td style="text-align:right; font-weight:700; color:#0f172a;">${formatCurrency(price)}</td>
            <td style="text-align:right; color:#64748b;">${formatCurrency(cost)}</td>
            <td style="text-align:right; font-weight:600; color:${parseFloat(margin) < 15 ? '#ef4444' : '#16a34a'};">${margin}%</td>
            <td style="text-align:center;">
              <button class="btn btn-sm" style="background:#fee2e2; color:#ef4444; padding:2px 6px;" title="Remove from group" onclick="removeGroupItemAction(${groupId}, ${item.id})">✕</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    container?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Error loading items: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function closeGroupItems() {
  const container = document.getElementById('groupItemsContainer');
  if (container) container.style.display = 'none';
  currentGroupId = null;
  currentGroupName = '';
}

async function executeBatchPriceUpdate() {
  if (!currentGroupId) {
    alert('Please select a group first.');
    return;
  }

  const type = document.getElementById('batchAdjustType')?.value || 'set_price';
  const valInput = document.getElementById('batchAdjustValue');
  const val = parseFloat(valInput?.value);

  if (isNaN(val)) {
    alert('Please enter a valid numeric value for the price adjustment.');
    valInput?.focus();
    return;
  }

  let promptDesc = '';
  if (type === 'set_price') promptDesc = `Set the exact price of ALL items in "${currentGroupName}" to $${val.toFixed(2)}`;
  else if (type === 'fixed_amount') promptDesc = `Adjust the price of ALL items in "${currentGroupName}" by ${val >= 0 ? '+' : ''}$${val.toFixed(2)}`;
  else if (type === 'percentage') promptDesc = `Adjust the price of ALL items in "${currentGroupName}" by ${val >= 0 ? '+' : ''}${val}%`;
  else if (type === 'markup_cost') promptDesc = `Set the price of ALL items in "${currentGroupName}" to Cost + ${val}% markup`;

  if (!confirm(`Are you sure you want to:\n\n${promptDesc}?\n\nThis will update all items in the group immediately.`)) {
    return;
  }

  try {
    const res = await ipcRenderer.invoke('batch-update-prices', currentGroupId, type, val);
    alert(`🎉 Successfully updated prices for ${res.updated} item(s) in "${currentGroupName}"!`);
    if (valInput) valInput.value = '';
    viewGroupItems(currentGroupId, currentGroupName);
    loadGroups();
  } catch (e) {
    alert(`Error updating prices: ${e.message}`);
  }
}

async function seedRetailGroupsAction() {
  if (!confirm('Re-seed and refresh all standard manufacturer retail price groups (Philip Morris, RJ Reynolds, ITG, PepsiCo, Coke, Red Bull, etc.)?')) {
    return;
  }
  try {
    const res = await ipcRenderer.invoke('seed-retail-groups');
    alert(`🎉 Created/Refreshed ${res.groupsCreated} Retail Groups with ${res.itemsAssigned} categorized items!`);
    loadGroups();
  } catch (e) {
    alert(`Error seeding groups: ${e.message}`);
  }
}

function openGroupModal(group = null) {
  const modal = document.getElementById('groupModal');
  const title = document.getElementById('groupModalTitle');
  const idInput = document.getElementById('groupId');
  const nameInput = document.getElementById('groupName');
  const catInput = document.getElementById('groupCategory');
  const descInput = document.getElementById('groupDesc');

  if (group) {
    if (title) title.textContent = 'Edit Item Group';
    if (idInput) idInput.value = group.id;
    if (nameInput) nameInput.value = group.name || '';
    if (catInput) catInput.value = group.category || 'General';
    if (descInput) descInput.value = group.description || '';
  } else {
    if (title) title.textContent = 'Create Item Group';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (catInput) catInput.value = 'General';
    if (descInput) descInput.value = '';
  }

  if (modal) modal.style.display = 'flex';
}

function closeGroupModal() {
  const modal = document.getElementById('groupModal');
  if (modal) modal.style.display = 'none';
}

async function saveGroup() {
  const id = document.getElementById('groupId')?.value;
  const name = document.getElementById('groupName')?.value.trim();
  const category = document.getElementById('groupCategory')?.value || 'General';
  const description = document.getElementById('groupDesc')?.value.trim();

  if (!name) {
    alert('Please enter a group name.');
    return;
  }

  try {
    if (id) {
      await ipcRenderer.invoke('update-group', parseInt(id), { name, category, description });
    } else {
      await ipcRenderer.invoke('create-group', { name, category, description, group_type: 'manual' });
    }
    closeGroupModal();
    loadGroups();
  } catch (e) {
    alert(`Error saving group: ${e.message}`);
  }
}

async function deleteGroupAction(id, name) {
  if (!confirm(`Are you sure you want to delete group "${name}"?`)) {
    return;
  }
  try {
    await ipcRenderer.invoke('delete-group', id);
    if (currentGroupId === id) closeGroupItems();
    loadGroups();
  } catch (e) {
    alert(`Error deleting group: ${e.message}`);
  }
}

async function removeGroupItemAction(groupId, pbId) {
  try {
    await ipcRenderer.invoke('remove-item-from-group', groupId, pbId);
    viewGroupItems(groupId, currentGroupName);
    loadGroups();
  } catch (e) {
    alert(`Error removing item: ${e.message}`);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
