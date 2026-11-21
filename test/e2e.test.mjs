// End-to-end: serve a temporary copy of the site whose data files are all
// synthetic, drive every page in headless Chromium, intercept all network
// traffic leaving localhost, and verify the CSV exports the pages produce.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSyntheticSite, serve, parseCSV, loadPlaywright} from './helpers/site.mjs';
import {syntheticFiles, syntheticMarket, MARKET_URL} from './fixtures/generate.mjs';

const fixtures = syntheticFiles();
let site, server, browser;

before(async () => {
  site = buildSyntheticSite();
  server = await serve(site.root);
  const {chromium} = await loadPlaywright();
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
  site?.cleanup();
});

// Opens a page with network isolation and error capture.
async function open(path, {reducedMotion = 'no-preference'} = {}) {
  const context = await browser.newContext({acceptDownloads: true, reducedMotion, viewport: {width: 1280, height: 900}});
  const page = await context.newPage();
  const errors = [], external = [], failed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.url().startsWith(server.url) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(server.url)) return route.continue();
    if (url.split('?')[0] === MARKET_URL) return route.fulfill({json: syntheticMarket()});
    external.push(url);
    return route.abort();
  });
  const response = await page.goto(server.url + path, {waitUntil: 'load'});
  return {page, context, response, errors, external, failed};
}
async function downloadText(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return {name: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8')};
}

const STATIC_PAGES = ['/', '/research/', '/in-the-news/', '/teaching/', '/australian-economic-analysis/'];
for (const path of STATIC_PAGES) {
  test(`page ${path} renders without errors`, async () => {
    const {page, context, response, errors, failed} = await open(path);
    try {
      assert.equal(response.status(), 200);
      assert.ok((await page.title()).length > 0);
      assert.ok(await page.locator('main').count(), 'has a main landmark');
      // Decorative background loads the synthetic Fourier coefficients.
      await page.waitForResponse(r => r.url().includes('/assets/fourier-australia.json'), {timeout: 5000}).catch(() => {});
      assert.ok(server.requests.some(u => u.startsWith('/assets/fourier-australia.json')));
      // Every image on the page that is served locally actually decodes.
      const broken = await page.$$eval('img', imgs => imgs.filter(i => i.src.startsWith(location.origin) && i.complete && i.naturalWidth === 0).map(i => i.src));
      assert.deepEqual(broken, []);
      assert.deepEqual(failed, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('unknown paths serve the 404 page', async () => {
  const {page, context, response, errors} = await open('/no-such-page/');
  try {
    assert.equal(response.status(), 404);
    assert.match(await page.title(), /not found/i);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('old scenario review URL redirects to scenario analysis', async () => {
  const {page, context} = await open('/scenario-review-3439915c9fd78aa0/');
  try {
    await page.waitForURL(/\/scenario-analysis\/$/, {timeout: 5000});
  } finally { await context.close(); }
});

test('scenario analysis: presets, models, explorer and CSV export', async () => {
  const {page, context, errors, failed} = await open('/scenario-analysis/');
  const data = fixtures['scenario-analysis/assets/scenarios.json'];
  try {
    await page.locator('#application').waitFor({state: 'visible', timeout: 15000});
    assert.equal(await page.locator('#loading').isHidden(), true);
    assert.ok(await page.locator('#chart-grid article svg').count() >= 7, 'default charts render');
    assert.equal(await page.locator('#variable-options input').count(), Object.keys(data.baseline).length);

    // Every preset renders and produces a downloadable CSV.
    const presets = await page.locator('#presets button').count();
    assert.equal(presets, 4);
    for (let i = 0; i < presets; i++) {
      await page.locator('#presets button').nth(i).click();
      assert.equal(await page.locator('#shock-list .shock').count(), 1);
      const {name, text} = await downloadText(page, () => page.locator('#download').click());
      assert.match(name, /^australian-scenario-(martin|dsge)-aug2026\.csv$/);
      const rows = parseCSV(text);
      assert.equal(rows[0][0], 'Model');
      const models = rows.filter(r => r[0] === 'Model' && r[1] !== 'Shocked variable').map(r => r[1]);
      assert.ok(models.length >= 1 && models.every(m => data.models.some(x => x.name === m)));
      const headers = rows.map((r, j) => r[0] === 'Variable' ? j : -1).filter(j => j >= 0);
      assert.equal(headers.length, models.length, 'one result section per model');
      for (const h of headers) {
        const body = rows.slice(h + 1, h + 1 + Object.keys(data.baseline).length * (data.quarters.length + 1));
        assert.ok(body.every(r => r.length === 8), 'result rows have 8 columns');
        assert.ok(body.some(r => r[7] === 'Mapped' && r[6] !== '' && Number(r[6]) !== 0), 'shock moves at least one mapped variable');
      }
      // The commodity preset has a non-forecast shock path: its section follows.
      if (i === 1) {
        const shockHeader = rows.findIndex(r => r[0] === 'Model' && r[1] === 'Shocked variable');
        assert.ok(shockHeader > 0, 'shock-path section exported');
        assert.ok(rows.slice(shockHeader + 1).every(r => r.length === 5 && Number.isFinite(Number(r[4]))));
        assert.ok(new Set(rows.slice(shockHeader + 1).map(r => r[0])).size === 2, 'both models export the matched shock path');
      }
    }
    // The housing preset is MARTIN-only: no peer comparison section.
    await page.locator('#presets button').nth(2).click();
    assert.equal(await page.locator('#scenario-status').textContent(), 'MARTIN · selected shocks');

    // Switch to a DINGO-only shock; MARTIN-only variables become "not modeled".
    await page.locator('#reset').click();
    await page.locator('#shock-select').selectOption('dsge:eps_g');
    await page.locator('#add-shock').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.model), 'dsge');
    assert.ok(await page.locator('#chart-grid .unmodeled').count() >= 1);
    const dingo = parseCSV((await downloadText(page, () => page.locator('#download').click())).text);
    assert.deepEqual(dingo[0], ['Model', data.models[1].name]);

    // Invalid input disables the export.
    await page.locator('#amount-eps_g').fill('999');
    assert.equal(await page.locator('#download').isDisabled(), true);
    await page.locator('#amount-eps_g').fill('1');
    assert.equal(await page.locator('#download').isDisabled(), false);

    // Full-matrix explorer and the extra MARTIN variable chart load the synthetic IRFs.
    await page.locator('#explorer summary').click();
    await page.locator('#explorer-chart svg').waitFor({timeout: 10000});
    assert.equal(await page.locator('#explorer-shock').inputValue(), 'eps_r');
    await page.locator('#reset').click();
    await page.locator('#shock-select').selectOption('shared:ncr');
    await page.locator('#add-shock').click();
    await page.locator('#extra-martin-variable').selectOption('y');
    await page.locator('[data-extra-martin="y"] svg').waitFor();
    // "Show all" sits inside the collapsed variable picker.
    await page.locator('details:has(#all-variables) > summary').click();
    await page.locator('#all-variables').click();
    assert.equal(await page.locator('#variable-options input:checked').count(), Object.keys(data.baseline).length);
    assert.ok(await page.locator('#scenario-table tbody tr').count() > data.quarters.length);

    assert.deepEqual(failed, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('optimal policy: market feed, optimisers and both models', async () => {
  const {page, context, errors, failed, external} = await open('/optimal-policy/', {reducedMotion: 'reduce'});
  const data = fixtures['optimal-policy/assets/policy-data.json'];
  try {
    await page.locator('#policy-app').waitFor({state: 'visible', timeout: 15000});
    await page.waitForFunction(() => /Market path/.test(document.querySelector('#market-status').textContent), null, {timeout: 10000});
    assert.equal(external.filter(u => u.startsWith(MARKET_URL)).length, 0, 'market feed was intercepted, not fetched');
    assert.equal(await page.locator('#policy-charts article').count(), 4);
    assert.equal(await page.locator('#policy-table tbody tr').count(), data.quarters.length);
    for (const model of ['martin', 'dingo']) {
      await page.locator(`[data-model="${model}"]`).click();
      await page.locator('#optimize').click();
      await page.locator('#rule-results').waitFor({state: 'visible', timeout: 60000});
      await page.locator('#replay-policy').waitFor({state: 'visible'});
      assert.match(await page.locator('#policy-results-title').textContent(), new RegExp(model.toUpperCase()));
      assert.equal(await page.locator('#rule-coefficients b').count(), 4);
      const cells = await page.locator('#policy-table tbody tr').last().locator('td').allTextContents();
      assert.equal(cells.length, 13);
      assert.ok(cells.every(c => c === '—' || Number.isFinite(Number(c))), `table cells ${cells}`);
      assert.ok(cells.slice(2, 4).every(c => c !== '—'), 'optimised rates shown');
      assert.equal(await page.locator('#policy-error').isHidden(), true);
    }
    // Invalid settings are reported rather than crashing.
    await page.locator('#nairu-setting').fill('50');
    assert.equal(await page.locator('#policy-error').isVisible(), true);
    assert.deepEqual(failed, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('optimal policy falls back cleanly when the market feed is down', async () => {
  const context = await browser.newContext({reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => route.request().url().startsWith(server.url) ? route.continue() : route.fulfill({status: 503, body: ''}));
  try {
    await page.goto(server.url + '/optimal-policy/');
    await page.waitForFunction(() => /Market unavailable/.test(document.querySelector('#market-status').textContent), null, {timeout: 15000});
    assert.equal(await page.locator('#market-legend').isHidden(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('fiscal policy: charts, peaks table and CSV export', async () => {
  const {page, context, errors, failed} = await open('/fiscal-policy/');
  const data = fixtures['fiscal-policy/assets/responses.json'];
  try {
    await page.locator('#fiscal-download:not([disabled])').waitFor({state: 'attached', timeout: 15000});
    // The export button sits inside the collapsed "quarterly values" details.
    await page.locator('details:has(#fiscal-download) > summary').click();
    assert.equal(await page.locator('#fiscal-charts svg').count(), 4);
    assert.equal(await page.locator('#fiscal-peaks tr').count(), data.scenarios.length);
    for (const size of ['0.25', '-0.5']) {
      await page.locator('#fiscal-size').fill(size);
      const {name, text} = await downloadText(page, () => page.locator('#fiscal-download').click());
      assert.equal(name, 'martin-government-spending.csv');
      const [header, ...rows] = parseCSV(text);
      assert.deepEqual(header, ['scenario', 'quarter', 'extra_spending_percent_baseline_gdp', 'extra_spending_percent_component', 'trimmed_mean_inflation_pp', 'headline_cpi_inflation_pp', 'cash_rate_pp', 'real_gdp_percent']);
      assert.equal(rows.length, data.scenarios.length * 40);
      rows.forEach((r, i) => {
        const s = data.scenarios[Math.floor(i / 40)], t = i % 40;
        assert.equal(r[0], s.id);
        assert.equal(Number(r[1]), t + 1);
        ['spending', 'componentPercent', 'inflation', 'headline', 'cash', 'gdp'].forEach((k, j) =>
          assert.ok(Math.abs(Number(r[j + 2]) - s[k][t] * Number(size)) < 1e-12, `${s.id} ${k} q${t + 1}`));
      });
    }
    await page.locator('#fiscal-inflation').selectOption({index: 1});
    assert.equal(await page.locator('#fiscal-charts svg').count(), 4);
    assert.deepEqual(failed, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('synthetic site copy left the committed data untouched', () => {
  const real = JSON.parse(readFileSync(new URL('../fiscal-policy/assets/responses.json', import.meta.url)));
  assert.notEqual(real.model, fixtures['fiscal-policy/assets/responses.json'].model);
  assert.ok(site.root.includes('isaacgross-site-'));
});
