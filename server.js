import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { XMLParser } from "fast-xml-parser";
import webpush from "web-push";
import { applyHttpDefaults } from "./config/http.js";
import {
  commodityPresets,
  focusPresets,
  languagePresets,
  matchModePresets,
  sortModePresets,
  sourcePresets,
  sourceTypePresets,
  worldCategoryPresets
} from "./config/presets.js";
import {
  aiChipTerms,
  commodityNoiseTitlePatterns,
  commodityProxyTitlePatterns,
  companyNoiseWords,
  countryLexicon,
  countryQueryExclusions,
  customIntentNoiseTitlePatterns,
  customQueryFocusLexicon,
  exportControlTerms,
  goldMarketTerms,
  goldProxyTerms,
  macroEconomyTerms,
  personalFinanceTerms,
  sourceProfiles,
  stockMarketTerms,
  tickerNoiseTitlePatterns
} from "./config/search-signals.js";
import { readJsonOr, writeJsonAtomic } from "./lib/json-store.js";
import { compactTerms, matchesNewsTerm, splitSearchTerms } from "./lib/query-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const GOOGLE_TOP_RSS = "https://news.google.com/rss";
const GOOGLE_TOPIC_RSS = "https://news.google.com/rss/headlines/section/topic";
const GOOGLE_NEWS_BATCH_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je";
const DATA_DIR = path.resolve(process.env.NEWS_AGENT_DATA_DIR || path.join(__dirname, "data"));
const PUBLIC_BASE_URL = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL || "");
const WATCHLIST_FILE = path.join(DATA_DIR, "watchlist.json");
const SEARCH_HISTORY_FILE = path.join(DATA_DIR, "search-history.json");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const USER_TAGS_FILE = path.join(DATA_DIR, "user-tags.json");
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const VAPID_KEYS_FILE = path.join(DATA_DIR, "vapid-keys.json");
const CACHE_TTL_MS = 5 * 60 * 1000;
const ARTICLE_IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ARTICLE_CONTENT_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const RELEVANCE_ENRICH_LIMIT = 16;
const GDELT_DELAY_MS = 5500;
const ALERT_MONITOR_TICK_MS = 60 * 1000;
const VISIBLE_STORY_MEDIA_LIMIT = 12;
const REQUEST_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const EMPTY_IMAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const INDEX_TEMPLATE_FILE = path.join(PUBLIC_DIR, "index.html");
const DEFAULT_SOCIAL_IMAGE_PATH = "/mockups/concept-4-visual-story-stream.png";
const tickerOverrides = {
  NRED: {
    symbol: "NREDF",
    name: "NovaRed Mining Inc.",
    aliases: ["NRED", "NREDF", "NRED.CN", "NRED.NE"],
    companyAliases: ["NovaRed Mining Inc.", "Rumble Resources Inc.", "NovaRedMin"]
  }
};
const tickerBrandNoiseWords = new Set([
  ...companyNoiseWords,
  "mining",
  "minerals",
  "resources",
  "metals",
  "energy",
  "pharma",
  "biotech",
  "bio",
  "therapeutics",
  "exploration",
  "financial",
  "capital",
  "technologies",
  "technology",
  "materials"
]);

const cache = new Map();
const tickerCache = new Map();
const articleImageCache = new Map();
const articleContentCache = new Map();
const articleAvailabilityCache = new Map();
const googleNewsUrlCache = new Map();
let gdeltQueue = Promise.resolve();
let gdeltNextAt = 0;
let alertMonitorRunning = false;
let vapidConfigPromise = null;
let indexTemplateCache = { mtimeMs: 0, contents: "" };

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text"
});

const commodityKeywords = {
  copper: ["copper", "lme copper", "copper futures", "copper mine"],
  gold: ["gold", "xau", "bullion", "gold futures", "central bank gold", "gold reserves", "spot gold"],
  silver: ["silver", "silver futures"],
  oil: ["oil", "crude", "brent", "wti", "opec"],
  gas: ["natural gas", "lng", "gas prices"],
  wheat: ["wheat", "grain", "grain exports"],
  lithium: ["lithium", "battery metals"],
  uranium: ["uranium", "nuclear fuel"]
};

const countryPrimaryTerms = {
  canada: "canada",
  usa: "united states",
  uk: "united kingdom",
  eu: "european union",
  china: "china",
  india: "india",
  japan: "japan",
  ukraine: "ukraine",
  russia: "russia",
  israel: "israel",
  iran: "iran",
  germany: "germany",
  france: "france",
  mexico: "mexico",
  australia: "australia"
};

const googleNewsRegions = {
  usa: { hl: "en-US", gl: "US", ceid: "US:en" },
  canada: { hl: "en-CA", gl: "CA", ceid: "CA:en" },
  uk: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  australia: { hl: "en-AU", gl: "AU", ceid: "AU:en" },
  india: { hl: "en-IN", gl: "IN", ceid: "IN:en" },
  germany: { hl: "en-DE", gl: "DE", ceid: "DE:en" },
  france: { hl: "en-FR", gl: "FR", ceid: "FR:en" },
  japan: { hl: "en-JP", gl: "JP", ceid: "JP:en" },
  mexico: { hl: "en-MX", gl: "MX", ceid: "MX:en" },
  ukraine: { hl: "en-UA", gl: "UA", ceid: "UA:en" }
};

applyHttpDefaults(app, { publicDir: PUBLIC_DIR, rootDir: __dirname });

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    dataDir: DATA_DIR
  });
});

app.get("/api/presets", (_req, res) => {
  res.json({
    commodities: commodityPresets,
    focuses: focusPresets,
    languages: languagePresets,
    sortModes: sortModePresets,
    matchModes: matchModePresets,
    sourceTypes: sourceTypePresets,
    sources: sourcePresets,
    worldCategories: worldCategoryPresets
  });
});

app.get("/api/watchlist", async (_req, res) => {
  res.json({ items: await readWatchlist() });
});

app.get("/api/history", async (_req, res) => {
  res.json({ items: await readSearchHistory() });
});

app.get("/api/alerts", async (_req, res) => {
  res.json({ items: await readAlerts() });
});

app.get("/api/user-tags", async (_req, res) => {
  res.json({ items: await readUserTags() });
});

app.get("/api/notifications/config", async (_req, res) => {
  const config = await ensurePushConfig();
  res.json({
    supported: true,
    publicKey: config.publicKey,
    subject: config.subject
  });
});

app.post("/api/watchlist", async (req, res) => {
  const item = normalizeWatchItem(req.body);
  if (!item) {
    res.status(400).json({ error: "Некорректный элемент наблюдения." });
    return;
  }

  const list = await readWatchlist();
  const existing = list.find((entry) => entry.signature === item.signature) || null;
  const next = existing ? list : [item, ...list].slice(0, 30);
  await writeWatchlist(next);
  res.status(existing ? 200 : 201).json({ item: existing || item, items: next });
});

app.post("/api/user-tags", async (req, res) => {
  const item = normalizeUserTag(req.body);
  if (!item) {
    res.status(400).json({ error: "Некорректный пользовательский тег." });
    return;
  }

  const items = await readUserTags();
  const normalizedName = item.name.toLowerCase();
  const existing = items.find((entry) => entry.name.toLowerCase() === normalizedName) || null;
  const stored = existing
    ? {
        ...existing,
        ...item,
        id: existing.id,
        createdAt: existing.createdAt
      }
    : item;
  const next = [stored, ...items.filter((entry) => entry.name.toLowerCase() !== normalizedName)].slice(0, 40);
  await writeUserTags(next);
  res.status(existing ? 200 : 201).json({ item: stored, items: next });
});

app.post("/api/notifications/subscribe", async (req, res) => {
  const subscription = normalizePushSubscription(req.body?.subscription || req.body);
  if (!subscription) {
    res.status(400).json({ error: "Некорректная push-подписка." });
    return;
  }

  const items = await readPushSubscriptions();
  const next = [subscription, ...items.filter((item) => item.endpoint !== subscription.endpoint)].slice(0, 200);
  await writePushSubscriptions(next);
  res.status(201).json({ ok: true, count: next.length });
});

app.delete("/api/watchlist/:id", async (req, res) => {
  const list = await readWatchlist();
  const next = list.filter((item) => item.id !== req.params.id);
  await writeWatchlist(next);
  res.json({ items: next });
});

app.post("/api/alerts", async (req, res) => {
  const alert = normalizeAlert(req.body);
  if (!alert) {
    res.status(400).json({ error: "Некорректное правило алерта." });
    return;
  }

  const alerts = await readAlerts();
  const existing = alerts.find((item) => item.signature === alert.signature) || null;
  const stored = existing
    ? {
        ...existing,
        ...alert,
        id: existing.id,
        createdAt: existing.createdAt,
        lastCheckedAt: existing.lastCheckedAt || "",
        lastMatchCount: Number(existing.lastMatchCount || 0),
        latestHeadline: existing.latestHeadline || "",
        lastHitAt: existing.lastHitAt || null,
        lastError: existing.lastError || ""
      }
    : alert;
  const next = [stored, ...alerts.filter((item) => item.signature !== alert.signature)].slice(0, 40);
  await writeAlerts(next);
  res.status(existing ? 200 : 201).json({ item: stored, items: next });
});

app.delete("/api/alerts/:id", async (req, res) => {
  const alerts = await readAlerts();
  const next = alerts.filter((item) => item.id !== req.params.id);
  await writeAlerts(next);
  res.json({ items: next });
});

app.delete("/api/user-tags/:id", async (req, res) => {
  const items = await readUserTags();
  const next = items.filter((item) => item.id !== req.params.id);
  await writeUserTags(next);
  res.json({ items: next });
});

app.post("/api/notifications/unsubscribe", async (req, res) => {
  const endpoint = cleanText(req.body?.endpoint || req.body?.subscription?.endpoint || "");
  if (!endpoint) {
    res.status(400).json({ error: "Не передан endpoint подписки." });
    return;
  }

  const items = await readPushSubscriptions();
  const next = items.filter((item) => item.endpoint !== endpoint);
  await writePushSubscriptions(next);
  res.json({ ok: true, count: next.length });
});

app.post("/api/alerts/check", async (_req, res) => {
  const alerts = await readAlerts();
  const previousById = new Map(alerts.map((alert) => [alert.id, snapshotAlert(alert)]));
  const checked = await Promise.all(
    alerts.map(async (alert) => {
      try {
        const request = await buildNewsRequest(requestToQueryParams(alert.request, { track: "0" }));
        const payload = await fetchNews(request);
        return {
          ...alert,
          lastCheckedAt: new Date().toISOString(),
          lastMatchCount: payload.articles.length,
          lastHitAt: payload.articles[0]?.publishedAt || alert.lastHitAt || null,
          latestHeadline: payload.articles[0]?.title || "",
          lastError: ""
        };
      } catch (error) {
        return {
          ...alert,
          lastCheckedAt: new Date().toISOString(),
          lastMatchCount: 0,
          lastError: error.message || "Не удалось обновить алерт."
        };
      }
    })
  );
  await writeAlerts(checked);
  await notifyAlertPushes(collectTriggeredAlerts(previousById, checked));
  res.json({ items: checked });
});

app.get("/api/news", async (req, res) => {
  try {
    const request = await buildNewsRequest(req.query);
    const cacheKey = JSON.stringify(toCacheKeyRequest(request));
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      const payload = { ...cached.payload, cached: true };
      if (request.trackHistory) await recordSearchHistorySafely(payload.request);
      res.json(payload);
      return;
    }

    const payload = await fetchNews(request);
    cache.set(cacheKey, { createdAt: Date.now(), payload });
    if (request.trackHistory) await recordSearchHistorySafely(payload.request);
    res.json({ ...payload, cached: false });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Не удалось получить новости."
    });
  }
});

app.get("/api/article-preview", async (req, res) => {
  try {
    const url = cleanText(req.query.url || "");
    const image = cleanText(req.query.image || "");

    if (!/^https?:\/\//i.test(url)) {
      res.status(400).json({ error: "Некорректный URL статьи." });
      return;
    }

    const article = {
      url,
      image,
      finalUrl: cleanText(req.query.finalUrl || "")
    };

    const targetUrl = await resolveArticleTargetUrl(article);
    if (targetUrl) {
      article.finalUrl = targetUrl;
      if (isGoogleNewsArticleUrl(article.url)) article.url = targetUrl;
    }

    const resolvedImage = await resolveArticleImage(article.url, article.image);
    if (resolvedImage) article.image = resolvedImage;

    res.json({
      url,
      finalUrl: article.finalUrl || article.url || url,
      image: article.image || image || ""
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Не удалось обновить статью."
    });
  }
});

app.get("/robots.txt", (req, res) => {
  const origin = getPublicOrigin(req);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("text/plain").send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const origin = getPublicOrigin(req);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res
    .type("application/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n` +
        `    <loc>${escapeXml(origin + "/")}</loc>\n` +
        `    <changefreq>hourly</changefreq>\n` +
        `    <priority>1.0</priority>\n` +
        `  </url>\n` +
        `</urlset>\n`
    );
});

