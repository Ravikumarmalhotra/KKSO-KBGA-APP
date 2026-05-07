/* ===================== APP VERSION ===================== */
/* Ravi you can change the version number here */
const APP_VERSION="4.5.1";

/* ===================== CONFIGURATION ===================== */
/* Ravi you can change all settings here */
let CONFIG={
  SHEET_ID:"136Fq_Pchc_kPJwEoBUgfRKzDqnYUs730w3vMhnSO9HI",
  API_KEY:"AIzaSyAjBceUqA-G1ueMCsqevOiPEhb2Nk-pOhI",
  SHEET_NAME:"master",
  APPS_SCRIPT_URL:"https://script.google.com/macros/s/AKfycbzluFhsV2Ib6I-BK5OdFacx7hjK8nTZSRLlisBedPCr1-nGD5L6MDp85iJhv075odfa/exec",
  INBOX_SHEET_NAME:"inbox",
  APPS_SHEET_NAME:"apps",
  /* Ravi: Put your GitHub raw base URL here — the folder where you upload HTML files */
  GITHUB_BASE_URL:"https://ravikumarmalhotra.github.io/KKSO-KBGA-APP/",
  VIEW_CONFIG_START_ROW:1,
  VIEW_CONFIG_END_ROW:50,
  ENTRY_CONFIG_START_ROW:82,
  ENTRY_CONFIG_END_ROW:150,
  USER_START_ROW:51,
  USER_END_ROW:81,
  CONFIG_END_COL:"AG",
  DATA_FETCH_END_COL:"AB",
  PERSONAL_DATA_LABELS:['Full Name','Designation','Department','Phone','Email','Address','Joining Date'],
  CREDENTIAL_CHECK_INTERVAL:3600000
};

/* ===================== STATE ===================== */
let currentUser="",currentPassword="",currentLevel="",currentUserRow=-1,currentUserPersonal=[];
let viewConfig=[],entryConfig=[],appInitialized=false,credentialCheckInterval=null;
let moreAppsLoaded=false;
let lastCredentialCheck=0;
let moreNavPath=[];
let moreClickActions=[];
let moreTree={};

/* ===================== HELPERS ===================== */
async function fetchSheet(sheetName,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(sheetName)}!${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;
  const res=await fetch(url);
  if(!res.ok)throw new Error(`API Error ${res.status}`);
  const data=await res.json();
  return data.values||[];
}
async function fetchSheetFormulas(sheetName,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(sheetName)}!${encodeURIComponent(range)}?key=${CONFIG.API_KEY}&valueRenderOption=FORMULA`;
  const res=await fetch(url);
  if(!res.ok)throw new Error(`API Error ${res.status}`);
  const data=await res.json();
  return data.values||[];
}
function isUrl(s){return typeof s==="string"&&/^https?:\/\//i.test(s)}
function driveDirect(u){if(typeof u!=="string")return u;let m=u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);if(m)return`https://drive.google.com/uc?export=view&id=${m[1]}`;m=u.match(/drive\.google\.com\/open\?id=([^&]+)/i);if(m)return`https://drive.google.com/uc?export=view&id=${m[1]}`;return u}
function extractImage(v){if(typeof v!=="string")return null;const m=v.match(/=*\s*IMAGE\s*\(\s*"([^"]+)"/i);if(m)return driveDirect(m[1]);if(isUrl(v)&&/\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(v))return driveDirect(v);return null}
function driveFileId(u){if(typeof u!=="string")return null;let m=u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);if(m)return m[1];m=u.match(/[?&]id=([^&]+)/i);if(m)return m[1];return null}
function getLevelCols(level){if(level==="admin")return{sheetCol:27,subCol:28};if(level==="supervisor")return{sheetCol:29,subCol:30};return{sheetCol:31,subCol:32}}

function buildPersonalHTML(targetId){
  const div=document.getElementById(targetId);
  if(!div)return;
  if(currentUserPersonal.some(v=>v)){
    let html='<div class="personal-card"><h3>👤 Personal Information</h3><div class="personal-grid">';
    html+=`<div class="personal-item"><div class="p-label">User ID</div><div class="p-value">${currentUser}</div></div>`;
    html+=`<div class="personal-item"><div class="p-label">Level</div><div class="p-value">${currentLevel}</div></div>`;
    CONFIG.PERSONAL_DATA_LABELS.forEach((label,i)=>{
      const val=currentUserPersonal[i];
      if(val)html+=`<div class="personal-item"><div class="p-label">${label}</div><div class="p-value">${val}</div></div>`;
    });
    html+='</div></div>';div.innerHTML=html;
  }else{div.innerHTML=''}
}

