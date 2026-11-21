// Build a throwaway copy of the site whose data files are all synthetic,
// and serve it locally. The committed site is never written to.
import {cpSync, mkdtempSync, rmSync, readFileSync, statSync, existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname, join, normalize, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {syntheticFiles, writeSyntheticFiles, DEFAULT_SEED} from '../fixtures/generate.mjs';

export const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SKIP = new Set(['.git', 'node_modules', 'test', '.github']);

export function buildSyntheticSite(seed = DEFAULT_SEED) {
  const root = mkdtempSync(join(tmpdir(), 'isaacgross-site-'));
  const synthetic = new Set(Object.keys(syntheticFiles(seed)).map(p => join(REPO, p)));
  cpSync(REPO, root, {
    recursive: true,
    // Real data files are replaced, so do not copy them at all.
    filter: src => !SKIP.has(src.slice(REPO.length + 1).split(sep)[0]) && !synthetic.has(src),
  });
  writeSyntheticFiles(root, seed);
  return {root, cleanup: () => rmSync(root, {recursive: true, force: true})};
}

const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
  '.xml': 'application/xml', '.txt': 'text/plain'};

// Mirrors GitHub Pages: directory URLs serve index.html, unknown paths serve 404.html.
export function resolveSitePath(root, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split(/[?#]/)[0])).replace(/^(\.\.(\/|\\|$))+/, '');
  let file = join(root, clean);
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export async function serve(root) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    const file = resolveSitePath(root, req.url);
    if (!file) {
      res.writeHead(404, {'content-type': TYPES['.html']});
      return res.end(readFileSync(join(root, '404.html')));
    }
    res.writeHead(200, {'content-type': TYPES[extname(file)] || 'application/octet-stream'});
    res.end(readFileSync(file));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return {url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(done => server.close(done))};
}

// RFC 4180 CSV parser; sections separated by blank lines stay as empty rows.
export function parseCSV(text) {
  const rows = [];let row = [], field = '', quoted = false, i = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') {
      if (field !== '') throw Error(`Stray quote at offset ${i}`);
      quoted = true;
    } else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else if (c === '\n') throw Error(`Bare LF at offset ${i}; expected CRLF`);
    else field += c;
  }
  if (quoted) throw Error('Unterminated quoted field');
  row.push(field); rows.push(row);
  return rows;
}

export function loadPlaywright() {
  // Resolved from local node_modules (CI) or a globally installed copy.
  return import('playwright').catch(async () => {
    const {createRequire} = await import('node:module');
    return createRequire(import.meta.url)('playwright');
  });
}
