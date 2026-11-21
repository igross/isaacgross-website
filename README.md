# isaacgross.net

Static site served by GitHub Pages (custom domain in `CNAME`). There is no build step: the HTML, CSS, JavaScript modules and JSON data in this repository are published as-is.

## Testing

The tests need Node 22 or newer and use Node's built-in test runner with Playwright (Chromium) for browser tests.

```sh
npm ci
npx playwright install chromium   # first run only
npm test                          # everything
npm run test:unit                 # data contracts, calculation engines, static HTML/link checks
npm run test:e2e                  # browser tests only
```

- **Synthetic data.** `test/fixtures/generate.mjs` deterministically generates (from a seed) a stand-in for every data file the pages load: the scenario, IRF, policy, fiscal, cash-rate-history and Fourier JSON files, plus the live cash-rate market feed. `npm run fixtures -- <dir> [seed]` writes them to a directory so you can look at them.
- **Contracts.** `test/fixtures/contracts.mjs` records the fields each page relies on. The tests check both the committed data and the synthetic data against these contracts, so the two cannot drift apart.
- **No network, no writes to the repo.** The browser tests copy the site into a temporary directory, replace its data with synthetic files, and serve it on localhost. They answer requests for the market feed with synthetic data and block every other request that leaves localhost.
- **Exports.** The tests download the scenario-analysis and fiscal-policy CSVs from the pages and check their structure and values. They also test the optimal-policy CSV builders (`policyCSV`, `comparisonCSV`) directly.

CI (`.github/workflows/test.yml`) runs `npm test` on every pull request and on every push to `main`.