/* ===================== CLOCK ===================== */
/* Ravi you can change the clock format here - year:'2-digit' shows 25 instead of 2025 */
function updateClock(){const el=document.querySelector('.clock-widget');if(!el)return;const now=new Date();el.querySelector('.day').textContent=now.toLocaleDateString(undefined,{weekday:'short'});el.querySelector('.date').textContent=now.toLocaleDateString(undefined,{year:'2-digit',month:'short',day:'numeric'});el.querySelector('.time').textContent=now.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
updateClock();setInterval(updateClock,1000);

/* ===================== LOGIN ===================== */
async function handleLogin(){
  const uid=document.getElementById('loginUser').value.trim();
  const pwd=document.getElementById('loginPass').value.trim();
  const errEl=document.getElementById('loginError');
  errEl.style.display='none';
  if(!uid||!pwd){errEl.textContent='Please enter User ID and Password';errEl.style.display='block';return}
  try{
    const range=`A${CONFIG.USER_START_ROW}:J${CONFIG.USER_END_ROW}`;
    const users=await fetchSheet(CONFIG.SHEET_NAME,range);
    let found=false;
    for(let i=0;i<users.length;i++){
      const row=users[i]||[];
      if(String(row[0]||'').trim()===uid&&String(row[1]||'').trim()===pwd){
        currentUser=uid;currentPassword=pwd;
        currentLevel=String(row[2]||'staff').trim().toLowerCase();
        currentUserRow=CONFIG.USER_START_ROW+i;
        currentUserPersonal=row.slice(3,10);
        found=true;break;
      }
    }
    if(!found){errEl.textContent='You are not registered';errEl.style.display='block';return}
    localStorage.setItem('kkso_user',currentUser);
    localStorage.setItem('kkso_password',currentPassword);
    localStorage.setItem('kkso_level',currentLevel);
    localStorage.setItem('kkso_row',String(currentUserRow));
    showApp();
  }catch(e){errEl.textContent='Connection error: '+e.message;errEl.style.display='block'}
}

function showApp(){
  document.getElementById('loginPage').style.display='none';
  document.getElementById('appPage').style.display='block';
  document.getElementById('userAvatar').textContent=currentUser.charAt(0).toUpperCase();
  document.getElementById('userName').textContent=currentUser;
  const levelIcons={admin:'👑',supervisor:'🛡️',staff:'👤'};
  const levelNames={admin:'Admin',supervisor:'Supervisor',staff:'Staff'};
  document.getElementById('userLevel').textContent=(levelIcons[currentLevel]||'')+' '+(levelNames[currentLevel]||currentLevel);
  document.getElementById('titleLevel').textContent='A Cloud Based Data System For '+(levelNames[currentLevel]||'Staff')+' Level';
  document.getElementById('versionText').textContent='© Created by SSE/M/KKSO | v'+APP_VERSION;
  document.body.className='theme-'+(currentLevel||'staff');
  if(!appInitialized)initApp();
  startCredentialCheck();
}

function handleLogout(){
  if(credentialCheckInterval)clearInterval(credentialCheckInterval);
  document.removeEventListener('visibilitychange',onVisibilityCredCheck);
  lastCredentialCheck=0;
  localStorage.removeItem('kkso_user');localStorage.removeItem('kkso_password');
  localStorage.removeItem('kkso_level');localStorage.removeItem('kkso_row');
  currentUser='';currentPassword='';currentLevel='';currentUserRow=-1;currentUserPersonal=[];
  appInitialized=false;moreAppsLoaded=false;moreNavPath=[];moreClickActions=[];moreTree={};
  document.getElementById('appPage').style.display='none';
  document.getElementById('loginPage').style.display='flex';
  document.getElementById('loginUser').value='';document.getElementById('loginPass').value='';
  document.getElementById('loginError').style.display='none';
  document.body.className='';
  document.getElementById('viewSubject').innerHTML='<option value="">-- Select Subject --</option>';
  document.getElementById('entrySubject').innerHTML='<option value="">-- Select Subject --</option>';
  document.getElementById('mySubjectFilter').innerHTML='<option value="">-- All Entries --</option>';
  document.getElementById('moreAppsContainer').innerHTML='<div class="more-loading">⏳ Loading apps...</div>';
  document.getElementById('moreBreadcrumb').innerHTML='';
  closeEmbeddedApp();
}

/* ===================== SESSION RESTORE ===================== */
(function(){
  const u=localStorage.getItem('kkso_user'),p=localStorage.getItem('kkso_password');
  const l=localStorage.getItem('kkso_level'),r=localStorage.getItem('kkso_row');
  if(u&&p){currentUser=u;currentPassword=p;currentLevel=l||'staff';currentUserRow=parseInt(r)||-1;showApp()}
})();

/* ===================== CREDENTIAL CHECK ===================== */
/* Ravi: This checks every hour AND when tab becomes visible again (phone wake/tab switch) */

async function doCredentialCheck(){
  if(!currentUser||!currentPassword)return;
  const now=Date.now();
  /* Don't check more than once per 5 minutes to avoid API spam */
  if(now-lastCredentialCheck<300000)return;
  try{
    const range=`A${CONFIG.USER_START_ROW}:B${CONFIG.USER_END_ROW}`;
    const users=await fetchSheet(CONFIG.SHEET_NAME,range);
    let valid=false;
    for(const row of users){
      if(row&&String(row[0]||'').trim()===currentUser&&String(row[1]||'').trim()===currentPassword){valid=true;break}
    }
    lastCredentialCheck=Date.now();
    if(!valid){alert('Your credentials have been changed or removed. You will be logged out.');handleLogout()}
  }catch(e){/* network error — skip, will retry next time */}
}

function startCredentialCheck(){
  if(credentialCheckInterval)clearInterval(credentialCheckInterval);
  lastCredentialCheck=Date.now(); /* mark login time as last check */

  /* Regular interval check every hour */
  credentialCheckInterval=setInterval(()=>{doCredentialCheck()},CONFIG.CREDENTIAL_CHECK_INTERVAL);

  /* ALSO check when tab becomes visible again (handles mobile sleep/tab switch) */
  document.removeEventListener('visibilitychange',onVisibilityCredCheck);
  document.addEventListener('visibilitychange',onVisibilityCredCheck);
}

function onVisibilityCredCheck(){
  if(document.visibilityState==='visible'&&currentUser){
    /* If more than 1 hour passed since last check, check now */
    if(Date.now()-lastCredentialCheck>=CONFIG.CREDENTIAL_CHECK_INTERVAL){
      doCredentialCheck();
    }
  }
}

/* ===================== PASSWORD CHANGE ===================== */
function openPasswordModal(){document.getElementById('pwdModal').style.display='flex';document.getElementById('pwdCurrent').value='';document.getElementById('pwdNew').value='';document.getElementById('pwdConfirm').value='';document.getElementById('pwdMessage').textContent=''}
function closePasswordModal(){document.getElementById('pwdModal').style.display='none'}
async function handlePasswordChange(){
  const cur=document.getElementById('pwdCurrent').value,nw=document.getElementById('pwdNew').value,cf=document.getElementById('pwdConfirm').value;
  const msg=document.getElementById('pwdMessage');
  if(!cur||!nw||!cf){msg.textContent='❌ Fill all fields';msg.style.color='#dc2626';return}
  if(cur!==currentPassword){msg.textContent='❌ Current password wrong';msg.style.color='#dc2626';return}
  if(nw!==cf){msg.textContent='❌ Passwords do not match';msg.style.color='#dc2626';return}
  if(nw.length<4){msg.textContent='❌ Min 4 characters';msg.style.color='#dc2626';return}
  if(nw===cur){msg.textContent='❌ Same as current';msg.style.color='#dc2626';return}
  try{
    msg.textContent='Changing...';msg.style.color='#2563eb';
    await fetch(CONFIG.APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({spreadsheetId:CONFIG.SHEET_ID,sheetName:CONFIG.SHEET_NAME,action:'changePassword',row:currentUserRow,newPassword:nw})});
    currentPassword=nw;localStorage.setItem('kkso_password',nw);
    msg.textContent='✅ Password changed! Logging out...';msg.style.color='#16a34a';
    setTimeout(()=>{closePasswordModal();handleLogout()},2000);
  }catch(e){msg.textContent='❌ Error: '+e.message;msg.style.color='#dc2626'}
}

/* ===================== MODE SWITCHING ===================== */
function switchMode(mode){
  document.getElementById('viewSection').style.display=mode==='view'?'block':'none';
  document.getElementById('entrySection').style.display=mode==='entry'?'block':'none';
  document.getElementById('mydataSection').style.display=mode==='mydata'?'block':'none';
  document.getElementById('moreSection').style.display=mode==='more'?'block':'none';
  document.getElementById('viewBtn').classList.toggle('active',mode==='view');
  document.getElementById('entryBtn').classList.toggle('active',mode==='entry');
  document.getElementById('mydataBtn').classList.toggle('active',mode==='mydata');
  document.getElementById('moreBtn').classList.toggle('active',mode==='more');
  if(mode==='mydata')loadMyData();
  if(mode==='more')loadMoreApps();
}
function switchMyData(sub){
  document.getElementById('myEntriesSection').style.display=sub==='entries'?'block':'none';
  document.getElementById('myInboxSection').style.display=sub==='inbox'?'block':'none';
  document.getElementById('myEntriesBtn').classList.toggle('active',sub==='entries');
  document.getElementById('myInboxBtn').classList.toggle('active',sub==='inbox');
  if(sub==='inbox')loadInbox();
}

/* ===================== INIT APP ===================== */
async function initApp(){
  if(appInitialized)return;appInitialized=true;
  try{
    const vcRange=`A${CONFIG.VIEW_CONFIG_START_ROW}:${CONFIG.CONFIG_END_COL}${CONFIG.VIEW_CONFIG_END_ROW}`;
    const ecRange=`A${CONFIG.ENTRY_CONFIG_START_ROW}:${CONFIG.CONFIG_END_COL}${CONFIG.ENTRY_CONFIG_END_ROW}`;
    const[vc,ec]=await Promise.all([fetchSheet(CONFIG.SHEET_NAME,vcRange),fetchSheet(CONFIG.SHEET_NAME,ecRange)]);
    viewConfig=vc||[];entryConfig=ec||[];
    const lc=getLevelCols(currentLevel);
    const vSel=document.getElementById('viewSubject');
    vSel.innerHTML='<option value="">-- Select Subject --</option>';
    const vSubjects=[...new Set(viewConfig.filter(r=>r&&r[0]&&String(r[lc.sheetCol]||'').trim()).map(r=>String(r[0]).trim()))];
    vSubjects.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;vSel.appendChild(o)});
    const eSel=document.getElementById('entrySubject');
    eSel.innerHTML='<option value="">-- Select Subject --</option>';
    const eSubjects=[...new Set(entryConfig.filter(r=>r&&r[0]&&String(r[lc.sheetCol]||'').trim()).map(r=>String(r[0]).trim()))];
    eSubjects.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;eSel.appendChild(o)});
    if(currentUserPersonal.length===0&&currentUserRow>0){
      try{const pd=await fetchSheet(CONFIG.SHEET_NAME,`D${currentUserRow}:J${currentUserRow}`);currentUserPersonal=(pd[0]||[])}catch(e){}}
  }catch(e){console.error('Init error:',e)}
}

