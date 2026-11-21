// Unit tests for the pure calculation and CSV-export modules, fed synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticFiles, syntheticMarket} from './fixtures/generate.mjs';
import {parseCSV} from './helpers/site.mjs';
import {scenario, csv} from '../scenario-analysis/assets/scenario-engine.mjs';
import {fixedScales, axisTicks, scenarioDomain} from '../scenario-analysis/assets/scenario-scales.mjs';
import {comparison} from '../scenario-analysis/assets/model-comparison.mjs';
import {withHistory} from '../scenario-analysis/assets/scenario-history.mjs';
import {cashRateAxis} from '../scenario-analysis/assets/cash-rate-axis.mjs';
import {cashRateAxis as policyCashRateAxis} from '../optimal-policy/assets/cash-rate-axis.mjs';
import {DEFAULTS, validate, evaluate, feasible, optimizePath, simulateRule, optimizeRule, policyCSV} from '../optimal-policy/assets/policy-engine.mjs';
import {MARKET_URL, normalizeMarket, rateDecisions, moveLabel, bpLabel, transitionRates, comparisonCSV, withNairu} from '../optimal-policy/assets/policy-display.mjs';
import {MARKET_URL as FIXTURE_MARKET_URL} from './fixtures/generate.mjs';

const files = syntheticFiles();
const fresh = path => structuredClone(files[path]);
const scenarioData = () => withHistory(fresh('scenario-analysis/assets/scenarios.json'), fresh('scenario-analysis/assets/history.json'));
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), `${a} ≈ ${b}`);

test('withHistory prepends the March quarter and keeps shock timing', () => {
  const source = fresh('scenario-analysis/assets/scenarios.json'), data = scenarioData();
  assert.equal(data.quarters.length, source.quarters.length + 1);
  assert.equal(data.quarters[0], 'Mar 2026');
  assert.equal(data.shockStart, source.shockStart + 1);
  assert.equal(data.baseline.CR.observations[0], 'Actual');
  assert.equal(data.baseline.Crude.observations[0], 'Unavailable');
  assert.equal(data.baseline.Crude.historyMissing, true);
  assert.equal(data.baseline.HSR.values[0], null, 'series absent from history');
  assert.equal(source.baseline.CR.values.length, 11, 'source is not mutated');
  const misaligned = fresh('scenario-analysis/assets/history.json');misaligned.quarters = ['Dec 2025', 'Mar 2026'];
  assert.throws(() => withHistory(source, misaligned), /do not align/);
});

test('scenario engine: zero shock reproduces baseline; responses are linear', () => {
  const data = scenarioData();
  for (const model of data.models) {
    const none = scenario(data, model, {});
    for (const [key, s] of Object.entries(none)) {
      assert.equal(s.covered, key in model.mapped[model.shocks[0].id]);
      s.values.forEach((v, t) => { if (v !== null) close(v, data.baseline[key].values[t]); });
    }
    const id = model.presets[0].shock;
    const one = scenario(data, model, {[id]: 1}), two = scenario(data, model, {[id]: 2});
    for (const key of Object.keys(one)) one[key].delta.forEach((d, t) => {
      if (d === null) return assert.equal(two[key].delta[t], null);
      if (t < data.shockStart) assert.equal(d, 0);
      close(two[key].delta[t], 2 * d);
    });
    // Impact on the cash rate equals the mapped response at h = 0.
    if (one.CR.covered) close(one.CR.delta[data.shockStart], model.mapped[id].CR[0]);
    assert.throws(() => scenario(data, model, {not_a_shock: 1}), /Invalid shock/);
    assert.throws(() => scenario(data, model, {[id]: NaN}), /Invalid shock/);
  }
});

test('scenario engine converts index forecasts with a percentage change', () => {
  const data = scenarioData(), model = data.models[0];
  const r = scenario(data, model, {rtwi: 1}), t = data.shockStart;
  close(r.TWI.delta[t], data.baseline.TWI.values[t] * model.mapped.rtwi.TWI[0] / 100);
});

