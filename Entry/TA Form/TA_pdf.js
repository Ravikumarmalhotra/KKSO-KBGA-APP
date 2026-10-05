// ===================== taPdf.js (PRINT-BASED — no libraries, no hanging, no blocked downloads) =====================

// ---------- date/time helpers ----------
function taParseDMY(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  let y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (y < 100) y = 2000 + y;
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function taFormatDMY(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const p = n => (n < 10 ? '0' + n : '' + n);
  return p(dateObj.getDate()) + '-' + p(dateObj.getMonth() + 1) + '-' + String(dateObj.getFullYear()).slice(-2);
}

function taTimeToMinutes(t) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

function taMinutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const p = n => (n < 10 ? '0' + n : '' + n);
  return p(h) + ':' + p(mm);
}

function taExtractCode(fullText) {
  if (!fullText || typeof fullText !== 'string') return '';
  return fullText.split('(')[0].trim();
}

function taComputeNoOfTrain(toFullText, dateObj, leftMin, finalArrivedMin) {
  const code = taExtractCode(toFullText);
  if (!code) return '';
  const unrestricted = (typeof TAUnrestrictedMetroStations !== 'undefined') ? TAUnrestrictedMetroStations : [];
  const restricted   = (typeof TATimeRestrictedStations !== 'undefined') ? TATimeRestrictedStations : [];

  if (unrestricted.includes(code)) return '-By Metro-';

  if (restricted.includes(code)) {
    if (!dateObj) return '-By Car-';
    const dow = dateObj.getDay();
    const isWeekday = dow >= 1 && dow <= 5;
    const inWindow = (mins) => mins >= 480 && mins <= 1200;
    const eitherInWindow = inWindow(leftMin) || inWindow(finalArrivedMin);
    return (isWeekday && eitherInWindow) ? '-By Metro-' : '-By Car-';
  }
  return '-By Car-';
}

function taFormatObjectText(objectText) {
  const excluded = (typeof TAObjectSuffixExcludedUsers !== 'undefined') ? TAObjectSuffixExcludedUsers : [];
  let text = (objectText || '').toString().trim().toUpperCase();
  const suffix = 'BOOKED BY SSE/M/KKSO';
  const alreadyHasSuffix = text.endsWith(suffix);
  
  const key = (typeof lookupKey !== 'undefined') ? lookupKey : '';
  
  if (!excluded.includes(key) && !alreadyHasSuffix) {
    text = text + ' ' + suffix;
  }
  return text;
}

function taBuildTrip(row, rowIndex) {
  try {
    const dateObj = taParseDMY(row.Date);
    const leftMin = taTimeToMinutes(row.LeftTime);
    const finalArrivedMin = taTimeToMinutes(row.ArrivedTime);

    const travelMinutes = (typeof stationTime !== 'undefined' && stationTime[row.To] !== undefined)
      ? stationTime[row.To] : 0;

    const outArrivedMin = leftMin + travelMinutes;
    const outArrivedStr = taMinutesToHHMM(outArrivedMin);
    const fromCode = taExtractCode(row.From);
    const toCode   = taExtractCode(row.To);
    const noOfTrain = taComputeNoOfTrain(row.To, dateObj, leftMin, finalArrivedMin);

    const retLeftMin = finalArrivedMin - travelMinutes;
    const retLeftStr = taMinutesToHHMM(retLeftMin);
    const retArrivedStr = row.ArrivedTime || '';
    const nextDay = finalArrivedMin < leftMin;

    const rate = (typeof employeeData !== 'undefined' && employeeData.Rates) ? parseFloat(employeeData.Rates) : 0;
    const pct = parseFloat((row.TA || '0').toString().replace('%', '')) || 0;
    const amount = rate * pct / 100;
    const rs = Math.floor(amount + 1e-6);
    const p  = Math.round((amount - rs) * 100);

    const safeDateObj = dateObj || new Date();

    return {
      dateObj: safeDateObj, dateStr: row.Date || '', train: noOfTrain,
      out: { left: row.LeftTime || '', arrived: outArrivedStr, from: fromCode, to: toCode },
      ret: { left: retLeftStr, arrived: retArrivedStr, from: toCode, to: fromCode },
      nextDay, days: row.TA || '',
      pct: pct, // Percentage track karne ke liye
      object: taFormatObjectText(row.ObjectOfJourney),
      rate, rs, p
    };
  } catch (err) {
    console.error('Failed to build trip for row', rowIndex, row, err);
    return null;
  }
}