/* ===================== MORE / FOLDER-BASED APP HUB ===================== */

/* Card gradient palettes for visual variety */
const APP_CARD_GRADIENTS=[
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#ffecd2,#fcb69f)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
];

/* Folder color palettes for top-bar stripe */
const FOLDER_STRIPE_COLORS=[
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#06b6d4,#3b82f6)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#f97316,#dc2626)',
  'linear-gradient(135deg,#14b8a6,#0ea5e9)',
  'linear-gradient(135deg,#8b5cf6,#6366f1)',
];

/*
  "apps" sheet structure (A:H) — NO columns I/J needed:
  A = Subject (folder name) — if blank, app shows directly in More root
  B = Sub-Subject (sub-folder name) — if blank with A filled, app goes directly in subject folder
  C = App display name
  D = HTML file name (uploaded to GitHub)
  E = Icon emoji OR image (supports IMAGE() formula, URLs, and plain emoji)
  F = Admin can access? (true/false)
  G = Supervisor can access? (true/false)
  H = Staff can access? (true/false)

  Condition 1: A filled + B filled → Subject folder > Sub-Subject folder > App
  Condition 2: A filled + B blank  → Subject folder > App (no sub-subject)
  Condition 3: A blank             → App shown directly in More root (no folder)
*/

/* More tab state — moreNavPath, moreClickActions, moreTree declared in STATE section above */

function handleMoreClick(idx){
  if(moreClickActions[idx])moreClickActions[idx]();
}

/* Render icon: handle emoji text, IMAGE() formula, or URL in column E */
function renderMoreIcon(iconVal,iconFormula){
  /* Check formula for IMAGE() */
  if(iconFormula){
    var m=iconFormula.match(/=*\s*IMAGE\s*\(\s*"([^"]+)"/i);
    if(m){
      var imgUrl=driveDirect(m[1]);
      return '<img src="'+imgUrl+'" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML=\'📦\'">';
    }
  }
  /* Check if value is a URL (image link or drive link) */
  if(iconVal&&isUrl(iconVal)){
    var imgUrl2=driveDirect(iconVal);
    return '<img src="'+imgUrl2+'" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML=\'📦\'">';
  }
  /* Check if value looks like a Google Sheets thumbnail URL (lh3/lh4/lh5 etc) */
  if(iconVal&&/^https?:\/\/lh[0-9]+\.googleusercontent\.com/i.test(iconVal)){
    return '<img src="'+iconVal+'" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML=\'📦\'">';
  }
  /* Otherwise return as text (emoji) */
  return iconVal||'📦';
}

async function loadMoreApps(){
  if(moreAppsLoaded)return;
  const container=document.getElementById('moreAppsContainer');
  container.innerHTML='<div class="more-loading">⏳ Loading apps list…</div>';

  try{
    /* Fetch both values and formulas to handle IMAGE() in icon column E */
    const[rows,formulaRows]=await Promise.all([
      fetchSheet(CONFIG.APPS_SHEET_NAME,'A:H'),
      fetchSheetFormulas(CONFIG.APPS_SHEET_NAME,'A:H')
    ]);

    /* Build tree structure automatically from A and B columns */
    moreTree={subjectOrder:[],subjects:{},rootApps:[]};

    for(let i=1;i<rows.length;i++){
      const row=rows[i]||[];
      const fRow=formulaRows[i]||[];
      const subject=String(row[0]||'').trim();
      const subSubject=String(row[1]||'').trim();
      const appName=String(row[2]||'').trim();
      const fileName=String(row[3]||'').trim();
      const iconVal=String(row[4]||'').trim();
      const iconFormula=String(fRow[4]||'').trim();
      const adminAccess=String(row[5]||'false').trim().toLowerCase()==='true';
      const supervisorAccess=String(row[6]||'false').trim().toLowerCase()==='true';
      const staffAccess=String(row[7]||'false').trim().toLowerCase()==='true';

      if(!appName&&!subject)continue; /* skip completely empty rows */

      const access=currentLevel==='admin'?adminAccess:currentLevel==='supervisor'?supervisorAccess:staffAccess;
      const app={name:appName,file:fileName,iconVal:iconVal,iconFormula:iconFormula,access:access};

      /* Condition 3: A is blank → root level app (no folder) */
      if(!subject){
        if(appName)moreTree.rootApps.push(app);
        continue;
      }

      /* Ensure subject folder exists */
      if(!moreTree.subjects[subject]){
        moreTree.subjectOrder.push(subject);
        moreTree.subjects[subject]={subSubjectOrder:[],subSubjects:{},directApps:[]};
      }
      const subj=moreTree.subjects[subject];

      /* Condition 2: A filled + B blank → app directly in subject folder */
      if(!subSubject){
        if(appName)subj.directApps.push(app);
        continue;
      }

      /* Condition 1: A filled + B filled → app in sub-subject folder */
      if(!subj.subSubjects[subSubject]){
        subj.subSubjectOrder.push(subSubject);
        subj.subSubjects[subSubject]={apps:[]};
      }
      if(appName)subj.subSubjects[subSubject].apps.push(app);
    }

    moreNavPath=[];
    renderMoreView();
    moreAppsLoaded=true;
  }catch(e){
    console.warn('Could not load apps sheet:',e);
    container.innerHTML='<div class="more-empty"><p>⚠️ Error loading apps.<br>'+e.message+'</p></div>';
  }
}

/* ===== Rendering ===== */

function renderMoreView(){
  renderMoreBreadcrumb();
  const container=document.getElementById('moreAppsContainer');
  const desc=document.getElementById('moreHeaderDesc');

  if(moreNavPath.length===0){
    desc.textContent='Select a category below to explore';
    renderRootView(container);
  }else if(moreNavPath.length===1){
    desc.textContent=moreNavPath[0]+' — Browse apps & sub-folders';
    renderSubjectView(container,moreNavPath[0]);
  }else if(moreNavPath.length===2){
    desc.textContent=moreNavPath[1]+' — Select an app to launch';
    renderSubSubjectView(container,moreNavPath[0],moreNavPath[1]);
  }
}

function renderMoreBreadcrumb(){
  const bc=document.getElementById('moreBreadcrumb');
  if(!bc)return;
  if(moreNavPath.length===0){bc.innerHTML='';return}

  moreClickActions=[];  /* reset */
  let html='<div class="more-breadcrumb">';

  /* Root "More" link */
  const rootIdx=moreClickActions.length;
  moreClickActions.push(()=>navigateMoreTo([]));
  html+='<span class="more-breadcrumb-item" onclick="handleMoreClick('+rootIdx+')">📦 More</span>';

  if(moreNavPath.length>=1){
    html+='<span class="more-breadcrumb-separator">›</span>';
    if(moreNavPath.length===1){
      html+='<span class="more-breadcrumb-current">📁 '+moreNavPath[0]+'</span>';
    }else{
      const sIdx=moreClickActions.length;
      moreClickActions.push(()=>navigateMoreTo([moreNavPath[0]]));
      html+='<span class="more-breadcrumb-item" onclick="handleMoreClick('+sIdx+')">📁 '+moreNavPath[0]+'</span>';
    }
  }

  if(moreNavPath.length>=2){
    html+='<span class="more-breadcrumb-separator">›</span>';
    html+='<span class="more-breadcrumb-current">📂 '+moreNavPath[1]+'</span>';
  }

  html+='</div>';
  bc.innerHTML=html;
}

