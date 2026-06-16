# Project Audit Report

Generated: 2026-06-16

## Scope

Audit covered:

- runtime/server errors
- security vulnerabilities
- performance and caching
- architecture and data integrity
- SEO metadata and crawlability
- search quality regression checks

## What I checked

- dependency audit with `npm audit --json`
- server syntax with `node --check`
- local HTTP headers and rendered HTML on `http://127.0.0.1:3220`
- dynamic `robots.txt` and `sitemap.xml`
- end-to-end search harness via `npm run audit:search`
- browser-side smoke check through the in-app browser

## Findings and fixes

### 1. Security

Issue:

- `Content-Security-Policy` was disabled.
- the app exposed static HTML with inline JSON-LD and no nonce.

Fix:

- enabled Helmet CSP with explicit directives
- added per-request CSP nonce
- blocked inline script attributes and object embeds
- kept fonts/images/styles compatible with the current UI

Files:

- [config/http.js](/Users/viktoria/Documents/New project 2/config/http.js)
- [server.js](/Users/viktoria/Documents/New project 2/server.js)
- [public/index.html](/Users/viktoria/Documents/New project 2/public/index.html)

### 2. Data integrity / pseudo-database

Issue:

- JSON persistence used direct `fs.writeFile(...)`.
- interrupted writes could corrupt watchlist/history/alerts/push subscriptions.

Fix:

- added atomic JSON writes through temp-file + rename
- moved low-level JSON storage helpers into a separate module

Files:

- [lib/json-store.js](/Users/viktoria/Documents/New project 2/lib/json-store.js)
- [server.js](/Users/viktoria/Documents/New project 2/server.js)

### 3. SEO

Issue:

- canonical URL, `og:url`, JSON-LD URL, `robots.txt`, and `sitemap.xml` were hardcoded to the Render domain
- no social preview image
- no site icon for browser/PWA surfaces

Fix:

- made canonical/OG/JSON-LD dynamic from `PUBLIC_BASE_URL` or request host
- added dynamic `robots.txt` and `sitemap.xml`
- added `og:image` and `twitter:image`
- added SVG favicon and manifest icon entry

Files:

- [public/index.html](/Users/viktoria/Documents/New project 2/public/index.html)
- [public/icon.svg](/Users/viktoria/Documents/New project 2/public/icon.svg)
- [public/manifest.webmanifest](/Users/viktoria/Documents/New project 2/public/manifest.webmanifest)
- [render.yaml](/Users/viktoria/Documents/New project 2/render.yaml)
- [README.md](/Users/viktoria/Documents/New project 2/README.md)

### 4. Performance

Issue:

- main HTML had to remain dynamic for SEO, but there was no safe strategy around it
- static middleware also eagerly owned `/`, `robots.txt`, and `sitemap.xml`

Fix:

- static serving now bypasses SEO-controlled endpoints
- dynamic HTML is cached in memory by template mtime
- immutable assets keep long-lived cache headers
- vendor bundle (`lucide.min.js`) now gets explicit caching too

Files:

- [config/http.js](/Users/viktoria/Documents/New project 2/config/http.js)
- [server.js](/Users/viktoria/Documents/New project 2/server.js)

### 5. Search quality audit

Issue:

- search harness judged only the top 10 results
- this was too weak for ticker/equities quality control

Fix:

- harness now evaluates the full returned result set for each case
- markdown report keeps the table compact by showing the first 15 judged rows only

Files:

- [scripts/search-harness.js](/Users/viktoria/Documents/New project 2/scripts/search-harness.js)
- [output/search-audit/latest.md](/Users/viktoria/Documents/New project 2/output/search-audit/latest.md)

## Verification results

### Security

- `npm audit`: 0 vulnerabilities
- CSP is now present on `/`

### Search harness

Results from [output/search-audit/latest.md](/Users/viktoria/Documents/New project 2/output/search-audit/latest.md):

- total cases: 18
- successful: 18
- failed: 0
- average full-set heuristic precision: 0.97
- ticker precision: 1.00 across both ticker cases
- commodity precision: 1.00
- world precision: 1.00
- custom precision: 0.91

### Browser smoke check

Confirmed locally:

- page loads
- search form is visible
- no console errors in smoke check
- dynamic canonical/OG tags work on a fresh uncached load

## Remaining architectural debt

These are not broken, but still worth planning:

1. [server.js](/Users/viktoria/Documents/New project 2/server.js) is still very large and should eventually be split into:
   - API routes
   - search providers
   - ranking/filtering
   - alert/push services
   - SEO/render helpers
2. [public/app.js](/Users/viktoria/Documents/New project 2/public/app.js) and [public/styles.css](/Users/viktoria/Documents/New project 2/public/styles.css) are still monolithic and would benefit from modularization.
3. There is still no automated unit/integration test suite beyond the search harness.

## Recommended next step

Next highest-value step: split the search pipeline into provider -> normalize -> rank -> strict-filter stages and add deterministic regression fixtures for `economy`, `gold`, and `AI chip export restrictions`.
