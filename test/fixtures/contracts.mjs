// Shape contracts: the fields and invariants each page script relies on.
// They run against both the committed data and the synthetic fixtures, so the
// synthetic data cannot silently drift away from the real inputs.
import assert from 'node:assert/strict';

const finiteArray = (a, n, label) => {
  assert.ok(Array.isArray(a), `${label} must be an array`);
  if (n !== undefined) assert.equal(a.length, n, `${label} length`);
  for (const v of a) assert.ok(Number.isFinite(v), `${label} must contain finite numbers`);
};
const nullableArray = (a, n, label) => {
  assert.ok(Array.isArray(a) && a.length === n, `${label} length`);
  for (const v of a) assert.ok(v === null || Number.isFinite(v), `${label} must contain numbers or null`);
};
const quarterLabel = /^(Mar|Jun|Sep|Dec) \d{4}$/;

export function scenarios(d) {
  assert.ok(Array.isArray(d.quarters) && d.quarters.every(q => quarterLabel.test(q)), 'quarters');
  const n = d.quarters.length;
  assert.equal(d.published.length, n);
  assert.ok(Number.isInteger(d.shockStart) && d.shockStart >= 0 && d.shockStart < n);
  for (const k of ['vintage', 'forecastSource']) assert.equal(typeof d[k], 'string', k);
  // Default chart selection plus comparison and level-conversion variables.
  for (const k of ['RGDP', 'GDPPC', 'TMI', 'UR', 'CR', 'RHFCE', 'RDI', 'TWI', 'RMTPGDP'])
    assert.ok(d.baseline[k], `baseline.${k} is required by the page`);
  for (const [k, b] of Object.entries(d.baseline)) {
    for (const f of ['name', 'unit']) assert.equal(typeof b[f], 'string', `baseline.${k}.${f}`);
    nullableArray(b.values, n, `baseline.${k}.values`);
    assert.equal(typeof b.juneHistorical, 'boolean');
  }
  assert.deepEqual(d.models.map(m => m.id), ['martin', 'dsge']);
  const required = {martin: ['ncr', 'wpcom', 'rtwi', 'wy', 'ph'], dsge: ['eps_r', 'eps_p_star_z', 'eps_psi', 'eps_y_star']};
  for (const m of d.models) {
    for (const f of ['name', 'short', 'description']) assert.equal(typeof m[f], 'string', `${m.id}.${f}`);
    assert.equal(typeof m.mappingNotes, 'object');
    const ids = m.shocks.map(s => s.id);
    for (const id of required[m.id]) assert.ok(ids.includes(id), `${m.id} needs shock ${id}`);
    const covered = Object.keys(m.mapped[m.shocks[0].id]);
    for (const s of m.shocks) {
      for (const f of ['id', 'name', 'unit']) assert.equal(typeof s[f], 'string');
      assert.equal(typeof s.active, 'boolean');
      assert.ok(Number.isFinite(s.displayFactor) && s.displayFactor > 0, `${m.id}.${s.id}.displayFactor`);
      assert.deepEqual(Object.keys(m.mapped[s.id]).sort(), [...covered].sort(), `${m.id}.${s.id} covers the same variables`);
      for (const [k, a] of Object.entries(m.mapped[s.id])) {
        assert.ok(k in d.baseline, `${m.id}.${s.id}.${k} maps to a baseline variable`);
        finiteArray(a, undefined, `${m.id}.${s.id}.${k}`);
        assert.ok(a.length >= n - d.shockStart);
      }
    }
    for (const p of m.presets) {
      assert.ok(ids.includes(p.shock), `preset ${p.shock}`);
      assert.ok(Number.isFinite(p.amount));
    }
    for (const k of ['CR', 'TWI', 'RMTPGDP']) assert.ok(covered.includes(k), `${m.id} must map ${k} for model comparison`);
  }
}

export function history(h, data) {
  assert.equal(h.quarters.length, 2);
  assert.equal(h.quarters[1], data.quarters[0], 'history must end at the first forecast quarter');
  for (const [k, s] of Object.entries(h.series)) {
    nullableArray(s.values, 2, `history.${k}`);
    assert.equal(typeof s.source, 'string');
  }
}

export function chartReferences(c, data) {
  finiteArray(c.nairu.values, data.quarters.length, 'nairu.values');
  assert.equal(typeof c.nairu.source, 'string');
  const t = c.inflationTarget;
  assert.ok(t.lower < t.midpoint && t.midpoint < t.upper);
}