app.get("*", async (req, res, next) => {
  try {
    const document = await renderIndexDocument(req, res);
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(document);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  console.error("Unhandled request error:", error);

  if (res.headersSent) return;

  if (req.path.startsWith("/api/")) {
    res.status(500).json({ error: "Internal server error." });
    return;
  }

  res.status(500).type("text/plain").send("Internal server error.");
});

app.listen(PORT, () => {
  console.log(`News agent is running at http://localhost:${PORT}`);
});

void runDueAlertsCheck().catch((error) => {
  console.error("Initial alert monitor run failed:", error.message);
});

setInterval(() => {
  void runDueAlertsCheck().catch((error) => {
    console.error("Alert monitor tick failed:", error.message);
  });
}, ALERT_MONITOR_TICK_MS).unref();

async function buildNewsRequest(queryParams) {
  const mode = String(queryParams.mode || "world").toLowerCase();
  const source = sanitizeSource(queryParams.source);
  const timespan = sanitizeTimespan(queryParams.timespan);
  const limit = getSearchLimit(timespan);
  const filters = normalizeFilters(queryParams);
  const trackHistory = queryParams.track !== "0";

  if (mode === "world") {
    if (!cleanText(queryParams.category || "")) throw new Error("Выберите тему новостей.");
    const category = sanitizeWorldCategory(queryParams.category);
    const preset = worldCategoryPresets[category];
    return {
      mode,
      source,
      limit,
      timespan,
      trackHistory,
      category,
      filters,
      label: preset.label,
      query: preset.query,
      googleQuery: preset.googleQuery,
      googleTopics: preset.topics
    };
  }

  if (mode === "ticker") {
    const requestedTicker = sanitizeTicker(queryParams.ticker || queryParams.query);
    if (!requestedTicker) throw new Error("Введите тикер компании.");
    const resolved = await resolveTicker(requestedTicker);
    const tickerSymbol = sanitizeTicker(resolved.symbol || requestedTicker);
    const company = cleanText(resolved.name || "");
    const tickerAliases = compactTerms([requestedTicker, tickerSymbol, ...(resolved.aliases || [])]).map((value) => sanitizeTicker(value)).filter(Boolean);
    const companyAliases = expandCompanyAliases(company, ...(resolved.companyAliases || []));
    const aliasTerms = [
      ...tickerAliases.map((value) => `"${value}"`),
      ...tickerAliases.map((value) => `"$${value}"`),
      ...companyAliases.map((value) => `"${value}"`)
    ];
    const googleIdentityTerms = compactTerms([
      ...tickerAliases.slice(0, 4).map((value) => `"${value}"`),
      ...companyAliases.slice(0, 4).map((value) => `"${value}"`)
    ]);
    const query = `(${aliasTerms.join(" OR ")}) (stock OR shares OR earnings OR revenue OR guidance OR merger OR acquisition OR analyst OR company OR financing OR project OR contract)`;
    const googleQuery =
      googleIdentityTerms.length > 1
        ? `(${googleIdentityTerms.join(" OR ")})`
        : googleIdentityTerms[0] || `"${requestedTicker}"`;
    return {
      mode,
      source,
      limit,
      timespan,
      trackHistory,
      filters,
      label: company ? `${requestedTicker} - ${company}` : requestedTicker,
      ticker: requestedTicker,
      tickerSymbol,
      tickerAliases,
      company,
      companyAliases,
      query,
      googleQuery
    };
  }

  if (mode === "commodity") {
    const key = cleanText(queryParams.commodity || "").toLowerCase();
    if (!key) throw new Error("Выберите сырье или металл.");
    const preset = commodityPresets[key];
    if (!preset) throw new Error("Выберите доступный товар/металл.");
    return {
      mode,
      source,
      limit,
      timespan,
      trackHistory,
      filters,
      commodity: key,
      commodityKeywords: commodityKeywords[key] || [preset.label, key],
      label: preset.label,
      query: preset.query,
      googleQuery: preset.query.replace(/[()"']/g, " ")
    };
  }

  if (mode === "custom") {
    const raw = String(queryParams.query || "").trim();
    if (raw.length < 2) throw new Error("Введите поисковый запрос.");
    const parsed = parseCustomQuery(raw);
    return {
      mode,
      source,
      limit,
      timespan,
      trackHistory,
      filters: {
        ...filters,
        country: filters.country || parsed.country
      },
      label: raw,
      parsedQuery: parsed,
      query: raw,
      googleQuery: parsed.searchQuery
    };
  }

  throw new Error("Неизвестный режим поиска.");
}

async function fetchNews(request) {
  const providers = getProviderPlan(request.source);
  const errors = [];
  const collected = [];
  let successfulProviders = 0;

  for (const provider of providers) {
    try {
      const articles = await fetchProviderArticles(provider, request);
      successfulProviders += 1;
      collected.push(...articles.map((article) => ({ ...article, resolvedSource: provider.source })));

      const processed = finalizeArticlesForRequest(collected, request).slice(0, request.limit);
      if (processed.length > 0 && provider.source !== "auto") break;
    } catch (error) {
      errors.push(`${provider.source}: ${error.message}`);
    }
  }

  const relevanceCandidates = selectArticlesForDeepRelevance(collected, request);
  await enrichArticlesForRelevance(relevanceCandidates, request);

  const candidatePool = finalizeArticlesForRequest(collected, request).slice(0, request.limit);
  const processed = (await filterUnavailableArticles(candidatePool)).slice(0, request.limit);
  if (!processed.length) {
    if (successfulProviders > 0) {
      return buildEmptyNewsPayload(request);
    }
    if (errors.length && errors.every(isProviderUnavailableError)) {
      throw new Error("Источники временно недоступны. Попробуйте позже.");
    }
    throw new Error(errors.length ? errors.join("; ") : "Новости отсутствуют.");
  }

  const clusters = buildStoryClusters(processed).slice(0, request.limit);
  if (!shouldHydrateStoryMediaAsync(request)) {
    await enrichClusterLeadMedia(clusters);
  }
  const requestInfo = buildRequestInfo(request, collected.some((article) => article.resolvedSource === "auto") ? "auto" : inferPrimarySource(clusters));
  const briefing = buildBriefing(processed, clusters, requestInfo);

  return {
    request: requestInfo,
    articles: processed,
    clusters,
    stats: buildStats(processed),
    summary: briefing,
    briefing,
    generatedAt: new Date().toISOString()
  };
}

function getProviderPlan(source) {
  if (source === "gdelt") return [{ type: "gdelt", source: "gdelt" }];
  if (source === "google") return [{ type: "google", source: "google" }];
  if (source === "auto") return [{ type: "combined", source: "auto" }, { type: "gdelt", source: "gdelt" }];
  return [{ type: "rss", source }];
}

async function fetchProviderArticles(provider, request) {
  if (provider.type === "gdelt") return fetchGdeltArticles(request);
  if (provider.type === "google") return fetchGoogleArticles(request);
  if (provider.type === "combined") return fetchCombinedArticles(request);
  return fetchRssArticles(request, provider.source);
}

async function fetchCombinedArticles(request) {
  const settled = await Promise.allSettled([
    fetchGoogleArticles(request),
    fetchRssArticles(request, "feeds")
  ]);
  const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return sortArticlesForRequest(articles, request);
}

async function fetchGdeltArticles(request) {
  return scheduleGdelt(async () => {
    const params = new URLSearchParams({
      query: request.query,
      mode: "artlist",
      format: "json",
      maxrecords: String(request.limit),
      timespan: request.timespan,
      sort: "datedesc"
    });
    const json = await fetchJson(`${GDELT_DOC_URL}?${params.toString()}`, 22000);
    const articles = Array.isArray(json.articles) ? json.articles : [];

    return articles.map((article) => ({
      title: cleanText(article.title),
      url: article.url,
      image: article.socialimage || "",
      domain: article.domain || getDomain(article.url),
      sourceCountry: article.sourcecountry || article.sourceCountry || "",
      language: article.language || "",
      publishedAt: normalizeDate(article.seendate || article.seenDate),
      provider: "GDELT",
      tags: inferTags(article.title)
    }));
  });
}

async function fetchGoogleArticles(request) {
  const params = new URLSearchParams(buildGoogleNewsParams(request));

  if (request.mode === "world" && !request.filters?.country) {
    const feeds = request.googleTopics.map((topic) => fetchGoogleTopicArticles(topic, params));
    const settled = await Promise.allSettled(feeds);
    const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    return rankWorldArticles(articles, request);
  }

  const countryTerm = shouldInjectCountryIntoQuery(request) ? getGoogleCountrySearchTerm(request) : "";
  const queryBase = [countryTerm, request.googleQuery || request.query].filter(Boolean).join(" ");
  const query = `${queryBase} when:${toGoogleWhen(request.timespan)}`;
  params.set("q", query);
  const url = `${GOOGLE_NEWS_RSS}?${params.toString()}`;
  const xml = await fetchText(url, 16000);
  return parseGoogleRss(xml);
}

async function fetchGoogleTopicArticles(topic, baseParams) {
  const params = new URLSearchParams(baseParams);
  const url = topic === "TOP" ? `${GOOGLE_TOP_RSS}?${params.toString()}` : `${GOOGLE_TOPIC_RSS}/${topic}?${params.toString()}`;
  const xml = await fetchText(url, 16000);
  return parseGoogleRss(xml, topic);
}

function parseGoogleRss(xml, topic = "") {
  const parsed = xmlParser.parse(xml);
  const items = toArray(parsed?.rss?.channel?.item);

  return items.map((item) => {
    const source = parseGoogleSource(item.source);
    const url = normalizeFeedLink(item.link);
    const description = readFeedText(item.description);
    return {
      title: cleanGoogleTitle(cleanText(item.title), source.name),
      url,
      image: extractFeedImage(item, url, description),
      domain: source.name || getDomain(url),
      sourceCountry: "",
      language: "English",
      publishedAt: normalizeDate(item.pubDate),
      provider: "Google News",
      tags: inferTags(`${item.title || ""} ${description}`, topic),
      summary: normalizeArticleSummary(description, cleanText(item.title))
    };
  });
}

function rankWorldArticles(articles, request) {
  const category = request.category || "all";
  const byDate = [...articles].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (category === "all") {
    return interleaveWorldArticles(byDate);
  }

  const mixed = articles.map((article, index) => ({
    ...article,
    rank: index,
    priority: getWorldPriority(article, category)
  }));

  return mixed
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
    .map(({ rank: _rank, priority: _priority, ...article }) => article);
}

function interleaveWorldArticles(articles) {
  const buckets = {
    politics: [],
    ordinary: [],
    economy: []
  };

  for (const article of articles) {
    const tags = new Set(article.tags || []);
    if (tags.has("политика") || tags.has("геополитика")) {
      buckets.politics.push(article);
    } else if (tags.has("экономика") || tags.has("рынки") || tags.has("макро")) {
      buckets.economy.push(article);
    } else {
      buckets.ordinary.push(article);
    }
  }

  const result = [];
  const order = ["politics", "ordinary", "economy", "ordinary"];

  while (Object.values(buckets).some((bucket) => bucket.length > 0)) {
    let moved = false;

    for (const key of order) {
      const article = buckets[key].shift();
      if (!article) continue;
      result.push(article);
      moved = true;
    }

    if (!moved) break;
  }

  return result;
}

function getWorldPriority(article, category) {
  const tags = new Set(article.tags || []);

  if (category === "politics") return tags.has("политика") || tags.has("геополитика") ? 3 : 1;
  if (category === "ordinary") {
    if (tags.has("политика") || tags.has("геополитика") || tags.has("крипта") || isStockMarketArticle(article)) return 0;
    if (tags.has("здоровье") || tags.has("наука") || tags.has("технологии") || tags.has("культура") || tags.has("спорт")) return 3;
    return 1;
  }
  if (category === "economy") {
    const strength = economyMentionStrength(article);
    if (strength >= 10) return 6;
    if (strength >= 7) return 4;
    if (strength >= 4) return 2;
    return 0;
  }
  if (category === "stocks") {
    const strength = stockMentionStrength(article);
    if (strength >= 8) return 6;
    if (strength >= 5) return 4;
    if (strength >= 3) return 2;
    return 0;
  }
  if (category === "crypto") return tags.has("крипта") ? 4 : tags.has("рынки") ? 2 : 1;
  if (category === "technology") return tags.has("технологии") || tags.has("наука") ? 3 : 1;

  if (tags.has("политика") || tags.has("геополитика")) return 3;
  if (tags.has("экономика") || tags.has("рынки") || tags.has("макро")) return 2;
  return 1;
}

async function fetchRssArticles(request, sourceMode = "feeds") {
  const feeds = getRssFeedsForRequest(request, sourceMode);
  if (!feeds.length) return [];

  const settled = await Promise.allSettled(feeds.map((feed) => fetchRssFeed(feed)));
  const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  return sortArticlesForRequest(
    articles.filter((article) => articleMatchesRequest(article, request)),
    request
  );
}

async function fetchRssFeed(feed) {
  const xml = await fetchText(feed.url, 9000);
  const parsed = xmlParser.parse(xml);
  const rssItems = toArray(parsed?.rss?.channel?.item);
  const atomItems = toArray(parsed?.feed?.entry);
  const items = rssItems.length ? rssItems : atomItems;
  const feedDate = parsed?.rss?.channel?.lastBuildDate || parsed?.rss?.channel?.pubDate || parsed?.feed?.updated;

  return items.map((item) => {
    const title = cleanText(decodeHtml(readFeedText(item.title)));
    const rawContent = readFeedText(item.description || item.summary || item["content:encoded"] || item.content);
    const summary = normalizeArticleSummary(rawContent, title);
    const url = normalizeFeedLink(item.link || item.guid || item.id);

    return {
      title,
      url,
      image: extractFeedImage(item, url, rawContent),
      domain: feed.label,
      sourceCountry: "",
      language: "English",
      publishedAt: normalizeDate(item.pubDate || item.updated || item.published || item["dc:date"] || feedDate),
      provider: feed.label,
      tags: inferTags(`${title} ${summary}`, feed.topic),
      summary
    };
  });
}

function getRssFeedsForRequest(request, sourceMode) {
  const selectedSources =
    sourceMode === "feeds"
      ? getAutoFeedSourceSet(request)
      : [sourceMode];
  const feeds = [];
  const add = (source, label, url, topic = "") => {
    if (selectedSources.includes(source)) feeds.push({ source, label, url, topic });
  };

  add("stocktitan", "Stock Titan", "https://www.stocktitan.net/rss", "BUSINESS");

  add("yahoo", "Yahoo Finance", "https://finance.yahoo.com/rss/topstories", "BUSINESS");
  for (const symbol of getTickerSymbolAliases(request).slice(0, 4)) {
    add(
      "yahoo",
      "Yahoo Finance",
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
      "BUSINESS"
    );
  }

  add("investing", "Investing.com", "https://www.investing.com/rss/news.rss", "BUSINESS");
  add("investing", "Investing.com", "https://www.investing.com/rss/market_overview.rss", "BUSINESS");
  add("investing", "Investing.com", "https://www.investing.com/rss/stock.rss", "BUSINESS");
  if (request.mode === "commodity" || request.category === "economy" || sourceMode === "investing") {
    add("investing", "Investing.com", "https://www.investing.com/rss/commodities.rss", "BUSINESS");
    add("investing", "Investing.com", "https://www.investing.com/rss/forex.rss", "BUSINESS");
  }

  add("benzinga", "Benzinga", "https://www.benzinga.com/feed", "BUSINESS");
  add("benzinga", "Benzinga", "https://www.benzinga.com/markets/feed", "BUSINESS");

  add("cnbc", "CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html", "BUSINESS");
  add("cnbc", "CNBC", "https://www.cnbc.com/id/10001147/device/rss/rss.html", "BUSINESS");

  add("marketwatch", "MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories", "BUSINESS");
  add("marketwatch", "MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", "BUSINESS");

  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", "");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "WORLD");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/US.xml", "NATION");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", "BUSINESS");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", "TECHNOLOGY");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", "SCIENCE");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml", "HEALTH");
  add("nytimes", "NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml", "SPORTS");

  add("npr", "NPR", "https://feeds.npr.org/1001/rss.xml", "");
  add("fox", "Fox News", "https://moxie.foxnews.com/google-publisher/latest.xml", "");
  add("fox", "Fox News", "https://moxie.foxnews.com/google-publisher/world.xml", "WORLD");
  add("fox", "Fox News", "https://moxie.foxnews.com/google-publisher/politics.xml", "NATION");
  add("fox", "Fox News", "https://moxie.foxnews.com/google-publisher/health.xml", "HEALTH");

  return feeds;
}

