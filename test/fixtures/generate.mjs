// Seeded, deterministic synthetic stand-ins for every data input the site reads.
//
// The committed JSON under assets/ was produced offline from RBA, ABS, MARTIN and
// DINGO sources; the optimal-policy page also fetches a live market feed from
// GitHub. The tests never touch those: they build a copy of the site in a
// temporary directory, overwrite every data file with the output of
// syntheticFiles(), and intercept the market-feed request with syntheticMarket().
//
// Usage: node test/fixtures/generate.mjs <output-dir> [seed]
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEFAULT_SEED = 20261121;
export const MARKET_URL = 'https://raw.githubusercontent.com/igross/cash-rate-forecasts/main/docs/data/cash-rate-latest.json';

// mulberry32: small, fast and fully deterministic for a given seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round = (v, d = 6) => Number(v.toFixed(d));
const sig = v => Number(v.toPrecision(8));
export function quarterLabels(year, monthIndex, n) {
  return Array.from({length: n}, (_, i) => {
    const m = monthIndex + 3 * i;
    return `${MONTHS[m % 12]} ${year + Math.floor(m / 12)}`;
  });
}

// Forecast horizon matching the August 2026 SMP layout: Jun 2026 … Dec 2028.
const QUARTERS = quarterLabels(2026, 5, 11);
const PUBLISHED = QUARTERS.map((_, i) => i % 2 === 0);
const HISTORY_QUARTERS = ['Mar 2026', 'Jun 2026'];

// key, name, unit, centre, spread, juneHistorical, decimals
const VARIABLES = [
  ['RGDP', 'Gross domestic product', 'Year-ended growth (%)', 2, 1.2, false, 2],
  ['GDPPC', 'GDP per capita', 'Year-ended growth (%)', .5, 1, false, 2],
  ['RHFCE', 'Household consumption', 'Year-ended growth (%)', 2, 1.4, false, 2],
  ['RDI', 'Dwelling investment', 'Year-ended growth (%)', 1, 4, false, 2],
  ['RBI', 'Business investment', 'Year-ended growth (%)', 3, 3, false, 2],
  ['RPD', 'Public demand', 'Year-ended growth (%)', 3.5, 1.5, false, 2],
  ['RMTPGDP', 'Major trading partner (export-weighted) GDP', 'Year-ended growth (%)', 3.5, .8, false, 2],
  ['Emp', 'Employment', 'Year-ended growth (%)', 1.8, .8, true, 2],
  ['UR', 'Unemployment rate (quarterly, %)', 'Per cent', 4.4, .4, true, 2],
  ['CPI', 'Consumer Price Index', 'Year-ended growth (%)', 3, 1, true, 2],
  ['TMI', 'Trimmed mean inflation', 'Year-ended growth (%)', 3, .8, true, 2],
  ['CR', 'Cash rate (%)', 'Per cent', 4.3, .4, true, 2],
  ['TWI', 'Trade-weighted index', 'Index', 62, 3, false, 1],
  ['Crude', 'Brent crude oil prices', 'US$ per barrel', 70, 8, false, 1],
  ['HSR', 'Household saving ratio', 'Per cent', 5, 1.5, false, 1],
];

function walk(r, n, centre, spread, decimals) {
  let v = centre + (r() - .5) * spread;
  return Array.from({length: n}, () => {
    const out = round(v, decimals);
    v += (r() - .5) * spread * .25;
    return out;
  });
}
// A hump-shaped impulse response: impact, then a decaying hump.
function irf(r, n, impact, {hump = (r() - .5) * 2 * Math.abs(impact || .2), decay = 2 + 8 * r()} = {}) {
  return Array.from({length: n}, (_, h) => sig(impact * Math.exp(-h / decay) + hump * (h / decay) * Math.exp(1 - h / decay)));
}