function taPaginateTrips(trips) {
  const pages = [];
  const page1 = trips.slice(0, 7);
  pages.push({ type: 'first', trips: page1 });
  let idx = page1.length, remaining = trips.length - idx;
  if (remaining <= 0) {
    pages.push({ type: 'final', trips: [] });
  } else {
    while (remaining > 0) {
      const chunk = trips.slice(idx, idx + 6);
      idx += chunk.length; remaining -= chunk.length;
      pages.push({ type: remaining <= 0 ? 'final' : 'middle', trips: chunk });
    }
  }
  return pages;
}

// ---------- Normal Sum (C/F, B/F aur Page-wise calculations ke liye) ----------
function taSumAmounts(trips) {
  let rs = 0, p = 0;
  trips.forEach(t => { 
    rs += t.rs; 
    p += t.p; 
  });
  rs += Math.floor(p / 100); 
  p %= 100;
  return { rs, p };
}

// ---------- Corrected Final Sum Logic (Computer Tab Entry) ----------
function taFinalSumAmounts(allTrips) {
  let count30 = 0;
  let count70 = 0;
  let totalRs = 0;
  let totalP = 0;

  allTrips.forEach(t => {
    totalRs += t.rs;
    totalP += t.p;

    // 30% aur 70% ki count track karein
    if (t.pct === 30) count30++;
    else if (t.pct === 70) count70++;
  });

  // Base sum: Paise ko Rs me convert karein
  totalRs += Math.floor(totalP / 100);
  totalP %= 100;

  // AGAR PEHLE SE HI ROUND FIGURE HAI (totalP === 0), TOH KUCH NAHI KARNA
  if (totalP > 0) {
    let extraPaise = 0;

    // 1. Agar total round figure nahi hai aur 30% count odd hai -> +50 paise
    if (count30 % 2 !== 0) {
      extraPaise += 50;
    }

    // 2. Agar total round figure nahi hai aur 70% count odd hai -> +50 paise
    if (count70 % 2 !== 0) {
      extraPaise += 50;
    }

    totalP += extraPaise;
    totalRs += Math.floor(totalP / 100);
    totalP %= 100;

    // HAR HAAL ME FINAL TOTAL ROUND FIGURE CHAHIYE:
    // Agar add karne ke baad bhi paise bache hain (e.g. 50 paise),
    // toh use next nearest rupee par round off kar denge.
    if (totalP > 0) {
      if (totalP >= 50) {
        totalRs += 1;
      }
      totalP = 0; // Final Paise hamesha 00 ho jayenge
    }
  }

  return { rs: totalRs, p: 0 }; // Always 0 paise (Pure Round Figure)
}


function taNumberToWords(num) {
  if (num === 0) return 'Zero';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n/10)] + (n%10 ? ' ' + a[n%10] : '');
  const three = n => { let s=''; if(n>=100){s+=a[Math.floor(n/100)]+' Hundred'; n%=100; if(n) s+=' ';} if(n>0) s+=two(n); return s; };
  let result = '';
  const crore = Math.floor(num/10000000); num %= 10000000;
  const lakh  = Math.floor(num/100000);   num %= 100000;
  const thousand = Math.floor(num/1000);  num %= 1000;
  if (crore) result += three(crore) + ' Crore ';
  if (lakh)  result += three(lakh) + ' Lakh ';
  if (thousand) result += three(thousand) + ' Thousand ';
  if (num) result += three(num);
  return result.trim();
}