function navigateMoreTo(path){
  moreNavPath=path;
  renderMoreView();
}

/* --- Root: show subject folders + root apps (Condition 3) --- */
function renderRootView(container){
  const subjects=moreTree.subjectOrder;
  const rootApps=moreTree.rootApps;

  if(subjects.length===0&&rootApps.length===0){
    container.innerHTML='<div class="more-empty"><p>⚠️ No apps configured yet.<br>Add apps to the "apps" sheet in your spreadsheet.</p></div>';
    return;
  }

  moreClickActions=[];
  let html='';
  let anyAccessible=false;

  /* Subject folders */
  if(subjects.length>0){
    if(rootApps.length>0)html+='<div class="more-section-divider">📁 Categories</div>';
    html+='<div class="more-apps-grid">';

    subjects.forEach((sName,idx)=>{
      const subj=moreTree.subjects[sName];
      const totalItems=subj.subSubjectOrder.length+subj.directApps.length;
      const stripe=FOLDER_STRIPE_COLORS[idx%FOLDER_STRIPE_COLORS.length];
      /* Check if any app inside is accessible */
      let folderAccess=subj.directApps.some(a=>a.access);
      if(!folderAccess){
        for(const ssN of subj.subSubjectOrder){
          if(subj.subSubjects[ssN].apps.some(a=>a.access)){folderAccess=true;break}
        }
      }

      if(folderAccess){
        anyAccessible=true;
        const ci=moreClickActions.length;
        moreClickActions.push(()=>navigateMoreTo([sName]));
        html+='<div class="more-folder-card" onclick="handleMoreClick('+ci+')">';
        html+='<div class="more-app-badge" style="background:'+stripe+'">OPEN</div>';
        html+='<span class="more-folder-icon">📁</span>';
        html+='<div class="more-folder-name">'+sName+'</div>';
        html+='<div class="more-folder-count">'+totalItems+' item'+(totalItems!==1?'s':'')+'</div>';
        html+='</div>';
      }else{
        html+='<div class="more-folder-card locked">';
        html+='<div class="more-app-badge" style="background:#94a3b8">🔒 LOCKED</div>';
        html+='<span class="more-folder-icon" style="filter:grayscale(1)">📁</span>';
        html+='<div class="more-folder-name" style="color:#94a3b8">'+sName+'</div>';
        html+='<div class="more-folder-count" style="background:#f1f5f9;color:#94a3b8">No access</div>';
        html+='</div>';
      }
    });

    html+='</div>';
  }

  /* Root apps (Condition 3: A blank) */
  if(rootApps.length>0){
    if(subjects.length>0)html+='<div class="more-section-divider">📱 Apps</div>';
    html+='<div class="more-apps-grid">';

    rootApps.forEach((app,idx)=>{
      const gradBg=APP_CARD_GRADIENTS[idx%APP_CARD_GRADIENTS.length];
      const iconHtml=renderMoreIcon(app.iconVal,app.iconFormula,36);
      if(app.access&&app.file){
        anyAccessible=true;
        const ci=moreClickActions.length;
        moreClickActions.push(()=>openEmbeddedApp(app.name,app.file));
        html+='<div class="more-app-card" onclick="handleMoreClick('+ci+')">';
        html+='<div class="more-app-badge" style="background:'+gradBg+'">LAUNCH</div>';
        html+='<span class="more-app-icon">'+iconHtml+'</span>';
        html+='<div class="more-app-name">'+app.name+'</div>';
        html+='<div class="more-app-desc">Tap to open</div>';
        html+='</div>';
      }else{
        html+='<div class="more-app-card future">';
        html+='<div class="more-app-badge" style="background:#94a3b8">LOCKED</div>';
        html+='<span class="more-app-icon" style="filter:grayscale(1)">'+iconHtml+'</span>';
        html+='<div class="more-app-name" style="color:#94a3b8">'+app.name+'</div>';
        html+='<div class="more-app-desc" style="color:#cbd5e1">No access</div>';
        html+='</div>';
      }
    });

    html+='</div>';
  }

  if(!anyAccessible){
    html+='<div class="more-access-denied">🔒 No apps are available for your access level ('+currentLevel+'). Please contact Admin.</div>';
  }

  container.innerHTML=html;
}

/* --- Subject view: show sub-subject folders + direct apps --- */
function renderSubjectView(container,subjectName){
  const subj=moreTree.subjects[subjectName];
  if(!subj){container.innerHTML='<div class="more-empty"><p>❌ Subject not found</p></div>';return}

  moreClickActions=[];
  let html='';

  /* Back button */
  const backIdx=moreClickActions.length;
  moreClickActions.push(()=>navigateMoreTo([]));
  html+='<div class="more-back-row"><button class="more-back-btn" onclick="handleMoreClick('+backIdx+')">← Back to All Categories</button></div>';

  const hasSubSubs=subj.subSubjectOrder.length>0;
  const hasDirectApps=subj.directApps.length>0;

  /* Sub-subject folders */
  if(hasSubSubs){
    if(hasDirectApps)html+='<div class="more-section-divider">📂 Sub-Folders</div>';
    html+='<div class="more-apps-grid">';

    subj.subSubjectOrder.forEach((ssName,idx)=>{
      const ss=subj.subSubjects[ssName];
      if(!ss)return;
      const appCount=ss.apps.length;
      const stripe=FOLDER_STRIPE_COLORS[(idx+2)%FOLDER_STRIPE_COLORS.length];
      const anyAccess=ss.apps.some(a=>a.access);

      if(anyAccess){
        const ci=moreClickActions.length;
        moreClickActions.push(()=>navigateMoreTo([subjectName,ssName]));
        html+='<div class="more-folder-card" onclick="handleMoreClick('+ci+')">';
        html+='<div class="more-app-badge" style="background:'+stripe+'">OPEN</div>';
        html+='<span class="more-folder-icon">📂</span>';
        html+='<div class="more-folder-name">'+ssName+'</div>';
        html+='<div class="more-folder-count">'+appCount+' app'+(appCount!==1?'s':'')+'</div>';
        html+='</div>';
      }else{
        html+='<div class="more-folder-card locked">';
        html+='<div class="more-app-badge" style="background:#94a3b8">🔒 LOCKED</div>';
        html+='<span class="more-folder-icon" style="filter:grayscale(1)">📂</span>';
        html+='<div class="more-folder-name" style="color:#94a3b8">'+ssName+'</div>';
        html+='<div class="more-folder-count" style="background:#f1f5f9;color:#94a3b8">No access</div>';
        html+='</div>';
      }
    });

    html+='</div>';
  }

  /* Direct apps under this subject (Condition 2) */
  if(hasDirectApps){
    if(hasSubSubs)html+='<div class="more-section-divider">📱 Apps</div>';
    html+='<div class="more-apps-grid">';

    subj.directApps.forEach((app,idx)=>{
      const gradBg=APP_CARD_GRADIENTS[(idx+4)%APP_CARD_GRADIENTS.length];
      const iconHtml=renderMoreIcon(app.iconVal,app.iconFormula,36);
      if(app.access&&app.file){
        const ci=moreClickActions.length;
        moreClickActions.push(()=>openEmbeddedApp(app.name,app.file));
        html+='<div class="more-app-card" onclick="handleMoreClick('+ci+')">';
        html+='<div class="more-app-badge" style="background:'+gradBg+'">LAUNCH</div>';
        html+='<span class="more-app-icon">'+iconHtml+'</span>';
        html+='<div class="more-app-name">'+app.name+'</div>';
        html+='<div class="more-app-desc">Tap to open</div>';
        html+='</div>';
      }else{
        html+='<div class="more-app-card future">';
        html+='<div class="more-app-badge" style="background:#94a3b8">LOCKED</div>';
        html+='<span class="more-app-icon" style="filter:grayscale(1)">'+iconHtml+'</span>';
        html+='<div class="more-app-name" style="color:#94a3b8">'+app.name+'</div>';
        html+='<div class="more-app-desc" style="color:#cbd5e1">No access</div>';
        html+='</div>';
      }
    });

    html+='</div>';
  }

  if(!hasSubSubs&&!hasDirectApps){
    html+='<div class="more-empty"><p>📭 This folder is empty.<br>No sub-folders or apps found.</p></div>';
  }

  container.innerHTML=html;
}