function getAutoFeedSourceSet(request) {
  if (isMarketDrivenRequest(request)) {
    return ["stocktitan", "yahoo", "investing", "benzinga", "cnbc", "marketwatch"];
  }
  return ["stocktitan", "yahoo", "investing", "benzinga", "cnbc", "marketwatch", "nytimes", "npr", "fox"];
}

function isMarketDrivenRequest(request) {
  const focus = getEffectiveFocus(request);
  return (
    request.mode === "ticker" ||
    request.mode === "commodity" ||
    request.category === "stocks" ||
    request.category === "crypto" ||
    focus === "markets" ||
    focus === "stocks" ||
    focus === "crypto" ||
    focus === "commodities" ||
    focus === "companies"
  );
}

function articleMatchesRequest(article, request) {
  const tags = new Set(article.tags || []);
  const filters = request.filters || {};
  const focus = getEffectiveFocus(request);
  const score = scoreArticleForRequest(article, request);

  if (filters.language !== "any" && !languageMatches(article, filters.language)) return false;
  if (filters.sourceType !== "any" && inferSourceQuality(article).tier !== filters.sourceType) return false;
  if (shouldHardFilterByCountry(request) && filters.country && !articleMatchesCountry(article, filters.country)) return false;
  if (!sourceAllowed(article, filters)) return false;

  if (request.mode === "world") {
    if (request.category === "politics" && !(tags.has("политика") || tags.has("геополитика"))) return false;
    if (
      request.category === "ordinary" &&
      (tags.has("политика") || tags.has("геополитика") || tags.has("крипта") || isStockMarketArticle(article))
    ) {
      return false;
    }
    if (request.category === "economy" && !isMacroEconomyArticle(article)) return false;
    if (request.category === "stocks" && !isStockMarketArticle(article)) return false;
    if (request.category === "crypto" && !tags.has("крипта")) return false;
    if (request.category === "technology" && !(tags.has("технологии") || tags.has("наука"))) return false;
  }

  if (focus !== "all" && !articleMatchesFocus(article, focus)) return false;

  if (request.mode === "custom") {
    if (!articleHasCustomMatch(article, request)) return false;
    return score >= minScoreForRequest(request, "custom");
  }
  if (request.mode === "ticker") {
    if (!articleHasTickerMatch(article, request)) return false;
    return score >= minScoreForRequest(request, "ticker");
  }
  if (request.mode === "commodity") {
    if (!articleHasCommodityMatch(article, request)) return false;
    return score >= minScoreForRequest(request, "commodity");
  }
  return true;
}

function getEffectiveFocus(request) {
  const explicit = request?.filters?.focus || "all";
  if (explicit !== "all") return explicit;
  return request?.parsedQuery?.focus || "all";
}

function getRequestTerms(request) {
  if (request.mode === "ticker") {
    return compactTerms([
      request.ticker,
      request.tickerSymbol,
      ...(request.tickerAliases || []),
      request.company,
      ...(request.companyAliases || []),
      ...String(request.company || "").split(/[^a-z0-9.]+/i)
    ]);
  }

  if (request.mode === "commodity") {
    return compactTerms([request.label, request.commodity, ...(request.commodityKeywords || [])]);
  }

  if (request.mode === "custom") {
    return compactTerms([
      ...(request.parsedQuery?.includeTerms || []),
      ...splitSearchTerms(request.query || request.googleQuery || "")
    ]);
  }

  return [];
}

function getArticleSearchText(article, options = {}) {
  const parts = [
    article.title || "",
    article.summary || "",
    article.fullText || "",
    article.sourceCountry || "",
    article.domain || "",
    article.provider || ""
  ];
  if (options.includeUrl) parts.push(article.url || "", article.finalUrl || "");
  return parts.join(" ").toLowerCase();
}

function sortArticlesForRequest(articles, request) {
  const enriched = articles.map((article) => ({
    ...article,
    sourceQuality: inferSourceQuality(article),
    relevanceScore: scoreArticleForRequest(article, request)
  }));
  const deduped = dedupeArticles(enriched);
  const comparator = compareArticlesForRequest(request);

  if (request.mode === "world" && request.filters?.sortMode === "relevance") {
    return rankWorldArticles(deduped, request).sort(comparator);
  }

  return deduped.sort(comparator);
}

async function enrichArticlesForRelevance(articles, request) {
  if (!needsDeepArticleParsing(request) || !articles.length) return;

  const limit = Math.min(articles.length, RELEVANCE_ENRICH_LIMIT);
  await runWithConcurrency(articles.slice(0, limit), 4, async (article) => {
    const content = await resolveArticleContent(article.url, article.title);
    if (!content) return;
    article.summary = choosePreferredSummary(article.summary, content.summary, article.title);
    article.fullText = content.text || "";
    article.finalUrl = content.finalUrl || article.url;
  });
}

function needsDeepArticleParsing(request) {
  if (!request) return false;
  if (request.mode === "ticker" || request.mode === "commodity" || request.mode === "custom") return true;
  if (request.filters?.country) return true;
  if (request.category === "stocks" || request.category === "crypto" || request.category === "technology") return true;
  return false;
}

function selectArticlesForDeepRelevance(articles, request) {
  if (!needsDeepArticleParsing(request) || !articles.length) return [];

  const seenUrls = new Set();
  const seenTitles = new Set();

  return articles
    .filter((article) => isRecent(article.publishedAt, request.timespan) && articlePassesSoftFilters(article, request))
    .map((article) => ({
      article,
      sourceQuality: inferSourceQuality(article),
      relevanceScore: scoreArticleForRequest(article, request)
    }))
    .sort(compareArticlesByRelevance)
    .filter(({ article }) => {
      const urlKey = String(article.url || "").split("?")[0];
      const titleKey = normalizeTitleKey(article.title);
      if (!urlKey || !titleKey) return false;
      if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) return false;
      seenUrls.add(urlKey);
      seenTitles.add(titleKey);
      return true;
    })
    .slice(0, RELEVANCE_ENRICH_LIMIT)
    .map(({ article }) => article);
}

function articlePassesSoftFilters(article, request) {
  const filters = request.filters || {};
  const focus = getEffectiveFocus(request);

  if (filters.language !== "any" && !languageMatches(article, filters.language)) return false;
  if (filters.sourceType !== "any" && inferSourceQuality(article).tier !== filters.sourceType) return false;
  if (!sourceAllowed(article, filters)) return false;

  if (focus !== "all" && !articleMatchesFocus(article, focus)) return false;

  if (request.mode === "ticker") return articleHasTickerAnchor(article, request);
  if (request.mode === "commodity") return articleHasCommodityAnchor(article, request);
  if (request.mode === "custom" && request.parsedQuery?.topicTerms?.length) {
    if (!articleMatchesCustomIntent(article, request)) return false;
    return customTopicStrength(article, request) >= 1;
  }
  if (request.mode === "custom" && request.parsedQuery?.country && request.parsedQuery?.topicTerms?.length === 0) {
    return !isCountryFalsePositiveArticle(article, request.parsedQuery.country);
  }

  return true;
}

async function enrichArticleImages(articles) {
  const targets = articles.filter((article) => shouldRefreshArticleImage(article));
  const googleTargets = targets.filter((article) => isGoogleNewsArticleUrl(article.url)).slice(0, 6);
  const regularTargets = targets.filter((article) => !isGoogleNewsArticleUrl(article.url));

  const enrichOne = async (article) => {
      const isGoogle = isGoogleNewsArticleUrl(article.url);
      const targetUrl = await resolveArticleTargetUrl(article);
      if (targetUrl) {
        article.finalUrl = targetUrl;
        if (isGoogleNewsArticleUrl(article.url)) article.url = targetUrl;
      }
      const resolved = await resolveArticleImage(article.url, article.image);
      if (resolved) article.image = resolved;
      if (isGoogle) await sleep(250);
  };

  await runWithConcurrency(googleTargets, 1, enrichOne);
  await runWithConcurrency(regularTargets, 4, enrichOne);
}

async function enrichClusterLeadMedia(clusters) {
  const leads = clusters.slice(0, VISIBLE_STORY_MEDIA_LIMIT).map((cluster) => cluster.lead).filter(Boolean);
  if (!leads.length) return;
  await enrichArticleImages(leads);
}

function shouldHydrateStoryMediaAsync(request) {
  return request?.source === "google" || request?.source === "auto";
}

function shouldRefreshArticleImage(article) {
  if (!article?.url) return false;
  if (!article.image) return true;
  return isGenericAggregatorImage(article.image, article.url);
}

async function resolveArticleImage(url, fallbackImage = "") {
  const targetUrl = await resolveGoogleNewsArticleUrl(url);
  const key = String(targetUrl || url || "").split("#")[0];
  if (!key) return fallbackImage || "";

  const cached = articleImageCache.get(key);
  const cacheTtl = cached?.value ? ARTICLE_IMAGE_CACHE_TTL_MS : EMPTY_IMAGE_CACHE_TTL_MS;
  if (cached && Date.now() - cached.createdAt < cacheTtl) {
    return cached.value || fallbackImage || "";
  }

  try {
    const { html, finalUrl } = await fetchHtml(key, 7000);
    const image = extractPagePreviewImage(html, finalUrl || key) || fallbackImage || "";
    if (image) {
      articleImageCache.set(key, { createdAt: Date.now(), value: image });
    } else {
      articleImageCache.delete(key);
    }
    return image;
  } catch {
    if (fallbackImage) {
      articleImageCache.set(key, { createdAt: Date.now(), value: fallbackImage });
      return fallbackImage;
    }
    articleImageCache.delete(key);
    return "";
  }
}

async function resolveArticleContent(url, title = "") {
  const targetUrl = await resolveGoogleNewsArticleUrl(url);
  const key = String(targetUrl || url || "").split("#")[0];
  if (!key) return null;

  const cached = articleContentCache.get(key);
  if (cached && Date.now() - cached.createdAt < ARTICLE_CONTENT_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const { html, finalUrl } = await fetchHtml(key, 7000);
    const summary = extractMetaDescription(html, title);
    const text = extractPageText(html);
    const value = {
      finalUrl: finalUrl || key,
      summary,
      text
    };
    articleContentCache.set(key, { createdAt: Date.now(), value });
    return value;
  } catch {
    const value = null;
    articleContentCache.set(key, { createdAt: Date.now(), value });
    return value;
  }
}

async function runWithConcurrency(items, limit, worker) {
  if (!items.length) return;
  let index = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });

  await Promise.allSettled(runners);
}

async function filterUnavailableArticles(articles) {
  if (!articles.length) return articles;

  const checks = await Promise.all(
    articles.map(async (article) => ({
      article,
      unavailable: await isUnavailableArticleUrl(article.url)
    }))
  );

  return checks.filter((entry) => !entry.unavailable).map((entry) => entry.article);
}

async function isUnavailableArticleUrl(url) {
  const key = String(url || "").split("#")[0];
  if (!key) return false;
  if (key.includes("news.google.com/rss/articles/")) return false;

  const cached = articleAvailabilityCache.get(key);
  if (cached && Date.now() - cached.createdAt < ARTICLE_IMAGE_CACHE_TTL_MS) {
    return cached.unavailable;
  }

  try {
    await fetchHtml(key, 7000);
    articleAvailabilityCache.set(key, { createdAt: Date.now(), unavailable: false });
    return false;
  } catch (error) {
    const unavailable = isDeadArticlePageError(error.message || "");
    articleAvailabilityCache.set(key, { createdAt: Date.now(), unavailable });
    return unavailable;
  }
}

function compareArticlesByRelevance(a, b) {
  if ((b.relevanceScore || 0) !== (a.relevanceScore || 0)) {
    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  }
  if ((b.sourceQuality?.quality || 0) !== (a.sourceQuality?.quality || 0)) {
    return (b.sourceQuality?.quality || 0) - (a.sourceQuality?.quality || 0);
  }
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

async function resolveArticleTargetUrl(article) {
  if (!article?.url) return "";
  const resolved = await resolveGoogleNewsArticleUrl(article.finalUrl || article.url);
  return resolved || article.finalUrl || article.url;
}

async function resolveGoogleNewsArticleUrl(sourceUrl) {
  const key = String(sourceUrl || "").split("#")[0];
  if (!key || !isGoogleNewsArticleUrl(key)) return key;

  const cached = googleNewsUrlCache.get(key);
  if (cached && Date.now() - cached.createdAt < ARTICLE_CONTENT_CACHE_TTL_MS) {
    return cached.value || key;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const direct = decodeGoogleNewsUrlDirectly(key);
      if (direct && /^https?:\/\//i.test(direct)) {
        googleNewsUrlCache.set(key, { createdAt: Date.now(), value: direct });
        return direct;
      }

      const params = await fetchGoogleNewsDecodeParams(key);
      const decoded = await requestGoogleNewsDecodedUrl(params);
      if (decoded) {
        googleNewsUrlCache.set(key, { createdAt: Date.now(), value: decoded });
        return decoded;
      }
    } catch {
      if (attempt === 0) {
        await sleep(450);
        continue;
      }
    }
  }

  return key;
}

function isGoogleNewsArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.hostname === "news.google.com" && /\/(?:rss\/)?articles\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractGoogleNewsArticleId(value) {
  try {
    const url = new URL(String(value || ""));
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

function decodeGoogleNewsUrlDirectly(sourceUrl) {
  const articleId = extractGoogleNewsArticleId(sourceUrl);
  if (!articleId) return "";

  try {
    let decoded = Buffer.from(articleId, "base64url").toString("latin1");
    const prefix = Buffer.from([0x08, 0x13, 0x22]).toString("latin1");
    const suffix = Buffer.from([0xd2, 0x01, 0x00]).toString("latin1");

    if (decoded.startsWith(prefix)) decoded = decoded.slice(prefix.length);
    if (decoded.endsWith(suffix)) decoded = decoded.slice(0, -suffix.length);

    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const firstByte = bytes[0];
    if (!firstByte) return "";

    if (firstByte >= 0x80 && bytes.length > 2) {
      decoded = decoded.slice(2, firstByte + 2);
    } else {
      decoded = decoded.slice(1, firstByte + 1);
    }

    if (/^https?:\/\//i.test(decoded)) return decoded;
    return "";
  } catch {
    return "";
  }
}

async function fetchGoogleNewsDecodeParams(sourceUrl) {
  const articleId = extractGoogleNewsArticleId(sourceUrl);
  if (!articleId) throw new Error("Google News article id not found.");

  const candidates = [
    `https://news.google.com/articles/${articleId}?hl=en-US&gl=US&ceid=US:en`,
    `https://news.google.com/rss/articles/${articleId}?hl=en-US&gl=US&ceid=US:en`,
    `${String(sourceUrl || "").replace(/([?&])(?:hl|gl|ceid)=[^&]*/g, "").replace(/[?&]$/, "")}${String(sourceUrl || "").includes("?") ? "&" : "?"}hl=en-US&gl=US&ceid=US:en`
  ];

  for (const articleUrl of candidates) {
    try {
      const { html } = await fetchHtml(articleUrl, 7000);
      const ordered =
        html.match(/data-n-a-id="([^"]+)"[^>]*data-n-a-ts="([^"]+)"[^>]*data-n-a-sg="([^"]+)"/i) ||
        html.match(/data-n-a-ts="([^"]+)"[^>]*data-n-a-sg="([^"]+)"[^>]*data-n-a-id="([^"]+)"/i);

      if (!ordered) continue;

      if (html.includes(`data-n-a-id="${ordered[1]}"`)) {
        return {
          articleId: ordered[1],
          timestamp: ordered[2],
          signature: ordered[3]
        };
      }

      return {
        articleId: ordered[3],
        timestamp: ordered[1],
        signature: ordered[2]
      };
    } catch {
      continue;
    }
  }

  throw new Error("Google News decode params not found.");
}

async function requestGoogleNewsDecodedUrl(params) {
  const payload = [[[
    "Fbv4je",
    `[\"garturlreq\",[[\"X\",\"X\",[\"X\",\"X\"],null,null,1,1,\"US:en\",null,1,null,null,null,null,null,0,1],\"X\",\"X\",1,[1,1,1],1,1,null,0,0,null,0],\"${params.articleId}\",${params.timestamp},\"${params.signature}\"]`
  ]]];

  const body = new URLSearchParams({
    "f.req": JSON.stringify(payload)
  }).toString();

  const response = await fetch(GOOGLE_NEWS_BATCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": REQUEST_USER_AGENT,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://news.google.com/"
    },
    body
  });

  const text = await response.text();
  const payloadText = extractGoogleBatchPayload(text);
  if (!payloadText) return "";

  const rows = JSON.parse(payloadText);
  const target = rows.find((row) => row?.[0] === "wrb.fr" && row?.[1] === "Fbv4je");
  if (!target?.[2]) return "";

  const decoded = JSON.parse(target[2]);
  return cleanText(decoded?.[1] || "");
}

function extractGoogleBatchPayload(text) {
  const normalized = String(text || "")
    .replace(/^\)\]\}'\s*/, "")
    .trim();

  if (!normalized) return "";

  const candidates = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate.startsWith("[[")) continue;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return "";
}

function compareArticlesByNewest(a, b) {
  const timeDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  if (timeDiff !== 0) return timeDiff;
  return compareArticlesByRelevance(a, b);
}

function compareArticlesByQuality(a, b) {
  if ((b.sourceQuality?.quality || 0) !== (a.sourceQuality?.quality || 0)) {
    return (b.sourceQuality?.quality || 0) - (a.sourceQuality?.quality || 0);
  }
  return compareArticlesByRelevance(a, b);
}

function compareArticlesForRequest(request) {
  const sortMode = request.filters?.sortMode || "relevance";
  if (sortMode === "newest") return compareArticlesByNewest;
  if (sortMode === "quality") return compareArticlesByQuality;
  return compareArticlesByRelevance;
}

function finalizeArticlesForRequest(articles, request) {
  return sortArticlesForRequest(
    articles.filter((article) => isRecent(article.publishedAt, request.timespan) && articleMatchesRequest(article, request)),
    request
  );
}

function scoreArticleForRequest(article, request) {
  const text = getArticleSearchText(article);
  const title = String(article.title || "").toLowerCase();
  const quality = inferSourceQuality(article).quality;
  const requestCountry = request.filters?.country || request.parsedQuery?.country || "";
  const countryStrength = requestCountry ? countryMentionStrength(article, requestCountry) : 0;
  const focus = getEffectiveFocus(request);
  const economyStrength = economyMentionStrength(article);
  let score = Math.round(quality / 25);

  for (const term of getRequestTerms(request)) {
    if (matchesNewsTerm(title, term)) score += 5;
    else if (matchesNewsTerm(text, term)) score += 3;
  }

  const excludes = request.parsedQuery?.excludeTerms || request.filters?.excludeTerms || [];
  for (const term of excludes) {
    if (matchesNewsTerm(text, term.toLowerCase())) return -100;
  }

  if (requestCountry && countryStrength > 0) {
    score += 4 + countryStrength * 2;
  }

  if (request.mode === "custom" && request.parsedQuery?.topicTerms?.length) {
    for (const term of request.parsedQuery.topicTerms) {
      if (matchesNewsTerm(text, term)) score += 2;
    }
  }

  if (request.mode === "custom" && request.parsedQuery?.country && request.parsedQuery?.topicTerms?.length === 0) {
    if (countryStrength >= 3) score += 5;
    if (countryStrength === 2) score += 2;
    if (countryStrength === 1) score -= 2;
    if (articleMatchesFocus(article, "politics") || articleMatchesFocus(article, "markets")) score += 4;
    if (articleMatchesFocus(article, "science")) score += 2;
    if (inferSourceQuality(article).tier === "major") score += 4;
    if (inferSourceQuality(article).tier === "market") score += 1;
    if ((article.tags || []).includes("спорт")) score -= 6;
    if ((article.tags || []).includes("культура")) score -= 4;
  }

  if (focus !== "all" && articleMatchesFocus(article, focus)) score += 4;
  if (request.mode === "ticker") score += tickerMentionStrength(article, request);
  if (request.mode === "commodity") score += commodityMentionStrength(article, request);
  if (request.mode === "custom") {
    score += customTopicStrength(article, request);
    if (articleMatchesCustomIntent(article, request)) score += 4;
  }
  if (request.mode === "world" && request.category === "stocks") {
    score += stockMentionStrength(article);
  }
  if (request.mode === "world" && request.category === "economy") {
    score += economyStrength;
    if (isCompanyCentricArticle(article) && economyStrength < 6) score -= 5;
  }
  if (request.mode === "world") score += getWorldPriority(article, request.category || "all");

  return score;
}

function articleMatchesFocus(article, focus) {
  if (focus === "all") return true;
  const tags = new Set(article.tags || []);
  if (focus === "politics") return tags.has("политика") || tags.has("геополитика");
  if (focus === "markets") return tags.has("рынки") || tags.has("макро") || tags.has("экономика");
  if (focus === "stocks") return isStockMarketArticle(article);
  if (focus === "crypto") return tags.has("крипта");
  if (focus === "companies") return tags.has("рынки") || tags.has("экономика");
  if (focus === "commodities") return tags.has("сырье");
  if (focus === "tech") return tags.has("технологии");
  if (focus === "science") return tags.has("наука") || tags.has("здоровье");
  return true;
}

function articleHasTickerMatch(article, request) {
  const strength = tickerMentionStrength(article, request);
  const hasAnchor = articleHasTickerAnchor(article, request);
  const hasTitleAnchor = articleHasTickerTitleAnchor(article, request);

  if (!hasAnchor) return false;
  if (!hasTitleAnchor) return false;
  if (isTickerNoiseArticle(article, request)) return false;
  return strength >= minTickerMentionStrength(request);
}

function articleHasCommodityMatch(article, request) {
  const matchMode = request.filters?.matchMode || "balanced";
  const strength = commodityMentionStrength(article, request);
  const hasAnchor = articleHasCommodityAnchor(article, request);
  const hasTitleAnchor = articleHasCommodityTitleAnchor(article, request);

  if (!hasAnchor) return false;
  if (matchMode !== "broad" && isCommodityNoiseArticle(article, request)) return false;
  if (matchMode === "strict") return hasTitleAnchor && strength >= minCommodityMentionStrength(request);
  if (matchMode === "balanced") return hasTitleAnchor && strength >= minCommodityMentionStrength(request);
  return strength >= minCommodityMentionStrength(request);
}

function articleHasCustomMatch(article, request) {
  if (request.parsedQuery?.topicTerms?.length) {
    if (!articleMatchesCustomIntent(article, request)) return false;
    return customTopicStrength(article, request) >= 2;
  }
  if (request.parsedQuery?.country) {
    if (isCountryFalsePositiveArticle(article, request.parsedQuery.country)) return false;
    return countryMentionStrength(article, request.parsedQuery.country) >= 3;
  }
  return true;
}

function tickerMentionStrength(article, request) {
  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article, { includeUrl: true });
  const symbolAliases = getTickerSymbolAliases(request);
  const companyAliases = getTickerCompanyAliases(request);
  const companyTokens = getTickerCompanyBrandTerms(request);
  let score = 0;

  if (symbolAliases.some((symbol) => matchesTickerSymbol(title, symbol))) score += 12;
  else if (symbolAliases.some((symbol) => matchesTickerSymbol(text, symbol))) score += 8;
  if (symbolAliases.some((symbol) => title.includes(`$${symbol.toLowerCase()}`) || text.includes(`$${symbol.toLowerCase()}`))) score += 2;

  if (companyAliases.some((company) => matchesNewsTerm(title, company))) score += 10;
  else if (companyAliases.some((company) => matchesNewsTerm(text, company))) score += 6;

  const titleTokenHits = countDistinctTermMatches(title, companyTokens);
  const textTokenHits = countDistinctTermMatches(text, companyTokens);

  if (titleTokenHits >= 2) score += 7;
  else if (titleTokenHits === 1 && hasHighConfidenceTickerBrand(companyTokens)) score += 5;

  if (textTokenHits >= 2) score += 4;
  else if (textTokenHits === 1 && hasHighConfidenceTickerBrand(companyTokens)) score += 2;

  if (isTickerNoiseArticle(article, request)) score -= 8;

  return score;
}

function articleHasTickerAnchor(article, request) {
  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article, { includeUrl: true });
  const symbolAliases = getTickerSymbolAliases(request);
  const companyAliases = getTickerCompanyAliases(request);
  const companyTokens = getTickerCompanyBrandTerms(request);

  if (symbolAliases.some((symbol) => matchesTickerSymbol(title, symbol) || matchesTickerSymbol(text, symbol))) return true;
  if (companyAliases.some((company) => matchesNewsTerm(title, company) || matchesNewsTerm(text, company))) return true;
  if (countDistinctTermMatches(title, companyTokens) >= 1 && hasHighConfidenceTickerBrand(companyTokens)) return true;
  if (companyTokens.length >= 2 && countDistinctTermMatches(text, companyTokens) >= 2) return true;
  return false;
}

function articleHasTickerTitleAnchor(article, request) {
  const title = String(article.title || "").toLowerCase();
  const symbolAliases = getTickerSymbolAliases(request);
  const companyAliases = getTickerCompanyAliases(request);
  const companyTokens = getTickerCompanyBrandTerms(request);

  if (symbolAliases.some((symbol) => matchesTickerSymbol(title, symbol))) return true;
  if (companyAliases.some((company) => matchesNewsTerm(title, company))) return true;
  if (countDistinctTermMatches(title, companyTokens) >= 1 && hasHighConfidenceTickerBrand(companyTokens)) return true;
  if (companyTokens.length >= 2 && countDistinctTermMatches(title, companyTokens) >= 2) return true;
  return false;
}

function isTickerNoiseArticle(article, request) {
  const title = String(article.title || "").toLowerCase();
  const text = `${title} ${String(article.summary || "").toLowerCase()}`;

  if (!articleHasTickerTitleAnchor(article, request)) return false;
  if (tickerNoiseTitlePatterns.some((pattern) => pattern.test(text))) return true;
  if (isInstitutionalOwnershipHeadline(title)) return true;
  if (isTickerAdviceHeadline(title)) return true;
  if (isTickerComparisonHeadline(title, request)) return true;
  if (hasMultipleTickerSubjects(article, request)) return true;
  return false;
}

function isInstitutionalOwnershipHeadline(title) {
  const ownershipSignal =
    /\b(?:stake|stakes|position|positions|holdings?|ownership|shares?)\b/i.test(title) ||
    /\b(?:invests?|invested|investment|bought|purchased|sold|acquired|trimmed|boosted|reduced|raised|lowered|increased|decreased)\b/i.test(title);
  const filerSignal =
    /\b(?:advisors?|advisory|trust|fund|funds|capital|management|partners|wealth|pension|asset|investor|investors|llc|l\.l\.c\.|lp|l\.p\.)\b/i.test(title);

  return ownershipSignal && filerSignal;
}

