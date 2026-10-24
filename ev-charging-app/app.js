/**
 * Càrrega EV - Peugeot & Tesla
 * Adaptat exactament al Google Sheet de l'usuari
 */

const SPREADSHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/172Qbr7TNXVji0boL61hC35tx6-9Oh9fCxk0rxzbvQsw/export?format=csv&gid=0';
const STORAGE_KEY_CHARGES = 'ev_charges_full_v2';
const STORAGE_KEY_SETTINGS = 'ev_settings_v2';
const STORAGE_KEY_API_URL = 'ev_sheets_api_url_v2';

// URL pre-configurada per defecte (perquè funcioni automàticament al mòbil sense haver d'escriure res a mà)
const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxitvd9KkXku4d_8lVIsjWQT6Ua55eNJpgopCwxFFu_ODLiaVPfQVK_zgtBQUAVUgZ3Ew/exec';

function getApiUrl() {
  const custom = localStorage.getItem(STORAGE_KEY_API_URL);
  if (custom && custom.trim() !== '') return custom.trim();
  if (DEFAULT_SCRIPT_URL && DEFAULT_SCRIPT_URL.trim() !== '') return DEFAULT_SCRIPT_URL.trim();
  return '';
}

let currentCar = 'Tesla'; // 'Tesla' | 'Peugeot'
let charges = [];
let settings = {
  homeRate: 0.0847, // €/kWh actual del Google Sheet
  teslaStart: '02:00',
  teslaEnd: '06:00',
  peugeotStart: '00:05',
  peugeotEnd: '08:00'
};
let monthlyChartInstance = null;

// Bateries útils de referència per càlcul % -> kWh
const BATTERY_CAPACITY = {
  Tesla: 60.0,    // LFP 60 kWh (1% ≈ 0.6 kWh)
  Peugeot: 46.3   // Útil e-2008 50 kWh (1% ≈ 0.463 kWh)
};

// Darrer quilometratge conegut
let lastKnownKm = {
  Tesla: 29209,
  Peugeot: 69751
};

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initFormDefaults();
  loadData();
  initServiceWorker();
});

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (saved) {
    try {
      settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {
      console.error(e);
    }
  }

  const cfgHomePrice = document.getElementById('cfgHomePrice');
  const homeRateDisplay = document.getElementById('homeRateDisplay');
  if (cfgHomePrice) cfgHomePrice.value = settings.homeRate;
  if (homeRateDisplay) homeRateDisplay.innerText = settings.homeRate.toString().replace('.', ',');

  const activeApiUrl = getApiUrl();
  const cfgSheetApiUrl = document.getElementById('cfgSheetApiUrl');
  if (cfgSheetApiUrl) {
    cfgSheetApiUrl.value = activeApiUrl;
    if (activeApiUrl) {
      updateSyncStatus('Apps Script connectat');
    } else {
      updateSyncStatus('⚠️ Falta configurar URL a Ajustos');
    }
  }
}

function saveSettings() {
  const p = parseFloat(document.getElementById('cfgHomePrice').value);
  if (!isNaN(p) && p >= 0) settings.homeRate = p;

  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  document.getElementById('homeRateDisplay').innerText = settings.homeRate.toString().replace('.', ',');
  document.getElementById('inputRatePerKwh').value = settings.homeRate;
  onPriceRateChange();
  showToast('Configuració desada!');
}

function saveSheetUrl() {
  const url = document.getElementById('cfgSheetApiUrl').value.trim();
  if (url) {
    localStorage.setItem(STORAGE_KEY_API_URL, url);
    updateSyncStatus('Apps Script connectat');
    showToast('URL connectada correctament!');
    // Enviem automàticament qualsevol càrrega que hagi quedat pendent al mòbil
    pushPendingCharges();
  } else {
    localStorage.removeItem(STORAGE_KEY_API_URL);
    updateSyncStatus('Sense URL de Google Sheets');
    showToast('S\'ha eliminat la URL d\'Apps Script', 'warn');
  }
}

// Inicialització del formulari
function initFormDefaults() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inputDate').value = today;
  selectCar('Tesla');
}

// Canvi de cotxe (Tesla vs Peugeot)
function selectCar(car) {
  currentCar = car;
  const btnTesla = document.getElementById('btnCarTesla');
  const btnPeugeot = document.getElementById('btnCarPeugeot');
  const badgeTesla = document.getElementById('badgeTesla');
  const badgePeugeot = document.getElementById('badgePeugeot');
  const suggestedLabel = document.getElementById('suggestedLabel');
  const inputKm = document.getElementById('inputKm');

  if (car === 'Tesla') {
    btnTesla.className = "relative p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center bg-slate-900 border-red-500 shadow-md shadow-red-500/10 active:scale-95";
    btnPeugeot.className = "relative p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center bg-slate-900 border-slate-800 text-slate-400 active:scale-95";
    badgeTesla.classList.remove('hidden');
    badgePeugeot.classList.add('hidden');

    document.getElementById('inputStartTime').value = settings.teslaStart;
    document.getElementById('inputEndTime').value = settings.teslaEnd;
    suggestedLabel.innerText = 'Habitual Tesla (02:00 - 06:00)';
    inputKm.placeholder = `Últim: ${lastKnownKm.Tesla} km`;
    
    // Valors típics Tesla
    document.getElementById('inputPercentIn').value = '45';
    document.getElementById('inputPercentFi').value = '68';
    onBatteryPercentInput();
  } else {
    btnPeugeot.className = "relative p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center bg-slate-900 border-blue-500 shadow-md shadow-blue-500/10 active:scale-95";
    btnTesla.className = "relative p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center justify-center text-center bg-slate-900 border-slate-800 text-slate-400 active:scale-95";
    badgePeugeot.classList.remove('hidden');
    badgeTesla.classList.add('hidden');

    document.getElementById('inputStartTime').value = settings.peugeotStart;
    document.getElementById('inputEndTime').value = settings.peugeotEnd;
    suggestedLabel.innerText = 'Habitual Peugeot (00:05 - 08:00)';
    inputKm.placeholder = `Últim: ${lastKnownKm.Peugeot} km`;

    // Valors típics Peugeot
    document.getElementById('inputPercentIn').value = '30';
    document.getElementById('inputPercentFi').value = '80';
    onBatteryPercentInput();
  }

  onTimeOrPercentChange();
}

