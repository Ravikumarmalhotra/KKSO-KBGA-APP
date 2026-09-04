// ===================== script.js =====================

// ---------- Shared / URL params ----------
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

const loggedInUser  = getUrlParam('user');
const loggedInLevel = getUrlParam('level');

const displayName = loggedInUser.toUpperCase();
const lookupKey   = displayName.replace(/\s+/g, '_');
const employeeData = (typeof TAMapping !== 'undefined' && TAMapping[lookupKey]) || {};

const WORKER_URL = 'https://app.powersupplyorange.workers.dev';
const SHEET_ID   = '1aa-N2lqaYFv9Al9r4zWeRIbeccCrTuQn-5fqYTysm94';

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function formatDateDMY(d) { return pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+String(d.getFullYear()).slice(-2); }
function formatDateYMD(d) { return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }

// ===================================================================
// CUSTOM ALERT (replaces native alert() — hides site URL)
// ===================================================================
function showAppAlert(message, type = 'info') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    const icon = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
    overlay.innerHTML = `
      <div class="custom-alert-box ${type}">
        <div class="custom-alert-icon">${icon}</div>
        <div class="custom-alert-message">${message}</div>
        <button class="custom-alert-btn">OK</button>
      </div>`;
    document.body.appendChild(overlay);
    const closeModal = () => { overlay.remove(); resolve(); };
    overlay.querySelector('.custom-alert-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  });
}

// ===================================================================
// TAB SWITCHING
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  const btnEntry  = document.getElementById('btnEntry');
  const btnView   = document.getElementById('btnView');
  const entryPage = document.getElementById('entryPage');
  const viewPage  = document.getElementById('viewPage');

  btnEntry.addEventListener('click', () => {
    btnEntry.classList.add('active'); btnView.classList.remove('active');
    entryPage.classList.add('active'); viewPage.classList.remove('active');
  });

  btnView.addEventListener('click', () => {
    btnView.classList.add('active'); btnEntry.classList.remove('active');
    viewPage.classList.add('active'); entryPage.classList.remove('active');
    initView();
  });

  initEntryForm();
  populateMonthSelect();

  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    exitEditMode();
    showSubmitMessage('Edit cancelled.', 'info');
  });
});

// ===================================================================
// ENTRY FORM LOGIC
// ===================================================================
const fldName        = document.getElementById('fldName');
const fldDesignation = document.getElementById('fldDesignation');
const fldDate        = document.getElementById('fldDate');
const fldObject      = document.getElementById('fldObject');
const fldLeft        = document.getElementById('fldLeft');
const fldArrived     = document.getElementById('fldArrived');
const fldFrom        = document.getElementById('fldFrom');
const fldTo          = document.getElementById('fldTo');
const fldTA          = document.getElementById('fldTA');
const fldBookedBy    = document.getElementById('fldBookedBy');
const taForm         = document.getElementById('taForm');
const submitMessageEl = document.getElementById('submitMessage');
let submitMessageTimer = null;

// ---- EDIT MODE STATE ----
let editingSerialNo = null; // null = Add mode; non-null = Editing that SerialNo

function showSubmitMessage(text, type) {
  clearTimeout(submitMessageTimer);
  submitMessageEl.textContent = text;
  submitMessageEl.className = 'submit-message full-width show ' + type;
  submitMessageTimer = setTimeout(() => {
    submitMessageEl.className = 'submit-message full-width';
    submitMessageEl.textContent = '';
  }, 5000);
}

function updateSubmitButtonLabel() {
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.textContent = editingSerialNo ? '💾 Update' : '🚀 Submit';
}

function initEntryForm() {
  fldName.value = displayName;
  fldDesignation.value = employeeData.Designation || '';

  const today = new Date();

const minD = new Date(today);
// Only subtract 1 day if today is NOT the 1st day of the month
//if (today.getDate() > 1) {
  minD.setDate(today.getDate() - 1);
//}
  const maxD = new Date(today); maxD.setDate(today.getDate() + 0);
  fldDate.min = formatDateYMD(minD);
  fldDate.max = formatDateYMD(maxD);
  fldDate.value = formatDateYMD(today);

  fldFrom.value = 'KKSO (KAVI SUBHASH)';

  fldTo.innerHTML = '<option value="">-- Select Station --</option>';
  (typeof TAStations !== 'undefined' ? TAStations : []).forEach(st => {
    const opt = document.createElement('option');
    opt.value = st; opt.textContent = st;
    fldTo.appendChild(opt);
  });

  fldBookedBy.innerHTML = '<option value="">-- Select Supervisor --</option>';
  (typeof BookSupervisor !== 'undefined' ? BookSupervisor : []).forEach(sup => {
    const opt = document.createElement('option');
    opt.value = sup; opt.textContent = sup;
    fldBookedBy.appendChild(opt);
  });

  refreshAllFieldStatus();
  attachEntryListeners();
  updateSubmitButtonLabel();
}