function isTickerAdviceHeadline(title) {
  return [
    /\bforecast\b/i,
    /\bprice forecast\b/i,
    /\bworth buying\b/i,
    /\bhow to (?:trade|buy|reduce risk)\b/i,
    /\bposition map\b/i,
    /\bpremarket today\b/i,
    /\b(stock|shares?) (?:update|outlook|prediction)\b/i,
    /\bovervalued\b/i,
    /\breduce risk\b/i,
    /\breward mechanism\b/i,
    /\btoday on\b/i,
    /\btrading\b/i,
    /\((?:[A-Za-z0-9_-]{8,})\)$/i
  ].some((pattern) => pattern.test(title));
}

function isTickerComparisonHeadline(title, request) {
  const symbol = String(request.tickerSymbol || "").toUpperCase();
  const companyTerms = getCompanyIdentityTerms(request.company || "");
  const comparatorLanguage = /\b(?:vs\.?|versus|stronger bet than|better than|compared with|compare)\b/i.test(title);
  if (!comparatorLanguage) return false;

  const cleaned = String(title || "");
  const allCaps = cleaned.match(/\b[A-Z]{2,5}\b/g) || [];
  const otherSymbols = [...new Set(allCaps)].filter((value) => value !== symbol);
  if (otherSymbols.length >= 1) return true;

  const normalized = cleaned.toLowerCase();
  const companyHits = countDistinctTermMatches(normalized, companyTerms);
  return companyHits <= 1;
}

function hasMultipleTickerSubjects(article, request) {
  const title = String(article.title || "");
  const currentSymbol = String(request.tickerSymbol || "").toUpperCase();
  if (!currentSymbol) return false;

  const matches = title.match(/\b[A-Z]{2,5}\b/g) || [];
  const unique = [...new Set(matches)];
  const otherSymbols = unique.filter((symbol) => symbol !== currentSymbol);

  return otherSymbols.length >= 2;
}

function articleHasCommodityAnchor(article, request) {
  const text = getArticleSearchText(article);
  return getCommodityIdentityTerms(request).some((term) => matchesNewsTerm(text, term));
}

function articleHasCommodityTitleAnchor(article, request) {
  const title = String(article.title || "").toLowerCase();
  return getCommodityIdentityTerms(request).some((term) => matchesNewsTerm(title, term));
}

function isCommodityNoiseArticle(article, request) {
  const title = String(article.title || "").toLowerCase();
  const text = `${title} ${String(article.summary || "").toLowerCase()}`;
  const hasTitleAnchor = articleHasCommodityTitleAnchor(article, request);

  if (!hasTitleAnchor) return false;
  if (commodityNoiseTitlePatterns.some((pattern) => pattern.test(text))) return true;
  if (hasCommodityProxyAssetSignal(article, request)) return true;
  return false;
}

function hasCommodityProxyAssetSignal(article, request) {
  const title = String(article.title || "").toLowerCase();
  if (commodityProxyTitlePatterns.some((pattern) => pattern.test(title))) return true;

  if (String(request.commodity || "").toLowerCase() === "gold") {
    const hasProxy = goldProxyTerms.some((term) => matchesNewsTerm(title, term));
    return hasProxy && !hasGoldDirectMarketSignal(article);
  }

  return false;
}

function hasGoldDirectMarketSignal(article) {
  const title = String(article.title || "").toLowerCase();
  return goldMarketTerms.some((term) => matchesNewsTerm(title, term));
}

function commodityMentionStrength(article, request) {
  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article, { includeUrl: true });
  let score = 0;

  const identityTerms = getCommodityIdentityTerms(request);
  const keywords = request.commodityKeywords || [];

  for (const term of identityTerms) {
    const normalized = cleanText(term).toLowerCase();
    if (!normalized) continue;
    if (matchesNewsTerm(title, normalized)) score += 8;
    else if (matchesNewsTerm(text, normalized)) score += 4;
  }

  for (const term of keywords) {
    const normalized = cleanText(term).toLowerCase();
    if (!normalized) continue;
    if (identityTerms.includes(normalized)) continue;
    if (matchesNewsTerm(title, normalized)) score += 3;
    else if (matchesNewsTerm(text, normalized)) score += 1;
  }

  if ((article.tags || []).includes("сырье")) score += 1;
  if (isCommodityNoiseArticle(article, request)) score -= 7;

  return score;
}

function customTopicStrength(article, request) {
  const terms = request.parsedQuery?.topicTerms || [];
  if (!terms.length) return 0;

  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article);
  let score = 0;

  for (const term of terms) {
    if (matchesNewsTerm(title, term)) score += 3;
    else if (matchesNewsTerm(text, term)) score += 1;
  }

  return score;
}

function articleMatchesCustomIntent(article, request) {
  const buckets = getCustomIntentBuckets(request);
  if (!buckets.length) return true;

  const title = String(article.title || "").toLowerCase();
  if (customIntentNoiseTitlePatterns.some((pattern) => pattern.test(title))) return false;

  const text = getArticleSearchText(article);
  return buckets.every((bucket) => bucket.some((term) => matchesNewsTerm(text, term)));
}

function getCustomIntentBuckets(request) {
  const text = `${request.query || ""} ${request.googleQuery || ""}`.toLowerCase();
  const buckets = [];

  if (aiChipTerms.some((term) => matchesNewsTerm(text, term)) && exportControlTerms.some((term) => matchesNewsTerm(text, term))) {
    buckets.push(aiChipTerms, exportControlTerms);
  }

  return buckets;
}

function isCountryFalsePositiveArticle(article, country) {
  const patterns = countryQueryExclusions[String(country || "").toLowerCase()] || [];
  if (!patterns.length) return false;

  const text = `${String(article.title || "")} ${String(article.summary || "")}`.toLowerCase();
  return patterns.some((term) => matchesNewsTerm(text, term));
}

function getCompanyIdentityTerms(company) {
  return compactTerms(
    String(company || "")
      .split(/[^a-z0-9]+/i)
      .map((term) => term.toLowerCase())
      .filter((term) => term.length > 2 && !companyNoiseWords.has(term))
  );
}

function expandCompanyAliases(...values) {
  const legalSuffixPattern =
    /\b(?:incorporated|inc|corp|corporation|company|co|limited|ltd|plc|llc|lp|holdings?|group|sa|ag|nv)\b\.?/gi;
  const variants = [];

  for (const value of values) {
    const raw = cleanText(value);
    if (!raw) continue;
    variants.push(raw);

    const stripped = cleanText(raw.replace(legalSuffixPattern, " "));
    if (stripped && stripped !== raw) variants.push(stripped);

    const normalized = cleanText(stripped.replace(/[.,]/g, " "));
    if (normalized && normalized !== stripped) variants.push(normalized);
  }

  return compactTerms(variants);
}

function getTickerSymbolAliases(request) {
  return compactTerms([request.ticker, request.tickerSymbol, ...(request.tickerAliases || [])])
    .map((value) => sanitizeTicker(value))
    .filter(Boolean);
}

function getTickerCompanyAliases(request) {
  return compactTerms([request.company, ...(request.companyAliases || [])]).map((value) => cleanText(value).toLowerCase()).filter(Boolean);
}

function getTickerCompanyBrandTerms(request) {
  return compactTerms(getTickerCompanyAliases(request)
    .flatMap((value) => String(value || "").split(/[^a-z0-9]+/i)))
    .map((term) => term.toLowerCase())
    .filter((term) => term.length > 3 && !tickerBrandNoiseWords.has(term));
}

function hasHighConfidenceTickerBrand(terms) {
  return (terms || []).some((term) => String(term || "").length >= 6);
}

function countDistinctTermMatches(value, terms) {
  if (!terms.length) return 0;
  return terms.reduce((count, term) => count + (matchesNewsTerm(value, term) ? 1 : 0), 0);
}

function matchesTickerSymbol(value, symbol) {
  if (!value || !symbol) return false;
  return new RegExp(`(^|[^a-z0-9])\\$?${escapeRegExp(symbol.toLowerCase())}([^a-z0-9]|$)`, "i").test(value);
}

function minTickerMentionStrength(request) {
  const matchMode = request.filters?.matchMode || "balanced";
  const thresholds = { strict: 10, balanced: 7, broad: 5 };
  return thresholds[matchMode] ?? thresholds.balanced;
}

function minCommodityMentionStrength(request) {
  const matchMode = request.filters?.matchMode || "balanced";
  const thresholds = { strict: 9, balanced: 7, broad: 4 };
  return thresholds[matchMode] ?? thresholds.balanced;
}

function getCommodityIdentityTerms(request) {
  const commodity = String(request.commodity || "").toLowerCase();
  const primary = {
    copper: ["copper", "lme copper"],
    gold: ["gold", "xau", "bullion", "spot gold"],
    silver: ["silver"],
    oil: ["oil", "crude oil", "brent", "wti"],
    gas: ["natural gas", "lng"],
    wheat: ["wheat", "grain"],
    lithium: ["lithium"],
    uranium: ["uranium"]
  };

  return primary[commodity] || compactTerms([request.label, request.commodity, ...(request.commodityKeywords || [])]);
}

function stockMentionStrength(article) {
  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article);
  let score = 0;

  for (const term of stockMarketTerms) {
    if (matchesNewsTerm(title, term)) score += 3;
    else if (matchesNewsTerm(text, term)) score += 1;
  }

  const quality = inferSourceQuality(article);
  if (quality.tier === "market") score += 1;
  if ((article.tags || []).includes("акции")) score += 4;
  if ((article.tags || []).includes("рынки")) score += 1;
  if ((article.tags || []).includes("крипта")) score -= 2;

  return score;
}

function economyMentionStrength(article) {
  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article);
  const tags = new Set(article.tags || []);
  let score = 0;

  for (const term of macroEconomyTerms) {
    if (matchesNewsTerm(title, term)) score += 3;
    else if (matchesNewsTerm(text, term)) score += 1;
  }

  if (tags.has("экономика")) score += 4;
  if (tags.has("макро")) score += 3;
  if (tags.has("рынки")) score += 1;
  if (tags.has("акции")) score -= 1;

  return score;
}

function isMacroEconomyArticle(article) {
  const strength = economyMentionStrength(article);
  const tags = new Set(article.tags || []);

  if (strength >= 8) return true;
  if ((tags.has("экономика") || tags.has("макро")) && strength >= 4) return true;
  if (tags.has("рынки") && strength >= 5) return true;
  return false;
}

function isCompanyCentricArticle(article) {
  const title = String(article.title || "").toLowerCase();
  return stockMarketTerms.some((term) => matchesNewsTerm(title, term));
}

function hasStockTitleSignal(article) {
  const title = String(article.title || "").toLowerCase();
  return stockMarketTerms.some((term) => matchesNewsTerm(title, term));
}

function isPersonalFinanceArticle(article) {
  const text = getArticleSearchText(article);
  return personalFinanceTerms.some((term) => matchesNewsTerm(text, term));
}

function isStockMarketArticle(article) {
  const tags = new Set(article.tags || []);
  const strength = stockMentionStrength(article);
  const titleSignal = hasStockTitleSignal(article);

  if (isPersonalFinanceArticle(article) && !titleSignal) return false;
  if (!titleSignal && !tags.has("акции")) return false;
  if (tags.has("акции") && strength >= 4) return true;
  if (strength >= 6) return true;
  return false;
}

function sourceAllowed(article, filters) {
  const haystacks = [
    String(article.domain || "").toLowerCase(),
    String(article.provider || "").toLowerCase()
  ];
  const includes = filters.sourceInclude || [];
  const excludes = filters.sourceExclude || [];

  if (includes.length && !includes.some((term) => haystacks.some((value) => value.includes(term)))) return false;
  if (excludes.some((term) => haystacks.some((value) => value.includes(term)))) return false;
  return true;
}

function languageMatches(article, language) {
  const value = String(article.language || "").toLowerCase();
  if (language === "english") return value.includes("english") || value.includes("en");
  if (language === "russian") return value.includes("russian") || value.includes("ru");
  return true;
}

function articleMatchesCountry(article, country) {
  return countryMentionStrength(article, country) >= 3;
}

function countryMentionStrength(article, country) {
  if (!country) return 0;
  const terms = getCountryTerms(country);
  const title = String(article.title || "").toLowerCase();
  const text = getArticleSearchText(article);
  const titleHits = countDistinctTermMatches(title, terms);
  const textHits = countDistinctTermMatches(text, terms);

  if (titleHits > 0 && textHits > 1) return 5;
  if (titleHits > 0) return 4;
  if (textHits >= 2) return 3;
  if (textHits === 1) return 1;
  return 0;
}

function getCountryTerms(country) {
  const key = String(country || "").toLowerCase();
  return (countryLexicon[key] || [key]).map((term) => term.toLowerCase());
}

function inferSourceQuality(article) {
  const key = String(article.domain || article.provider || "")
    .toLowerCase()
    .replace(/^www\./, "");
  const profile = sourceProfiles[key] || sourceProfiles[String(article.provider || "").toLowerCase()] || {
    tier: "specialist",
    type: "niche",
    quality: 68
  };
  const freshnessBoost = Math.max(0, 8 - ageHours(article.publishedAt) / 6);
  return {
    ...profile,
    quality: Math.round(profile.quality + freshnessBoost)
  };
}

function ageHours(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 999;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function buildStoryClusters(articles) {
  const clusters = [];

  for (const article of articles) {
    const fingerprint = storyFingerprint(article.title);
    const existing = clusters.find((cluster) => storySimilarity(fingerprint, cluster.fingerprint) >= 0.58);

    if (existing) {
      existing.items.push(article);
      existing.sources.add(article.domain || article.provider || "Source");
      if ((article.relevanceScore || 0) > (existing.lead.relevanceScore || 0)) existing.lead = article;
      continue;
    }

    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      fingerprint,
      lead: article,
      items: [article],
      sources: new Set([article.domain || article.provider || "Source"])
    });
  }

  return clusters
    .map((cluster) => ({
      id: cluster.id,
      lead: cluster.lead,
      size: cluster.items.length,
      related: cluster.items
        .filter((item) => item.url !== cluster.lead.url)
        .slice(0, 4)
        .map((item) => ({
          title: item.title,
          url: item.url,
          source: item.domain || item.provider || "Source"
        })),
      sources: [...cluster.sources]
    }))
    .sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      return compareArticlesByRelevance(a.lead, b.lead);
    });
}

