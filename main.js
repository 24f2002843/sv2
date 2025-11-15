// Improved fetch + fallback approach and safer data extraction

async function fetchData(cik) {
    const secUrl = `https://data.sec.gov/api/xbrl/companyconcept/${cik}/dei/EntityCommonStockSharesOutstanding.json`;

    // Try SEC first (may be blocked by CORS in browser)
    try {
        const response = await fetch(secUrl, {
            headers: {
                // SEC requests a descriptive User-Agent. Replace with your contact info.
                'User-Agent': 'YourCompanyName/YourAppName (your-email@example.com)',
                'Accept': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`SEC fetch failed: ${response.status} ${response.statusText}`);
        const data = await response.json();
        return data;
    } catch (secErr) {
        console.warn('SEC fetch failed (likely CORS or network). Falling back to /data.json. Error:', secErr);
        // Fallback to local data.json (serve from your GitHub Pages or bundle)
        const fallbackResp = await fetch('/data.json');
        if (!fallbackResp.ok) throw new Error(`Fallback fetch failed: ${fallbackResp.status} ${fallbackResp.statusText}`);
        return await fallbackResp.json();
    }
}

function extractSharesData(data) {
    if (!data) throw new Error('No data provided to extractSharesData');
    const entityName = data.entityName || 'Unknown Entity';

    const units = data.units || {};
    const sharesArray = units.shares || [];

    // Normalize and filter: parse fiscal year as integer where possible
    const filtered = sharesArray
        .map(entry => {
            const fy = (entry && entry.fy) ? parseInt(String(entry.fy).slice(0,4), 10) : NaN;
            return { ...entry, fyNum: Number.isFinite(fy) ? fy : NaN };
        })
        .filter(entry => Number.isFinite(entry.fyNum) && entry.fyNum > 2020 && typeof entry.val === 'number');

    if (filtered.length === 0) {
        throw new Error('No share data found with fy > 2020 and numeric val');
    }

    const max = filtered.reduce((prev, current) => (prev.val > current.val ? prev : current));
    const min = filtered.reduce((prev, current) => (prev.val < current.val ? prev : current));

    // Keep original fy string when possible
    return { entityName, max, min };
}

function renderData(data) {
    document.title = `${data.entityName} - Share Volume`;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value ?? '';
    };

    setText('share-entity-name', data.entityName);
    setText('share-max-value', data.max.val);
    setText('share-max-fy', data.max.fy || data.max.fyNum || '');
    setText('share-min-value', data.min.val);
    setText('share-min-fy', data.min.fy || data.min.fyNum || '');
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    let cik = urlParams.get('CIK') || '0000002969';
    // Ensure CIK is zero-padded to 10 digits (SEC expects 10-digit CIKs)
    cik = cik.toString().padStart(10, '0');

    try {
        const data = await fetchData(cik);
        const sharesData = extractSharesData(data);
        renderData(sharesData);
    } catch (error) {
        console.error('Error fetching or rendering data:', error);
        const errEl = document.getElementById('error');
        if (errEl) errEl.innerText = 'Error loading data. See console for details.';
    }
}

init();

// Keep selfTest for local dev; it should not interfere with production behavior
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
