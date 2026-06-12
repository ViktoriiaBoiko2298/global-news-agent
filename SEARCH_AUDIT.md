# Search Audit

## 1. What search modes exist now

The project currently has 4 search modes:

1. `world`
2. `ticker`
3. `commodity`
4. `custom`

Each mode builds a different request and then passes it through the same pipeline:

1. Build request object
2. Choose providers
3. Fetch raw articles
4. Soft-filter candidates
5. Deep-enrich top candidates with article content
6. Score and hard-filter articles
7. Deduplicate
8. Cluster similar stories
9. Return stats + briefing

## 2. Topics and presets

### World categories

Defined in `server.js`:

- `all` -> politics + ordinary
- `politics`
- `ordinary`
- `economy`
- `stocks`
- `crypto`
- `technology`

Each world category has:

- `label`
- `topics` for Google News topic RSS
- `query` for general providers
- `googleQuery` for Google News search

### Commodity categories

Defined in `server.js`:

- `copper`
- `gold`
- `silver`
- `oil`
- `gas`
- `wheat`
- `lithium`
- `uranium`

Each commodity has:

- preset query
- keyword list
- identity terms used for stronger matching

### Focus filters

Independent focus filter options:

- `all`
- `politics`
- `markets`
- `stocks`
- `crypto`
- `companies`
- `commodities`
- `tech`
- `science`

These do not create the query. They act as an extra filtering/ranking layer after fetch.

## 3. Sources

Available source presets:

- `auto`
- `google`
- `feeds`
- `stocktitan`
- `yahoo`
- `investing`
- `benzinga`
- `cnbc`
- `marketwatch`
- `nytimes`
- `npr`
- `fox`
- `gdelt`

### How provider planning works

- `gdelt` -> only GDELT
- `google` -> only Google News
- `auto` -> combined Google + RSS feeds, fallback to GDELT
- specific source -> only that RSS/provider

### Auto mode behavior

`auto` is not one source. It is a plan:

1. `fetchCombinedArticles(request)` -> Google + feeds
2. if needed, fallback to GDELT

### Market-driven routing

The system treats these as market-heavy requests:

- `ticker`
- `commodity`
- world `stocks`
- world `crypto`
- focus `markets`
- focus `stocks`
- focus `crypto`
- focus `commodities`
- focus `companies`

For those, auto-feed logic leans toward market outlets.

## 4. Request building by mode

### World

Uses preset from `worldCategoryPresets` and produces:

- `category`
- `label`
- `query`
- `googleQuery`
- `googleTopics`

This is broad editorial search.

### Ticker

Steps:

1. sanitize ticker
2. resolve company name via Yahoo search
3. build query around symbol + company

Result includes:

- `tickerSymbol`
- `company`
- `label`
- `query`
- `googleQuery`

This is the strongest "entity search" mode in the project.

### Commodity

Builds from preset:

- `commodity`
- `commodityKeywords`
- `label`
- `query`
- `googleQuery`

This is stronger than generic query mode because it uses identity terms and commodity-specific anti-noise rules.

### Custom

Parses free text and tries to infer:

- country
- topic terms
- exclude terms
- focus
- normalized `searchQuery`

Example:

- `America news` -> country-heavy query
- `Canada politics` -> country + politics
- `gold central bank buying` -> topic terms + likely markets focus

## 5. Search quality pipeline

### Step A. Soft filtering

Before expensive deep parsing, the system checks:

- language
- source type
- source include/exclude rules
- focus fit
- ticker anchor
- commodity anchor
- custom topic signal or country false-positive check

This saves work and removes obvious junk early.

### Step B. Deep enrichment

For high-value searches:

- ticker
- commodity
- custom
- country-filtered searches
- world stocks
- world crypto
- world technology

The system opens article pages and enriches:

- better summary
- full text
- final URL

This is important because many RSS snippets are too weak for reliable ranking.

### Step C. Scoring

Final score uses:

- source quality
- title matches
- body matches
- country strength
- focus alignment
- mode-specific strength

Mode-specific scoring:

- ticker -> `tickerMentionStrength`
- commodity -> `commodityMentionStrength`
- custom -> `customTopicStrength`
- world stocks -> `stockMentionStrength`
- world -> category priority

### Step D. Hard filtering

After scoring, the system applies stricter match gates:

- ticker must pass ticker match logic
- commodity must pass commodity match logic
- custom must pass topic/country logic
- world category must match expected tags/signals

## 6. What is already strong

### Ticker mode

Strengths:

- resolves company name
- uses ticker symbol anchors
- requires title anchor in strict/balanced modes
- filters many portfolio noise headlines
- rejects multi-symbol contamination

Good for:

- company-specific news
- earnings / partnerships / guidance / launches

Still vulnerable to:

- opinion pieces with symbol in title
- valuation articles
- broad market headlines mentioning ticker once