/* --- Sub-Subject view: show apps (Condition 1) --- */
function renderSubSubjectView(container,subjectName,subSubjectName){
  const subj=moreTree.subjects[subjectName];
  const ss=subj?subj.subSubjects[subSubjectName]:null;

  if(!ss){container.innerHTML='<div class="more-empty"><p>❌ Sub-folder not found</p></div>';return}

  moreClickActions=[];
  let html='';

  /* Back button */
  const backIdx=moreClickActions.length;
  moreClickActions.push(()=>navigateMoreTo([subjectName]));
  html+='<div class="more-back-row"><button class="more-back-btn" onclick="handleMoreClick('+backIdx+')">← Back to '+subjectName+'</button></div>';

  if(ss.apps.length===0){
    html+='<div class="more-empty"><p>📭 No apps in this folder yet.</p></div>';
    container.innerHTML=html;
    return;
  }

  html+='<div class="more-section-divider">📱 Apps</div>';
  html+='<div class="more-apps-grid">';

  ss.apps.forEach((app,idx)=>{
    const gradBg=APP_CARD_GRADIENTS[idx%APP_CARD_GRADIENTS.length];
    const iconHtml=renderMoreIcon(app.iconVal,app.iconFormula,36);
    if(app.access&&app.file){
      const ci=moreClickActions.length;
      moreClickActions.push(()=>openEmbeddedApp(app.name,app.file));
      html+='<div class="more-app-card" onclick="handleMoreClick('+ci+')">';
      html+='<div class="more-app-badge" style="background:'+gradBg+'">LAUNCH</div>';
      html+='<span class="more-app-icon">'+iconHtml+'</span>';
      html+='<div class="more-app-name">'+app.name+'</div>';
      html+='<div class="more-app-desc">Tap to open</div>';
      html+='</div>';
    }else{
      html+='<div class="more-app-card future">';
      html+='<div class="more-app-badge" style="background:#94a3b8">LOCKED</div>';
      html+='<span class="more-app-icon" style="filter:grayscale(1)">'+iconHtml+'</span>';
      html+='<div class="more-app-name" style="color:#94a3b8">'+app.name+'</div>';
      html+='<div class="more-app-desc" style="color:#cbd5e1">No access</div>';
      html+='</div>';
    }
  });

  html+='</div>';
  container.innerHTML=html;
}

/* ===================== EMBEDDED APP VIEWER ===================== */

function openEmbeddedApp(appName,fileName){
  /* Build URL: if fileName starts with http use as-is, else prepend GitHub base */
  let url=fileName;
  if(!/^https?:\/\//i.test(fileName)){
    /* Use raw GitHub Pages URL */
    url=CONFIG.GITHUB_BASE_URL.replace(/\/$/,'')+'/'+fileName;
  }

  const wrapper=document.getElementById('appEmbedWrapper');
  const iframe=document.getElementById('appEmbedIframe');
  const titleEl=document.getElementById('appEmbedTitle');
  const loadingEl=document.getElementById('appEmbedLoading');

  titleEl.textContent=appName;
  loadingEl.style.display='flex';
  iframe.src='';/* reset */
  wrapper.classList.add('visible');
  document.body.style.overflow='hidden';

  /* Small delay to show loader before setting iframe src */
  setTimeout(()=>{iframe.src=url;},80);
}

function onIframeLoad(){
  const loadingEl=document.getElementById('appEmbedLoading');
  if(loadingEl)loadingEl.style.display='none';
}

function closeEmbeddedApp(){
  const wrapper=document.getElementById('appEmbedWrapper');
  const iframe=document.getElementById('appEmbedIframe');
  wrapper.classList.remove('visible');
  document.body.style.overflow='';
  setTimeout(()=>{iframe.src='';},300);
}

/* ESC key closes embedded app */
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){closeEmbeddedApp()}
});

/* ===================== VIEW MODE ===================== */
let viewState={config:[],dataValues:[],dataFormulas:[],filteredIdxs:[],inputTitles:[],outputTitles:[],inputValues:{},subject:'',subSubject:'',subEnabled:false,baseInputCol:2};

document.getElementById('viewSubject').addEventListener('change',function(){
  const subject=this.value.trim();viewState.subject=subject;viewState.subSubject='';viewState.inputValues={};
  document.getElementById('viewDropdowns').innerHTML='';document.getElementById('viewOutput').innerHTML='';
  const ssGroup=document.getElementById('viewSubSubjectGroup');
  const ssSel=document.getElementById('viewSubSubject');
  ssSel.innerHTML='<option value="">-- Select Sub-Subject --</option>';
  ssGroup.style.display='none';
  if(!subject)return;
  const lc=getLevelCols(currentLevel);
  const rows=viewConfig.filter(r=>r&&String(r[0]||'').trim()===subject&&String(r[lc.sheetCol]||'').trim());
  if(!rows.length)return;
  const firstRow=rows[0];
  const hasSub=String(firstRow[lc.subCol]||'').trim().toLowerCase()==='true';
  viewState.subEnabled=hasSub;
  if(hasSub){
    ssGroup.style.display='block';
    const subs=[...new Set(rows.map(r=>String(r[1]||'').trim()).filter(v=>v))];
    subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;ssSel.appendChild(o)});
  }else{
    const cfgIdx=viewConfig.indexOf(firstRow);
    applyViewConfig(cfgIdx);
  }
});

document.getElementById('viewSubSubject').addEventListener('change',function(){
  const ss=this.value.trim();viewState.subSubject=ss;viewState.inputValues={};
  document.getElementById('viewDropdowns').innerHTML='';document.getElementById('viewOutput').innerHTML='';
  if(!ss)return;
  const idx=viewConfig.findIndex(r=>r&&String(r[0]||'').trim()===viewState.subject&&String(r[1]||'').trim()===ss);
  if(idx>=0)applyViewConfig(idx);
});

async function applyViewConfig(idx){
  const row=viewConfig[idx]||[];
  const lc=getLevelCols(currentLevel);
  viewState.subEnabled=String(row[lc.subCol]||'').trim().toLowerCase()==='true';
  viewState.baseInputCol=viewState.subEnabled?2:1;
  const inputCount=Math.max(0,Math.min(parseInt(row[25]||'0',10)||0,8));
  const outputCount=Math.max(0,Math.min(parseInt(row[26]||'0',10)||0,15));
  const titles=[];for(let i=0;i<inputCount;i++)titles.push(String(row[viewState.baseInputCol+i]||''));
  viewState.inputTitles=titles;
  viewState.outputTitles=[];for(let i=0;i<outputCount;i++)viewState.outputTitles.push(String(row[10+i]||''));
  const sheetName=String(row[lc.sheetCol]||'').trim();
  if(!sheetName){document.getElementById('viewOutput').innerHTML='<div class="panel" style="color:red">No data sheet configured</div>';return}
  try{
    document.getElementById('viewOutput').innerHTML='<div class="panel">Loading...</div>';
    const[vals,forms]=await Promise.all([fetchSheet(sheetName,'A:'+CONFIG.DATA_FETCH_END_COL),fetchSheetFormulas(sheetName,'A:'+CONFIG.DATA_FETCH_END_COL)]);
    viewState.dataValues=vals||[];viewState.dataFormulas=forms||[];
    viewState.filteredIdxs=[];
    for(let i=0;i<viewState.dataValues.length;i++){
      const r=viewState.dataValues[i]||[];
      if(String(r[0]||'').trim()!==viewState.subject)continue;
      if(viewState.subEnabled&&String(r[1]||'').trim()!==viewState.subSubject)continue;
      viewState.filteredIdxs.push(i);
    }
    document.getElementById('viewOutput').innerHTML='';
    if(!viewState.filteredIdxs.length){document.getElementById('viewOutput').innerHTML='<div class="panel" style="color:#b00">No data found</div>';return}
    buildViewDropdowns();checkViewOutput();
  }catch(e){document.getElementById('viewOutput').innerHTML='<div class="panel" style="color:red">Error: '+e.message+'</div>'}
}