function storyFingerprint(title) {
  const tokens = normalizeTitleKey(title)
    .split(" ")
    .filter((token) => token.length > 3 && !genericNewsWords.has(token));
  return [...new Set(tokens)].slice(0, 10);
}

function storySimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }
  return overlap / Math.min(aSet.size, bSet.size);
}

const genericNewsWords = new Set([
  "after", "today", "says", "amid", "over", "more", "from", "into", "will", "news", "live", "update",
  "updates", "report", "reports", "about", "still", "market", "markets", "world", "global", "latest"
]);

function buildBriefing(articles, clusters, request) {
  const topDomains = buildStats(articles).topDomains.slice(0, 3).map((entry) => entry.label).join(", ");
  const topTags = buildStats(articles).topTags.slice(0, 3).map((entry) => entry.label).join(", ");
  const leadCluster = clusters[0];
  const lines = [
    `${articles.length} материалов за ${request.timespan} по запросу "${request.label}".`,
    topTags ? `Главные темы ленты: ${topTags}.` : "",
    leadCluster ? `Самая заметная история: ${leadCluster.lead.title}${leadCluster.size > 1 ? ` (${leadCluster.size} источника)` : ""}.` : "",
    topDomains ? `Чаще всего встречаются источники: ${topDomains}.` : ""
  ].filter(Boolean);

  return {
    mode: "heuristic",
    lines
  };
}

function buildEmptyNewsPayload(request) {
  return {
    request: buildRequestInfo(request, request.source || "google"),
    articles: [],
    clusters: [],
    stats: buildStats([]),
    summary: { mode: "heuristic", lines: [] },
    briefing: { mode: "heuristic", lines: [] },
    generatedAt: new Date().toISOString()
  };
}

function buildRequestInfo(request, source) {
  return {
    mode: request.mode,
    source,
    category: request.category,
    label: request.label,
    timespan: request.timespan,
    limit: request.limit,
    filters: request.filters || {},
    parsedQuery: request.parsedQuery || null,
    commodity: request.commodity || "",
    query: request.query || "",
    ticker: request.ticker || request.tickerSymbol || ""
  };
}

function inferPrimarySource(clusters) {
  return clusters[0]?.lead?.resolvedSource || clusters[0]?.lead?.provider?.toLowerCase() || "auto";
}

function toCacheKeyRequest(request) {
  return {
    ...request,
    trackHistory: undefined
  };
}

function scheduleGdelt(task) {
  const run = gdeltQueue.catch(() => undefined).then(async () => {
    const waitMs = Math.max(0, gdeltNextAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    gdeltNextAt = Date.now() + GDELT_DELAY_MS;
    return task();
  });
  gdeltQueue = run.catch(() => undefined);
  return run;
}

async function resolveTicker(rawTicker) {
  const symbol = sanitizeTicker(rawTicker);
  if (!symbol) return { symbol: "", name: "" };
  const override = tickerOverrides[symbol] || null;

  const cached = tickerCache.get(symbol);
  if (cached && Date.now() - cached.createdAt < 24 * 60 * 60 * 1000) {
    return cached.value;
  }

  try {
    const params = new URLSearchParams({
      q: symbol,
      quotesCount: "5",
      newsCount: "0"
    });
    const json = await fetchJson(`https://query1.finance.yahoo.com/v1/finance/search?${params.toString()}`, 10000);
    const quotes = Array.isArray(json.quotes) ? json.quotes : [];
    const exact = quotes.find((quote) => String(quote.symbol || "").toUpperCase() === symbol);
    const quote = exact || quotes[0] || {};
    const aliases = compactTerms([
      symbol,
      override?.symbol,
      quote.symbol,
      ...(override?.aliases || []),
      ...quotes.slice(0, 5).map((item) => item.symbol)
    ]).map((value) => sanitizeTicker(value)).filter(Boolean);
    const companyAliases = expandCompanyAliases(
      override?.name,
      ...(override?.companyAliases || []),
      quote.longname,
      quote.shortname,
      quote.prevName,
      ...quotes.slice(0, 5).flatMap((item) => [item.longname, item.shortname, item.prevName])
    );
    const value = {
      symbol: sanitizeTicker(quote.symbol || override?.symbol || symbol),
      name: cleanText(quote.longname || quote.shortname || override?.name || ""),
      aliases,
      companyAliases
    };
    tickerCache.set(symbol, { createdAt: Date.now(), value });
    return value;
  } catch {
    const fallbackAliases = compactTerms([
      symbol,
      override?.symbol,
      ...(override?.aliases || []),
      ...(/^[A-Z]{4}$/.test(symbol) ? [`${symbol}F`, `${symbol}.CN`, `${symbol}.NE`] : [])
    ]).map((value) => sanitizeTicker(value)).filter(Boolean);
    const value = {
      symbol: sanitizeTicker(override?.symbol || symbol),
      name: cleanText(override?.name || ""),
      aliases: fallbackAliases.length ? fallbackAliases : [symbol],
      companyAliases: expandCompanyAliases(override?.name, ...(override?.companyAliases || []))
    };
    tickerCache.set(symbol, { createdAt: Date.now(), value });
    return value;
  }
}

async function fetchJson(url, timeoutMs) {
  const text = await fetchText(url, timeoutMs);
  try {
    return JSON.parse(text);
  } catch {
    if (looksLikeHtmlDocument(text)) {
      throw new Error(classifyUnavailableResponse(text));
    }
    throw new Error(cleanText(stripHtml(text)).slice(0, 160) || "Некорректный JSON-ответ.");
  }
}

async function fetchText(url, timeoutMs) {
  const { html } = await fetchHtml(url, timeoutMs);
  return html;
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": REQUEST_USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();

    if (looksLikeUnavailableHtml(text, contentType)) {
      throw new Error(classifyUnavailableResponse(text));
    }

    if (!response.ok) {
      const message = looksLikeHtmlDocument(text)
        ? classifyUnavailableResponse(text)
        : `${response.status} ${response.statusText}: ${cleanText(stripHtml(text)).slice(0, 120)}`;
      throw new Error(message);
    }
    if (/please limit requests/i.test(text)) {
      throw new Error("Источник просит делать запросы реже. Попробуйте еще раз через несколько секунд.");
    }
    return { html: text, finalUrl: response.url || url };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Источник новостей не ответил вовремя.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readWatchlist() {
  return readNormalizedItems(WATCHLIST_FILE, normalizeWatchItem);
}

async function writeWatchlist(items) {
  await writeItemsFile(WATCHLIST_FILE, items);
}

async function readSearchHistory() {
  return readNormalizedItems(SEARCH_HISTORY_FILE, normalizeHistoryItem);
}

async function writeSearchHistory(items) {
  await writeItemsFile(SEARCH_HISTORY_FILE, items);
}

async function readAlerts() {
  return readNormalizedItems(ALERTS_FILE, normalizeAlert);
}

async function writeAlerts(items) {
  await writeItemsFile(ALERTS_FILE, items);
}

async function readUserTags() {
  return readNormalizedItems(USER_TAGS_FILE, normalizeUserTag);
}

async function writeUserTags(items) {
  await writeItemsFile(USER_TAGS_FILE, items);
}

async function readPushSubscriptions() {
  return readNormalizedItems(PUSH_SUBSCRIPTIONS_FILE, normalizePushSubscription);
}

async function writePushSubscriptions(items) {
  await writeItemsFile(PUSH_SUBSCRIPTIONS_FILE, items);
}

async function ensurePushConfig() {
  if (!vapidConfigPromise) {
    vapidConfigPromise = (async () => {
      const envPublicKey = cleanText(process.env.WEB_PUSH_PUBLIC_KEY || "");
      const envPrivateKey = cleanText(process.env.WEB_PUSH_PRIVATE_KEY || "");
      const subject = cleanText(process.env.WEB_PUSH_SUBJECT || "mailto:alerts@news-agent.local");

      if (envPublicKey && envPrivateKey) {
        webpush.setVapidDetails(subject, envPublicKey, envPrivateKey);
        return { publicKey: envPublicKey, privateKey: envPrivateKey, subject };
      }

      const stored = await readJsonFile(VAPID_KEYS_FILE);
      if (stored?.publicKey && stored?.privateKey) {
        webpush.setVapidDetails(subject, stored.publicKey, stored.privateKey);
        return { publicKey: stored.publicKey, privateKey: stored.privateKey, subject };
      }

      const generated = webpush.generateVAPIDKeys();
      await writeJsonFile(VAPID_KEYS_FILE, generated);
      webpush.setVapidDetails(subject, generated.publicKey, generated.privateKey);
      return { ...generated, subject };
    })();
  }

  return vapidConfigPromise;
}

async function runDueAlertsCheck() {
  if (alertMonitorRunning) return;
  alertMonitorRunning = true;

  try {
    const alerts = await readAlerts();
    if (!alerts.length) return;

    const previousById = new Map(alerts.map((alert) => [alert.id, snapshotAlert(alert)]));
    let changed = false;
    const now = Date.now();
    const nextAlerts = [];

    for (const alert of alerts) {
      if (alert.status !== "ACTIVE") {
        nextAlerts.push(alert);
        continue;
      }

      const lastCheckedAt = alert.lastCheckedAt ? new Date(alert.lastCheckedAt).getTime() : 0;
      const intervalMs = clamp(Number(alert.intervalMinutes || 60), 5, 1440) * 60 * 1000;
      const due = !lastCheckedAt || now - lastCheckedAt >= intervalMs;

      if (!due) {
        nextAlerts.push(alert);
        continue;
      }

      changed = true;

      try {
        const request = await buildNewsRequest(requestToQueryParams(alert.request, { track: "0" }));
        const payload = await fetchNews(request);
        nextAlerts.push({
          ...alert,
          lastCheckedAt: new Date().toISOString(),
          lastMatchCount: payload.articles.length,
          latestHeadline: payload.articles[0]?.title || "",
          lastHitAt: payload.articles[0]?.publishedAt || alert.lastHitAt || null,
          lastError: ""
        });
      } catch (error) {
        nextAlerts.push({
          ...alert,
          lastCheckedAt: new Date().toISOString(),
          lastMatchCount: 0,
          lastError: error.message || "Не удалось обновить алерт."
        });
      }
    }

    if (changed) {
      await writeAlerts(nextAlerts);
      await notifyAlertPushes(collectTriggeredAlerts(previousById, nextAlerts));
    }
  } finally {
    alertMonitorRunning = false;
  }
}

async function readItemsFile(filePath) {
  const parsed = await readJsonOr(filePath, { items: [] });
  return Array.isArray(parsed?.items) ? parsed.items : [];
}

async function readNormalizedItems(filePath, normalizer) {
  const items = await readItemsFile(filePath);
  const normalized = items.map((item) => normalizer(item, { preserveMeta: true })).filter(Boolean);

  if (JSON.stringify(items) !== JSON.stringify(normalized)) {
    await writeItemsFile(filePath, normalized);
  }

  return normalized;
}

async function readJsonFile(filePath) {
  return readJsonOr(filePath, null);
}

async function writeItemsFile(filePath, items) {
  await writeJsonAtomic(filePath, { items });
}

async function writeJsonFile(filePath, value) {
  await writeJsonAtomic(filePath, value);
}

async function renderIndexDocument(req, res) {
  const origin = getPublicOrigin(req);
  const canonicalUrl = getCanonicalUrl(req, origin);
  const socialImageUrl = new URL(DEFAULT_SOCIAL_IMAGE_PATH, `${origin}/`).toString();
  const jsonLd = serializeJsonForHtml({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "News Agent",
    url: origin,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "Global news radar for world events, equities, crypto, commodities, and company signals."
  });

  return (await loadIndexTemplate())
    .replaceAll("__CANONICAL_URL__", escapeHtmlAttribute(canonicalUrl))
    .replaceAll("__OG_IMAGE_URL__", escapeHtmlAttribute(socialImageUrl))
    .replaceAll("__CSP_NONCE__", escapeHtmlAttribute(res.locals.cspNonce || ""))
    .replace("__WEBAPP_JSON_LD__", jsonLd);
}

async function loadIndexTemplate() {
  const stats = await fs.stat(INDEX_TEMPLATE_FILE);
  if (indexTemplateCache.contents && indexTemplateCache.mtimeMs === stats.mtimeMs) {
    return indexTemplateCache.contents;
  }

  indexTemplateCache = {
    mtimeMs: stats.mtimeMs,
    contents: await fs.readFile(INDEX_TEMPLATE_FILE, "utf8")
  };

  return indexTemplateCache.contents;
}

function getPublicOrigin(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  return `${req.protocol}://${req.get("host")}`;
}

function getCanonicalUrl(req, origin) {
  const pathname = req.path === "/index.html" ? "/" : req.path;
  return new URL(pathname || "/", `${origin}/`).toString();
}

function normalizePublicBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

async function recordSearchHistory(requestInfo) {
  const history = await readSearchHistory();
  const signature = buildRequestSignature(requestInfo);
  const nextItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    signature,
    label: requestInfo.label,
    mode: requestInfo.mode,
    request: requestInfo,
    createdAt: new Date().toISOString()
  };
  const withoutSame = history.filter((item) => item.signature !== signature);
  await writeSearchHistory([nextItem, ...withoutSame].slice(0, 25));
}

async function recordSearchHistorySafely(requestInfo) {
  try {
    await recordSearchHistory(requestInfo);
  } catch (error) {
    console.warn("Failed to record search history.", error);
  }
}

function normalizeWatchItem(body, options = {}) {
  const request = normalizeStoredRequestShape(body?.request && typeof body.request === "object" ? body.request : body);
  if (!request) return null;

  const label = cleanText(body?.label || body?.value || defaultStoredRequestLabel(request));
  const value = cleanText(body?.value || request.query || request.ticker || request.commodity || request.category || "");
  if (request.mode !== "world" && !value) return null;

  return {
    id: normalizeEntityId(body?.id, options.preserveMeta),
    mode: request.mode,
    label: label || defaultStoredRequestLabel(request),
    value,
    request,
    signature: buildRequestSignature(request),
    createdAt: normalizeStoredTimestamp(body?.createdAt, options.preserveMeta)
  };
}

function normalizeAlert(body, options = {}) {
  const request = normalizeStoredRequestShape(body?.request && typeof body.request === "object" ? body.request : body);
  const label = cleanText(body?.label || defaultStoredRequestLabel(request));
  const intervalMinutes = clamp(Number(body?.intervalMinutes || 60), 5, 1440);
  if (!request || !label) return null;

  return {
    id: normalizeEntityId(body?.id, options.preserveMeta),
    label,
    signature: buildRequestSignature(request),
    request,
    intervalMinutes,
    createdAt: normalizeStoredTimestamp(body?.createdAt, options.preserveMeta),
    status: body?.status === "PAUSED" ? "PAUSED" : "ACTIVE",
    lastCheckedAt: normalizeOptionalTimestamp(body?.lastCheckedAt),
    lastMatchCount: clamp(Number(body?.lastMatchCount || 0), 0, 100000),
    latestHeadline: cleanText(body?.latestHeadline || ""),
    lastHitAt: normalizeOptionalTimestamp(body?.lastHitAt),
    lastError: cleanText(body?.lastError || "")
  };
}

function normalizeUserTag(body, options = {}) {
  const request = normalizeStoredRequestShape(body?.request && typeof body.request === "object" ? body.request : body);
  const name = cleanText(body?.name || body?.label || "");
  if (!request || !name) return null;

  return {
    id: normalizeEntityId(body?.id, options.preserveMeta),
    name,
    label: name,
    signature: buildRequestSignature(request),
    request,
    createdAt: normalizeStoredTimestamp(body?.createdAt, options.preserveMeta)
  };
}

function normalizeHistoryItem(body, options = {}) {
  const request = normalizeStoredRequestShape(body?.request);
  if (!request) return null;

  return {
    id: normalizeEntityId(body?.id, options.preserveMeta),
    signature: buildRequestSignature(request),
    label: cleanText(body?.label || defaultStoredRequestLabel(request)),
    mode: request.mode,
    request,
    createdAt: normalizeStoredTimestamp(body?.createdAt, options.preserveMeta)
  };
}

function normalizePushSubscription(body, options = {}) {
  const endpoint = cleanText(body?.endpoint || "");
  const p256dh = cleanText(body?.keys?.p256dh || "");
  const auth = cleanText(body?.keys?.auth || "");
  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    expirationTime: body?.expirationTime || null,
    keys: {
      p256dh,
      auth
    },
    createdAt: normalizeStoredTimestamp(body?.createdAt, options.preserveMeta)
  };
}