function taAmountToWords(rs, p) {
  let words = taNumberToWords(rs) + ' Rupees';
  if (p > 0) words += ' and ' + taNumberToWords(p) + ' Paisa';
  return words + ' Only';
}

// ---------- KM decorative pattern ----------
const KM_PATTERN_PAGE1 = ['A','B','O','V','E','','08','','K','M','','','',''];
const KM_PATTERN_OTHER = ['','','A','B','O','V','E','','08','','K','M','',''];
function taKmPatternFor(isFirstPage, idx) {
  return (isFirstPage ? KM_PATTERN_PAGE1 : KM_PATTERN_OTHER)[idx] || '';
}

// ---------- HTML Row rendering ----------
function taRenderRowsForPage(pageObj, isFirstPage) {
  let html = '';
  let idx = 0;

  if (!isFirstPage) {
    html += `
      <tr class="bf-row">
        <td></td><td></td><td></td><td></td><td></td><td></td>
        <td class="km-cell">${taKmPatternFor(false, idx++)}</td>
        <td rowspan="2"></td><td rowspan="2"></td>
        <td rowspan="2">B/F</td>
        <td rowspan="2">${pageObj.bf.rs}</td>
        <td rowspan="2">${String(pageObj.bf.p).padStart(2,'0')}</td>
      </tr>
      <tr class="bf-row">
        <td></td><td></td><td></td><td></td><td></td><td></td>
        <td class="km-cell">${taKmPatternFor(false, idx++)}</td>
      </tr>`;
  }

  const maxSets = isFirstPage ? 7 : 6;
  for (let i = 0; i < maxSets; i++) {
    const trip = pageObj.trips[i];
    const kmA = taKmPatternFor(isFirstPage, idx++);
    const kmB = taKmPatternFor(isFirstPage, idx++);

    if (!trip) {
      html += `
        <tr>
          <td></td><td></td><td></td><td></td><td></td><td></td>
          <td class="km-cell">${kmA}</td>
          <td rowspan="2"></td><td rowspan="2"></td><td rowspan="2"></td>
          <td rowspan="2"></td><td rowspan="2"></td>
        </tr>
        <tr>
          <td></td><td></td><td></td><td></td><td></td><td></td>
          <td class="km-cell">${kmB}</td>
        </tr>`;
      continue;
    }

    const row2Date = trip.nextDay
      ? taFormatDMY(new Date(trip.dateObj.getFullYear(), trip.dateObj.getMonth(), trip.dateObj.getDate() + 1))
      : '-Do-';

    html += `
      <tr>
        <td>${trip.dateStr}</td><td>${trip.train}</td>
        <td>${trip.out.left}</td><td>${trip.out.arrived}</td>
        <td>${trip.out.from}</td><td>${trip.out.to}</td>
        <td class="km-cell">${kmA}</td>
        <td rowspan="2">${trip.days}</td>
        <td rowspan="2" class="object-col">${trip.object}</td>
        <td rowspan="2">${trip.rate}</td>
        <td rowspan="2">${trip.rs}</td>
        <td rowspan="2">${String(trip.p).padStart(2,'0')}</td>
      </tr>
      <tr>
        <td>${row2Date}</td><td>-Do-</td>
        <td>${trip.ret.left}</td><td>${trip.ret.arrived}</td>
        <td>${trip.ret.from}</td><td>${trip.ret.to}</td>
        <td class="km-cell">${kmB}</td>
      </tr>`;
  }
  return html;
}