function buildViewDropdowns(){
  const container=document.getElementById('viewDropdowns');container.innerHTML='';
  viewState.inputTitles.forEach((label,idx)=>{
    const div=document.createElement('div');div.className='form-group';
    const lbl=document.createElement('label');lbl.textContent=label;
    const wrap=document.createElement('div');wrap.className='select-wrapper';
    const sel=document.createElement('select');sel.className='colorful-select g'+(idx%5+2);
    sel.innerHTML=`<option value="">Select ${label}</option>`;
    const opts=getViewOptions(idx);
    opts.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;if(viewState.inputValues[label]===v)o.selected=true;sel.appendChild(o)});
    sel.addEventListener('change',e=>{viewState.inputValues[label]=e.target.value;buildViewDropdowns();checkViewOutput()});
    wrap.appendChild(sel);div.appendChild(lbl);div.appendChild(wrap);container.appendChild(div);
  });
}

function getViewOptions(curIdx){
  const base=viewState.baseInputCol;
  let idxs=viewState.filteredIdxs.slice();
  for(let i=0;i<curIdx;i++){
    const k=viewState.inputTitles[i],v=viewState.inputValues[k];
    if(v)idxs=idxs.filter(ri=>String((viewState.dataValues[ri]||[])[base+i]||'')===v);
  }
  const set=new Set();
  idxs.forEach(ri=>{const v=(viewState.dataValues[ri]||[])[base+curIdx];if(v!=null&&v!=='')set.add(String(v))});
  return[...set];
}

function checkViewOutput(){
  if(viewState.inputTitles.length>0&&!viewState.inputTitles.every(k=>viewState.inputValues[k])){document.getElementById('viewOutput').innerHTML='';return}
  const base=viewState.baseInputCol;
  let idxs=viewState.filteredIdxs.slice();
  viewState.inputTitles.forEach((k,i)=>{const v=viewState.inputValues[k];if(v)idxs=idxs.filter(ri=>String((viewState.dataValues[ri]||[])[base+i]||'')===v)});
  const results=idxs.map(ri=>{
    const rv=viewState.dataValues[ri]||[],rf=viewState.dataFormulas[ri]||[];
    const cells=[];for(let c=10;c<10+viewState.outputTitles.length;c++)cells.push({value:rv[c]||'',formula:rf[c]||''});
    return cells;
  });
  renderViewOutput(results);
}

function renderViewOutput(data){
  const container=document.getElementById('viewOutput');container.innerHTML='';
  if(!data.length)return;
  const title=document.createElement('div');title.className='output-title';title.textContent='Your Result';container.appendChild(title);
  const scroll=document.createElement('div');scroll.className='output-scroll';
  const cols=viewState.outputTitles.length;
  const gridStyle=`grid-template-columns:repeat(${cols},minmax(150px,1fr))`;
  const hdr=document.createElement('div');hdr.className='output-grid';hdr.style.cssText=gridStyle;
  viewState.outputTitles.forEach(t=>{const d=document.createElement('div');d.textContent=t;d.classList.add('output-header');hdr.appendChild(d)});
  scroll.appendChild(hdr);
  data.forEach(row=>{
    const r=document.createElement('div');r.className='output-grid';r.style.cssText=gridStyle;
    row.forEach(cell=>{
      const d=document.createElement('div');
      const img=extractImage(cell.formula)||extractImage(cell.value);
      if(img){const el=document.createElement('img');el.src=img;el.loading='lazy';el.onclick=()=>window.open(img,'_blank');d.appendChild(el)}
      else if(isUrl(cell.value)){const a=document.createElement('a');a.href=driveDirect(cell.value);a.target='_blank';a.className='file-link';a.textContent='image';d.appendChild(a)}
      else{d.textContent=cell.value||''}
      r.appendChild(d);
    });
    scroll.appendChild(r);
  });
  container.appendChild(scroll);
}

/* ===================== ENTRY MODE ===================== */
let entryState={config:[],dataValues:[],filteredIdxs:[],inputTitles:[],dropdownCount:0,inputValues:{},subject:'',subSubject:'',subEnabled:false,baseInputCol:2,targetSheet:''};

document.getElementById('entrySubject').addEventListener('change',function(){
  const subject=this.value.trim();entryState.subject=subject;entryState.subSubject='';entryState.inputValues={};
  document.getElementById('entryDropdowns').innerHTML='';document.getElementById('entryBtnGroup').style.display='none';
  document.getElementById('entryStatus').innerHTML='';
  const ssGroup=document.getElementById('entrySubSubjectGroup');
  const ssSel=document.getElementById('entrySubSubject');
  ssSel.innerHTML='<option value="">-- Select Sub-Subject --</option>';ssGroup.style.display='none';
  if(!subject)return;
  const lc=getLevelCols(currentLevel);
  const rows=entryConfig.filter(r=>r&&String(r[0]||'').trim()===subject&&String(r[lc.sheetCol]||'').trim());
  if(!rows.length)return;
  const firstRow=rows[0];
  const hasSub=String(firstRow[lc.subCol]||'').trim().toLowerCase()==='true';
  entryState.subEnabled=hasSub;
  if(hasSub){
    ssGroup.style.display='block';
    const subs=[...new Set(rows.map(r=>String(r[1]||'').trim()).filter(v=>v))];
    subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;ssSel.appendChild(o)});
  }else{
    const cfgIdx=entryConfig.indexOf(firstRow);
    applyEntryConfig(cfgIdx);
  }
});

document.getElementById('entrySubSubject').addEventListener('change',function(){
  const ss=this.value.trim();entryState.subSubject=ss;entryState.inputValues={};
  document.getElementById('entryDropdowns').innerHTML='';document.getElementById('entryBtnGroup').style.display='none';
  if(!ss)return;
  const idx=entryConfig.findIndex(r=>r&&String(r[0]||'').trim()===entryState.subject&&String(r[1]||'').trim()===ss);
  if(idx>=0)applyEntryConfig(idx);
});

async function applyEntryConfig(idx){
  const row=entryConfig[idx]||[];
  const lc=getLevelCols(currentLevel);
  entryState.subEnabled=String(row[lc.subCol]||'').trim().toLowerCase()==='true';
  entryState.baseInputCol=entryState.subEnabled?2:1;
  const totalInputs=Math.max(0,parseInt(row[25]||'0',10)||0);
  entryState.dropdownCount=Math.max(0,parseInt(row[26]||'0',10)||0);
  const titles=[];for(let i=0;i<totalInputs;i++)titles.push(String(row[entryState.baseInputCol+i]||''));
  entryState.inputTitles=titles;
  entryState.targetSheet=String(row[lc.sheetCol]||'').trim();
  if(!entryState.targetSheet)return;
  try{
    const vals=await fetchSheet(entryState.targetSheet,'A:'+CONFIG.DATA_FETCH_END_COL);
    entryState.dataValues=vals||[];
    entryState.filteredIdxs=[];
    for(let i=0;i<entryState.dataValues.length;i++){
      const r=entryState.dataValues[i]||[];
      if(String(r[0]||'').trim()!==entryState.subject)continue;
      if(entryState.subEnabled&&String(r[1]||'').trim()!==entryState.subSubject)continue;
      entryState.filteredIdxs.push(i);
    }
    buildEntryFields();
  }catch(e){document.getElementById('entryStatus').innerHTML='<div class="status-msg" style="color:red">Error: '+e.message+'</div>'}
}

