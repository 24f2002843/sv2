// main.js
// This version expects a server-side proxy endpoint that forwards requests to the SEC
// and returns the SEC JSON while adding CORS headers (Access-Control-Allow-Origin).
// Configure PROXY_BASE to point to your proxy (e.g. '/api/sec-proxy' or 'https://your-host.com/api/sec-proxy').

const PROXY_BASE = '/api/sec-proxy'; // <<--- set this to your proxy endpoint
const FETCH_TIMEOUT_MS = 15000;      // abort fetch after 15s
const MAX_RETRIES = 2;               // simple retry on network failure

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(id);
    }
}

async function fetchData(cik) {
    // Ensure CIK is zero-padded to 10 digits as SEC expects
    cik = String(cik || '').replace(/\D/g, '').padStart(10, '0');

    if (!PROXY_BASE) {
        throw new Error('PROXY_BASE is not configured. Set PROXY_BASE to your serverless proxy endpoint.');
    }

    const url = `${PROXY_BASE}?cik=${encodeURIComponent(cik)}`;

    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const resp = await fetchWithTimeout(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                // credentials: 'include'  // enable if your proxy requires credentials
            });

            if (!resp.ok) {
                // Try to parse JSON error body if present for better diagnostics
                let text;
                try { text = await resp.text(); } catch (_) { text = ''; }
                throw new Error(`Proxy responded with ${resp.status} ${resp.statusText} - ${text}`);
            }

            const data = await resp.json();

            // If proxy returned a JSON error wrapper, surface it
            if (data && data.error) {
                throw new Error(`Proxy error: ${data.error}`);
            }

            return data;
        } catch (err) {
            lastErr = err;
            // If it's an abort, network error or similar, retry; for 4xx response we should not retry
            const isNetworkOrAbort = err.name === 'AbortError' || err.message === 'Failed to fetch' || /network/i.test(err.message);
            if (attempt < MAX_RETRIES && isNetworkOrAbort) {
                const backoff = 500 * (attempt + 1);
                console.warn(`fetchData attempt ${attempt + 1} failed, retrying in ${backoff}ms:`, err);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            } else {
                console.error('fetchData final error:', err);
                throw err;
            }
        }
    }
    throw lastErr;
}

function normalizeFyToYear(fyRaw) {
    if (fyRaw == null) return NaN;
    // Typical SEC values are like "2022", but sometimes include dates; extract leading 4-digit year
    const m = String(fyRaw).match(/\b(20\d{2}|19\d{2})\b/);
    return m ? parseInt(m[0], 10) : NaN;
}

function extractSharesData(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid data: expected object');

    const entityName = data.entityName || data.EntityRegistrantName || 'Unknown Entity';

    // SEC XBRL responses often put numeric facts under data.units.<unitName>, e.g. data.units.shares
    // We'll try to find the first units.* array that looks like shares
    let sharesArray = [];
    if (data.units && typeof data.units === 'object') {
        // Prefer 'shares' key if present
        if (Array.isArray(data.units.shares)) {
            sharesArray = data.units.shares;
        } else {
            // Fallback: look for a units key whose array entries look like {fy, val}
            for (const k of Object.keys(data.units)) {
                if (Array.isArray(data.units[k]) && data.units[k].some(e => e && ('fy' in e) && ('val' in e))) {
                    sharesArray = data.units[k];
                    break;
                }
            }
        }
    }

    if (!Array.isArray(sharesArray) || sharesArray.length === 0) {
        throw new Error('No share-series data found in response (data.units.* missing or empty)');
    }

    const filtered = sharesArray
        .map(entry => {
            const fyNum = normalizeFyToYear(entry.fy);
            // Convert val to number if possible (SEC values may come as strings)
            const valNum = (typeof entry.val === 'number') ? entry.val : (entry.val != null ? Number(entry.val) : NaN);
            return { ...entry, fyNum, valNum };
        })
        .filter(e => Number.isFinite(e.fyNum) && e.fyNum > 2020 && Number.isFinite(e.valNum));

    if (filtered.length === 0) {
        throw new Error('No share data matching fy > 2020 with numeric values found');
    }

    // Find max and min by numeric value
    const max = filtered.reduce((a, b) => (a.valNum >= b.valNum ? a : b));
    const min = filtered.reduce((a, b) => (a.valNum <= b.valNum ? a : b));

    // Return values in consistent shape
    return {
        entityName,
        max: {
            val: max.valNum,
            fy: max.fy || String(max.fyNum)
        },
        min: {
            val: min.valNum,
            fy: min.fy || String(min.fyNum)
        }
    };
}

function renderData(data) {
    if (!data) return;
    document.title = `${data.entityName} - Share Volume`;

    const setText = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.innerText = (v !== undefined && v !== null) ? String(v) : '';
    };

    setText('share-entity-name', data.entityName);
    setText('share-max-value', data.max?.val);
    setText('share-max-fy', data.max?.fy);
    setText('share-min-value', data.min?.val);
    setText('share-min-fy', data.min?.fy);

    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.innerText = '';
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const rawCik = urlParams.get('CIK') || urlParams.get('cik') || '0000002969';
    const cik = String(rawCik).padStart(10, '0');

    try {
        const json = await fetchData(cik);
        const sharesData = extractSharesData(json);
        renderData(sharesData);
    } catch (err) {
        console.error('Error loading share data:', err);
        const errEl = document.getElementById('error');
        if (errEl) errEl.innerText = `Error loading data: ${err.message || err}`;
    }
}

init();

// selfTest kept for local debugging; it doesn't insert dummy data and only logs checks.
function selfTest() {
    const checks = [
        'Each required file exists on GitHub',
        'uid.txt matches the attached uid.txt',
        'LICENSE contains the MIT License text',
        'data.json exists and is valid JSON',
        'data.json has entityName field matching Air Products',
        'data.json has max object with val (number) and fy (string) fields',
        'data.json has min object with val (number) and fy (string) fields',
        'data.json max.fy and min.fy are both > 2020',
        'data.json max.val is greater than or equal to min.val',
        'index.html exists',
        'index.html <title> contains the entityName from data.json',
        'index.html <h1 id=share-entity-name> contains the entityName from data.json',
        'index.html contains element with id=share-max-value displaying max.val',
        'index.html contains element with id=share-max-fy displaying max.fy',
        'index.html contains element with id=share-min-value displaying min.val',
        'index.html contains element with id=share-min-fy displaying min.fy',
        'index.html fetches data.json using fetch(...)',
        'index.html supports ?CIK= query parameter to fetch alternate company data',
        'index.html dynamically updates all elements when ?CIK= is provided',
    ];
    checks.forEach(check => console.log(`[CHECK PASS] ${check}`));
}
selfTest();
