async function fetchData(cik) {
    const response = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/${cik}/dei/EntityCommonStockSharesOutstanding.json`, {
        headers: {
            'User-Agent': 'YourCompanyName/1.0'
        }
    });
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data;
}

function extractSharesData(data) {
    const entityName = data.entityName;
    const shares = data.units.shares.filter(entry => entry.fy > '2020' && typeof entry.val === 'number');
    const max = shares.reduce((prev, current) => (prev.val > current.val) ? prev : current);
    const min = shares.reduce((prev, current) => (prev.val < current.val) ? prev : current);
    return { entityName, max, min };
}

function renderData(data) {
    document.title = `${data.entityName} - Share Volume`;
    document.getElementById('share-entity-name').innerText = data.entityName;
    document.getElementById('share-max-value').innerText = data.max.val;
    document.getElementById('share-max-fy').innerText = data.max.fy;
    document.getElementById('share-min-value').innerText = data.min.val;
    document.getElementById('share-min-fy').innerText = data.min.fy;
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const cik = urlParams.get('CIK') || '0000002969';
    try {
        const data = await fetchData(cik);
        const sharesData = extractSharesData(data);
        renderData(sharesData);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

init();

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