### Commodity mode

Strengths:

- identity-term matching
- title anchor requirement
- anti-noise rules for forecasts / technical analysis
- anti-proxy rules for ETF / stock / shares contamination

Good for:

- gold / oil / copper / gas / wheat type searches
- price and supply-demand headlines

Still vulnerable to:

- niche commodity blog content
- mine/project headlines that are really company stories
- mixed multi-commodity stories

### Country-style custom queries

Strengths:

- country detection
- sports suppression for country-only searches
- false-positive exclusions like `Bank of America`
- extra boosts for politics / markets / major outlets

Good for:

- `Canada news`
- `America news`
- `Ukraine news`

Still vulnerable to:

- adjective-only matches like `American`
- multinational stories where country is present but not central
- country terms inside brand names not yet listed in exclusions

### World mode

Strengths:

- easy editorial browsing
- separate politics / economy / crypto / technology presets
- clustering and briefing work well here

Still vulnerable to:

- category drift in `ordinary`
- stock-market contamination in `economy`
- crypto bleed into business headlines

## 7. Where the main weaknesses are now

### 1. World categories are still the softest mode

`world` is broad by design. It relies more on:

- source feed quality
- tags
- light scoring

This means it is the most likely mode to pull "close but not perfect" results.

### 2. Custom mode depends heavily on lexical matching

Custom search is smart, but still mostly lexical:

- country aliases
- topic words
- exclude words

It is not yet semantic reranking in the model-based sense.

### 3. Focus filter is secondary, not primary

Focus does not fully rebuild the search intent.
It filters after fetch.

That means:

- `focus=stocks` helps
- but a true stock-only query mode is still stronger than world + focus

### 4. Source quality is fixed-profile based

`inferSourceQuality` uses a hardcoded source table plus freshness boost.

Good:

- predictable

Weakness:

- newer domains are not deeply evaluated
- all unknown domains default to `specialist`

### 5. No true semantic clustering by event identity

Current clustering is title-fingerprint based.

Good:

- fast

Weakness:

- same story with very different headlines may split into separate clusters

## 8. Theme-by-theme search risk map

### Politics

Usually strong because:

- political tags are common
- country matching helps
- major outlets are abundant

Risk:

- geopolitics vs domestic politics can mix

### Ordinary news

Most fragile world category.

Risk:

- entertainment / lifestyle / science / accidents all mixed together

### Economy / macro

Usually decent.

Risk:

- market commentary can dominate
- company/business news can sneak in

### Stocks

Good in dedicated stock mode.

Risk:

- portfolio updates
- analyst roundup spam
- personal finance

### Crypto

Usually easy to identify lexically.

Risk:

- crypto-investing blogs
- token price noise

### Commodities

Much better now.

Risk:

- proxy equities
- trading-analysis sites
- macro articles where commodity is secondary

### Tech

Good for big themes like AI, chips, software.

Risk:

- science/health bleed
- startup marketing/newswire content

### Science / health

Moderate.

Risk:

- health policy vs research vs product news all mixed

## 9. What I would test next

I would test the whole system with a fixed query matrix.

### World

- `world/all`
- `world/politics`
- `world/ordinary`
- `world/economy`
- `world/stocks`
- `world/crypto`
- `world/technology`

### Ticker

- `NVDA`
- `AAPL`
- `TSLA`
- `NVO`
- `NRED`

### Commodity

- `gold`
- `copper`
- `oil`
- `gas`
- `uranium`

### Custom country

- `America news`
- `Canada news`
- `Ukraine news`
- `China news`

### Custom mixed-intent

- `Canada politics`
- `US stock market`
- `Iran oil news`
- `central bank gold buying`
- `AI chip export restrictions`

## 10. Best improvements from here

### High impact

1. Build a query test harness that runs all search themes and saves top-10 results
2. Add per-mode precision metrics: how many results are clearly on-topic
3. Add a stronger country-centrality check for custom country searches
4. Add semantic reranking for custom and world searches

### Medium impact

1. Expand country false-positive exclusions
2. Add source blacklist presets for spammy market-analysis sites
3. Add separate `macro` vs `company` distinction in economy mode

### Product impact

1. Show why an article matched:
   - country
   - ticker
   - commodity
   - topic
2. Add debug mode in UI for search quality inspection
3. Add "strict / balanced / broad" presets per mode in a more visible way

## 11. Practical conclusion

Right now the search engine is strongest in this order:

1. `ticker`
2. `commodity`
3. `custom` with clear country or topic intent
4. `world` category browsing

So if the goal is accuracy:

- use `ticker` for companies
- use `commodity` for metals/energy/agri
- use `custom` for country/topic combinations
- use `world` for broad discovery

The next serious step is not more UI polish.
It is systematic search QA across all themes with a repeatable test matrix.