function taBuildHeaderBlock(h) {
  return `
    <div class="top-right">
      <div>P.F No <span class="field">${h.pfNo}</span></div>
      <div>Bill Unit <span class="field">${h.billUnit}</span></div>
      <div>Mob:- <span class="field">${h.mob}</span></div>
    </div>
    <p class="title">METRO RAILWAY/KOLKATA</p>
    <p class="subtitle">TRAVELLING ALLOWANCE JOURNAL</p>
    <div class="info-container">
      <table class="info-table">
        <tr><td><b>ELECTRICAL</b> Branch <b>METRO RAILWAY</b> Division Headquarters at duty performed by 
          <b>SSE/M/KKSO</b> journal of </td></tr>
        <tr><td>Sri:- <span class="field" style="min-width:120px;">${h.sri}</span> which allowance for:- <span class="field" style="min-width:100px;">${h.allowanceMonth}</span>
          Designation:- <span class="field" style="min-width:100px;">${h.designation}</span></td></tr>
        <tr><td>
          Pay:- <span class="field" style="min-width:90px;">${h.pay}</span>Scale of Pay:- <span class="field" style="min-width:70px;">${h.scaleOfPay}</span>
          Date. of. appointment:- <span class="field" style="min-width:100px;">${h.appointmentDate}</span>
          Rule by which governed <b>SR.T.A.</b></td></tr>
      </table>
    </div>`;
}

function taBuildTableHead() {
  return `
    <thead>
      <tr>
        <th rowspan="2">Month &amp;<br>Date</th>
        <th rowspan="2">No. of<br>Train</th>
        <th rowspan="2">Time left</th>
        <th rowspan="2">Time<br>arrived</th>
        <th colspan="2">Station</th>
        <th rowspan="2">KMs</th>
        <th rowspan="2">Days/<br>Night</th>
        <th rowspan="2">Object of Journey</th>
        <th rowspan="2">Rate</th>
        <th rowspan="2">Rs.</th>
        <th rowspan="2">P.</th>
      </tr>
      <tr><th>From</th><th>To</th></tr>
    </thead>`;
}

function taBuildColgroup() {
  return `
    <colgroup>
      <col style="width:24mm"><col style="width:20mm"><col style="width:16mm">
      <col style="width:16mm"><col style="width:20mm"><col style="width:20mm">
      <col style="width:12mm"><col style="width:16mm"><col style="width:97mm">
      <col style="width:14mm"><col style="width:14mm"><col style="width:12mm">
    </colgroup>`;
}

function taBuildPageDiv(pageNumber, pageObj, header) {
  const isFirstPage = pageObj.type === 'first';
  const rowsHtml = taRenderRowsForPage(pageObj, isFirstPage);
  const headerBlock = isFirstPage ? taBuildHeaderBlock(header) : '';

  let footRow;
  if (pageObj.type === 'final') {
    const words = taAmountToWords(pageObj.runningTotal.rs, pageObj.runningTotal.p);
    footRow = `
      <tfoot><tr>
        <td colspan="9" style="text-align:left;" class="total-words-text"><b>Total Rupees:</b> <span>${words}</span></td>
        <td>Total=</td>
        <td>${pageObj.runningTotal.rs}</td>
        <td>${String(pageObj.runningTotal.p).padStart(2,'0')}</td>
      </tr></tfoot>`;
  } else {
    footRow = `
      <tfoot><tr class="cf-row">
        <td colspan="9"></td>
        <td>C/F</td>
        <td>${pageObj.runningTotal.rs}</td>
        <td>${String(pageObj.runningTotal.p).padStart(2,'0')}</td>
      </tr></tfoot>`;
  }

  const certBlock = pageObj.type === 'final' ? `
    <div class="cert-block" style="text-indent: 5em;">
      I hereby certify that. the above mentioned <b>${header.sri}</b>
      was absent on duty from his Headquarters station during the period
      charged for in the bill on Railway business and that the officer performed the journey by Rail/Air/sea/Road and
      was allowed free pass or locomotion at the expenses of Government Local Fund or Indian State. No T.A /D.A or
      any other remuneration has been drawn from any other source in respect of the journeys performed on duty Pass
      and also for the halts for which T.A/D.A has been claimed in this bill.
    </div>
    <div class="signrow">
      <div><span class="label">Countersigned</span></div>
      <div><span class="label">Controlling Officer</span></div>
      <div><span class="label">Head of Office</span></div>
      <div><span class="label">Signature of staff claiming T.A.</span></div>
    </div>
    <div class="notes"><b>Note: -</b>
      <ol style="margin:4px 0 0 18px; padding:0;">
        <li>On T.A. bills of transfer from one railway to another a certificate whether or not a free pass or Locomotion at Government expense was allowed should be recorded.</li>
        <li>Entries made by the claimant in Hindi/Regional Language should be transliterated in English.</li>
      </ol>
    </div>` : '';

  return `
    <div class="page" id="page${pageNumber}">
      ${headerBlock}
      <table class="ta-table" id="table${pageNumber}">
        ${taBuildColgroup()}
        ${taBuildTableHead()}
        <tbody>${rowsHtml}</tbody>
        ${footRow}
      </table>
      ${certBlock}
    </div>`;
}