test('scenario CSV export is well formed and complete', () => {
  const data = scenarioData(), model = data.models[0], amounts = {ncr: 1 / .389, ph: -2};
  const result = scenario(data, model, amounts);
  const rows = parseCSV(csv(data, model, result, amounts));
  assert.deepEqual(rows[0], ['Model', model.name]);
  assert.deepEqual(rows[2], ['Shocks start', data.quarters[data.shockStart]]);
  const shocks = rows.filter(r => r[0] === 'Shock');
  assert.deepEqual(shocks.map(r => r[1]), ['ncr', 'ph']);
  close(Number(shocks[0][2]), 1, 1e-9);
  const header = rows.findIndex(r => r[0] === 'Variable');
  assert.deepEqual(rows[header], ['Variable', 'Unit', 'Quarter', 'Endpoint status', 'Baseline', 'Scenario', 'Difference', 'Response coverage']);
  const body = rows.slice(header + 1);
  assert.equal(body.length, Object.keys(data.baseline).length * data.quarters.length);
  for (const r of body) {
    assert.equal(r.length, 8);
    assert.ok(data.quarters.includes(r[2]));
    assert.ok(['Mapped', 'Unavailable'].includes(r[7]));
    for (const v of r.slice(4, 7)) assert.ok(v === '' || Number.isFinite(Number(v)), `numeric cell ${v}`);
  }
  assert.ok(body.some(r => r[3] === 'Actual') && body.some(r => r[3] === 'RBA forecast'));
  // Quotes inside names are escaped.
  data.baseline.CR.name = 'Cash "rate"';
  assert.ok(parseCSV(csv(data, model, scenario(data, model, amounts), amounts)).some(r => r[0] === 'Cash "rate"'));
});

test('fixed scales and tick helpers bound every preset scenario', () => {
  const data = scenarioData(), scales = fixedScales(data);
  for (const [key, [lo, hi]] of Object.entries(scales)) {
    assert.ok(lo < hi, key);
    for (const v of data.baseline[key].values.filter(Number.isFinite)) assert.ok(v >= lo && v <= hi, `${key} ${v} in [${lo}, ${hi}]`);
  }
  const ticks = axisTicks(-1.3, 2.7);
  assert.ok(ticks.length >= 3 && ticks.every((v, i) => !i || v > ticks[i - 1]));
  assert.ok(ticks[0] >= -1.3 && ticks.at(-1) <= 2.7);
  assert.deepEqual(scenarioDomain([0, 1], [.2, .8]), [0, 1]);
  const wide = scenarioDomain([0, 1], [-3, 5]);
  assert.ok(wide[0] <= -3 && wide[1] >= 5);
});

test('cash-rate axis uses the 0.10 + 0.25 lattice', () => {
  for (const axis of [cashRateAxis, policyCashRateAxis]) {
    const a = axis([3.6, 4.35, null]);
    assert.equal(a.step, .25);
    for (const t of a.ticks) close(((t - .1) / .25) % 1 === 0 ? 0 : Math.abs(Math.round((t - .1) / .25) - (t - .1) / .25), 0, 1e-6);
    assert.ok(a.lo < 3.6 && a.hi > 4.35);
    assert.ok(axis([4.35]).ticks.length >= 3);
    assert.throws(() => axis([NaN]), /finite/);
  }
});

test('model comparison maps shared shocks and refuses exclusive ones', () => {
  const data = scenarioData(), [martin, dsge] = data.models;
  const peer = comparison(data, martin, {ncr: 1});
  assert.equal(peer.model.id, 'dsge');
  close(peer.amounts.eps_r * dsge.mapped.eps_r.CR[0], martin.mapped.ncr.CR[0]);
  const commodity = comparison(data, martin, {wpcom: 1});
  close(commodity.amounts.eps_p_star_z * dsge.shocks.find(s => s.id === 'eps_p_star_z').displayFactor, martin.shocks.find(s => s.id === 'wpcom').displayFactor);
  assert.equal(comparison(data, dsge, {eps_psi: 1}).model.id, 'martin');
  assert.equal(comparison(data, martin, {ph: 1}), null);
  assert.equal(comparison(data, martin, {}), null);
});