// Selector ràpid de PdC
function setPdC(pdc) {
  const input = document.getElementById('inputPdC');
  const rateInput = document.getElementById('inputRatePerKwh');
  const badge = document.getElementById('rateLabelBadge');

  input.value = pdc;

  // Actualitzar estils botons
  const btns = {
    Home: document.getElementById('btnPdcHome'),
    'Port Mataró': document.getElementById('btnPdcPort'),
    'La Roca AC': document.getElementById('btnPdcRoca'),
    Supercharger: document.getElementById('btnPdcSC')
  };

  Object.keys(btns).forEach(key => {
    if (btns[key]) {
      btns[key].className = (key === pdc)
        ? "py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white shadow transition text-center"
        : "py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:text-white transition text-center";
    }
  });

  if (pdc === 'Home') {
    rateInput.value = settings.homeRate;
    badge.innerText = `Casa: ${settings.homeRate.toString().replace('.', ',')} €/kWh`;
    badge.className = "text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium";
  } else if (pdc === 'Port Mataró' || pdc === 'La Roca AC') {
    rateInput.value = 0;
    badge.innerText = "Càrrega Gratuïta (0,00 €)";
    badge.className = "text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium";
  } else if (pdc === 'Supercharger') {
    rateInput.value = 0.42;
    badge.innerText = "Supercharger Tesla (~0,42 €)";
    badge.className = "text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium";
  }

  onPriceRateChange();
}

function applyHomeRate() {
  document.getElementById('inputRatePerKwh').value = settings.homeRate;
  setPdC('Home');
}

// Càlcul de durada en minuts (i creuant mitjanit)
function calculateDurationMinutes(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);

  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

// Quan canvia l'hora o percentatge
function onTimeOrPercentChange() {
  const start = document.getElementById('inputStartTime').value;
  const end = document.getElementById('inputEndTime').value;
  const mins = calculateDurationMinutes(start, end);

  const h = Math.floor(mins / 60);
  const m = mins % 60;
  document.getElementById('calcDuration').innerText = `Temps: ${mins} min (${h}h ${m < 10 ? '0' : ''}${m}m)`;

  // Potència mitjana (kW)
  const kwh = parseFloat(document.getElementById('inputKwh').value) || 0;
  if (mins > 0 && kwh > 0) {
    const avgKw = (kwh / (mins / 60)).toFixed(1);
    document.getElementById('calcAvgKw').innerText = `Potència mitjana: ${avgKw.replace('.', ',')} kW`;
  } else {
    document.getElementById('calcAvgKw').innerText = `Potència mitjana: -- kW`;
  }
}

// Quan l'usuari introdueix % in o % fi
function onBatteryPercentInput() {
  const pIn = parseFloat(document.getElementById('inputPercentIn').value);
  const pFi = parseFloat(document.getElementById('inputPercentFi').value);
  const displayDif = document.getElementById('displayPercentDif');

  if (!isNaN(pIn) && !isNaN(pFi) && pFi >= pIn) {
    const diff = pFi - pIn;
    displayDif.innerText = `+${diff}%`;

    // Càlcul de kWh a partir de la bateria del cotxe
    const capacity = BATTERY_CAPACITY[currentCar] || 60.0;
    const estimatedKwh = (diff / 100) * capacity;

    // Arrodoniment intel·ligent: al Tesla 23% sol ser exactament 14 kWh al full
    const roundedKwh = Math.round(estimatedKwh * 10) / 10;
    document.getElementById('inputKwh').value = (diff === 23 && currentCar === 'Tesla') ? 14 : roundedKwh;

    onManualKwhChange();
  } else {
    displayDif.innerText = '--%';
  }
}

// Quan canvia kWh
function onManualKwhChange() {
  const kwh = parseFloat(document.getElementById('inputKwh').value) || 0;
  const rate = parseFloat(document.getElementById('inputRatePerKwh').value) || 0;
  const costInput = document.getElementById('inputTotalCost');

  const totalCost = kwh * rate;
  costInput.value = totalCost.toFixed(2);

  onTimeOrPercentChange();
}

// Quan canvia el preu/kWh
function onPriceRateChange() {
  onManualKwhChange();
}

// Si l'usuari edita directament el cost total
function onTotalCostManualChange() {
  const totalCost = parseFloat(document.getElementById('inputTotalCost').value) || 0;
  const kwh = parseFloat(document.getElementById('inputKwh').value) || 0;

  if (kwh > 0 && totalCost >= 0) {
    const rate = totalCost / kwh;
    document.getElementById('inputRatePerKwh').value = rate.toFixed(4);
  }
}