function taBuildAllPages(trips, header) {
  const pages = taPaginateTrips(trips);
  let cumulative = { rs: 0, p: 0 };
  let pageNum = 0;

  return pages.map((pageObj, index) => {
    pageNum++;
    const isLastPage = (index === pages.length - 1);

    if (pageObj.type === 'first') {
      cumulative = isLastPage ? taFinalSumAmounts(trips) : taSumAmounts(pageObj.trips);
      pageObj.runningTotal = cumulative;
    } else {
      pageObj.bf = { ...cumulative };
      if (isLastPage) {
        // Final Page par odd count waha 30%/70% tab logic lagayenge
        cumulative = taFinalSumAmounts(trips);
      } else {
        // Middle pages par normal C/F addition chalega
        const newSum = taSumAmounts(pageObj.trips);
        let rs = cumulative.rs + newSum.rs, p = cumulative.p + newSum.p;
        rs += Math.floor(p / 100); p %= 100;
        cumulative = { rs, p };
      }
      pageObj.runningTotal = cumulative;
    }
    return taBuildPageDiv(pageNum, pageObj, header);
  }).join('\n');
}

function taGetPdfStyles() {
  return `
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; background: #fff; }

    .page {
      width: 281mm;
      margin: 0 auto 4mm auto;
      background: #fff;
      padding: 0;
      position: relative;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; margin-bottom:0; }

    .top-right { text-align: right; font-size: 12px; line-height: 1.5; font-weight: bold; }
    .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 20px; margin: 3px 0 1px 0; }
    .subtitle { text-align: center; font-weight: bold; text-decoration: underline; font-size: 17px; margin: 0 0 10px 0; }
    .info-container { padding: 0 100px; margin-bottom: 12px; }
    .info-table { width: 100%; border-collapse: collapse; }
    .info-table td { padding: 2px 0; font-size: 15px; line-height: 1.8; word-spacing: 3px; text-align: justify; }
    .field { display: inline-block; min-width: 95px; border-bottom: 0px solid #000; padding: 0 6px; font-weight: bold; text-align: center; margin: 0 4px; }

    table.ta-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1.2px solid #000;
    }
    table.ta-table th, table.ta-table td { border: 1.2px solid #000; padding: 1.5px 2px; text-align: center; vertical-align: middle; overflow: hidden; font-size: 12px; word-wrap: break-word; }
    table.ta-table th { font-weight: bold; background: #f2f2f2; }
    table.ta-table thead tr { height: 6mm; }
    table.ta-table tbody tr { height: 7.8mm; }

    .object-col { text-align: left !important; text-transform: uppercase; }
    .km-cell { font-weight: bold; }

    tfoot td { font-weight: bold; }
    .bf-row td { font-weight: bold; }
    .cf-row td { padding: 2px 4px; }

    .cert-block { margin-top: 12px; font-size: 12px; line-height: 1.6; text-align: justify; padding: 0 6px; }
    .signrow { display: flex; justify-content: space-between; margin-top: 60px; font-size: 15px; font-weight: bold; }
    .signrow div { text-align: center; width: 22%; border-top: 2px solid #000; padding-top: 5px; }
    .signrow div span.label { display:block; text-decoration: underline; }
    .notes { margin-top: 10px; font-size: 12px; line-height: 0.9; }
    .total-words-text { font-size: 15px; }

    .toolbar-fixed {
      position: fixed; top: 0; left: 0; width: 100%; z-index: 999;
      background: #1a3c6e; padding: 10px; text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .toolbar-fixed button {
      padding: 10px 22px; font-size: 14px; font-weight: 700; color: #fff;
      background: #2563eb; border: none; border-radius: 6px; cursor: pointer; margin: 0 4px;
    }
    .toolbar-fixed button:hover { background: #1d4ed8; }
    .content-wrapper { margin-top: 55px; }

    @media print {
      body { background: #fff; }
      .page { margin: 0 auto; }
      .toolbar-fixed, .content-wrapper { margin-top: 0; }
      .toolbar-fixed { display: none !important; }
    }
  `;
}