function attachEntryListeners() {
  [fldDate, fldObject, fldLeft, fldArrived, fldTo, fldBookedBy].forEach(el => {
    el.addEventListener('input', () => { computeTA(); refreshAllFieldStatus(); });
    el.addEventListener('change', () => { computeTA(); refreshAllFieldStatus(); });
  });
  fldDate.addEventListener('change', validateDate);
  taForm.addEventListener('submit', handleSubmit);
}

function validateDate() {
  if (editingSerialNo) return; // date is locked during edit, skip validation
  const val = fldDate.value;
  if (val < fldDate.min || val > fldDate.max) {
    showAppAlert('Date must be between ' + fldDate.min + ' and ' + fldDate.max, 'error');
    fldDate.value = '';
  }
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function computeTA() {
  const left = timeToMinutes(fldLeft.value);
  const arrived = timeToMinutes(fldArrived.value);
  const toStation = fldTo.value;

  if (left === null || arrived === null || !toStation) { fldTA.value = ''; return; }

  const excStations = (typeof TAExcStation !== 'undefined') ? TAExcStation : [];
  if (excStations.includes(toStation)) { fldTA.value = '30%'; return; }

  let diff = arrived - left;
  if (diff < 0) diff += 24 * 60;
  const diffHours = diff / 60;

  let percent;
  if (diffHours < 6) percent = 30;
  else if (diffHours < 12) percent = 70;
  else percent = 100;

  fldTA.value = percent + '%';
}

function isFilled(el) { return el.value !== null && el.value.toString().trim() !== ''; }

function refreshAllFieldStatus() {
  const map = [
    ['grp-name', fldName], ['grp-designation', fldDesignation], ['grp-date', fldDate],
    ['grp-object', fldObject], ['grp-left', fldLeft], ['grp-arrived', fldArrived],
    ['grp-from', fldFrom], ['grp-to', fldTo], ['grp-ta', fldTA], ['grp-bookedby', fldBookedBy]
  ];
  map.forEach(([id, el]) => {
    const group = document.getElementById(id);
    isFilled(el) ? group.classList.add('filled') : group.classList.remove('filled');
  });
}

function allFieldsFilled() {
  return [fldName, fldDesignation, fldDate, fldObject, fldLeft, fldArrived,
          fldFrom, fldTo, fldTA, fldBookedBy].every(isFilled);
}

async function handleSubmit(e) {
  e.preventDefault();
  refreshAllFieldStatus();

  if (!allFieldsFilled()) {
    showSubmitMessage('⚠️ Please fill all fields before submitting.', 'error');
    return;
  }

  const isEditing = !!editingSerialNo;
  const currentMode = isEditing ? 'update' : 'submit';

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = isEditing ? 'Updating...' : 'Submitting...';

  const now = new Date();
  const timeStamp = formatDateDMY(now) + ', ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  // --- TIMEZONE-SAFE DATE PARSING ---
const [yearStr, monthStr, dayStr] = fldDate.value.split('-');
const selectedDateObj = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

const dateFormatted = formatDateDMY(selectedDateObj);
const targetMonth = `${MONTH_NAMES_FULL[selectedDateObj.getMonth()]}-${selectedDateObj.getFullYear()}`;
// ----------------------------------
  const payload = {
    //action: isEditing ? 'update' : 'submit', // Worker ko action pata chalega agar same date and same person ko dubara entry chahiye to cooment ko hata do dono jagah worker me bhi.
    target: targetMonth,
    data: {
      SeriaLNo: '',// add this function to update serial no when posting "isEditing ? editingSerialNo : '',"
      NameOfEmployee: fldName.value,
      Designation: fldDesignation.value,
      Date: dateFormatted,
      ObjectOfJourney: fldObject.value,
      LeftTime: fldLeft.value,
      ArrivedTime: fldArrived.value,
      From: fldFrom.value,
      To: fldTo.value,
      TA: fldTA.value,
      BookedBy: fldBookedBy.value,
      SubmitBy: currentMode === 'submit' ? '[ ' + currentMode + ' ] ' + loggedInUser + '; ' + loggedInLevel + '; ' + timeStamp : '',
      EditBy: currentMode === 'update' ? '[ ' + currentMode + ' ] ' + loggedInUser + '; ' + loggedInLevel + '; ' + timeStamp : ''
    }
  };

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Network error: ' + response.status);

    if (isEditing) {
      showSubmitMessage('✅ TA entry updated successfully!', 'success');
      exitEditMode();
      setTimeout(() => {
        const viewBtn = document.getElementById('btnView');
        if (viewBtn) viewBtn.click(); // returns to View tab and auto-refreshes
      }, 1000);
    } else {
      showSubmitMessage('✅ TA submitted successfully!', 'success');
      resetEntryForm();
    }
  } catch (err) {
    console.error('Submit failed:', err);
    showSubmitMessage(isEditing ? '❌ Update failed. Please try again.' : '❌ Submission failed. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    updateSubmitButtonLabel();
  }
}

function resetEntryForm() {
  fldObject.value = ''; fldLeft.value = ''; fldArrived.value = '';
  fldTo.value = ''; fldTA.value = ''; fldBookedBy.value = '';
  fldDate.value = formatDateYMD(new Date());
  refreshAllFieldStatus();
}

// ---- EDIT MODE FUNCTIONS ----
function editRow(index) {
  const row = currentFilteredData[index];
  if (!row) return;

  const currentMonth = (typeof getCurrentTAMonth === 'function') ? getCurrentTAMonth() : '';
  if (monthSelect.value !== currentMonth) {
    showAppAlert('Only current month (' + currentMonth + ') entries can be edited.', 'error');
    return;
  }

  editingSerialNo = row.SerialNo;

  // Switch to Entry tab
  document.getElementById('btnEntry').click();

  fldName.value = displayName;
  fldDesignation.value = employeeData.Designation || row.Designation || '';

  // Lock the Date field (cannot be changed while editing)
  const parsedDate = (typeof taParseDMY === 'function') ? taParseDMY(row.Date) : null;
  if (parsedDate) fldDate.value = formatDateYMD(parsedDate);
  fldDate.disabled = true;

  // Editable fields
  fldObject.value = row.ObjectOfJourney || '';
  fldLeft.value = row.LeftTime || '';
  fldArrived.value = row.ArrivedTime || '';
  fldFrom.value = 'KKSO (KAVI SUBHASH)';
  fldTo.value = row.To || '';
  fldBookedBy.value = row.BookedBy || '';

  computeTA();
  refreshAllFieldStatus();

  const banner = document.getElementById('editingBanner');
  banner.textContent = '✏️ Editing entry dated ' + row.Date + ' — Date cannot be changed.';
  banner.style.display = 'block';

  document.getElementById('cancelEditBtn').style.display = 'block';
  updateSubmitButtonLabel();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitEditMode() {
  editingSerialNo = null;
  fldDate.disabled = false;
  document.getElementById('editingBanner').style.display = 'none';
  document.getElementById('cancelEditBtn').style.display = 'none';
  resetEntryForm();
  updateSubmitButtonLabel();
}

// ===================================================================
// VIEW PAGE LOGIC
// ===================================================================
let currentFilteredData = [];

const monthSelect   = document.getElementById('monthSelect');
const refreshBtn    = document.getElementById('refreshBtn');
const downloadBtn   = document.getElementById('downloadBtn');
const totalTAEl     = document.getElementById('totalTA');
const totalAmountEl = document.getElementById('totalAmount');
const viewStatus    = document.getElementById('viewStatus');
const viewTableBody = document.getElementById('viewTableBody');
let viewListenersAttached = false;

const COL = {
  SerialNo: 0, NameOfEmployee: 1, Designation: 2, Date: 3, ObjectOfJourney: 4,
  LeftTime: 5, ArrivedTime: 6, From: 7, To: 8, TA: 9, BookedBy: 10
};
const TOTAL_COLS = 11;

function populateMonthSelect() {
  const months = (typeof TAMonths !== 'undefined') ? TAMonths : [];
  const current = (typeof getCurrentTAMonth === 'function') ? getCurrentTAMonth() : '';
  monthSelect.innerHTML = '';
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === current) opt.selected = true;
    monthSelect.appendChild(opt);
  });
}