const MARTIN_SHOCKS = [
  // id, name, unit, displayFactor, active, forecast variable shown automatically
  ['ncr', 'Monetary policy', 'percentage points', .389, true, 'CR'],
  ['wpcom', 'Commodity prices', '%', 6.22, true, null],
  ['rtwi', 'Exchange rate', '%', 3.53, true, 'TWI'],
  ['wy', 'Foreign demand', '%', .569, true, 'RMTPGDP'],
  ['ph', 'Housing prices', '%', 1.105, true, null],
  ['lhpp', 'Average hours worked', '%', .776, true, null],
  ['tdlla', 'Trend productivity growth', 'percentage points', .0137, true, null],
  ['ptm', 'Trimmed mean prices', '%', .21, true, 'TMI'],
  ['cash_rate_4q', 'Cash rate held higher for one year', 'percentage points', 1, true, 'CR'],
  ['pmeas', 'Measurement error (inactive)', '%', 1, false, null],
];
const DSGE_SHOCKS = [
  ['eps_r', 'Monetary policy', 'percentage points', 3.825, true, 'CR'],
  ['eps_p_star_z', 'Commodity prices', '%', 6.31, true, null],
  ['eps_psi', 'Exchange rate', '%', 5.41, true, 'TWI'],
  ['eps_y_star', 'Foreign demand', '%', .997, true, 'RMTPGDP'],
  ['eps_g', 'Government demand', '%', 1.21, true, 'RPD'],
  ['eps_mu', 'Trend productivity', 'percentage points', .126, true, null],
  ['eps_a', 'Stationary technology (inactive)', '%', 1, false, null],
];
// Variables each model does not cover, so "variable not modeled" paths run.
const UNMAPPED = {martin: ['HSR'], dsge: ['UR', 'Emp', 'CPI', 'Crude', 'HSR']};

function model(r, id, specs, baselineKeys) {
  const shocks = specs.map(([sid, name, unit, displayFactor, active]) => ({
    id: sid, name, unit, active, sd: round(displayFactor / (unit === '%' ? 100 : 1), 10), measurement: false,
    sourceUnit: 'standard deviations', displayFactor,
    sizeDescription: sid.includes('4q') ? 'Initial quarterly change in the cash rate, held for four quarters.' : `Initial change in ${name.toLowerCase()}.`,
  }));
  const covered = baselineKeys.filter(k => !UNMAPPED[id].includes(k));
  const mapped = {};
  for (const [sid, , , displayFactor, , own] of specs) {
    mapped[sid] = {};
    for (const key of covered) {
      // A shock's own forecast variable responds by about its display size on impact.
      const impact = key === own ? displayFactor * (key === 'TWI' ? 1.5 : 1) : (r() - .5) * .3;
      mapped[sid][key] = irf(r, 40, impact);
    }
  }
  const presets = id === 'martin'
    ? [['Cash rate +1 percentage point', 'ncr', 1 / .389], ['Commodity prices +10%', 'wpcom', 10 / 6.22], ['Housing prices fall 5%', 'ph', -5 / 1.105], ['Cash rate +1 point for a year', 'cash_rate_4q', 1]]
    : [['Cash rate +1 percentage point', 'eps_r', 1 / 3.825], ['Commodity prices +10%', 'eps_p_star_z', 10 / 6.31], ['Dollar appreciates 10%', 'eps_psi', 10 / 5.41]];
  return {
    id, name: id === 'martin' ? 'MARTIN · synthetic' : 'DINGO · synthetic', short: id === 'martin' ? 'MARTIN' : 'DINGO',
    description: `Synthetic ${id} response matrix for automated tests.`,
    shocks, mapped,
    mappingNotes: Object.fromEntries(covered.slice(0, 3).map(k => [k, `Synthetic mapping note for ${k}.`])),
    presets: presets.map(([name, shock, amount]) => ({name, shock, amount})),
  };
}

function scenarios(r) {
  const baseline = Object.fromEntries(VARIABLES.map(([key, name, unit, centre, spread, juneHistorical, d]) => {
    let values = walk(r, QUARTERS.length, centre, spread, d);
    if (key === 'CR') values = values.map(v => round(Math.round(v * 20) / 20, 2));
    return [key, {name, definition: `Synthetic definition of ${name.toLowerCase()}.`, unit, values, juneHistorical}];
  }));
  const keys = Object.keys(baseline);
  return {
    vintage: 'August 2026', finalised: '5 August 2026', release: '11 August 2026', retrieved: '25 September 2026',
    quarters: QUARTERS, published: PUBLISHED, shockStart: 1,
    forecastSource: 'https://www.rba.gov.au/publications/smp/2026/aug/outlook.html',
    baseline,
    models: [model(r, 'martin', MARTIN_SHOCKS, keys), model(r, 'dsge', DSGE_SHOCKS, keys)],
  };
}

function history(r, data) {
  const series = {};
  for (const [key, b] of Object.entries(data.baseline)) {
    if (key === 'HSR') continue; // a series absent from history entirely
    const missing = key === 'Crude' ? [null, null] : key === 'RMTPGDP' ? [null, b.values[0]] : null;
    series[key] = {
      values: missing || [round(b.values[0] + (r() - .5) * .4, 2), round(b.values[0], 2)],
      source: 'https://www.rba.gov.au/statistics/tables/', series: b.name, method: 'quarter',
    };
  }
  return {quarters: HISTORY_QUARTERS, retrieved: '2026-09-27', series};
}