// Enviament del formulari
async function handleFormSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-75');

  const rawDate = document.getElementById('inputDate').value; // 'YYYY-MM-DD'
  const [yyyy, mm, dd] = rawDate.split('-');
  const diaFormatted = `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yyyy}`; // Format del full: 'D/M/YYYY'

  const pdc = document.getElementById('inputPdC').value.trim() || 'Home';
  const startTime = document.getElementById('inputStartTime').value;
  const endTime = document.getElementById('inputEndTime').value;
  const minutes = calculateDurationMinutes(startTime, endTime);

  const pInVal = document.getElementById('inputPercentIn').value;
  const pFiVal = document.getElementById('inputPercentFi').value;
  const percentIn = pInVal !== '' ? `${pInVal}%` : '0%';
  const percentFi = pFiVal !== '' ? `${pFiVal}%` : '0%';
  const diffVal = (pInVal !== '' && pFiVal !== '') ? (parseInt(pFiVal, 10) - parseInt(pInVal, 10)) : 0;
  const percentDif = `${diffVal}%`;

  const kwh = parseFloat(document.getElementById('inputKwh').value) || 0;
  const avgKw = minutes > 0 ? (kwh / (minutes / 60)).toFixed(1).replace('.', ',') : '3,5';

  const ratePerKwh = parseFloat(document.getElementById('inputRatePerKwh').value) || 0;
  const totalCost = parseFloat(document.getElementById('inputTotalCost').value) || 0;

  const preuFormatted = `${ratePerKwh.toFixed(4).replace('.', ',')} €`;
  const costFormatted = `${totalCost.toFixed(2).replace('.', ',')} €`;

  const kmVal = document.getElementById('inputKm').value ? parseInt(document.getElementById('inputKm').value, 10) : '';

  // Objecte fidel a les 14 columnes:
  // Dia, PdC, Hora Inici, Hora Fi, Temps (min), % in, % fi, % Dif, kWh, kW mijans, Preu, Cost, Cotxe, Km
  const newRow = {
    id: 'chg_' + Date.now(),
    Dia: diaFormatted,
    PdC: pdc,
    HoraInici: startTime + (startTime.split(':').length === 2 ? ':00' : ''),
    HoraFi: endTime + (endTime.split(':').length === 2 ? ':00' : ''),
    Temps: minutes,
    PercentIn: percentIn,
    PercentFi: percentFi,
    PercentDif: percentDif,
    Kwh: kwh,
    KwMijans: avgKw,
    Preu: preuFormatted,
    Cost: costFormatted,
    Cotxe: currentCar,
    Km: kmVal,
    synced: false
  };

  // Afegir al principi
  charges.unshift(newRow);
  saveChargesLocally();
  renderHistory();
  showToast('✓ Càrrega afegida amb èxit!');

  // Actualitzar darrer km si s'ha posat
  if (kmVal) {
    lastKnownKm[currentCar] = kmVal;
  }

  // Sincronitzar amb Google Apps Script
  const apiUrl = getApiUrl();
  if (apiUrl) {
    syncSingleChargeToSheets(newRow);
  } else {
    showToast('⚠️ Desat al mòbil. Recorda connectar la URL a Configuració!', 'warn');
  }

  submitBtn.disabled = false;
  submitBtn.classList.remove('opacity-75');

  setTimeout(() => {
    switchTab('history');
  }, 400);
}

// Sincronitzar càrrega amb Google Sheets (amb POST i rescat GET/JSONP per a mòbils)
async function syncSingleChargeToSheets(charge) {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    updateSyncStatus('⚠️ Falta URL Google Sheets');
    return false;
  }

  updateSyncStatus('Enviant al Google Sheet...');
  const payloadStr = JSON.stringify({
    action: 'appendRow',
    charge: charge
  });

  let ok = false;
  try {
    // 1. Intentem POST directe amb text/plain (CORS safelisted, evita preflight OPTIONS)
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payloadStr
    });
    ok = true;
  } catch (errPost) {
    console.warn('POST ha fallat o s\'ha bloquejat al mòbil, provant rescat GET...', errPost);
  }

  // 2. Si el navegador mòbil ha bloquejat el POST o el redirect 302, utilitzem rescat GET
  if (!ok) {
    ok = await sendViaGetRescue(apiUrl, 'appendRow', charge);
  }

  if (ok) {
    charge.synced = true;
    saveChargesLocally();
    renderHistory();
    updateSyncStatus('Sincronitzat amb Google Sheets');
    return true;
  } else {
    updateSyncStatus('⚠️ Pendent de sincronitzar');
    return false;
  }
}

// Carregar dades: primer de window.INITIAL_CHARGES (immediat), després LocalStorage i Apps Script
async function loadData() {
  updateSyncStatus('Carregant dades...');
  let localData = [];
  const saved = localStorage.getItem(STORAGE_KEY_CHARGES);
  if (saved) {
    try {
      localData = JSON.parse(saved);
    } catch (e) {}
  }

  // Si tenim el paquet inicial de 1.033 càrregues històriques
  const initial = (typeof window !== 'undefined' && Array.isArray(window.INITIAL_CHARGES))
    ? window.INITIAL_CHARGES
    : [];

  if (localData.length === 0) {
    charges = initial.slice();
    saveChargesLocally();
  } else if (localData.length < initial.length) {
    // Si l'usuari tenia menys dades guardades, unim les locals noves amb l'històric
    const combined = [...localData];
    const localKeys = new Set(localData.map(c => `${c.Dia}_${c.Cotxe}_${c.HoraInici}`));
    initial.forEach(c => {
      const k = `${c.Dia}_${c.Cotxe}_${c.HoraInici}`;
      if (!localKeys.has(k)) {
        combined.push(c);
      }
    });
    charges = combined;
    saveChargesLocally();
  } else {
    charges = localData;
  }

  // Assegurar que tots els registres tenen un id únic per poder editar-los
  charges.forEach((c, idx) => {
    if (!c.id) c.id = 'chg_' + (c.rowNumber ? 'row_' + c.rowNumber : 'idx_' + idx);
    if (!c.rowNumber && c.synced) {
      c.rowNumber = charges.length - idx + 1;
    }
  });

  updateLastKnownKmFromCharges();
  renderHistory();
  updateSyncStatus(`${charges.length} càrregues carregades`);

  // Si hi ha URL de Google Apps Script configurada, intentem obtenir les últimes dades del full
  const apiUrl = getApiUrl();
  if (apiUrl) {
    fetchFromAppsScript(apiUrl);
  }
}

// Actualitza els quilometratges més recents detectats
function updateLastKnownKmFromCharges() {
  const lastTesla = charges.find(c => c.Cotxe === 'Tesla' && c.Km);
  if (lastTesla) {
    lastKnownKm.Tesla = lastTesla.Km;
    const elem = document.getElementById('lastKmTesla');
    if (elem) elem.innerText = lastTesla.Km.toLocaleString('es-ES');
  }

  const lastPeugeot = charges.find(c => c.Cotxe === 'Peugeot' && c.Km);
  if (lastPeugeot) {
    lastKnownKm.Peugeot = lastPeugeot.Km;
    const elem = document.getElementById('lastKmPeugeot');
    if (elem) elem.innerText = lastPeugeot.Km.toLocaleString('es-ES');
  }
}