function setStatus(msg, isError) {
  viewStatus.textContent = msg;
  viewStatus.style.color = isError ? 'red' : '#333';
}

async function fetchSheetData(sheetName) {
  const range = `${sheetName}!A:K`;
  const url = `${WORKER_URL}?sheetId=${SHEET_ID}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Sheets API error:', res.status, errText);
    throw new Error(`Failed to fetch sheet data (HTTP ${res.status})`);
  }
  const json = await res.json();
  return json.values || [];
}

function padRow(row) {
  const padded = row.slice(0, TOTAL_COLS);
  while (padded.length < TOTAL_COLS) padded.push('');
  return padded;
}

function rowsToObjects(rows) {
  if (!rows || rows.length <= 1) return [];
  const dataRows = rows.slice(1);
  return dataRows
    .map(padRow)
    .filter(r => r[COL.SerialNo] !== '' || r[COL.NameOfEmployee] !== '')
    .map(r => ({
      SerialNo: r[COL.SerialNo], NameOfEmployee: r[COL.NameOfEmployee],
      Designation: r[COL.Designation], Date: r[COL.Date],
      ObjectOfJourney: r[COL.ObjectOfJourney], LeftTime: r[COL.LeftTime],
      ArrivedTime: r[COL.ArrivedTime], From: r[COL.From], To: r[COL.To],
      TA: r[COL.TA], BookedBy: r[COL.BookedBy]
    }));
}

async function loadViewData() {
  const sheetName = monthSelect.value;
  if (!sheetName) { setStatus('Please select a month.', true); return; }

  setStatus('Loading data...');
  viewTableBody.innerHTML = '';
  totalTAEl.textContent = '0';
  totalAmountEl.textContent = '0.00';

  try {
    const rows = await fetchSheetData(sheetName);
    if (!rows || rows.length === 0) {
      setStatus('No data found in sheet "' + sheetName + '".', true);
      return;
    }
    const objects = rowsToObjects(rows);
    const targetName = displayName.trim().toUpperCase();
    const filtered = objects.filter(o =>
      (o.NameOfEmployee || '').toString().trim().toUpperCase() === targetName
    );

    currentFilteredData = filtered;
    renderTable(filtered);
    renderSummary(filtered);
    setStatus(filtered.length ? '' : 'No records found for ' + displayName + ' in ' + sheetName + '.');
  } catch (err) {
    console.error('loadViewData error:', err);
    setStatus('Error loading data: ' + err.message + ' — Tap Refresh to try again.', true);
  }
}

function renderTable(data) {
  viewTableBody.innerHTML = '';
  const currentMonth = (typeof getCurrentTAMonth === 'function') ? getCurrentTAMonth() : '';
  const isCurrentMonthSelected = (monthSelect.value === currentMonth);

  data.forEach((row, index) => {
    const tr = document.createElement('tr');
    const editCell = isCurrentMonthSelected
      ? `<button class="edit-btn" onclick="editRow(${index})">✏️ Edit</button>`
      : `<span class="edit-disabled" title="Only current month entries can be edited">🔒 Locked</span>`;

    tr.innerHTML = `
      <td>${row.SerialNo}</td><td>${row.NameOfEmployee}</td><td>${row.Designation}</td>
      <td>${row.Date}</td><td>${row.ObjectOfJourney}</td><td>${row.LeftTime}</td>
      <td>${row.ArrivedTime}</td><td>${row.From}</td><td>${row.To}</td>
      <td>${row.TA}</td><td>${row.BookedBy}</td>
      <td>${editCell}</td>`;
    viewTableBody.appendChild(tr);
  });
}

function renderSummary(data) {
  const totalTA = data.length;
  const rate = (employeeData && employeeData.Rates) ? parseFloat(employeeData.Rates) : 0;
  let totalAmount = 0;
  data.forEach(row => {
    const pct = parseFloat((row.TA || '0').toString().replace('%', '')) || 0;
    totalAmount += (pct / 100) * rate;
  });
  totalTAEl.textContent = totalTA;
  totalAmountEl.textContent = totalAmount.toFixed(2);
}

function generatePDF() {
  downloadTAPdfDirect(); // defined in taPdf.js
}

function initView() {
  if (!viewListenersAttached) {
    monthSelect.addEventListener('change', loadViewData);
    refreshBtn.addEventListener('click', loadViewData);
    downloadBtn.addEventListener('click', generatePDF);
    viewListenersAttached = true;
  }
  loadViewData();
}
