// Static checks over every page: well-formed HTML, resolvable local links and assets, valid sitemap.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, dirname, posix} from 'node:path';
import {REPO, resolveSitePath} from './helpers/site.mjs';

const SKIP = new Set(['.git', 'node_modules', 'test']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(REPO);
const pages = files.filter(f => f.endsWith('.html'));
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Elements whose end tag HTML lets authors omit.
const OPTIONAL = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'optgroup', 'colgroup', 'caption']);

export function checkHTML(html) {
  const problems = [], stack = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>');
  for (const [, close, name] of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    const tag = name.toLowerCase();
    if (VOID.has(tag)) continue;
    if (!close) { stack.push(tag); continue; }
    while (stack.length && stack.at(-1) !== tag && OPTIONAL.has(stack.at(-1))) stack.pop();
    if (stack.at(-1) === tag) stack.pop(); else problems.push(`unexpected </${tag}> (open: ${stack.slice(-3).join(' > ')})`);
  }
  const left = stack.filter(t => !OPTIONAL.has(t) && !['html', 'head', 'body'].includes(t));
  if (left.length) problems.push(`unclosed: ${left.join(', ')}`);
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) problems.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);
  return problems;
}

for (const page of pages) {
  const rel = relative(REPO, page);
  const html = readFileSync(page, 'utf8');
  test(`${rel} is well-formed HTML`, () => {
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html[^>]*\slang="en(-AU)?"/);
    assert.match(html, /<meta charset="utf-8">/i);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.deepEqual(checkHTML(html), []);
  });
  test(`${rel} local links and assets resolve`, () => {
    const refs = [...html.matchAll(/\s(?:href|src|content)="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
      .filter(u => !/^(https?:|mailto:|tel:|data:|#|javascript:)/.test(u) && /^[./\w-]/.test(u) && !/[\s=;]/.test(u.split(/[?#]/)[0]))
      .filter(u => u.startsWith('/') || /\.\w+([?#]|$)|\/$/.test(u)); // skip meta content that is prose
    const base = '/' + posix.join(...dirname(rel).split(/[\\/]/).filter(s => s !== '.'), '/');
    assert.ok(refs.length > 0, "page references local assets");
    const missing = refs.filter(u => !resolveSitePath(REPO, u.startsWith('/') ? u : posix.join(base, u)));
    assert.deepEqual(missing, []);
    // In-page fragment links point at an element that exists.
    for (const [, frag] of html.matchAll(/href="#([^"]+)"/g)) assert.match(html, new RegExp(`id="${frag}"`), `#${frag}`);
  });
}

test('stylesheet url() references resolve', () => {
  for (const css of files.filter(f => f.endsWith('.css'))) {
    for (const [, u] of readFileSync(css, 'utf8').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (/^(data:|https?:|#)/.test(u)) continue;
      const path = u.startsWith('/') ? u : '/' + posix.join(relative(REPO, dirname(css)).split(/[\\/]/).join('/'), u);
      assert.ok(resolveSitePath(REPO, path), `${relative(REPO, css)}: ${u}`);
    }
  }
});

test('sitemap.xml lists existing pages and robots.txt points at it', () => {
  const xml = readFileSync(join(REPO, 'sitemap.xml'), 'utf8');
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /<\/urlset>\s*$/);
  assert.deepEqual(checkHTML(xml.replace(/^<\?xml[^>]*>/, '')), []);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.ok(locs.length >= 5);
  for (const loc of locs) {
    const url = new URL(loc);
    assert.equal(url.origin, 'https://' + readFileSync(join(REPO, 'CNAME'), 'utf8').trim());
    assert.ok(resolveSitePath(REPO, url.pathname), loc);
  }
  assert.match(readFileSync(join(REPO, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/isaacgross\.net\/sitemap\.xml/);
});

test('every committed JSON file parses', () => {
  for (const f of files.filter(f => f.endsWith('.json'))) assert.doesNotThrow(() => JSON.parse(readFileSync(f, 'utf8')), relative(REPO, f));
});