// Obtenir dades directament del Google Sheet via Google Apps Script
async function fetchFromAppsScript(apiUrl) {
  if (!apiUrl) return;
  updateSyncStatus('Sincronitzant amb Google Sheet...');

  try {
    // 1. Intentem primer amb fetch directe
    const res = await fetch(apiUrl, { mode: 'cors' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
        mergeRemoteCharges(json.data);
        return;
      }
    }
  } catch (err) {
    console.log('Fetch directe bloquejat o amb redirect, intentant via JSONP...', err);
  }

  // 2. Fallback JSONP que mai falla per CORS al navegador mòbil
  fetchViaJsonp(apiUrl);
}

function fetchViaJsonp(apiUrl) {
  const cbName = 'handleSheetJsonp_' + Math.floor(Math.random() * 1000000);
  const script = document.createElement('script');

  window[cbName] = function(json) {
    try {
      if (json && json.status === 'success' && Array.isArray(json.data)) {
        mergeRemoteCharges(json.data);
        showToast(`Sincronitzat amb èxit! (${json.data.length} càrregues)`);
      }
    } finally {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }
  };

  script.onerror = function() {
    console.warn('JSONP ha fallat o Apps Script no té doGet');
    updateSyncStatus('Mode dades locals');
    if (script.parentNode) script.parentNode.removeChild(script);
  };

  const sep = apiUrl.includes('?') ? '&' : '?';
  script.src = apiUrl + sep + 'callback=' + cbName;
  document.body.appendChild(script);
}

// Actualitza les dades des de Google Sheets tractant el full com a font de la veritat
function mergeRemoteCharges(remoteList) {
  if (!Array.isArray(remoteList) || remoteList.length === 0) return;

  // Conservem només càrregues que s'hagin creat al mòbil i que encara estiguin pendents d'enviar (offline)
  const pendingSync = charges.filter(c => c.synced === false);

  remoteList.forEach((r, idx) => {
    if (!r.id) r.id = 'chg_' + (r.rowNumber ? 'row_' + r.rowNumber : 'remote_' + idx);
  });

  // La llista que ve de Google Sheets és l'oficial: recull qualsevol edició, correcció o eliminació feta al full
  charges = [...pendingSync, ...remoteList];

  updateLastKnownKmFromCharges();
  saveChargesLocally();
  renderHistory();
  updateSyncStatus(`Google Sheet al dia (${charges.length} càrregues)`);
}

async function reloadFromSheetCsv() {
  const apiUrl = getApiUrl();
  if (apiUrl) {
    fetchFromAppsScript(apiUrl);
  } else {
    loadData();
  }
}

// Parser del CSV oficial
function parseGoogleSheetCsv(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return;

  const parsed = [];
  // Linia 0 és la capçalera: Dia,PdC,Hora Inici,Hora Fi,Temps (min),% in,% fi,% Dif,kWh,kW mijans,Preu,Cost,Cotxe,Km
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parseig de camps CSV considerant cometes dobles
    const row = parseCsvLine(line);
    if (!row || row.length < 13) continue;

    const [dia, pdc, horaInici, horaFi, temps, pIn, pFi, pDif, kwh, kwMijans, preu, cost, cotxe, km] = row;

    parsed.push({
      id: 'row_' + i,
      Dia: dia || '',
      PdC: pdc || 'Home',
      HoraInici: horaInici || '',
      HoraFi: horaFi || '',
      Temps: parseInt(temps, 10) || 0,
      PercentIn: pIn || '',
      PercentFi: pFi || '',
      PercentDif: pDif || '',
      Kwh: parseLocaleFloat(kwh),
      KwMijans: kwMijans || '',
      Preu: preu || '',
      Cost: cost || '',
      CostNum: parseEuroFloat(cost),
      Cotxe: (cotxe || '').trim().toLowerCase().includes('tesla') ? 'Tesla' : 'Peugeot',
      Km: km ? parseInt(km, 10) : '',
      synced: true
    });
  }

  // Ordenar de més recent a més antic
  parsed.reverse();
  charges = parsed;

  // Actualitzar darrers KM detectats
  const lastTesla = charges.find(c => c.Cotxe === 'Tesla' && c.Km);
  if (lastTesla) {
    lastKnownKm.Tesla = lastTesla.Km;
    const elem = document.getElementById('lastKmTesla');
    if (elem) elem.innerText = lastTesla.Km.toLocaleString('es-ES');
  }

  const lastPeugeot = charges.find(c => c.Cotxe === 'Peugeot' && c.Km);
  if (lastPeugeot) {
    lastKnownKm.Peugeot = lastPeugeot.Km;
    const elem = document.getElementById('lastKmPeugeot');
    if (elem) elem.innerText = lastPeugeot.Km.toLocaleString('es-ES');
  }
}