export function shockPaths(p, data) {
  for (const m of data.models) {
    const ids = m.shocks.map(s => s.id);
    for (const id of ids) {
      const e = p[m.id][id];
      assert.ok(e, `shock-paths.${m.id}.${id}`);
      if (e.forecast) { assert.ok(e.forecast in data.baseline, `forecast ${e.forecast}`); continue; }
      for (const f of ['name', 'unit']) assert.equal(typeof e[f], 'string');
      for (const other of ids) if (e.responses[other]) finiteArray(e.responses[other], undefined, `${m.id}.${id}.${other}`);
      assert.ok(e.responses[id], `${m.id}.${id} responds to itself`);
    }
  }
}

export function allIrfs(raw, model, explorerVariable) {
  assert.equal(typeof raw.units, 'string');
  assert.ok(raw.variables.includes(explorerVariable), `variables include ${explorerVariable}`);
  for (const s of raw.shocks) for (const f of ['id', 'name']) assert.equal(typeof s[f], 'string');
  for (const s of model.shocks) {
    assert.ok(raw.responses[s.id], `responses.${s.id}`);
    if (model.id === 'martin') for (const v of raw.variables) finiteArray(raw.responses[s.id][v], 40, `${s.id}.${v}`);
  }
}

export function policyData(d, dingo = false) {
  const n = d.quarters.length;
  assert.ok(d.quarters.every(q => quarterLabel.test(q)));
  for (const k of ['CR', 'TMI', 'UR']) finiteArray(d.baseline[k], n, `baseline.${k}`);
  assert.ok(Number.isFinite(d.targets.inflation) && Number.isFinite(d.targets.nairu));
  for (const k of ['TMI', 'UR']) {
    assert.equal(d.responses[k].length, n - 1);
    d.responses[k].forEach(row => finiteArray(row, n - 1, `responses.${k}`));
  }
  assert.equal(typeof d.sources.nairu, 'string');
  if (dingo) {
    assert.equal(d.model, 'dingo');
    assert.ok(Number.isFinite(d.calibration.okun));
  }
}

export function fiscal(f) {
  assert.equal(f.quarters.length, 40);
  assert.deepEqual(f.scenarios.map(s => s.component).sort(), ['gc', 'gc', 'gi', 'gi']);
  for (const s of f.scenarios) {
    assert.ok(['temporary', 'permanent'].includes(s.duration));
    for (const k of ['inflation', 'headline', 'cash', 'gdp', 'spending', 'componentPercent']) finiteArray(s[k], 40, `${s.id}.${k}`);
  }
}

export function cashRateHistory(c) {
  assert.ok(c.frames.length > 10);
  const h = c.horizons.length;
  for (const f of c.frames) {
    assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
    if (f.forward !== null) finiteArray(f.forward, h, 'forward');
  }
  assert.ok(c.frames.some(f => f.forward));
  for (const [date, v] of c.actual) { assert.match(date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(Number.isFinite(v)); }
}

export function fourier(f) {
  assert.ok(Array.isArray(f) && f.length >= 1);
  for (const c of f) {
    finiteArray(c.center, 2, 'center');
    assert.ok(c.terms.length >= 1000, 'the background draws 1000 terms');
    for (const t of c.terms) finiteArray(t, 3, 'term');
  }
}

// Validate a full set of data files, keyed by path relative to the site root.
export function validateAll(files) {
  const s = files['scenario-analysis/assets/scenarios.json'];
  scenarios(s);
  history(files['scenario-analysis/assets/history.json'], s);
  chartReferences(files['scenario-analysis/assets/chart-references.json'], s);
  shockPaths(files['scenario-analysis/assets/shock-paths.json'], s);
  allIrfs(files['scenario-analysis/assets/martin-all-irfs.json'], s.models[0], 'y');
  allIrfs(files['scenario-analysis/assets/dsge-all-irfs.json'], s.models[1], 'y_va');
  policyData(files['optimal-policy/assets/policy-data.json']);
  policyData(files['optimal-policy/assets/dingo-policy-data.json'], true);
  fiscal(files['fiscal-policy/assets/responses.json']);
  cashRateHistory(files['assets/cash-rate-history.json']);
  fourier(files['assets/fourier-australia.json']);
}