function buildEntryFields(){
  const container=document.getElementById('entryDropdowns');container.innerHTML='';
  entryState.inputTitles.forEach((label,idx)=>{
    const div=document.createElement('div');div.className='form-group';
    const lbl=document.createElement('label');lbl.textContent=label;div.appendChild(lbl);
    if(idx<entryState.dropdownCount){
      const wrap=document.createElement('div');wrap.className='select-wrapper';
      const sel=document.createElement('select');sel.className='colorful-select g'+(idx%5+2);sel.dataset.label=label;
      sel.innerHTML=`<option value="">Select ${label}</option>`;
      const opts=getEntryOptions(idx);
      opts.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;if(entryState.inputValues[label]===v)o.selected=true;sel.appendChild(o)});
      sel.addEventListener('change',e=>{entryState.inputValues[label]=e.target.value;buildEntryFields()});
      wrap.appendChild(sel);div.appendChild(wrap);
    }else{
      const inp=document.createElement('input');inp.type='text';inp.placeholder='Enter '+label;inp.dataset.label=label;
      inp.value=entryState.inputValues[label]||'';
      inp.addEventListener('input',e=>{entryState.inputValues[label]=e.target.value});
      div.appendChild(inp);
    }
    container.appendChild(div);
  });
  document.getElementById('entryBtnGroup').style.display=entryState.inputTitles.length?'flex':'none';
}

function getEntryOptions(curIdx){
  const base=entryState.baseInputCol;
  let idxs=entryState.filteredIdxs.slice();
  for(let i=0;i<curIdx;i++){
    const k=entryState.inputTitles[i],v=entryState.inputValues[k];
    if(v)idxs=idxs.filter(ri=>String((entryState.dataValues[ri]||[])[base+i]||'')===v);
  }
  const set=new Set();
  idxs.forEach(ri=>{const v=(entryState.dataValues[ri]||[])[base+curIdx];if(v!=null&&v!=='')set.add(String(v))});
  return[...set];
}

async function handleEntrySubmit(){
  const statusEl=document.getElementById('entryStatus');
  if(!entryState.inputTitles.every(k=>entryState.inputValues[k])){statusEl.innerHTML='<div class="status-msg" style="background:#fef2f2;color:#dc2626">❌ Please fill all fields</div>';return}
  const dataArr=[entryState.subject];
  if(entryState.subEnabled)dataArr.push(entryState.subSubject);
  entryState.inputTitles.forEach(k=>dataArr.push(entryState.inputValues[k]||''));
  while(dataArr.length<15)dataArr.push('');
  const now=new Date();
  const dt=now.toLocaleDateString('en-GB')+', '+now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  dataArr.push(currentUser);dataArr.push(dt);dataArr.push(currentLevel);
  try{
    statusEl.innerHTML='<div class="status-msg" style="background:#eff6ff;color:#2563eb">Submitting...</div>';
    await fetch(CONFIG.APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({spreadsheetId:CONFIG.SHEET_ID,sheetName:entryState.targetSheet,data:dataArr})});
    statusEl.innerHTML='<div class="status-msg" style="background:#f0fdf4;color:#16a34a">✅ Data submitted successfully</div>';
    entryState.inputTitles.forEach((k,i)=>{if(i>=entryState.dropdownCount)entryState.inputValues[k]=''});
    buildEntryFields();
  }catch(e){statusEl.innerHTML='<div class="status-msg" style="background:#fef2f2;color:#dc2626">❌ Error: '+e.message+'</div>'}
}

function handleEntryClear(){
  entryState.inputTitles.forEach((k,i)=>{if(i>=entryState.dropdownCount)entryState.inputValues[k]=''});
  document.getElementById('entryStatus').innerHTML='';buildEntryFields();
}

/* ===================== MY DATA ===================== */
let allMyEntries=[];

async function loadMyData(){
  const lc=getLevelCols(currentLevel);
  /* NO personal info in My Entry Data - only in Inbox */

  allMyEntries=[];
  const sheetNames=[...new Set(entryConfig.filter(r=>r&&String(r[lc.sheetCol]||'').trim()).map(r=>String(r[lc.sheetCol]).trim()))];

  for(const sn of sheetNames){
    try{
      const data=await fetchSheet(sn,'K:'+CONFIG.DATA_FETCH_END_COL);
      for(let i=0;i<data.length;i++){
        const row=data[i]||[];
        const submitter=String(row[15]||'').trim();
        if(submitter===currentUser){
          allMyEntries.push({sheet:sn,subject:String(row[0]||'').trim(),subSubject:String(row[1]||'').trim(),data:row,rowIdx:i+1});
        }
      }
    }catch(e){}
  }

  allMyEntries.sort((a,b)=>{
    const da=String((a.data||[])[16]||'');const db=String((b.data||[])[16]||'');
    return db.localeCompare(da);
  });

  const now=new Date();const todayStr=now.toLocaleDateString('en-GB');
  const weekAgo=new Date(now);weekAgo.setDate(weekAgo.getDate()-7);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  let today=0,week=0,month=0;
  allMyEntries.forEach(e=>{
    const ds=String((e.data||[])[16]||'');
    if(ds.startsWith(todayStr))today++;
    const parts=ds.split(/[/,\s]+/);
    if(parts.length>=3){
      const d=new Date(parts[2]+'-'+parts[1]+'-'+parts[0]);
      if(!isNaN(d)){if(d>=weekAgo)week++;if(d>=monthStart)month++}
    }
  });
  document.getElementById('statTotal').textContent=allMyEntries.length;
  document.getElementById('statToday').textContent=today;
  document.getElementById('statWeek').textContent=week;
  document.getElementById('statMonth').textContent=month;

  const mySubjects=[...new Set(allMyEntries.map(e=>e.subject).filter(v=>v))];
  const filterSel=document.getElementById('mySubjectFilter');
  filterSel.innerHTML='<option value="">-- All Entries --</option>';
  mySubjects.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;filterSel.appendChild(o)});
  filterSel.onchange=()=>renderMyEntries(filterSel.value);

  renderMyEntries('');
}