function normalizeStoredRequestShape(value) {
  if (!value || typeof value !== "object") return null;

  const mode = String(value.mode || "").toLowerCase();
  if (!["world", "ticker", "commodity", "custom"].includes(mode)) return null;

  const source = sanitizeSource(value.source);
  const timespan = sanitizeTimespan(value.timespan);
  const filters = normalizeFilters({
    country: value.filters?.country ?? value.country,
    focus: value.filters?.focus ?? value.focus,
    language: value.filters?.language ?? value.language,
    sourceType: value.filters?.sourceType ?? value.sourceType,
    sortMode: value.filters?.sortMode ?? value.sortMode,
    matchMode: value.filters?.matchMode ?? value.matchMode,
    sourceInclude: Array.isArray(value.filters?.sourceInclude)
      ? value.filters.sourceInclude.join(",")
      : (value.filters?.sourceInclude ?? value.sourceInclude),
    sourceExclude: Array.isArray(value.filters?.sourceExclude)
      ? value.filters.sourceExclude.join(",")
      : (value.filters?.sourceExclude ?? value.sourceExclude),
    exclude: Array.isArray(value.filters?.excludeTerms)
      ? value.filters.excludeTerms.join(",")
      : (value.filters?.excludeTerms ?? value.exclude)
  });

  if (mode === "world") {
    const category = cleanText(value.category || "").toLowerCase();
    if (!category || !Object.prototype.hasOwnProperty.call(worldCategoryPresets, category)) return null;
    return { mode, source, timespan, category, filters };
  }

  if (mode === "ticker") {
    const ticker = sanitizeTicker(value.ticker || value.tickerSymbol || value.query);
    if (!ticker) return null;
    return { mode, source, timespan, ticker, tickerSymbol: ticker, filters };
  }

  if (mode === "commodity") {
    const commodity = cleanText(value.commodity || "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(commodityPresets, commodity)) return null;
    return { mode, source, timespan, commodity, filters };
  }

  const query = cleanText(value.query || value.label || "");
  if (query.length < 2) return null;
  return { mode, source, timespan, query, filters };
}

function defaultStoredRequestLabel(request) {
  if (!request) return "News Agent";
  if (request.mode === "world") return worldCategoryPresets[request.category]?.label || "World news";
  if (request.mode === "ticker") return request.ticker || request.tickerSymbol || "Ticker";
  if (request.mode === "commodity") return commodityPresets[request.commodity]?.label || request.commodity || "Commodity";
  return request.query || "Custom search";
}

function normalizeEntityId(value, preserveMeta) {
  const cleaned = cleanText(value || "");
  if (preserveMeta && cleaned) return cleaned;
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStoredTimestamp(value, preserveMeta) {
  if (preserveMeta) {
    const normalized = normalizeOptionalTimestamp(value);
    if (normalized) return normalized;
  }
  return new Date().toISOString();
}

function normalizeOptionalTimestamp(value) {
  const raw = cleanText(value || "");
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function snapshotAlert(alert) {
  return {
    id: alert.id,
    lastCheckedAt: alert.lastCheckedAt || "",
    lastMatchCount: Number(alert.lastMatchCount || 0),
    latestHeadline: alert.latestHeadline || ""
  };
}

function collectTriggeredAlerts(previousById, nextAlerts) {
  return nextAlerts.filter((alert) => shouldNotifyAlert(previousById.get(alert.id), alert));
}

function shouldNotifyAlert(previous, current) {
  if (!current || current.status !== "ACTIVE") return false;
  if (!previous) return false;
  if (!current.lastCheckedAt || current.lastCheckedAt === previous.lastCheckedAt) return false;
  if (Number(current.lastMatchCount || 0) <= 0) return false;
  if ((current.latestHeadline || "") && current.latestHeadline !== previous.latestHeadline) return true;
  return Number(current.lastMatchCount || 0) > Number(previous.lastMatchCount || 0);
}

async function notifyAlertPushes(alerts) {
  if (!alerts.length) return;

  for (const alert of alerts) {
    const payload = {
      title: `Алерт: ${alert.label}`,
      body: alert.latestHeadline || `${alert.lastMatchCount} новых совпадений`,
      tag: `news-agent-alert-${alert.id}`,
      url: buildAlertUrl(alert),
      alertId: alert.id
    };
    await sendPushToSubscribers(payload);
  }
}

async function sendPushToSubscribers(payload) {
  const subscriptions = await readPushSubscriptions();
  if (!subscriptions.length) return;

  await ensurePushConfig();

  const expired = new Set();
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), {
          TTL: 60,
          urgency: "high"
        });
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          expired.add(subscription.endpoint);
          return;
        }
        console.error("Push delivery failed:", error.message);
      }
    })
  );

  if (expired.size) {
    await writePushSubscriptions(subscriptions.filter((item) => !expired.has(item.endpoint)));
  }
}

function buildRequestSignature(requestInfo) {
  return JSON.stringify({
    mode: requestInfo.mode,
    source: requestInfo.source,
    category: requestInfo.category,
    timespan: requestInfo.timespan,
    filters: requestInfo.filters,
    ticker: requestInfo.ticker || requestInfo.tickerSymbol,
    commodity: requestInfo.commodity,
    query: requestInfo.query
  });
}

function buildStats(articles) {
  const domains = countBy(articles, (article) => article.domain || "Unknown");
  const countries = countBy(articles, (article) => article.sourceCountry || "Unknown");
  const tags = countTags(articles);

  return {
    total: articles.length,
    topDomains: topEntries(domains, 6),
    topCountries: topEntries(countries, 6),
    topTags: topEntries(tags, 8)
  };
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countTags(items) {
  return items.reduce((acc, item) => {
    for (const tag of item.tags || []) {
      acc[tag] = (acc[tag] || 0) + 1;
    }
    return acc;
  }, {});
}

function topEntries(map, limit) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function dedupeArticles(articles) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const result = [];

  for (const article of articles) {
    if (!article.title || !article.url) continue;
    const urlKey = article.url.split("?")[0];
    const titleKey = normalizeTitleKey(article.title);
    if (seenUrls.has(urlKey) || seenTitles.has(titleKey)) continue;
    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    result.push(article);
  }

  return result;
}

function normalizeTitleKey(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .trim();
}

function inferTags(text = "", topic = "") {
  const value = String(text).toLowerCase();
  const feed = String(topic || "").toUpperCase();
  const tags = [];
  const checks = [
    ["политика", ["politics", "election", "government", "parliament", "president", "minister", "vote", "campaign"]],
    ["рынки", ["stock", "market", "shares", "bond", "yield", "earnings", "revenue"]],
    ["акции", ["stock market", "stocks", "equities", "shares", "nasdaq", "nyse", "s&p 500", "dow", "earnings"]],
    ["крипта", ["crypto", "cryptocurrency", "bitcoin", "btc", "ethereum", "eth", "solana", "stablecoin", "blockchain"]],
    ["сырье", ["gold", "silver", "copper", "oil", "gas", "wheat", "uranium", "lithium", "commodity"]],
    ["геополитика", ["war", "conflict", "sanction", "ceasefire", "military", "border"]],
    ["макро", ["inflation", "central bank", "fed", "ecb", "rate", "gdp", "economy"]],
    ["экономика", ["business", "trade", "jobs", "tariff", "growth", "recession"]],
    ["технологии", ["technology", "ai", "chip", "software", "cybersecurity", "startup"]],
    ["наука", ["science", "space", "research", "study", "climate"]],
    ["здоровье", ["health", "medicine", "hospital", "virus", "vaccine"]],
    ["спорт", ["sport", "football", "soccer", "basketball", "tennis", "world cup"]],
    ["культура", ["film", "music", "festival", "movie", "entertainment", "celebrity"]],
    ["риски", ["earthquake", "flood", "wildfire", "storm", "attack", "crisis"]]
  ];

  for (const [tag, words] of checks) {
    if (words.some((word) => matchesNewsTerm(value, word))) tags.push(tag);
  }

  const feedTags = {
    WORLD: "геополитика",
    NATION: "политика",
    BUSINESS: "экономика",
    TECHNOLOGY: "технологии",
    SCIENCE: "наука",
    HEALTH: "здоровье",
    SPORTS: "спорт",
    ENTERTAINMENT: "культура"
  };
  if (feedTags[feed] && !tags.includes(feedTags[feed])) tags.push(feedTags[feed]);

  return tags;
}

function normalizeFilters(queryParams) {
  const nested = queryParams?.filters && typeof queryParams.filters === "object" ? queryParams.filters : {};
  const rawExclude =
    queryParams.exclude ??
    (Array.isArray(nested.excludeTerms) ? nested.excludeTerms.join(",") : nested.excludeTerms || "");
  const rawSourceInclude =
    queryParams.sourceInclude ??
    (Array.isArray(nested.sourceInclude) ? nested.sourceInclude.join(",") : nested.sourceInclude || "");
  const rawSourceExclude =
    queryParams.sourceExclude ??
    (Array.isArray(nested.sourceExclude) ? nested.sourceExclude.join(",") : nested.sourceExclude || "");

  return {
    country: normalizeCountry(queryParams.country ?? nested.country),
    excludeTerms: parseExcludeTerms(rawExclude),
    focus: normalizeFocus(queryParams.focus ?? nested.focus),
    language: normalizeLanguage(queryParams.language ?? nested.language),
    sourceType: normalizeSourceType(queryParams.sourceType ?? nested.sourceType),
    sortMode: normalizeSortMode(queryParams.sortMode ?? nested.sortMode),
    matchMode: normalizeMatchMode(queryParams.matchMode ?? nested.matchMode),
    sourceInclude: parseSourceTerms(rawSourceInclude),
    sourceExclude: parseSourceTerms(rawSourceExclude)
  };
}

function requestToQueryParams(request, extra = {}) {
  return {
    ...extra,
    mode: request?.mode,
    source: request?.source,
    category: request?.category,
    timespan: request?.timespan,
    limit: request?.limit,
    ticker: request?.ticker || request?.tickerSymbol,
    commodity: request?.commodity,
    query: request?.query,
    country: request?.filters?.country,
    focus: request?.filters?.focus,
    language: request?.filters?.language,
    sourceType: request?.filters?.sourceType,
    sortMode: request?.filters?.sortMode,
    matchMode: request?.filters?.matchMode,
    sourceInclude: Array.isArray(request?.filters?.sourceInclude) ? request.filters.sourceInclude.join(",") : request?.filters?.sourceInclude,
    sourceExclude: Array.isArray(request?.filters?.sourceExclude) ? request.filters.sourceExclude.join(",") : request?.filters?.sourceExclude,
    exclude: Array.isArray(request?.filters?.excludeTerms) ? request.filters.excludeTerms.join(",") : request?.filters?.excludeTerms
  };
}

function buildAlertUrl(alert) {
  const params = new URLSearchParams();
  const request = requestToQueryParams(alert?.request || {});

  Object.entries(request).forEach(([key, value]) => {
    if (value == null || value === "" || value === "any") return;
    if (key !== "category" && value === "all") return;
    params.set(key, String(value));
  });

  params.set("mode", alert?.request?.mode || "world");
  return `/?${params.toString()}`;
}