for (const [name, file] of [['MARTIN', 'optimal-policy/assets/policy-data.json'], ['DINGO', 'optimal-policy/assets/dingo-policy-data.json']]) {
  test(`${name} policy optimisers improve on the baseline and respect constraints`, () => {
    const data = fresh(file), o = {...DEFAULTS};
    const baseline = evaluate(data, data.baseline.CR.slice(1), o);
    assert.deepEqual(baseline.TMI, data.baseline.TMI.map((v, t) => t ? baseline.TMI[t] : v));
    baseline.TMI.forEach((v, t) => close(v, data.baseline.TMI[t]));
    assert.equal(baseline.loss.length, data.quarters.length - 1);
    close(baseline.total, baseline.parts.inflation + baseline.parts.unemployment + baseline.parts.smoothing);
    const path = optimizePath(data, o);
    assert.ok(feasible(data, path.rates, o));
    assert.ok(path.total <= baseline.total + 1e-9, 'commitment path never loses to baseline');
    assert.ok(path.certificate < 1e-6);
    const rule = optimizeRule(data, o);
    assert.equal(rule.coefficients.length, 4);
    rule.coefficients.forEach((c, i) => assert.ok(c >= 0 && c <= (i ? 5 : 1)));
    assert.ok(rule.total >= path.total - 1e-6, 'a rule cannot beat the unconstrained commitment path');
    const sim = simulateRule(data, rule.coefficients, o);
    close(sim.total, rule.total);
    for (let t = 1; t < sim.CR.length; t++) assert.ok(Math.abs(sim.CR[t] - sim.CR[t - 1]) <= o.maxMove + 1e-9);
    // CSV exports.
    for (const result of [path, rule]) {
      const rows = parseCSV(policyCSV(data, result, o));
      const header = rows.findIndex(r => r[0] === 'Quarter');
      assert.equal(rows.length - header - 1, data.quarters.length);
      rows.slice(header + 1).forEach(r => assert.equal(r.length, rows[header].length));
      assert.equal(rows.some(r => r[0].startsWith('Rule coefficients')), result.method === 'rule');
    }
    const market = normalizeMarket(syntheticMarket(), data.quarters, Date.parse('2026-10-01'));
    const rows = parseCSV(comparisonCSV(data, {path, rule}, o, market));
    const header = rows.findIndex(r => r[0] === 'Quarter');
    assert.equal(rows[header].length, 20);
    assert.equal(rows.length - header - 1, data.quarters.length);
    assert.deepEqual(rows.find(r => r[0] === 'Market source'), ['Market source', MARKET_URL]);
    rows.slice(header + 1).forEach((r, t) => {
      assert.equal(r.length, 20);
      close(Number(r[2]), market.quarterly[t]);
      for (const v of r.slice(1)) assert.ok(v === '' || Number.isFinite(Number(v)), `numeric cell ${v}`);
    });
    assert.equal(parseCSV(comparisonCSV(data, {path, rule}, o, null)).find(r => r[0] === 'Market quote date')[1], 'Unavailable');
  });
}

test('policy settings validation', () => {
  const data = fresh('optimal-policy/assets/policy-data.json');
  assert.doesNotThrow(() => validate(DEFAULTS));
  for (const bad of [{inflation: NaN}, {inflation: 11}, {inflation: 0, unemployment: 0, smoothing: 0}, {minRate: 5, maxRate: 4}, {maxMove: .01}, {neutral: 5}])
    assert.throws(() => validate({...DEFAULTS, ...bad}));
  assert.throws(() => evaluate(data, [1, 2], DEFAULTS), /Invalid cash-rate path/);
  assert.throws(() => optimizePath(data, {...DEFAULTS, maxRate: .5, maxMove: .05}), /cannot be reached/);
  assert.equal(withNairu(data, 4.5).targets.nairu, 4.5);
  assert.notEqual(data.targets.nairu, 4.5, 'withNairu does not mutate');
  assert.throws(() => withNairu(data, 11));
});

test('market feed normalisation rejects malformed or future feeds', () => {
  const quarters = files['optimal-policy/assets/policy-data.json'].quarters, now = Date.parse('2026-10-01');
  assert.equal(FIXTURE_MARKET_URL, MARKET_URL, 'fixture intercepts the URL the page fetches');
  const ok = normalizeMarket(syntheticMarket(), quarters, now);
  assert.equal(ok.firstMonth, '2026-06');
  assert.ok(ok.points.every((p, i) => !i || p.serial > ok.points[i - 1].serial));
  const feed = () => structuredClone(syntheticMarket());
  const cases = [f => { f.schemaVersion = 2; }, f => { f.points = f.points.slice(0, 1); }, f => { f.quoteDate = '24/09/2026'; },
    f => { f.points[0].ratePct = 40; }, f => { f.points[1].month = f.points[0].month; }, f => { f.points[0].month = '2026-13'; }];
  for (const mutate of cases) { const f = feed(); mutate(f); assert.throws(() => normalizeMarket(f, quarters, now)); }
  assert.throws(() => normalizeMarket(syntheticMarket(undefined, '2027-01-01'), quarters, now), /Future-dated/);
  assert.throws(() => normalizeMarket(syntheticMarket(), ['Foo 2026'], now), /Invalid forecast date/);
});

test('rate decision labels and transitions', () => {
  assert.deepEqual(rateDecisions([4, 4.25, 4]).map(d => d && Math.round(d.bp)), [null, 25, -25]);
  assert.equal(moveLabel(0), 'Hold');assert.equal(moveLabel(50), '2.00 hikes');assert.equal(moveLabel(-12.5), '0.50 cuts');assert.equal(moveLabel(NaN), '—');
  assert.equal(bpLabel(0), '0');assert.equal(bpLabel(25), '+25.0');assert.equal(bpLabel(-0.01), '−<0.1');assert.equal(bpLabel(undefined), '—');
  assert.deepEqual(transitionRates([1, 1], [2, 3], 0, 'rule'), [1, 1]);
  assert.deepEqual(transitionRates([1, 1], [2, 3], 1, 'rule'), [2, 3]);
  assert.deepEqual(transitionRates([1, 1], [2, 3], .5, 'path'), [2, 1]);
});