function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseLocaleFloat(str) {
  if (!str) return 0;
  const clean = str.toString().replace(/"/g, '').replace(',', '.').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function parseEuroFloat(str) {
  if (!str) return 0;
  const clean = str.toString().replace(/"/g, '').replace('€', '').replace(',', '.').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

function saveChargesLocally() {
  localStorage.setItem(STORAGE_KEY_CHARGES, JSON.stringify(charges));
}

// Renderitzar Històric i Gràfica
function renderHistory() {
  const container = document.getElementById('chargesList');
  const countBadge = document.getElementById('chargesCountBadge');
  if (countBadge) countBadge.innerText = `${charges.length} càrregues`;

  let totalCost = 0;
  let totalKwh = 0;
  let monthCost = 0;
  let monthKwh = 0;

  let teslaCost = 0;
  let teslaKwh = 0;
  let peugeotCost = 0;
  let peugeotKwh = 0;

  const monthlyData = {};

  charges.forEach(c => {
    const cost = c.CostNum !== undefined ? c.CostNum : parseEuroFloat(c.Cost);
    const kwh = Number(c.Kwh) || 0;

    totalCost += cost;
    totalKwh += kwh;

    // Mes actual (Octubre 2026 en el full)
    if (c.Dia && (c.Dia.includes('/10/2026') || c.Dia.includes('/10/26'))) {
      monthCost += cost;
      monthKwh += kwh;
    }

    if (c.Cotxe === 'Tesla') {
      teslaCost += cost;
      teslaKwh += kwh;
    } else {
      peugeotCost += cost;
      peugeotKwh += kwh;
    }

    // Mes per gràfica (extraure M/YYYY)
    if (c.Dia) {
      const parts = c.Dia.split('/');
      if (parts.length === 3) {
        const ym = `${parts[2]}-${parts[1].padStart(2, '0')}`;
        if (!monthlyData[ym]) monthlyData[ym] = { cost: 0, kwh: 0 };
        monthlyData[ym].cost += cost;
        monthlyData[ym].kwh += kwh;
      }
    }
  });

  document.getElementById('statMonthCost').innerText = `${monthCost.toFixed(2).replace('.', ',')} €`;
  document.getElementById('statMonthKwh').innerText = `${monthKwh.toFixed(1).replace('.', ',')} kWh`;
  document.getElementById('statTotalCost').innerText = `${totalCost.toFixed(2).replace('.', ',')} €`;
  document.getElementById('statTotalCharges').innerText = `${charges.length} càrregues (${totalKwh.toFixed(0)} kWh)`;

  document.getElementById('statTeslaCost').innerHTML = `${teslaCost.toFixed(2).replace('.', ',')} € <span class="text-slate-500 text-[11px]">(${teslaKwh.toFixed(0)} kWh)</span>`;
  document.getElementById('statPeugeotCost').innerHTML = `${peugeotCost.toFixed(2).replace('.', ',')} € <span class="text-slate-500 text-[11px]">(${peugeotKwh.toFixed(0)} kWh)</span>`;

  const totalCarCost = teslaCost + peugeotCost;
  const pTesla = totalCarCost > 0 ? (teslaCost / totalCarCost) * 100 : 50;
  const pPeugeot = totalCarCost > 0 ? (peugeotCost / totalCarCost) * 100 : 50;

  document.getElementById('barTesla').style.width = `${pTesla}%`;
  document.getElementById('barPeugeot').style.width = `${pPeugeot}%`;

  // Render llista d'últimes càrregues (primeres 50 per agilitat al mòbil)
  if (!container) return;
  const recent = charges.slice(0, 50);

  container.innerHTML = recent.map((c, idx) => {
    const isTesla = c.Cotxe === 'Tesla';
    const badgeColor = isTesla ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    const icon = isTesla ? '⚡' : '🦁';
    const isHome = (c.PdC || '').toLowerCase().includes('home');
    const isLatest = idx === 0;

    return `
      <div class="bg-slate-900 border ${isLatest ? 'border-emerald-500/50 shadow-md shadow-emerald-500/10' : 'border-slate-800'} rounded-2xl p-3.5 flex flex-col gap-2.5 hover:border-slate-700 transition">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg ${badgeColor} border font-bold flex-shrink-0">
              ${icon}
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-sm text-white">${c.Cotxe}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded ${isHome ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'} font-medium">${c.PdC || 'Home'}</span>
                ${c.PercentDif && c.PercentDif !== '0%' ? `<span class="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-1 rounded">${c.PercentDif}</span>` : ''}
                ${isLatest ? `<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">Més recent</span>` : ''}
              </div>
              <div class="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>📅 ${c.Dia}</span>
                <span>•</span>
                <span>🕒 ${c.HoraInici}-${c.HoraFi}</span>
                ${c.Km ? `<span>• 🚗 ${c.Km.toLocaleString('es-ES')} km</span>` : ''}
              </div>
            </div>
          </div>

          <div class="text-right flex flex-col items-end flex-shrink-0">
            <span class="font-extrabold text-base text-emerald-400">${c.Cost || '0,00 €'}</span>
            <span class="text-xs text-slate-400">${c.Kwh} kWh</span>
            <span class="text-[10px] text-slate-500">${c.Preu || ''}</span>
          </div>
        </div>

        <!-- Accions: Editar / Eliminar -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-0.5">
          <span class="text-[10px] text-slate-500">
            ${c.rowNumber ? `Fila #${c.rowNumber}` : ''} ${c.synced === false ? '<span class="text-amber-400">• Pendent de sync</span>' : ''}
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="openEditModal('${c.id}')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              <span>Editar</span>
            </button>
            <button type="button" onclick="deleteCharge('${c.id}')" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs transition active:scale-95" title="Eliminar registre">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Actualitzem l'estat del banner de càrregues pendents
  const pending = charges.filter(c => c.synced === false);
  const pendingBanner = document.getElementById('pendingSyncBanner');
  const pendingCountElem = document.getElementById('pendingCount');
  const settingsPendingBox = document.getElementById('settingsPendingBox');
  const settingsPendingCount = document.getElementById('settingsPendingCount');

  if (pending.length > 0) {
    if (pendingBanner) {
      pendingBanner.classList.remove('hidden');
      if (pendingCountElem) pendingCountElem.innerText = pending.length;
    }
    if (settingsPendingBox) {
      settingsPendingBox.classList.remove('hidden');
      if (settingsPendingCount) settingsPendingCount.innerText = pending.length;
    }
  } else {
    if (pendingBanner) pendingBanner.classList.add('hidden');
    if (settingsPendingBox) settingsPendingBox.classList.add('hidden');
  }

  renderMonthlyChart(monthlyData);
}

function renderMonthlyChart(monthlyData) {
  const canvas = document.getElementById('monthlyChart');
  if (!canvas) return;

  const sortedMonths = Object.keys(monthlyData).sort().slice(-8); // Últims 8 mesos
  const labels = sortedMonths.map(ym => {
    const [year, month] = ym.split('-');
    const names = ['Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des'];
    return `${names[parseInt(month, 10) - 1]} '${year.slice(2)}`;
  });

  const costData = sortedMonths.map(ym => monthlyData[ym]?.cost || 0);

  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  monthlyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Despesa (€)',
        data: costData,
        backgroundColor: '#10b981',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(2).replace('.', ',')} €`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (v) => `${v}€`
          }
        }
      }
    }
  });
}

function switchTab(tabName) {
  const tabRegister = document.getElementById('tab-register');
  const tabHistory = document.getElementById('tab-history');
  const tabSettings = document.getElementById('tab-settings');

  const navRegister = document.getElementById('nav-btn-register');
  const navHistory = document.getElementById('nav-btn-history');
  const navSettings = document.getElementById('nav-btn-settings');

  tabRegister.classList.add('hidden');
  tabHistory.classList.add('hidden');
  tabSettings.classList.add('hidden');

  navRegister.className = "flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition active:scale-95";
  navHistory.className = "flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition active:scale-95";
  navSettings.className = "flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition active:scale-95";

  if (tabName === 'register') {
    tabRegister.classList.remove('hidden');
    navRegister.className = "flex flex-col items-center justify-center gap-1 text-emerald-400 font-semibold transition active:scale-95";
  } else if (tabName === 'history') {
    tabHistory.classList.remove('hidden');
    navHistory.className = "flex flex-col items-center justify-center gap-1 text-emerald-400 font-semibold transition active:scale-95";
    renderHistory();
  } else if (tabName === 'settings') {
    tabSettings.classList.remove('hidden');
    navSettings.className = "flex flex-col items-center justify-center gap-1 text-emerald-400 font-semibold transition active:scale-95";
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  toastMsg.innerText = message;
  toast.classList.remove('opacity-0', '-translate-y-2', 'pointer-events-none');
  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2', 'pointer-events-none');
  }, 2500);
}

function updateSyncStatus(text) {
  const elem = document.getElementById('syncStatus');
  if (elem) elem.innerText = text;
}

async function syncWithGoogleSheets() {
  const icon = document.getElementById('syncIcon');
  if (icon) icon.classList.add('animate-spin');
  updateSyncStatus('Sincronitzant...');

  const apiUrl = getApiUrl();

  // 1. Enviem al full qualsevol càrrega que hagi quedat pendent
  const pending = charges.filter(c => c.synced === false);
  if (pending.length > 0 && apiUrl) {
    for (const p of pending) {
      await syncSingleChargeToSheets(p);
    }
  }

  // 2. Descarreguem l'estat actual del Google Sheet amb totes les modificacions
  if (apiUrl) {
    await fetchFromAppsScript(apiUrl);
  } else {
    await reloadFromSheetCsv();
  }

  if (icon) icon.classList.remove('animate-spin');
  showToast('Sincronització completada!');
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('SW registrat'))
      .catch(e => console.log(e));
  }
}

// ==========================================
// FUNCIONS D'EDICIÓ I CORRECCIÓ DE REGISTRES
// ==========================================

function formatDiaToInputDate(diaStr) {
  if (!diaStr) return new Date().toISOString().split('T')[0];
  const parts = diaStr.split('/');
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().split('T')[0];
}

function formatInputDateToDia(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${parts[0]}`;
  }
  return dateStr;
}

function formatTimeToInputTime(timeStr) {
  if (!timeStr) return '02:00';
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return timeStr;
}

// Obrir modal d'edició
function openEditModal(chargeId) {
  const charge = charges.find(c => c.id === chargeId);
  if (!charge) {
    showToast('No s\'ha trobat el registre', 'error');
    return;
  }

  document.getElementById('editChargeId').value = charge.id;
  document.getElementById('editRowNumber').value = charge.rowNumber || '';
  document.getElementById('editOldHoraInici').value = charge.HoraInici || '';

  // Cotxe
  selectEditCar(charge.Cotxe || 'Tesla');

  // PdC
  document.getElementById('editInputPdC').value = charge.PdC || 'Home';

  // Data
  document.getElementById('editInputDate').value = formatDiaToInputDate(charge.Dia);

  // Hores
  document.getElementById('editInputStartTime').value = formatTimeToInputTime(charge.HoraInici);
  document.getElementById('editInputEndTime').value = formatTimeToInputTime(charge.HoraFi);

  // Bateria %
  const pIn = charge.PercentIn ? parseInt(charge.PercentIn.toString().replace('%', ''), 10) : '';
  const pFi = charge.PercentFi ? parseInt(charge.PercentFi.toString().replace('%', ''), 10) : '';
  document.getElementById('editPercentIn').value = isNaN(pIn) ? '' : pIn;
  document.getElementById('editPercentFi').value = isNaN(pFi) ? '' : pFi;
  document.getElementById('editDisplayPercentDif').innerText = charge.PercentDif || '+0%';

  // kWh i Km
  document.getElementById('editInputKwh').value = charge.Kwh || 0;
  document.getElementById('editInputKm').value = charge.Km || '';

  // Preu / kWh
  let rateVal = parseLocaleFloat(charge.Preu);
  if (!rateVal && (charge.PdC || '').toLowerCase().includes('home')) {
    rateVal = settings.homeRate;
  }
  document.getElementById('editInputRatePerKwh').value = rateVal || settings.homeRate;

  // Cost total
  let costVal = charge.CostNum !== undefined ? charge.CostNum : parseEuroFloat(charge.Cost);
  document.getElementById('editInputTotalCost').value = costVal ? costVal.toFixed(2) : '0.00';

  // Recalcular càlculs d'hores
  onEditTimeOrPercentChange();

  // Subtitle
  const rowInfo = charge.rowNumber ? `(Fila #${charge.rowNumber})` : '(Nou)';
  document.getElementById('editModalSubtitle').innerText = `${charge.Cotxe} • ${charge.Dia} ${rowInfo}`;

  // Obrir modal
  const modal = document.getElementById('editModal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  modal.classList.add('opacity-0', 'pointer-events-none');
}

function selectEditCar(car) {
  const btnTesla = document.getElementById('editBtnTesla');
  const btnPeugeot = document.getElementById('editBtnPeugeot');
  const inputCotxe = document.getElementById('editInputCotxe');

  inputCotxe.value = car;
  if (car === 'Tesla') {
    btnTesla.className = "py-2.5 px-3 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-xs transition active:scale-95 bg-slate-950 border-red-500 text-white shadow";
    btnPeugeot.className = "py-2.5 px-3 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-xs transition active:scale-95 bg-slate-950 border-slate-800 text-slate-400";
  } else {
    btnPeugeot.className = "py-2.5 px-3 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-xs transition active:scale-95 bg-slate-950 border-blue-500 text-white shadow";
    btnTesla.className = "py-2.5 px-3 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-xs transition active:scale-95 bg-slate-950 border-slate-800 text-slate-400";
  }
  onEditTimeOrPercentChange();
}

function setEditPdC(pdc) {
  document.getElementById('editInputPdC').value = pdc;
  if (pdc === 'Home') {
    document.getElementById('editInputRatePerKwh').value = settings.homeRate;
  } else if (pdc === 'Port Mataró' || pdc === 'La Roca AC') {
    document.getElementById('editInputRatePerKwh').value = 0;
  } else if (pdc === 'Supercharger') {
    document.getElementById('editInputRatePerKwh').value = 0.42;
  }
  onEditPriceRateChange();
}

function onEditTimeOrPercentChange() {
  const start = document.getElementById('editInputStartTime').value;
  const end = document.getElementById('editInputEndTime').value;
  const mins = calculateDurationMinutes(start, end);

  const h = Math.floor(mins / 60);
  const m = mins % 60;
  document.getElementById('editCalcDuration').innerText = `Temps: ${mins} min (${h}h ${m < 10 ? '0' : ''}${m}m)`;

  const kwh = parseFloat(document.getElementById('editInputKwh').value) || 0;
  if (mins > 0 && kwh > 0) {
    const avgKw = (kwh / (mins / 60)).toFixed(1);
    document.getElementById('editCalcAvgKw').innerText = `Potència mitjana: ${avgKw.replace('.', ',')} kW`;
  } else {
    document.getElementById('editCalcAvgKw').innerText = `Potència mitjana: -- kW`;
  }
}

function onEditBatteryPercentInput() {
  const pIn = parseFloat(document.getElementById('editPercentIn').value);
  const pFi = parseFloat(document.getElementById('editPercentFi').value);
  const displayDif = document.getElementById('editDisplayPercentDif');
  const car = document.getElementById('editInputCotxe').value || 'Tesla';

  if (!isNaN(pIn) && !isNaN(pFi) && pFi >= pIn) {
    const diff = pFi - pIn;
    displayDif.innerText = `+${diff}%`;

    const capacity = BATTERY_CAPACITY[car] || 60.0;
    const estimatedKwh = (diff / 100) * capacity;
    const roundedKwh = Math.round(estimatedKwh * 10) / 10;
    document.getElementById('editInputKwh').value = (diff === 23 && car === 'Tesla') ? 14 : roundedKwh;

    onEditManualKwhChange();
  } else {
    displayDif.innerText = '--%';
  }
}

function onEditManualKwhChange() {
  const kwh = parseFloat(document.getElementById('editInputKwh').value) || 0;
  const rate = parseFloat(document.getElementById('editInputRatePerKwh').value) || 0;
  const costInput = document.getElementById('editInputTotalCost');
  const totalCost = kwh * rate;
  costInput.value = totalCost.toFixed(2);
  onEditTimeOrPercentChange();
}

function onEditPriceRateChange() {
  onEditManualKwhChange();
}

function onEditTotalCostManualChange() {
  const totalCost = parseFloat(document.getElementById('editInputTotalCost').value) || 0;
  const kwh = parseFloat(document.getElementById('editInputKwh').value) || 0;
  if (kwh > 0 && totalCost >= 0) {
    const rate = totalCost / kwh;
    document.getElementById('editInputRatePerKwh').value = rate.toFixed(4);
  }
}

// Desar canvis del modal
async function handleEditFormSubmit(e) {
  e.preventDefault();
  const editSubmitBtn = document.getElementById('editSubmitBtn');
  editSubmitBtn.disabled = true;

  const id = document.getElementById('editChargeId').value;
  const rowNumber = parseInt(document.getElementById('editRowNumber').value, 10) || null;
  const oldHoraInici = document.getElementById('editOldHoraInici').value;
  const car = document.getElementById('editInputCotxe').value || 'Tesla';
  const pdc = document.getElementById('editInputPdC').value.trim() || 'Home';
  const rawDate = document.getElementById('editInputDate').value;
  const diaFormatted = formatInputDateToDia(rawDate);

  const startTime = document.getElementById('editInputStartTime').value;
  const endTime = document.getElementById('editInputEndTime').value;
  const minutes = calculateDurationMinutes(startTime, endTime);

  const pInVal = document.getElementById('editPercentIn').value;
  const pFiVal = document.getElementById('editPercentFi').value;
  const percentIn = pInVal !== '' ? `${pInVal}%` : '0%';
  const percentFi = pFiVal !== '' ? `${pFiVal}%` : '0%';
  const diffVal = (pInVal !== '' && pFiVal !== '') ? (parseInt(pFiVal, 10) - parseInt(pInVal, 10)) : 0;
  const percentDif = `${diffVal}%`;

  const kwh = parseFloat(document.getElementById('editInputKwh').value) || 0;
  const avgKw = minutes > 0 ? (kwh / (minutes / 60)).toFixed(1).replace('.', ',') : '3,5';
  const ratePerKwh = parseFloat(document.getElementById('editInputRatePerKwh').value) || 0;
  const totalCost = parseFloat(document.getElementById('editInputTotalCost').value) || 0;

  const preuFormatted = `${ratePerKwh.toFixed(4).replace('.', ',')} €`;
  const costFormatted = `${totalCost.toFixed(2).replace('.', ',')} €`;
  const kmVal = document.getElementById('editInputKm').value ? parseInt(document.getElementById('editInputKm').value, 10) : '';

  const idx = charges.findIndex(c => c.id === id);
  if (idx === -1) {
    showToast('Error: no s\'ha trobat el registre per actualitzar', 'error');
    editSubmitBtn.disabled = false;
    return;
  }

  const updatedCharge = {
    ...charges[idx],
    Dia: diaFormatted,
    PdC: pdc,
    HoraInici: startTime + (startTime.split(':').length === 2 ? ':00' : ''),
    HoraFi: endTime + (endTime.split(':').length === 2 ? ':00' : ''),
    Temps: minutes,
    PercentIn: percentIn,
    PercentFi: percentFi,
    PercentDif: percentDif,
    Kwh: kwh,
    KwMijans: avgKw,
    Preu: preuFormatted,
    Cost: costFormatted,
    CostNum: totalCost,
    Cotxe: car,
    Km: kmVal,
    rowNumber: rowNumber,
    oldHoraInici: oldHoraInici,
    synced: false
  };

  charges[idx] = updatedCharge;

  if (kmVal) {
    updateLastKnownKmFromCharges();
  }

  saveChargesLocally();
  renderHistory();
  closeEditModal();
  showToast('✓ Registre actualitzat correctament!');

  const apiUrl = getApiUrl();
  if (apiUrl) {
    syncChargeUpdateToSheets(updatedCharge);
  }

  editSubmitBtn.disabled = false;
}

// Sincronitzar modificació amb Google Sheets
async function syncChargeUpdateToSheets(charge) {
  const apiUrl = getApiUrl();
  if (!apiUrl) return false;

  updateSyncStatus('Actualitzant al Google Sheet...');
  const payloadStr = JSON.stringify({
    action: 'updateRow',
    rowNumber: charge.rowNumber,
    charge: charge
  });

  let ok = false;
  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payloadStr
    });
    ok = true;
  } catch (err) {
    console.warn('POST ha fallat en actualitzar, utilitzant rescat GET...', err);
  }

  if (!ok) {
    ok = await sendViaGetRescue(apiUrl, 'updateRow', charge);
  }

  if (ok) {
    charge.synced = true;
    saveChargesLocally();
    renderHistory();
    updateSyncStatus('Google Sheet actualitzat');
    return true;
  } else {
    updateSyncStatus('Desat localment (actualització pendent)');
    return false;
  }
}

// Eliminar càrrega
function deleteCharge(id) {
  const charge = charges.find(c => c.id === id);
  if (!charge) return;

  const confirmMsg = `Vols eliminar la càrrega del ${charge.Dia} (${charge.Cotxe} • ${charge.Cost || charge.Kwh + ' kWh'})?`;
  if (confirm(confirmMsg)) {
    charges = charges.filter(c => c.id !== id);
    saveChargesLocally();
    renderHistory();
    showToast('Registre eliminat de l\'app');

    const apiUrl = getApiUrl();
    if (apiUrl && charge.rowNumber) {
      deleteSingleChargeFromSheets(charge);
    }
  }
}

// Eliminar fila a Google Sheets
async function deleteSingleChargeFromSheets(charge) {
  const apiUrl = getApiUrl();
  if (!apiUrl || !charge.rowNumber) return;

  try {
    updateSyncStatus('Eliminant fila del Google Sheet...');
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteRow',
        rowNumber: charge.rowNumber,
        charge: charge
      })
    });
    updateSyncStatus('Fila eliminada del Google Sheet');
  } catch (err) {
    console.warn('Error eliminant del full:', err);
  }
}