function parseCustomQuery(rawQuery) {
  const raw = cleanText(rawQuery);
  const excludeTerms = [];
  const stripped = raw.replace(/(^|\s)-"([^"]+)"|(^|\s)-(\S+)/g, (_match, _a, quoted, _b, plain) => {
    excludeTerms.push(cleanText(quoted || plain || ""));
    return " ";
  });
  const country = detectCountry(stripped);
  const normalized = cleanText(stripped);
  const rawTerms = compactTerms(splitSearchTerms(normalized));
  const includeTerms = rawTerms.filter((term) => !["news", "latest", "headlines", "today", "новости", "новость", "сегодня"].includes(term));
  const topicTerms = includeTerms.filter((term) => !termBelongsToCountry(term, country));
  const focus = detectCustomQueryFocus(normalized, topicTerms);
  if (country && topicTerms.length === 0) {
    excludeTerms.push("sport", "sports", "football", "soccer", "hockey", "basketball");
    excludeTerms.push(...(countryQueryExclusions[country] || []));
  }
  const searchQuery = cleanText(
    [
      country ? countryPrimaryTerms[country] || countryLexicon[country]?.[0] || country : "",
      ...topicTerms,
      ...excludeTerms.map((term) => `-${term}`)
    ].join(" ")
  ) || raw;

  return {
    raw,
    country,
    excludeTerms,
    includeTerms,
    topicTerms,
    focus,
    searchQuery
  };
}

function detectCustomQueryFocus(raw, topicTerms = []) {
  const text = `${raw} ${topicTerms.join(" ")}`.toLowerCase();
  let bestFocus = "all";
  let bestScore = 0;

  for (const [focus, hints] of Object.entries(customQueryFocusLexicon)) {
    const score = hints.reduce((sum, hint) => sum + (matchesNewsTerm(text, hint) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestFocus = focus;
    }
  }

  return bestScore > 0 ? bestFocus : "all";
}

function termBelongsToCountry(term, country) {
  if (!term) return false;
  const normalized = String(term).toLowerCase();
  if (country && (countryLexicon[country] || []).some((alias) => alias.toLowerCase() === normalized)) return true;
  return Object.entries(countryLexicon).some(([key, aliases]) => key === normalized || aliases.some((alias) => alias.toLowerCase() === normalized));
}

function detectCountry(value) {
  const text = String(value || "").toLowerCase();
  return Object.entries(countryLexicon).find(([, terms]) => terms.some((term) => matchesNewsTerm(text, term)))?.[0] || "";
}

function sanitizeSource(source) {
  const value = String(source || "google").toLowerCase();
  return Object.prototype.hasOwnProperty.call(sourcePresets, value) ? value : "google";
}

function getSearchLimit(timespan) {
  const map = {
    "1h": 60,
    "6h": 90,
    "12h": 120,
    "24h": 180,
    "48h": 220,
    "72h": 260,
    "7d": 320
  };
  return map[timespan] || 180;
}

function buildGoogleNewsParams(request) {
  const country = normalizeCountry(request?.filters?.country);
  return googleNewsRegions[country] || googleNewsRegions.usa;
}

function getGoogleCountrySearchTerm(request) {
  const country = normalizeCountry(request?.filters?.country);
  if (!country) return "";
  return countryPrimaryTerms[country] || countryLexicon[country]?.[0] || country;
}

function shouldInjectCountryIntoQuery(request) {
  if (!request?.filters?.country) return false;
  if (request.mode === "ticker") return false;
  if (request.mode === "commodity") return false;
  return true;
}

function shouldHardFilterByCountry(request) {
  if (!request?.filters?.country) return false;
  if (request.mode === "ticker") return false;
  if (request.mode === "commodity") return false;
  return true;
}

function sanitizeTimespan(timespan) {
  const value = String(timespan || "24h").toLowerCase();
  return ["1h", "6h", "12h", "24h", "48h", "72h", "7d"].includes(value) ? value : "24h";
}

function sanitizeWorldCategory(category) {
  const value = String(category || "all").toLowerCase();
  return Object.prototype.hasOwnProperty.call(worldCategoryPresets, value) ? value : "all";
}

function normalizeFocus(value) {
  const key = String(value || "all").toLowerCase();
  return Object.prototype.hasOwnProperty.call(focusPresets, key) ? key : "all";
}

function normalizeLanguage(value) {
  const key = String(value || "any").toLowerCase();
  return Object.prototype.hasOwnProperty.call(languagePresets, key) ? key : "any";
}

function normalizeSourceType(value) {
  const key = String(value || "any").toLowerCase();
  return Object.prototype.hasOwnProperty.call(sourceTypePresets, key) ? key : "any";
}

function normalizeSortMode(value) {
  const key = String(value || "relevance").toLowerCase();
  return Object.prototype.hasOwnProperty.call(sortModePresets, key) ? key : "relevance";
}

function normalizeMatchMode(value) {
  const key = String(value || "balanced").toLowerCase();
  return Object.prototype.hasOwnProperty.call(matchModePresets, key) ? key : "balanced";
}

function normalizeCountry(value) {
  if (!value) return "";
  const key = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(countryLexicon, key)) return key;
  return detectCountry(key) || key;
}

function parseExcludeTerms(value) {
  return compactTerms(String(value || "").split(","));
}

function parseSourceTerms(value) {
  return compactTerms(String(value || "").split(",").map((term) => term.replace(/^www\./i, "")));
}

function minScoreForRequest(request, mode) {
  const matchMode = request.filters?.matchMode || "balanced";
  const thresholds = {
    custom: { strict: 8, balanced: 4, broad: 2 },
    ticker: { strict: 6, balanced: 3, broad: 2 },
    commodity: { strict: 4, balanced: 2, broad: 1 }
  };
  return thresholds[mode]?.[matchMode] ?? thresholds[mode]?.balanced ?? 2;
}

function sanitizeTicker(value) {
  return String(value || "")
    .trim()
    .replace(/^\$/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function toGoogleWhen(timespan) {
  const map = {
    "1h": "1h",
    "6h": "6h",
    "12h": "12h",
    "24h": "1d",
    "48h": "2d",
    "72h": "3d",
    "7d": "7d"
  };
  return map[timespan] || "1d";
}

function isRecent(value, timespan) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;

  const hours = {
    "1h": 1,
    "6h": 6,
    "12h": 12,
    "24h": 24,
    "48h": 48,
    "72h": 72,
    "7d": 24 * 7
  }[timespan] || 24;

  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const raw = String(value).trim();
  const gdelt = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);

  if (gdelt) {
    const [, year, month, day, hour, minute, second] = gdelt.map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseGoogleSource(source) {
  if (!source) return { name: "" };
  if (typeof source === "string") return { name: source };
  return {
    name: cleanText(source.text || source["#text"] || "")
  };
}

function cleanGoogleTitle(title, sourceName) {
  if (!sourceName) return title;
  return title.replace(new RegExp(`\\s+-\\s+${escapeRegExp(sourceName)}$`, "i"), "");
}

function readFeedText(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readFeedText).join(" ");
  if (typeof value === "object") return readFeedText(value.text || value["#text"] || value._ || value.href || "");
  return "";
}

function choosePreferredSummary(existing, candidate, title = "") {
  const current = normalizeArticleSummary(existing, title);
  const next = normalizeArticleSummary(candidate, title);

  if (!next) return current;
  if (!current) return next;
  if (looksNoisySummary(next) && !looksNoisySummary(current)) return current;
  if (current.length >= 120 && next.length > current.length) return current;
  if (next.length > current.length + 18 && next.length <= 220) return next;
  return current;
}

function normalizeArticleSummary(value, title = "") {
  let text = cleanText(stripHtml(decodeHtml(String(value || ""))));
  if (!text) return "";

  const normalizedTitle = cleanText(decodeHtml(String(title || "")));
  if (normalizedTitle) {
    const escapedTitle = escapeRegExp(normalizedTitle);
    text = text.replace(new RegExp(`^${escapedTitle}[\\s:,-]+`, "i"), "");
  }

  text = text
    .replace(/\s*[|•·]\s*/g, " • ")
    .replace(/\s{2,}/g, " ")
    .trim();

  text = stripGoogleNewsBoilerplate(text);

  text = text.replace(/^(?:Reuters|BBC|CNN|AP News|The New York Times|New York Times|Washington Post|Bloomberg|CNBC|ABC News|CBS News|MarketWatch|Yahoo Finance|Fox News|NPR|Politico|Haaretz|Jerusalem Post|DW)\b[\s:,-]*/i, "").trim();

  if (looksNoisySummary(text)) return "";

  if (text.length > 240) {
    const clipped = text.slice(0, 237);
    const safeEdge = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf(" • "), clipped.lastIndexOf(" "));
    text = `${clipped.slice(0, safeEdge > 120 ? safeEdge : 237).trim()}...`;
  }

  return text;
}

function looksNoisySummary(text) {
  if (!text) return true;
  if (!stripGoogleNewsBoilerplate(text)) return true;
  const sourceMatches = String(text || "").match(/\b(?:Reuters|BBC|CNN|AP News|The New York Times|New York Times|Washington Post|Bloomberg|CNBC|ABC News|CBS News|MarketWatch|Yahoo Finance|Fox News|NPR|Politico|Haaretz|Jerusalem Post|DW)\b/gi) || [];
  return sourceMatches.length >= 2;
}

function stripGoogleNewsBoilerplate(text) {
  return cleanText(
    String(text || "")
      .replace(/See more headlines\s*&\s*perspectives on Google News\.?/gi, "")
      .replace(/Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News\.?/gi, "")
      .replace(/Full coverage of the latest news, gathered from sources around the world by Google News\.?/gi, "")
  );
}

function extractFeedImage(item, baseUrl = "", html = "") {
  const candidates = [
    item?.enclosure,
    item?.["media:content"],
    item?.["media:thumbnail"],
    item?.["media:group"]?.["media:content"],
    item?.["media:group"]?.["media:thumbnail"],
    item?.thumbnail,
    item?.image
  ]
    .flatMap(collectImageCandidates)
    .concat(extractImageUrlsFromHtml(html, baseUrl));

  return candidates.find(Boolean) || "";
}

function collectImageCandidates(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectImageCandidates);

  if (typeof value === "string") {
    return looksLikeImageUrl(value) ? [value] : [];
  }

  if (typeof value === "object") {
    const url = normalizeUrl(value.url || value.href || value.link || value.src || "");
    const type = String(value.type || "").toLowerCase();
    const medium = String(value.medium || "").toLowerCase();
    if (url && (looksLikeImageUrl(url) || type.startsWith("image/") || medium === "image")) {
      return [url];
    }
  }

  return [];
}

function extractPagePreviewImage(html, baseUrl) {
  const sources = [
    extractMetaContent(html, /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i),
    extractMetaContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i),
    extractMetaContent(html, /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i),
    extractMetaContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i),
    extractMetaContent(html, /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i),
    extractMetaContent(html, /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i),
    ...extractImageUrlsFromHtml(html, baseUrl)
  ];

  for (const source of sources) {
    const normalized = absolutizeUrl(source, baseUrl);
    if (isViableNewsImage(normalized)) return normalized;
  }

  return "";
}

function extractMetaContent(html, pattern) {
  const match = String(html || "").match(pattern);
  return cleanText(decodeHtml(match?.[1] || ""));
}

function extractMetaDescription(html, title = "") {
  return normalizeArticleSummary(
    extractMetaContent(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
    extractMetaContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
    title
  );
}

function extractPageText(html) {
  if (!html) return "";
  const source = String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");
  const articleChunk =
    source.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] ||
    source.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ||
    source.match(/<body\b[^>]*>[\s\S]*?<\/body>/i)?.[0] ||
    source;
  return cleanText(stripHtml(articleChunk)).slice(0, 6000);
}

function extractImageUrlsFromHtml(html, baseUrl = "") {
  const matches = [];
  const source = String(html || "");
  const imagePattern = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;

  while ((match = imagePattern.exec(source))) {
    const normalized = absolutizeUrl(match[1], baseUrl);
    if (normalized) matches.push(normalized);
  }

  return matches;
}

function isViableNewsImage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith("data:")) return false;
  if (/(logo|sprite|icon|avatar|favicon|amphtml|pixel|tracking)/i.test(lower)) return false;
  return true;
}

function isGenericAggregatorImage(imageUrl, articleUrl) {
  const imageHost = getDomain(imageUrl);
  const articleHost = getDomain(articleUrl);
  if (!imageHost) return false;
  if (imageHost.includes("googleusercontent.com") && articleHost.includes("news.google.com")) return true;
  return false;
}

function looksLikeImageUrl(url) {
  return /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(String(url || ""));
}

function absolutizeUrl(value, baseUrl) {
  const url = cleanText(decodeHtml(String(value || "")));
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (!baseUrl) return "";

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeUrl(value) {
  const url = cleanText(decodeHtml(String(value || "")));
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function normalizeFeedLink(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const alternate = value.find((entry) => entry?.rel === "alternate" && entry?.href) || value.find((entry) => entry?.href);
    return normalizeFeedLink(alternate || value[0]);
  }
  if (typeof value === "object") return value.href || value.text || value["#text"] || value._ || "";
  return String(value);
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function looksLikeHtmlDocument(value) {
  const text = String(value || "");
  return /<!doctype html|<html\b|<head\b|<body\b/i.test(text);
}

function looksLikeUnavailableHtml(value, contentType = "") {
  const text = String(value || "");
  if (!looksLikeHtmlDocument(text) && !String(contentType || "").includes("text/html")) return false;
  const lower = text.toLowerCase();
  return /service suspended|temporarily unavailable|access denied|error 403|error 404|error 500|error 502|error 503|forbidden|unavailable/i.test(lower);
}

function classifyUnavailableResponse(value) {
  const text = cleanText(stripHtml(String(value || ""))).toLowerCase();
  if (/service suspended|temporarily unavailable|error 503|error 502|maintenance|unavailable/.test(text)) {
    return "Источник временно недоступен.";
  }
  if (/access denied|forbidden|error 403/.test(text)) {
    return "Источник заблокировал запрос.";
  }
  if (/not found|error 404/.test(text)) {
    return "Источник недоступен по этому адресу.";
  }
  return "Источник вернул некорректный ответ.";
}

function isProviderUnavailableError(message) {
  const text = String(message || "").toLowerCase();
  return [
    "источник временно недоступен",
    "источник заблокировал запрос",
    "источник недоступен по этому адресу",
    "источник вернул некорректный ответ",
    "источник новостей не ответил вовремя",
    "fetch failed"
  ].some((part) => text.includes(part));
}

function isDeadArticlePageError(message) {
  const text = String(message || "").toLowerCase();
  return [
    "источник временно недоступен",
    "источник недоступен по этому адресу"
  ].some((part) => text.includes(part));
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
