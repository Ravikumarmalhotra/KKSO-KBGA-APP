/* ===================== APP VERSION ===================== */
const APP_VERSION="4.7.0";

/* ===================== CONFIGURATION ===================== */
let CONFIG={
 SHEET_ID:"136Fq_Pchc_kPJwEoBUgfRKzDqnYUs730w3vMhnSO9HI",
 WORKER_URL:"https://app.powersupplyorange.workers.dev",
 SHEET_NAME:"master",
 APPS_SCRIPT_URL:"https://script.google.com/macros/s/AKfycbzluFhsV2Ib6I-BK5OdFacx7hjK8nTZSRLlisBedPCr1-nGD5L6MDp85iJhv075odfa/exec",
 INBOX_SHEET_NAME:"inbox",
 APPS_SHEET_NAME:"apps",
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
async function fetchSheet(sheetName,range,spreadsheetId){
 const sid=spreadsheetId||CONFIG.SHEET_ID; /* ✅ allow custom external spreadsheet (config col X) */
 const url=`${CONFIG.WORKER_URL}?sheetId=${sid}&range=${encodeURIComponent(sheetName+'!'+range)}`;
 const res=await fetch(url);
 if(!res.ok)throw new Error(`API Error ${res.status}`);
 const data=await res.json();
 return data.values||[];
}
async function fetchSheetFormulas(sheetName,range,spreadsheetId){
 const sid=spreadsheetId||CONFIG.SHEET_ID;
 const url=`${CONFIG.WORKER_URL}?sheetId=${sid}&range=${encodeURIComponent(sheetName+'!'+range)}&renderOption=FORMULA`;
 const res=await fetch(url);
 if(!res.ok)throw new Error(`API Error ${res.status}`);
 const data=await res.json();
 return data.values||[];
}
function isUrl(s){return typeof s==="string"&&/^https?:\/\//i.test(s)}
/* ✅ Convert a column letter ("Y","AB") or numeric string into a zero-based array index. Rejects junk values safely. */
function colRefToIndex(ref){
 if(ref===null||ref===undefined)return -1;
 const s=String(ref).trim().toUpperCase();
 if(!s)return -1;
 if(/^\d+$/.test(s)){
 const n=parseInt(s,10);
 return (n>=0&&n<60)?n:-1; /* reject absurd numeric values (prevents runaway padding loops) */
 }
 if(!/^[A-Z]+$/.test(s))return -1; /* reject anything that isn't pure letters */
 let idx=0;
 for(let i=0;i<s.length;i++){idx=idx*26+(s.charCodeAt(i)-64)}
 return idx-1;
}
/* ✅ Detect if a value looks like a real spreadsheet TAB name vs junk (like a stray number) */
function isValidSheetName(sn){
 if(!sn)return false;
 const s=String(sn).trim();
 if(!s)return false;
 if(/^\d+$/.test(s))return false; /* pure numbers are not valid tab names for our use case */
 return true;
}
/* ✅ Detect if a View-mode target cell (AB/AD/AF) is a .json file reference instead of a sheet name */
function isJsonFileRef(v){
 if(v===null||v===undefined)return false;
 const s=String(v).trim();
 if(!s)return false;
 return /\.json(\?.*)?(#.*)?$/i.test(s);
}
/* ✅ Fetch a JSON data file from GitHub (same repo as HTML files) */
async function fetchGithubJsonData(fileName){
 let url=fileName;
 if(!/^https?:\/\//i.test(fileName)){
 url=CONFIG.GITHUB_BASE_URL.replace(/\/$/,'')+'/'+'View/Json/'+fileName;
 }
 url+=(url.includes('?')?'&':'?')+'_ts='+Date.now();
 const res=await fetch(url);
 if(!res.ok)throw new Error(`JSON fetch error ${res.status}`);
 const data=await res.json();
 return Array.isArray(data)?data:[];
}
/* ✅ Parse "[ submit ] Name; level; date,time" (or fallback formats) from a data row at a given column index */
function parseSubmitterInfo(row,colIdx){
 const idx=(colIdx!=null&&colIdx>=0)?colIdx:24;
 const val=String((row||[])[idx]||'').trim();
 if(!val)return null;
 let m=val.match(/\[\s*submit\s*\]\s*([^;]+);\s*([^;]+);\s*(.+)/i);
 if(m)return{name:m[1].trim(),level:m[2].trim(),dateTime:m[3].trim()};
 m=val.match(/^([^;]+);\s*([^;]+);\s*(.+)$/);
 if(m)return{name:m[1].trim(),level:m[2].trim(),dateTime:m[3].trim()};
 return null;
}
/* ✅ Convert "DD/MM/YYYY, hh:mm:ss AM/PM" or 24-hr legacy format into a real Date for sorting */
function parseSubmitterDate(dtStr){
 const s=String(dtStr||'').trim();
 if(!s)return new Date(0);
 let m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
 if(m){
 let[,d,mo,y,h,mi,se,ap]=m;
 h=parseInt(h,10);
 if(/PM/i.test(ap)&&h!==12)h+=12;
 if(/AM/i.test(ap)&&h===12)h=0;
 return new Date(parseInt(y,10),parseInt(mo,10)-1,parseInt(d,10),h,parseInt(mi,10),parseInt(se,10));
 }
 m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2}):(\d{2})/);
 if(m){
 const[,d,mo,y,h,mi,se]=m;
 return new Date(parseInt(y,10),parseInt(mo,10)-1,parseInt(d,10),parseInt(h,10),parseInt(mi,10),parseInt(se,10));
 }
 return new Date(0);
}


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
 const levelIcons={admin:'👑',supervisor:'🛡',staff:'👤'};
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
async function doCredentialCheck(){
 if(!currentUser||!currentPassword)return;
 const now=Date.now();
 if(now-lastCredentialCheck<300000)return;
 try{
 const range=`A${CONFIG.USER_START_ROW}:B${CONFIG.USER_END_ROW}`;
 const users=await fetchSheet(CONFIG.SHEET_NAME,range);
 let valid=false;
 for(const row of users){
 if(row&&String(row[0]||'').trim()===currentUser&&String(row[1]||'').trim()===currentPassword){valid=true;break}
 }
 lastCredentialCheck=Date.now();
 i
