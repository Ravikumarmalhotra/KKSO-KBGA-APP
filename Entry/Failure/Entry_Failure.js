/* ============================================================
 CONFIG
============================================================ */
function getUrlParam(name) {
 const params = new URLSearchParams(window.location.search);
 return params.get(name) || '';
}
const loggedInUser = getUrlParam('user');
const loggedInLevel = getUrlParam('level');
const parentSheet = getUrlParam('sheet');

const WORKER_URL = 'https://app.powersupplyorange.workers.dev';
const SPREADSHEET_ID  = '1Jid66wBQ1ktKoysqpoCF1sIKengpsHq8CQKW9euMWh0';
const SPREADSHEET_NAME= 'Failure_Log';

function getCurrentTimestamp() {
 const now = new Date();
 const dateStr = now.toLocaleDateString('en-GB');
 const timeStr = now.toLocaleTimeString('en-US', {
 hour: '2-digit', minute: '2-digit', second: '2-digit'
 });
 return `${dateStr}, ${timeStr}`;
}

/* ============================================================
 ASSET ID DECODE / VALIDATE
============================================================ */
function decodeAssetId(id) {
 const stationCode = id.slice(0,3);
 const groupCode = id.slice(3,5);
 const subGroupCode = id.slice(5,7);
 const equipCode = id.slice(7,9);
 return {
 stationCode, groupCode, subGroupCode, equipCode,
 station: stationMap[stationCode] || "Unknown",
 group: (groupMap[groupCode] || "Unknown").replace(/_/g," "),
 subGroup: (subGroupMap[groupCode] && subGroupMap[groupCode][subGroupCode]) || "Unknown",
 equipment: (equipmentMap[groupCode] && equipmentMap[groupCode][subGroupCode] &&
 equipmentMap[groupCode][subGroupCode][equipCode]) || "Unknown"
 };
}
function isValidAssetId(id) {
 if (!/^\d{9}$/.test(id)) return false;
 const groupCode = id.slice(3,5);
 const set = validAssetIdsByGroup[groupCode];
 return set ? set.has(id) : false;
}
function getValidSubGroupCodes(stationCode, groupCode) {
 const set = validAssetIdsByGroup[groupCode] || new Set();
 const prefix = stationCode + groupCode;
 const result = new Set();
 set.forEach(id => { if (id.startsWith(prefix)) result.add(id.slice(5,7)); });
 return result;
}
function getValidEquipmentCodes(stationCode, groupCode, subGroupCode) {
 const set = validAssetIdsByGroup[groupCode] || new Set();
 const prefix = stationCode + groupCode + subGroupCode;
 const result = new Set();
 set.forEach(id => { if (id.startsWith(prefix)) result.add(id.slice(7,9)); });
 return result;
}
function toDDMMYY(isoDate) {
 if (!isoDate) return '';
 const [y,m,d] = isoDate.split('-');
 return `${d}-${m}-${y.slice(2)}`;
}
function convertToInputDate(str) {
 if (!str) return '';
 str = str.toString().trim();
 let m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
 if (m) {
 let [, d, mo, y] = m;
 if (y.length === 2) y = '20' + y;
 return `${y.padStart(4,'0')}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
 }
 m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
 if (m) return `${m[1]}-${m[2]}-${m[3]}`;
 return '';
}
function markInvalid(el) { el.classList.add('invalid'); }
function clearInvalid(el) { el.classList.remove('invalid'); }

/* ============================================================
 REPORTED PERSON LIST (from maping.js -> reportedPersonMap)
============================================================ */
function getReportedPersonList() {
 if (typeof reportedPersonMap === 'undefined') return [];
 if (Array.isArray(reportedPersonMap)) return reportedPersonMap;
 if (typeof reportedPersonMap === 'object') return Object.values(reportedPersonMap);
 return [];
}
function populateReportedByDropdown(selectEl, presetValue) {
 selectEl.innerHTML = '<option value="">Select Reported By</option>';
 getReportedPersonList().forEach(name => {
 const opt = document.createElement('option');
 opt.value = name; opt.textContent = name;
 selectEl.appendChild(opt);
 });
 if (presetValue) selectEl.value = presetValue;
}

/* ============================================================
 GLOBAL STATE + DOM REFERENCES
============================================================ */
let currentMode = 'entry'; // 'entry' | 'edit'
let currentAssetId = null;
let currentDecoded = null;
let editMatches = [];
let editSelectedRow = null;

const entryPage = document.getElementById('entryPage');
const formPage = document.getElementById('formPage');

const modeEntryBtn = document.getElementById('modeEntryBtn');
const modeEditBtn = document.getElementById('modeEditBtn');

const editModeBanner = document.getElementById('editModeBanner');
const editModeStatus = document.getElementById('editModeStatus');
const selectFailureDateGroup = document.getElementById('selectFailureDateGroup');
const selectFailureDate = document.getElementById('selectFailureDate');

const btnClearFields = document.getElementById('btnClearFields');

const ddStation = document.getElementById('ddStation');
const ddGroup = document.getElementById('ddGroup');
const ddSubGroup = document.getElementById('ddSubGroup');
const ddEquipment = document.getElementById('ddEquipment');
const dropdownError = document.getElementById('dropdownError');
const assetIdInput = document.getElementById('assetIdInput');
const assetIdError = document.getElementById('assetIdError');

const dateInput = document.getElementById('dateOfFailure');
const dateErr = document.getElementById('dateErr');

const faultInput = document.getElementById('faultInput');
const faultErr = document.getElementById('faultErr');
const btnEditFault = document.getElementById('btnEditFault');

const reportedBySelect = document.getElementById('reportedBySelect');
const reportedByErr = document.getElementById('reportedByErr');
const btnEditReportedBy = document.getElementById('btnEditReportedBy');

const repercussionInput = document.getElementById('repercussionInput');
const repercussionErr = document.getElementById('repercussionErr');
const btnEditRepercussion = document.getElementById('btnEditRepercussion');

const causeInput = document.getElementById('causeInput');
const causeErr = document.getElementById('causeErr');
const btnEditCause = document.getElementById('btnEditCause');

const actionInput = document.getElementById('actionInput');
const actionErr = document.getElementById('actionErr');
const btnEditAction = document.getElementById('btnEditAction');

const attendedByContainer = document.getElementById('attendedByContainer');
const staffErr = document.getElementById('staffErr');
const btnAddStaff = document.getElementById('btnAddStaff');
const btnEditAttendedBy = document.getElementById('btnEditAttendedBy');

const rectificationDateGroup = document.getElementById('rectificationDateGroup');
const rectificationDate = document.getElementById('rectificationDate');
const rectDateErr = document.getElementById('rectDateErr');

const formError = document.getElementById('formError');
const submitStatus = document.getElementById('submitStatus');

/* ============================================================
 MODE TOGGLE (Entry / Edit)
============================================================ */
function updateMandatoryLabels() {
 const req = currentMode === 'edit';
 document.getElementById('labelRepercussion').textContent = 'Repercussion' + (req ? ' *' : '');
 document.getElementById('labelCause').textContent = 'Cause Of Failure' + (req ? ' *' : '');
 document.getElementById('labelAction').textContent = 'Action Taken' + (req ? ' *' : '');
 document.getElementById('labelAttendedBy').textContent = 'Attended By' + (req ? ' *' : '');
}
function setMode(mode) {
 currentMode = mode;
 modeEntryBtn.classList.toggle('active', mode === 'entry');
 modeEditBtn.classList.toggle('active', mode === 'edit');
 updateMandatoryLabels();
}
modeEntryBtn.addEventListener('click', () => setMode('entry'));
modeEditBtn.addEventListener('click', () => setMode('edit'));
updateMandatoryLabels(); // initialize labels on page load (Entry mode default)
/* ============================================================
 DROPDOWN POPULATION (Station / Group / SubGroup / Equipment)
============================================================ */
function populateStationDropdown() {
 ddStation.innerHTML = '<option value="">Select Station</option>';
 Object.entries(stationMap).forEach(([code,name]) => {
 const opt = document.createElement('option');
 opt.value = code; opt.textContent = `${name}`;
 ddStation.appendChild(opt);
 });
}
function populateGroupDropdown() {
 ddGroup.innerHTML = '<option value="">Select Group</option>';
 Object.entries(groupMap).forEach(([code,name]) => {
 const opt = document.createElement('option');
 opt.value = code; opt.textContent = name.replace(/_/g,' ');
 ddGroup.appendChild(opt);
 });
}
function populateSubGroupDropdown(stationCode, groupCode) {
 ddSubGroup.innerHTML = '<option value="">Select Sub-Group</option>';
 const allSubGroups = subGroupMap[groupCode] || {};
 const validCodes = getValidSubGroupCodes(stationCode, groupCode);
 const codes = Object.keys(allSubGroups).filter(c => validCodes.has(c));
 if (codes.length === 0) {
 const opt = document.createElement('option');
 opt.value = ''; opt.textContent = 'No data available for this Station/Group'; opt.disabled = true;
 ddSubGroup.appendChild(opt);
 return;
 }
 codes.forEach(code => {
 const opt = document.createElement('option');
 opt.value = code; opt.textContent = allSubGroups[code];
 ddSubGroup.appendChild(opt);
 });
}
function populateEquipmentDropdown(stationCode, groupCode, subGroupCode) {
 ddEquipment.innerHTML = '<option value="">Select Equipment</option>';
 const allEquip = (equipmentMap[groupCode] && equipmentMap[groupCode][subGroupCode]) || {};
 const validCodes = getValidEquipmentCodes(stationCode, groupCode, subGroupCode);
 const codes = Object.keys(allEquip).filter(c => validCodes.has(c));
 if (codes.length === 0) {
 const opt = document.createElement('option');
 opt.value = ''; opt.textContent = 'No data available'; opt.disabled = true;
 ddEquipment.appendChild(opt);
 return;
 }
 codes.forEach(code => {
 const opt = document.createElement('option');
 opt.value = code; opt.textContent = allEquip[code];
 ddEquipment.appendChild(opt);
 });
}
populateStationDropdown();
populateGroupDropdown();

ddStation.addEventListener('change', () => {
 ddGroup.value = '';
 ddSubGroup.innerHTML = '<option value="">Select Sub-Group</option>';
 ddEquipment.innerHTML = '<option value="">Select Equipment</option>';
 ddGroup.disabled = !ddStation.value;
 ddSubGroup.disabled = true;
 ddEquipment.disabled = true;
 dropdownError.textContent = '';
});
ddGroup.addEventListener('change', () => {
 ddSubGroup.innerHTML = '<option value="">Select Sub-Group</option>';
 ddEquipment.innerHTML = '<option value="">Select Equipment</option>';
 ddEquipment.disabled = true;
 if (ddStation.value && ddGroup.value) {
 populateSubGroupDropdown(ddStation.value, ddGroup.value);
 ddSubGroup.disabled = false;
 } else {
 ddSubGroup.disabled = true;
 }
 dropdownError.textContent = '';
});
ddSubGroup.addEventListener('change', () => {
 ddEquipment.innerHTML = '<option value="">Select Equipment</option>';
 if (ddStation.value && ddGroup.value && ddSubGroup.value) {
 populateEquipmentDropdown(ddStation.value, ddGroup.value, ddSubGroup.value);
 ddEquipment.disabled = false;
 } else {
 ddEquipment.disabled = true;
 }
 dropdownError.textContent = '';
});
document.getElementById('btnGetFormByDropdown').addEventListener('click', () => {
 const s = ddStation.value, g = ddGroup.value, sg = ddSubGroup.value, e = ddEquipment.value;
 dropdownError.textContent = '';
 if (!s || !g || !sg || !e) {
 dropdownError.textContent = 'Please select all fields (Station, Group, Sub-Group, Equipment).';
 return;
 }
 const assetId = s + g + sg + e;
 if (!isValidAssetId(assetId)) {
 dropdownError.textContent = 'Invalid combination. Asset Id not found in master list.';
 return;
 }
 showForm(assetId);
});
assetIdInput.addEventListener('input', (e) => {
 e.target.value = e.target.value.replace(/\D/g,'').slice(0,9);
 assetIdError.textContent = '';
});
document.getElementById('btnGetFormById').addEventListener('click', () => {
 const id = assetIdInput.value.trim();
 assetIdError.textContent = '';
 if (!/^\d{9}$/.test(id)) {
 assetIdError.textContent = 'Please enter a valid 9-digit Asset Id.';
 return;
 }
 if (!isValidAssetId(id)) {
 assetIdError.textContent = 'Asset Id not found in master list.';
 return;
 }
 showForm(id);
});
function clearEntryPageSelections() {
 assetIdInput.value = '';
 assetIdError.textContent = '';
 ddStation.value = ''; ddGroup.value = '';
 ddGroup.disabled = true;
 ddSubGroup.innerHTML = '<option value="">Select Sub-Group</option>';
 ddSubGroup.disabled = true;
 ddEquipment.innerHTML = '<option value="">Select Equipment</option>';
 ddEquipment.disabled = true;
 dropdownError.textContent = '';
}

/* ============================================================
 QR SCANNER
============================================================ */
const btnScanQr = document.getElementById('btnScanQr');
const qrReaderContainer = document.getElementById('qrReaderContainer');
const qrVideo = document.getElementById('qrVideo');
const qrCanvas = document.getElementById('qrCanvas');
const qrCtx = qrCanvas.getContext('2d');
const qrResult = document.getElementById('qrResult');
const qrError = document.getElementById('qrError');
let qrStream = null;
let qrScanning = false;
btnScanQr.addEventListener('click', startQrScan);
document.getElementById('btnCancelScan').addEventListener('click', stopQrScan);
async function startQrScan() {
 qrError.textContent = '';
 qrResult.textContent = '';
 if (!window.isSecureContext) {
 qrError.textContent = 'Camera requires a secure connection (HTTPS or localhost). Please open this page via https://';
 return;
 }
 if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
 qrError.textContent = 'Camera API not supported in this browser.';
 return;
 }
 const constraintsList = [
 { video: { facingMode: { exact: "environment" } } },
 { video: { facingMode: "environment" } },
 { video: true }
 ];
 let lastErr = null;
 qrStream = null;
 for (const constraints of constraintsList) {
 try {
 qrStream = await navigator.mediaDevices.getUserMedia(constraints);
 if (qrStream) break;
 } catch (err) {
 lastErr = err;
 }
 }
 if (!qrStream) {
 let msg = 'Camera access denied or not available.';
 if (lastErr && lastErr.name) {
 if (lastErr.name === 'NotAllowedError') msg = 'Camera permission denied. Please allow camera access in browser settings.';
 else if (lastErr.name === 'NotFoundError') msg = 'No camera found on this device.';
 else if (lastErr.name === 'NotReadableError') msg = 'Camera is already in use by another app.';
 else msg = 'Camera error: ' + lastErr.name;
 }
 qrError.textContent = msg;
 return;
 }
 qrVideo.srcObject = qrStream;
 qrVideo.setAttribute('playsinline', 'true');
 qrVideo.muted = true;
 try {
 await qrVideo.play();
 } catch (err) {
 qrError.textContent = 'Unable to start camera preview. Please try again.';
 stopQrScan();
 return;
 }
 qrReaderContainer.style.display = 'block';
 qrScanning = true;
 requestAnimationFrame(scanLoop);
}
function stopQrScan() {
 qrScanning = false;
 if (qrStream) {
 qrStream.getTracks().forEach(t => t.stop());
 qrStream = null;
 }
 qrReaderContainer.style.display = 'none';
}
function scanLoop() {
 if (!qrScanning) return;
 if (qrVideo.readyState === qrVideo.HAVE_ENOUGH_DATA) {
 qrCanvas.width = qrVideo.videoWidth;
 qrCanvas.height = qrVideo.videoHeight;
 qrCtx.drawImage(qrVideo, 0, 0, qrCanvas.width, qrCanvas.height);
 const imageData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
 const code = jsQR(imageData.data, imageData.width, imageData.height);
 if (code && code.data) {
 handleQrResult(code.data);
 return;
 }
 }
 requestAnimationFrame(scanLoop);
}
function handleQrResult(text) {
 const digitsOnly = text.replace(/\D/g, '');
 const assetId = digitsOnly.slice(-9);
 stopQrScan();
 if (!/^\d{9}$/.test(assetId) || !isValidAssetId(assetId)) {
 qrError.textContent = 'Scanned QR does not contain a valid Asset Id.';
 return;
 }
 qrResult.textContent = 'QR scanned successfully!';
 showForm(assetId);
}

/* ============================================================
 SHOW FORM / SHOW ENTRY (PAGE NAVIGATION)
============================================================ */
function showForm(assetId) {
 currentAssetId = assetId;
 currentDecoded = decodeAssetId(assetId);
 document.getElementById('infoAssetId').textContent = assetId;
 document.getElementById('infoStation').textContent = currentDecoded.station;
 document.getElementById('infoGroup').textContent = currentDecoded.group;
 document.getElementById('infoSubGroup').textContent = currentDecoded.subGroup;
 document.getElementById('infoEquipment').textContent = currentDecoded.equipment;

 entryPage.classList.remove('active');
 formPage.classList.add('active');
 window.scrollTo(0,0);

 if (currentMode === 'edit') {
 loadEditData(assetId);
 } else {
 resetEntryFormFields();
 }
}
function showEntry() {
 formPage.classList.remove('active');
 entryPage.classList.add('active');
 qrResult.textContent = '';
 qrError.textContent = '';
 clearEntryPageSelections();
 submitStatus.textContent = '';
 submitStatus.className = '';
 window.scrollTo(0,0);
}
document.getElementById('btnBack').addEventListener('click', showEntry);

/* ============================================================
 STAFF (Attended By) - MULTI ROW
============================================================ */
dateInput.addEventListener('change', () => { clearInvalid(dateInput); dateErr.textContent=''; });
faultInput.addEventListener('input', () => {
 clearInvalid(faultInput); faultErr.textContent = '';
});
repercussionInput.addEventListener('input', () => {
 clearInvalid(repercussionInput); repercussionErr.textContent = '';
});
reportedBySelect.addEventListener('change', () => { clearInvalid(reportedBySelect); reportedByErr.textContent=''; });
causeInput.addEventListener('input', () => { clearInvalid(causeInput); causeErr.textContent=''; });
actionInput.addEventListener('input', () => { clearInvalid(actionInput); actionErr.textContent=''; });

function getSelectedStaffValues() {
 return Array.from(document.querySelectorAll('.staffSelect')).map(s => s.value).filter(v => v);
}
function renderStaffOptions(select) {
 const currentVal = select.value;
 const used = getSelectedStaffValues();
 select.innerHTML = '<option value="">Select Staff</option>';
 staffList.forEach(name => {
 if (used.includes(name) && name !== currentVal) return;
 const opt = document.createElement('option');
 opt.value = name; opt.textContent = name;
 if (name === currentVal) opt.selected = true;
 select.appendChild(opt);
 });
}
function refreshAllStaffOptions() {
 document.querySelectorAll('.staffSelect').forEach(renderStaffOptions);
}
function updateStaffDeleteVisibility() {
 const rows = document.querySelectorAll('.staffRow');
 rows.forEach(r => {
 const btn = r.querySelector('.delBtn');
 btn.style.display = rows.length > 1 ? 'inline-block' : 'none';
 });
}
function addStaffRow(presetValue) {
 const row = document.createElement('div');
 row.className = 'staffRow';
 const select = document.createElement('select');
 select.className = 'staffSelect';
 select.addEventListener('change', () => {
 clearInvalid(select);
 staffErr.textContent = '';
 refreshAllStaffOptions();
 });
 const delBtn = document.createElement('button');
 delBtn.type = 'button';
 delBtn.className = 'delBtn';
 delBtn.textContent = '🗑';
 delBtn.title = 'Delete';
 delBtn.addEventListener('click', () => {
 row.remove();
 refreshAllStaffOptions();
 updateStaffDeleteVisibility();
 });
 row.appendChild(select);
 row.appendChild(delBtn);
 attendedByContainer.appendChild(row);
 renderStaffOptions(select);
 if (presetValue) select.value = presetValue;
 updateStaffDeleteVisibility();
}
btnAddStaff.addEventListener('click', () => addStaffRow());

/* ============================================================
 ENTRY MODE - RESET FORM
============================================================ */
function resetEntryFormFields() {
 editModeBanner.classList.remove('show');
 selectFailureDateGroup.style.display = 'none';
 rectificationDateGroup.style.display = 'none';
 rectificationDate.value = '';

 [dateErr,faultErr,reportedByErr,repercussionErr,causeErr,actionErr,staffErr,rectDateErr,formError].forEach(e=>e.textContent='');
 submitStatus.textContent=''; submitStatus.className='';

 dateInput.value = ''; dateInput.disabled = false; clearInvalid(dateInput);

 faultInput.value = ''; faultInput.readOnly = false; clearInvalid(faultInput);
 btnEditFault.style.display = 'none';

 populateReportedByDropdown(reportedBySelect);
 reportedBySelect.disabled = false; clearInvalid(reportedBySelect);
 btnEditReportedBy.style.display = 'none';

  repercussionInput.value = ''; repercussionInput.readOnly = false; clearInvalid(repercussionInput);
 btnEditRepercussion.style.display = 'none';

 causeInput.value = ''; causeInput.readOnly = false; clearInvalid(causeInput);
 btnEditCause.style.display = 'none';

 actionInput.value = ''; actionInput.readOnly = false; clearInvalid(actionInput);
 btnEditAction.style.display = 'none';

 attendedByContainer.innerHTML = '';
 addStaffRow();
 btnAddStaff.style.display = 'inline-block';
 btnEditAttendedBy.style.display = 'none';
}

/* ============================================================
 EDIT MODE - FETCH FROM GOOGLE SHEET
============================================================ */
async function fetchFailureLogRows() {
 const range = `${SPREADSHEET_NAME}!A2:I`;
 const url = `${WORKER_URL}?sheetId=${SPREADSHEET_ID}&range=${encodeURIComponent(range)}`;
 const res = await fetch(url);
 if (!res.ok) throw new Error('Sheet fetch failed: ' + res.status);
 const data = await res.json();
 return data.values || [];
}

async function loadEditData(assetId) {
 editModeBanner.classList.add('show');
 editModeStatus.textContent = 'Loading failure record...';
 selectFailureDateGroup.style.display = 'none';
 rectificationDateGroup.style.display = 'block';
 rectificationDate.value = '';
 rectDateErr.textContent = '';
 clearEditFieldsBlank();
 setFieldsDisabled(true);

 try {
 const rows = await fetchFailureLogRows();
 editMatches = rows.filter(r =>
 (r[0] || '').toString().trim() === assetId &&
 (!r[8] || r[8].toString().trim() === '')
 );

 if (editMatches.length === 0) {
 editModeStatus.textContent = '⚠️ No open failure record found for this Asset Id (nothing pending rectification).';
 return;
 }

 if (editMatches.length === 1) {
 editModeStatus.textContent = 'Failure record loaded.';
 editSelectedRow = editMatches[0];
 populateEditFields(editSelectedRow);
 } else {
 editModeStatus.textContent = 'Multiple open failure records found. Please select the failure date.';
 selectFailureDateGroup.style.display = 'block';
 selectFailureDate.innerHTML = '<option value="">Select Failure Date</option>';
 editMatches.forEach((m, idx) => {
 const opt = document.createElement('option');
 opt.value = idx;
 opt.textContent = m[1] || `Record ${idx+1}`;
 selectFailureDate.appendChild(opt);
 });
 }
 } catch (err) {
 console.error(err);
 editModeStatus.textContent = '❌ Failed to load failure data. Please try again.';
 }
}
selectFailureDate.addEventListener('change', () => {
 const idx = selectFailureDate.value;
 if (idx === '') { clearEditFieldsBlank(); setFieldsDisabled(true); return; }
 editSelectedRow = editMatches[idx];
 populateEditFields(editSelectedRow);
});

function clearEditFieldsBlank() {
 dateInput.value = '';
 faultInput.value = '';
 populateReportedByDropdown(reportedBySelect);
 repercussionInput.value = '';
 causeInput.value = '';
 actionInput.value = '';
 attendedByContainer.innerHTML = '';
 addStaffRow();
 [dateErr,faultErr,reportedByErr,repercussionErr,causeErr,actionErr,staffErr].forEach(e=>e.textContent='');
}

function populateEditFields(row) {
 // row: [AssetId, DateOfFailure, Fault, ReportedBy, Repercussion, CauseOfFailure, ActionTaken, AttendedBy, RectificationDate]
 dateInput.value = convertToInputDate(row[1]);
 if (dateInput.value) {
 const sameDay = new Date(dateInput.value);
 sameDay.setDate(sameDay.getDate() + 0);
 rectificationDate.min = sameDay.toISOString().slice(0,10);
 }
 faultInput.value = row[2] || '';
 populateReportedByDropdown(reportedBySelect, row[3] || '');
 repercussionInput.value = row[4] || '';
 causeInput.value = row[5] || '';
 actionInput.value = row[6] || '';

 attendedByContainer.innerHTML = '';
 const staffNames = (row[7] || '').split(',').map(s => s.trim()).filter(Boolean);
 if (staffNames.length === 0) addStaffRow(); else staffNames.forEach(n => addStaffRow(n));

 setFieldsDisabled(true);
 rectificationDate.value = '';
}

function setFieldsDisabled(disabled) {
 // (i) Date Of Failure - always locked in Edit Mode
 dateInput.disabled = true;

 // (ii) - (vii) locked by default with small Edit buttons
 faultInput.readOnly = disabled;
 btnEditFault.style.display = disabled ? 'inline-block' : 'none';

 reportedBySelect.disabled = disabled;
 btnEditReportedBy.style.display = disabled ? 'inline-block' : 'none';

 repercussionInput.readOnly = disabled; // (iv) also editable via its own edit btn in Edit Mode
 btnEditRepercussion.style.display = disabled ? 'inline-block' : 'none';

 causeInput.readOnly = disabled;
 btnEditCause.style.display = disabled ? 'inline-block' : 'none';

 actionInput.readOnly = disabled;
 btnEditAction.style.display = disabled ? 'inline-block' : 'none';

 document.querySelectorAll('.staffSelect').forEach(s => s.disabled = disabled);
 btnAddStaff.style.display = disabled ? 'none' : 'inline-block';
 btnEditAttendedBy.style.display = disabled ? 'inline-block' : 'none';
}

btnEditFault.addEventListener('click', () => { faultInput.readOnly = false; faultInput.focus(); });
btnEditReportedBy.addEventListener('click', () => { reportedBySelect.disabled = false; });
btnEditRepercussion.addEventListener('click', () => { repercussionInput.readOnly = false; repercussionInput.focus(); });
btnEditCause.addEventListener('click', () => { causeInput.readOnly = false; causeInput.focus(); });
btnEditAction.addEventListener('click', () => { actionInput.readOnly = false; actionInput.focus(); });
btnEditAttendedBy.addEventListener('click', () => {
 document.querySelectorAll('.staffSelect').forEach(s => s.disabled = false);
 btnAddStaff.style.display = 'inline-block';
});

rectificationDate.addEventListener('change', () => {
 clearInvalid(rectificationDate);
 rectDateErr.textContent = '';
 if (rectificationDate.value && dateInput.value && rectificationDate.value < dateInput.value) {
 markInvalid(rectificationDate);
 rectDateErr.textContent = 'Rectification Date must be equal or greater than Date Of Failure.';
 }
});

/* ============================================================
 CLEAR FIELDS BUTTON (works for both modes)
============================================================ */
btnClearFields.addEventListener('click', () => {
 if (currentMode === 'edit' && currentAssetId) {
 loadEditData(currentAssetId);
 } else {
 resetEntryFormFields();
 }
});

/* ============================================================
 SUBMIT HANDLER
============================================================ */
document.getElementById('btnSubmit').addEventListener('click', async () => {
 formError.textContent = '';
 submitStatus.textContent = '';
 submitStatus.className = '';
 [dateErr,faultErr,reportedByErr,repercussionErr,causeErr,actionErr,staffErr,rectDateErr].forEach(e=>e.textContent='');
 [dateInput,faultInput,reportedBySelect,causeInput,actionInput,rectificationDate].forEach(clearInvalid);

 let hasError = false;
/* ============================================================
 * Field- Kisko kisko  Required karna hai.
============================================================ */
 if (!dateInput.value) {
 dateErr.textContent = 'Date Of Failure is required.';
 markInvalid(dateInput); hasError = true;
 }
 if (!faultInput.value.trim()) {
 faultErr.textContent = 'Fault is required.';
 markInvalid(faultInput); hasError = true;
 }
 if (!reportedBySelect.value) {
 reportedByErr.textContent = 'Reported By is required.';
 markInvalid(reportedBySelect); hasError = true;
 }
 const staffSelects = Array.from(document.querySelectorAll('.staffSelect'));
 let staffBlank = staffSelects.some(s => !s.value);

 if (currentMode === 'edit') {
 if (!repercussionInput.value.trim()) {
 repercussionErr.textContent = 'Repercussion cannot be blank.';
 markInvalid(repercussionInput); hasError = true;
 }
 if (!causeInput.value.trim()) {
 causeErr.textContent = 'Cause Of Failure is required.';
 markInvalid(causeInput); hasError = true;
 }
 if (!actionInput.value.trim()) {
 actionErr.textContent = 'Action Taken is required.';
 markInvalid(actionInput); hasError = true;
 }
 staffSelects.forEach(s => { if (!s.value) markInvalid(s); else clearInvalid(s); });
 if (staffSelects.length === 0 || staffBlank) {
 staffErr.textContent = 'Attended By: at least one staff required and no box can be left blank.';
 hasError = true;
 }
 } else {
 // Entry Mode: iv–vii optional, just clear any stale invalid marks
 clearInvalid(repercussionInput);
 clearInvalid(causeInput);
 clearInvalid(actionInput);
 staffSelects.forEach(clearInvalid);
 }

  if (currentMode === 'edit') {
 if (!rectificationDate.value) {
 rectDateErr.textContent = 'Rectification Date is mandatory.';
 markInvalid(rectificationDate);
 hasError = true;
 } else if (dateInput.value && rectificationDate.value < dateInput.value) {
 rectDateErr.textContent = 'Rectification Date must be equal or greater than Date Of Failure.';
 markInvalid(rectificationDate);
 hasError = true;
 }
 if (!editSelectedRow) {
 formError.textContent = 'No failure record selected/loaded to edit.';
 hasError = true;
 }
 }

 if (hasError) {
 formError.textContent = 'Please fix the highlighted fields before submitting.';
 return;
 }

 const attendedBy = staffSelects.map(s => s.value);
 //---------------------------------------------------------------------------------------------------------------------------------
const timeStamp = getCurrentTimestamp();

const dataFields = {
  assetIdNo: currentAssetId,
  dateOfFailure: toDDMMYY(dateInput.value),
  fault: faultInput.value.trim(),
  reportedBy: reportedBySelect.value,
  repercussion: repercussionInput.value.trim(),
  causeOfFailure: causeInput.value.trim(),
  actionTaken: actionInput.value.trim(),
  attendedByStaff: attendedBy.join(', '),
  rectificationDate: currentMode === 'edit' ? toDDMMYY(rectificationDate.value) : '',
  entryDetails: currentMode === 'entry' ? '[ submit ] ' + loggedInUser + '; ' + loggedInLevel + '; ' + timeStamp : '',
  editDetails: currentMode === 'edit' ? '[ update ] ' + loggedInUser + '; ' + loggedInLevel + '; ' + timeStamp : ''
};
//--------------------------------------------------------------------------------------------------------------------------------------- 
 if (currentMode === 'edit' && editSelectedRow) {
 dataFields.originalFailureDate = editSelectedRow[1] || '';
 }

 // ⭐ Worker requires payload wrapped as { target, data }
 const payload = {
 target: 'Failure_Log',
 data: dataFields
 };

 const btnSubmit = document.getElementById('btnSubmit');
 btnSubmit.disabled = true;
 submitStatus.textContent = 'Submitting...';
 submitStatus.className = 'loading';

 try {
 const response = await fetch(WORKER_URL, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload)
 });
 const result = await response.json();
 if (result.success) {
 submitStatus.className = 'ok';
 submitStatus.textContent = '✅ Data submitted successfully!';
 setTimeout(() => { showEntry(); }, 1400);
 } else {
 submitStatus.className = 'err';
 submitStatus.textContent = '❌ Error: ' + result.error;
 }
 } catch (err) {
 submitStatus.className = 'err';
 submitStatus.textContent = '❌ Submission failed. Please try again.';
 console.error(err);
 } finally {
 btnSubmit.disabled = false;
 }
});
