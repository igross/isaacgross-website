// Data contracts hold for the committed data and for the synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {syntheticFiles, syntheticMarket, DEFAULT_SEED} from './fixtures/generate.mjs';
import {validateAll} from './fixtures/contracts.mjs';
import {normalizeMarket} from '../optimal-policy/assets/policy-display.mjs';
import {REPO} from './helpers/site.mjs';

test('synthetic fixtures are deterministic for a seed', () => {
  assert.deepEqual(syntheticFiles(DEFAULT_SEED), syntheticFiles(DEFAULT_SEED));
  assert.notDeepEqual(syntheticFiles(1)['fiscal-policy/assets/responses.json'], syntheticFiles(2)['fiscal-policy/assets/responses.json']);
  assert.deepEqual(syntheticMarket(), syntheticMarket());
});

test('synthetic fixtures satisfy every data contract', () => {
  for (const seed of [DEFAULT_SEED, 1, 42]) validateAll(syntheticFiles(seed));
});

test('committed data satisfies the same contracts', () => {
  const real = Object.fromEntries(Object.keys(syntheticFiles()).map(p => [p, JSON.parse(readFileSync(join(REPO, p), 'utf8'))]));
  validateAll(real);
});

test('synthetic market feed passes the page validator', () => {
  const quarters = syntheticFiles()['optimal-policy/assets/policy-data.json'].quarters;
  const market = normalizeMarket(syntheticMarket(), quarters, Date.parse('2026-10-01'));
  assert.ok(market.points.length > 20);
  assert.equal(market.quarterly.length, quarters.length);
  assert.ok(market.quarterly.every(Number.isFinite), 'every forecast quarter has a market observation');
});