function shockPaths(r, data) {
  const out = {};
  for (const [id, specs] of [['martin', MARTIN_SHOCKS], ['dsge', DSGE_SHOCKS]]) {
    out[id] = {};
    for (const [sid, name, unit, , , forecast] of specs) {
      out[id][sid] = forecast ? {forecast} : {
        name, unit, variable: sid,
        responses: Object.fromEntries(specs.map(([other, , , df]) => [other, irf(r, QUARTERS.length - 1, other === sid ? df : (r() - .5) * .2)])),
      };
    }
  }
  return out;
}

function allIrfs(r, model, extraVariables, label) {
  const variables = [...extraVariables, ...model.shocks.map(s => s.id)];
  return {
    model: label, units: 'Native variable units, absolute deviations from baseline',
    variables,
    shocks: model.shocks.map(({id, name, unit, active, sd, measurement}) => ({id, name, unit: 'standard deviations', active, sd, measurement})),
    responses: Object.fromEntries(model.shocks.map(s => [s.id, Object.fromEntries(variables.map(v => [v, irf(r, 40, (r() - .5) * .02)]))])),
  };
}

function chartReferences(r) {
  const values = QUARTERS.map((_, i) => round(4.6 + .02 * i + r() * .05, 6));
  return {
    nairu: {source: 'https://github.com/igross/nairu', commit: 'synthetic', sourceSha256: '0'.repeat(64), statistic: 'posterior median', sourceEnd: '2027 Q2', values, extrapolated: QUARTERS.map((_, i) => i > 4)},
    inflationTarget: {lower: 2, midpoint: 2.5, upper: 3, source: 'https://www.rba.gov.au/education/resources/explainers/inflation-target.html'},
  };
}

// Lower-triangular horizon-specific responses: rate rises lower inflation and raise unemployment.
function responseMatrix(r, n, sign, scale) {
  return Array.from({length: n}, (_, t) => Array.from({length: n}, (_, s) => s > t ? 0 : sig(sign * scale * (t - s + 1) * Math.exp(-(t - s) / 3) * (.8 + .4 * r()))));
}
function policyData(r, dingo) {
  const n = QUARTERS.length - 1;
  const CR = walk(r, QUARTERS.length, 4.3, .3, 2).map(v => round(Math.round(v * 20) / 20, 2));
  const data = {
    vintage: 'August 2026', quarters: QUARTERS, published: PUBLISHED, start: 1,
    baseline: {CR, TMI: walk(r, QUARTERS.length, 3.2, .5, 2), UR: walk(r, QUARTERS.length, 4.4, .3, 2)},
    targets: {inflation: 2.5, nairu: round(4.6 + r() * .4, 6)},
    responses: {TMI: responseMatrix(r, n, -1, .04), UR: responseMatrix(r, n, 1, .03)},
    sources: {forecast: 'https://www.rba.gov.au/publications/smp/2026/aug/outlook.html', model: 'https://www.rba.gov.au/publications/rdp/2019/2019-07/', paper: 'https://doi.org/10.1111/1475-4932.12689', nairu: 'https://github.com/igross/nairu'},
    method: 'Synthetic horizon-specific response matrices for automated tests.',
    sourceSha256: '0'.repeat(64),
  };
  if (!dingo) return data;
  data.responses.OUTPUT_GAP = data.responses.UR.map(row => row.map(v => sig(-v / .8)));
  data.sources.okun = 'https://www.rba.gov.au/publications/bulletin/';
  return {
    ...data, model: 'dingo', modelName: 'DINGO',
    policyIRFs: Object.fromEntries(['CR', 'OUTPUT_GAP', 'TMI', 'UR'].map(k => [k, irf(r, 40, k === 'CR' ? 1 : (r() - .5) * .2)])),
    shockFromRates: responseMatrix(r, n, 1, .3),
    calibration: {okun: .8, source: 'https://www.rba.gov.au/publications/bulletin/', description: 'Change in unemployment gap (pp) = -0.8 × change in output-gap proxy (%).'},
  };
}

function fiscal(r) {
  const scenarios = [];
  for (const [component, name] of [['gc', 'Consumption'], ['gi', 'Investment']]) {
    for (const duration of ['temporary', 'permanent']) {
      const on = q => duration === 'permanent' || q < 4;
      const series = scale => Array.from({length: 40}, (_, q) => sig(scale * (on(q) ? 1 - Math.exp(-(q + 1) / 3) : Math.exp(-(q - 3) / 4)) * (.9 + .2 * r())));
      scenarios.push({
        id: `${component}_${duration}`, component, duration,
        label: `${name} · ${duration === 'temporary' ? 'one year' : 'permanent'}`,
        inflation: series(.08), headline: series(.1), cash: series(.12), gdp: series(.6),
        spending: Array.from({length: 40}, (_, q) => on(q) ? 1 : 0), componentPercent: Array.from({length: 40}, (_, q) => on(q) ? 5.2 : 0),
      });
    }
  }
  return {
    model: 'Synthetic MARTIN fiscal responses', source_sha256: '0'.repeat(64), baseline: 'Synthetic trajectory',
    unit: 'Responses to extra real spending of 1% of baseline GDP', quarters: Array.from({length: 40}, (_, i) => i + 1), scenarios,
  };
}