function taBuildFullDocument(bodyHtml) {
  const safeName = (typeof displayName !== 'undefined' ? displayName : 'TA').replace(/\s+/g, '_');
  const safeMonth = (typeof monthSelect !== 'undefined' && monthSelect.value ? monthSelect.value : 'TA').replace(/\s+/g, '_');
  const pdfTitle = `${safeName}_${safeMonth}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${pdfTitle}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  ${taGetPdfStyles()}
</style></head>
<body>
<div class="toolbar-fixed">
  <button onclick="window.print()">🖨️ Print / Save as PDF</button>
  <button onclick="window.close()">✖️ Close</button>
</div>
<div class="content-wrapper">
${bodyHtml}
</div>
<script>
  window.addEventListener('load', function() {
    setTimeout(function() {
      window.print();
    }, 500);
  });
<\/script>
</body></html>`;
}

// ===================== MAIN ENTRY POINT =====================
function generateAndOpenTAPdf() {
  try {
    if (typeof currentFilteredData === 'undefined' || !currentFilteredData || currentFilteredData.length === 0) {
      if (typeof showAppAlert === 'function') {
        showAppAlert('No data available. Please load data on the View page first.', 'error');
      } else {
        alert('No data available. Please load data on the View page first.');
      }
      return;
    }

    const sorted = [...currentFilteredData].sort((a, b) => {
      const da = taParseDMY(a.Date), db = taParseDMY(b.Date);
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });

    const trips = sorted.map((row, i) => taBuildTrip(row, i)).filter(t => t !== null);

    if (trips.length === 0) {
      if (typeof showAppAlert === 'function') {
        showAppAlert('Could not process any rows. Check Date/Time formats in your sheet.', 'error');
      } else {
        alert('Could not process any rows. Check Date/Time formats in your sheet.');
      }
      return;
    }

    const emp = typeof employeeData !== 'undefined' ? employeeData : {};
    const header = {
      pfNo: emp.PF_No || '', billUnit: emp.Bill_Unit || '',
      mob: emp.Mob_No || '', sri: typeof displayName !== 'undefined' ? displayName : '',
      allowanceMonth: typeof monthSelect !== 'undefined' ? monthSelect.value : '', designation: emp.Designation || '',
      pay: emp.Basic_Pay || '', scaleOfPay: emp.Scale || '',
      appointmentDate: emp.Date_Of_Appointment || ''
    };

    const bodyHtml = taBuildAllPages(trips, header);
    const fullDoc = taBuildFullDocument(bodyHtml);

    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) {
      if (typeof showAppAlert === 'function') {
        showAppAlert('Popup blocked — please allow popups for this site, then tap the button again.', 'error');
      } else {
        alert('Popup blocked — please allow popups for this site, then tap the button again.');
      }
      return;
    }
    pdfWindow.document.open();
    pdfWindow.document.write(fullDoc);
    pdfWindow.document.close();

  } catch (err) {
    console.error('generateAndOpenTAPdf failed:', err);
    if (typeof showAppAlert === 'function') {
      showAppAlert('PDF generation failed: ' + (err.message || err), 'error');
    } else {
      alert('PDF generation failed: ' + (err.message || err));
    }
  }
}

function downloadTAPdfDirect() {
  generateAndOpenTAPdf();
}