function renderMyEntries(filterSubject){
  const container=document.getElementById('myEntriesTable');
  let entries=allMyEntries;
  if(filterSubject)entries=entries.filter(e=>e.subject===filterSubject);

  if(!entries.length){container.innerHTML='<div style="text-align:center;color:#64748b;padding:20px">No entries found</div>';return}

  const lc=getLevelCols(currentLevel);

  let headers=['SL','Subject'];
  let useDetailedHeaders=false;
  let detailedConfig=null;

  if(filterSubject){
    const cfgRow=entryConfig.find(r=>r&&String(r[0]||'').trim()===filterSubject&&String(r[lc.sheetCol]||'').trim());
    if(cfgRow){
      detailedConfig=cfgRow;
      useDetailedHeaders=true;
      const hasSub=String(cfgRow[lc.subCol]||'').trim().toLowerCase()==='true';
      const baseCol=hasSub?2:1;
      const inputCount=Math.max(0,parseInt(cfgRow[25]||'0',10)||0);
      if(hasSub)headers.push('Sub-Subject');
      for(let i=0;i<inputCount;i++)headers.push(String(cfgRow[baseCol+i]||'Input '+(i+1)));
    }
  }
  if(!useDetailedHeaders)headers.push('Data');
  headers.push('Date/Time');

  let html='<div class="history-scroll"><table class="history-table"><thead><tr>';
  headers.forEach(h=>{html+=`<th>${h}</th>`});
  html+='</tr></thead><tbody>';

  entries.forEach((entry,idx)=>{
    html+='<tr>';
    html+=`<td>${idx+1}</td>`;
    html+=`<td>${entry.subject}</td>`;
    if(useDetailedHeaders&&detailedConfig){
      const hasSub=String(detailedConfig[lc.subCol]||'').trim().toLowerCase()==='true';
      const inputCount=Math.max(0,parseInt(detailedConfig[25]||'0',10)||0);
      if(hasSub)html+=`<td>${entry.subSubject||''}</td>`;
      const dataStart=hasSub?2:1;
      for(let i=0;i<inputCount;i++){
        html+=`<td>${String((entry.data||[])[dataStart+i]||'')}</td>`;
      }
    }else{
      const dataCols=[];
      for(let i=1;i<15;i++){const v=(entry.data||[])[i];if(v)dataCols.push(v)}
      html+=`<td>${dataCols.join(', ')}</td>`;
    }
    html+=`<td>${String((entry.data||[])[16]||'')}</td>`;
    html+='</tr>';
  });

  html+='</tbody></table></div>';
  container.innerHTML=html;
}

function exportPDF(){
  /* Switch to My Data entries view before printing */
  switchMode('mydata');
  switchMyData('entries');
  /* Small delay to ensure DOM is ready then trigger print */
  setTimeout(()=>{window.print()},300);
}

/* ===================== INBOX ===================== */
let inboxData=[];
async function loadInbox(){
  /* Personal info ONLY in Inbox */
  buildPersonalHTML('inboxPersonalInfo');

  try{
    const data=await fetchSheet(CONFIG.INBOX_SHEET_NAME,'A:J');
    inboxData=[];
    let userEmail='';
    if(currentUserRow>0){
      try{const pe=await fetchSheet(CONFIG.SHEET_NAME,`J${currentUserRow}:J${currentUserRow}`);userEmail=String((pe[0]||[])[0]||'').trim()}catch(e){}}
    for(let i=0;i<data.length;i++){
      const row=data[i]||[];
      if(String(row[0]||'').trim()===currentUser){
        inboxData.push({row:i+1,to:row[0]||'',from:row[1]||'',date:row[2]||'',type:String(row[3]||'message').toLowerCase(),
          subject:row[4]||'',message:row[5]||'',link:row[6]||'',status:String(row[7]||'unread').toLowerCase(),
          priority:String(row[8]||'medium').toLowerCase(),email:String(row[9]||'').trim()||userEmail});
      }
    }
    inboxData.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    renderInboxStats();renderInboxCards('all');
    const unread=inboxData.filter(m=>m.status==='unread').length;
    const badge=document.getElementById('unreadBadge');
    if(unread>0){badge.textContent=unread;badge.style.display='inline-flex'}else{badge.style.display='none'}
  }catch(e){document.getElementById('inboxCards').innerHTML='<div style="text-align:center;color:#64748b;padding:20px">No inbox data or error loading</div>'}
}

function renderInboxStats(){
  const total=inboxData.length,unread=inboxData.filter(m=>m.status==='unread').length;
  const tasks=inboxData.filter(m=>m.type==='task'&&m.status!=='done').length;
  const high=inboxData.filter(m=>m.priority==='high'&&m.status!=='done').length;
  document.getElementById('inboxStats').innerHTML=`
    <div class="inbox-stat"><div class="is-num">${total}</div><div class="is-label">Total</div></div>
    <div class="inbox-stat"><div class="is-num" style="color:#ef4444">${unread}</div><div class="is-label">Unread</div></div>
    <div class="inbox-stat"><div class="is-num" style="color:#2563eb">${tasks}</div><div class="is-label">Tasks</div></div>
    <div class="inbox-stat"><div class="is-num" style="color:#dc2626">${high}</div><div class="is-label">High Priority</div></div>`;
  const types=['all','task','pdf','message','notice'];
  const typeIcons={all:'📬',task:'📋',pdf:'📄',message:'💬',notice:'📢'};
  let fhtml='';
  types.forEach(t=>{fhtml+=`<button class="inbox-filter-btn ${t==='all'?'active':''}" onclick="filterInbox('${t}')">${typeIcons[t]} ${t.charAt(0).toUpperCase()+t.slice(1)}</button>`});
  document.getElementById('inboxFilters').innerHTML=fhtml;
}

function filterInbox(type){
  document.querySelectorAll('.inbox-filter-btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  renderInboxCards(type);
}

function renderInboxCards(type){
  let items=type==='all'?inboxData:inboxData.filter(m=>m.type===type);
  const container=document.getElementById('inboxCards');
  if(!items.length){container.innerHTML='<div style="text-align:center;color:#64748b;padding:20px">No messages</div>';return}
  let html='';
  items.forEach(m=>{
    const priBadge=m.priority==='high'?'badge-high':m.priority==='low'?'badge-low':'badge-medium';
    const priText=m.priority==='high'?'🔴 High':m.priority==='low'?'🟢 Low':'🟡 Medium';
    const typeBadge='badge-'+m.type;const typeText=m.type.charAt(0).toUpperCase()+m.type.slice(1);
    const statusBadge=m.status==='unread'?'badge-unread':m.status==='done'?'badge-done':'badge-read';
    const statusText=m.status.charAt(0).toUpperCase()+m.status.slice(1);
    html+=`<div class="inbox-card" style="${m.status==='unread'?'border-left:4px solid #ef4444':''}">
      <div class="inbox-card-header">
        <span class="inbox-badge ${priBadge}">${priText}</span>
        <span class="inbox-badge ${typeBadge}">${typeText}</span>
        <span class="inbox-badge ${statusBadge}">${statusText}</span>
      </div>
      <div class="inbox-card-title">${m.subject}</div>
      <div class="inbox-card-msg">${m.message}</div>
      <div class="inbox-card-footer">
        <div class="inbox-card-meta">From: ${m.from} | ${m.date}</div>
        <div class="inbox-card-actions">`;
    if(m.link){
      if(m.email){
        const fid=driveFileId(m.link);
        const openUrl=fid?`https://drive.google.com/file/d/${fid}/view?authuser=${encodeURIComponent(m.email)}`:m.link;
        html+=`<a href="${openUrl}" target="_blank" class="inbox-file-btn">📂 Open</a>`;
      }else{
        html+=`<button class="inbox-file-btn no-access" onclick="alert('Email not provided. Cannot open file.')">🔒 No Access</button>`;
      }
    }
    if(m.status==='unread')html+=`<button class="inbox-action-btn mark-read" onclick="updateInboxStatus(${m.row},'read',this)">✓ Read</button>`;
    if(m.type==='task'&&m.status!=='done')html+=`<button class="inbox-action-btn mark-done" onclick="updateInboxStatus(${m.row},'done',this)">✓ Done</button>`;
    html+=`</div></div></div>`;
  });
  container.innerHTML=html;
}

async function updateInboxStatus(row,status,btnEl){
  /* Ravi: This sends update to Apps Script and then reloads inbox from sheet */
  if(btnEl){btnEl.textContent='...';btnEl.disabled=true}
  try{
    await fetch(CONFIG.APPS_SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({spreadsheetId:CONFIG.SHEET_ID,sheetName:CONFIG.INBOX_SHEET_NAME,action:'updateInboxStatus',row:row,status:status})});
    /* Wait 2 seconds for Apps Script to process, then reload inbox from sheet */
    setTimeout(async()=>{
      await loadInbox();
    },2000);
  }catch(e){
    if(btnEl){btnEl.textContent='Error';btnEl.disabled=false}
  }
}