// Mecanisme de rescat GET / JSONP que mai falla per CORS o redirects als mòbils
function sendViaGetRescue(apiUrl, action, charge) {
  return new Promise((resolve) => {
    try {
      const cbName = 'rescueCb_' + Math.floor(Math.random() * 1000000);
      const script = document.createElement('script');
      let timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 8000);

      function cleanup() {
        if (timer) clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function(resp) {
        cleanup();
        if (resp && resp.status === 'success') {
          resolve(true);
        } else {
          resolve(false);
        }
      };

      script.onerror = function() {
        cleanup();
        resolve(false);
      };

      const sep = apiUrl.includes('?') ? '&' : '?';
      const encoded = encodeURIComponent(JSON.stringify(charge));
      const rowParam = charge.rowNumber ? `&rowNumber=${charge.rowNumber}` : '';
      script.src = `${apiUrl}${sep}action=${action}&payload=${encoded}${rowParam}&callback=${cbName}`;
      document.body.appendChild(script);
    } catch (e) {
      resolve(false);
    }
  });
}

// Forçar l'enviament de totes les càrregues guardades al mòbil pendents de sincronitzar
async function pushPendingCharges() {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    showToast('⚠️ Cal introduir la URL d\'Apps Script a Configuració primer!', 'warn');
    switchTab('settings');
    return;
  }

  const pending = charges.filter(c => c.synced === false);
  if (pending.length === 0) {
    showToast('Totes les càrregues ja estan sincronitzades!');
    return;
  }

  const btn = document.getElementById('btnPushPending');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Enviant...';
  }

  updateSyncStatus(`Enviant ${pending.length} càrregues pendents...`);
  let successCount = 0;

  for (const c of pending) {
    const success = await syncSingleChargeToSheets(c);
    if (success) successCount++;
  }

  saveChargesLocally();
  renderHistory();

  if (btn) {
    btn.disabled = false;
    btn.innerText = 'Enviar ara';
  }

  if (successCount > 0) {
    showToast(`✓ S'han afegit ${successCount} càrregues al Google Sheet!`);
    await reloadFromSheetCsv();
  } else {
    showToast('No s\'ha pogut connectar. Comprova la URL a Configuració', 'error');
  }
}
