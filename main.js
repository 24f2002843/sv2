// main.js
// Updated to use CIK = 0000002969 by default and to fetch via a proxy (AllOrigins by default).
// Put this file in your site; it will call the proxy which retrieves the SEC JSON.
// If you deploy a server-side proxy (recommended), replace PROXY_RAW with your proxy base.
//
// Important:
// - Browsers prevent setting 'User-Agent' from client JS. To comply with SEC UA recommendations, use a server-side proxy.
// - Do NOT set PROXY_RAW to a relative path on GitHub Pages unless you have server code there.

const defaultCIK = '0000002969'; // <-- requested default CIK

// Proxy base: by default use AllOrigins raw endpoint. Replace with your serverless proxy base if you have one.
// Example serverless proxy usage: 'https://my-proxy.example.com/fetch?url='
// AllOrigins raw returns the proxied resource directly, which is convenient for quick testing.
const PROXY_RAW = 'https://api.allorigins.win/raw?url=';
const FETCH_TIMEOUT_MS = 15000;

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function normalizeCIK(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.padStart(10, '0');
}

function buildSecUrl(paddedCik) {
  // SEC path expects "CIK" prefix (as used elsewhere in examples)
  return `https://data.sec.gov/api/xbrl/companyconcept/CIK${paddedCik}/dei/EntityCommonStockSharesOutstanding.json`;
}

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

async function fetchData(cik) {
  const padded = normalizeCIK(cik);
  const secUrl = buildSecUrl(padded);
  const proxyUrl = `${PROXY_RAW}${encodeURIComponent(secUrl)}`;

  try {
    // Note: do NOT attempt to set 'User-Agent' in browser JS; it's blocked by browsers.
    const resp = await fetchWithTimeout(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      // Try to get response text for debugging (e.g., GitHub Pages 404 HTML)
      const debugText = await resp.text().catch(() => '');
      throw new Error(`Proxy responded with ${resp.status} ${resp.statusText} - ${debugText}`);
    }

    // AllOrigins raw returns the resource directly; parse JSON
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

function parseYear(fyRaw) {
  if (fyRaw == null) return NaN;
  const s = String(fyRaw);
  const m = s.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : NaN;
}

function findSharesArray(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.units?.shares)) return data.units.shares;

  if (data.units && typeof data.units === 'object') {
    for (const key of Object.keys(data.units)) {
      const arr = data.units[key];
      if (Array.isArray(arr) && arr.some(e => e && ('fy' in e) && ('val' in e))) {
        return arr;
      }
    }
  }
  return [];
}

async function loadData(cik) {
  const data = await fetchData(cik);
  const entityEl = document.getElementById('entity-name');
  const errorEl = document.getElementById('error');

  if (!data) {
    if (entityEl) entityEl.textContent = 'Data not available';
    if (errorEl) errorEl.textContent = 'Unable to fetch data (see console)';
    return;
  }

  const entityName = data.entityName || data.EntityRegistrantName || 'Unknown Entity';
  document.title = entityName + ' Shares Volume';
  if (entityEl) entityEl.textContent = entityName;
  if (errorEl) errorEl.textContent = '';

  const shares = findSharesArray(data);
  const normalized = shares
    .map(s => {
      const fyNum = parseYear(s.fy);
      const valNum = (typeof s.val === 'number') ? s.val : (s.val != null ? Number(s.val) : NaN);
      return { raw: s, fyNum, valNum };
    })
    .filter(x => Number.isFinite(x.fyNum) && x.fyNum > 2020 && Number.isFinite(x.valNum));

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (txt === undefined || txt === null) ? '' : String(txt);
  };

  if (normalized.length === 0) {
    setText('share-max-value', 'N/A');
    setText('share-max-fy', '');
    setText('share-min-value', 'N/A');
    setText('share-min-fy', '');
    if (errorEl) errorEl.textContent = 'No share facts found for fy > 2020.';
    return;
  }

  let max = normalized[0];
  let min = normalized[0];
  for (const n of normalized) {
    if (n.valNum > max.valNum) max = n;
    if (n.valNum < min.valNum) min = n;
  }

  setText('share-max-value', max.valNum);
  setText('share-max-fy', max.raw.fy ?? String(max.fyNum));
  setText('share-min-value', min.valNum);
  setText('share-min-fy', min.raw.fy ?? String(min.fyNum));
}

async function init() {
  // Prefer query param 'CIK' or 'cik'; otherwise use default CIK (0000002969)
  const cikParam = getQueryParam('CIK') || getQueryParam('cik');
  const cik = cikParam || defaultCIK;
  await loadData(cik);
}

// Auto-run
init();