function cashRateHistory(r) {
  const horizons = Array.from({length: 41}, (_, i) => i / 4);
  const frames = [], actual = [];
  let rate = 5, day = Date.UTC(2000, 0, 4);
  const end = Date.UTC(2026, 7, 31);
  for (let i = 0; day <= end; i++, day += 7 * 86400000) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (i % 6 === 0) {
      const next = Math.max(.1, Math.min(7.5, rate + (Math.round((r() - .5) * 3) * .25)));
      if (next !== rate || !actual.length) actual.push([date, (rate = next)]);
    }
    const slope = (r() - .5) * .4;
    frames.push({date, forward: i < 60 ? null : horizons.map(h => round(Math.max(0, rate + slope * h * Math.exp(-h / 4)), 4)), target: rate});
  }
  return {
    frames, actual, horizons,
    sources: [{file: 'synthetic.xls', bytes: 1, sha256: '0'.repeat(64), first: frames[0].date, last: frames.at(-1).date}],
    units: 'Per cent per annum', note: 'Synthetic cash-rate history for automated tests.',
  };
}

function fourier(r) {
  // Two closed outlines (mainland and an island), ordered k = 1, -1, 2, -2, …
  return [[[-.006, -.041], .18], [[.05, .2], .02]].map(([center, size]) => ({
    center,
    terms: Array.from({length: 1000}, (_, i) => {
      const k = (i % 2 ? -1 : 1) * (Math.floor(i / 2) + 1);
      const mag = (i === 0 ? size : size * .1 / (Math.abs(k) ** 1.6)) * (.5 + r());
      const phase = r() * 2 * Math.PI;
      return [k, sig(mag * Math.cos(phase)), sig(mag * Math.sin(phase))];
    }),
  }));
}

// Every runtime data file, keyed by its path relative to the site root.
export function syntheticFiles(seed = DEFAULT_SEED) {
  const r = rng(seed);
  const data = scenarios(r);
  return {
    'scenario-analysis/assets/scenarios.json': data,
    'scenario-analysis/assets/history.json': history(r, data),
    'scenario-analysis/assets/chart-references.json': chartReferences(r),
    'scenario-analysis/assets/shock-paths.json': shockPaths(r, data),
    'scenario-analysis/assets/martin-all-irfs.json': allIrfs(r, data.models[0], ['y', 'rc', 'ib', 'pi_ptm', 'pi_p', 'lur'], 'Synthetic MARTIN'),
    'scenario-analysis/assets/dsge-all-irfs.json': allIrfs(r, data.models[1], ['y_va', 'c', 'inve', 'infl', 'r'], 'Synthetic DINGO'),
    'optimal-policy/assets/policy-data.json': policyData(r, false),
    'optimal-policy/assets/dingo-policy-data.json': policyData(r, true),
    'fiscal-policy/assets/responses.json': fiscal(r),
    'assets/cash-rate-history.json': cashRateHistory(r),
    'assets/fourier-australia.json': fourier(r),
  };
}

// The live futures-implied cash-rate feed fetched by optimal-policy.
export function syntheticMarket(seed = DEFAULT_SEED, quoteDate = '2026-09-24') {
  const r = rng(seed ^ 0x5eed);
  let rate = 4.3;
  const points = [];
  for (let m = 5; m <= 5 + 36; m++) {
    rate = Math.max(0, rate + (r() - .55) * .1);
    points.push({month: `${2026 + Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, '0')}`, ratePct: round(rate, 3)});
  }
  return {schemaVersion: 1, quoteDate, scrapedAt: `${quoteDate}T06:30:00Z`, points};
}

export function writeSyntheticFiles(root, seed = DEFAULT_SEED) {
  const files = syntheticFiles(seed);
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), {recursive: true});
    writeFileSync(join(root, path), JSON.stringify(value));
  }
  return Object.keys(files);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out, seed] = process.argv.slice(2);
  if (!out) { console.error('Usage: node test/fixtures/generate.mjs <output-dir> [seed]'); process.exit(2); }
  const written = writeSyntheticFiles(resolve(out), seed ? Number(seed) : DEFAULT_SEED);
  console.log(`Wrote ${written.length} synthetic data files to ${resolve(out)}`);
}
