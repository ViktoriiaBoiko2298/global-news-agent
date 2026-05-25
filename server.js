import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { XMLParser } from "fast-xml-parser";
import webpush from "web-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const GOOGLE_TOP_RSS = "https://news.google.com/rss";
const GOOGLE_TOPIC_RSS = "https://news.google.com/rss/headlines/section/topic";
const DATA_DIR = path.resolve(process.env.NEWS_AGENT_DATA_DIR || path.join(__dirname, "data"));
const WATCHLIST_FILE = path.join(DATA_DIR, "watchlist.json");
const SEARCH_HISTORY_FILE = path.join(DATA_DIR, "search-history.json");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const USER_TAGS_FILE = path.join(DATA_DIR, "user-tags.json");
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const VAPID_KEYS_FILE = path.join(DATA_DIR, "vapid-keys.json");
const CACHE_TTL_MS = 5 * 60 * 1000;
const GDELT_DELAY_MS = 5500;
const ALERT_MONITOR_TICK_MS = 60 * 1000;

const cache = new Map();
const tickerCache = new Map();
let gdeltQueue = Promise.resolve();
let gdeltNextAt = 0;
let alertMonitorRunning = false;
let vapidConfigPromise = null;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text"
});

const commodityPresets = {
  copper: {
    label: "Медь",
    query: '(copper OR "copper prices" OR "LME copper" OR "copper futures" OR "copper mine")'
  },
  gold: {
    label: "Золото",
    query: '(gold OR "gold prices" OR "gold futures" OR "central bank gold" OR "safe haven gold")'
  },
  silver: {
    label: "Серебро",
    query: '(silver OR "silver prices" OR "silver futures" OR "industrial silver")'
  },
  oil: {
    label: "Нефть",
    query: '(oil OR "crude oil" OR Brent OR WTI OR OPEC OR "oil prices")'
  },
  gas: {
    label: "Газ",
    query: '("natural gas" OR LNG OR "gas prices" OR "European gas" OR "gas storage")'
  },
  wheat: {
    label: "Пшеница",
    query: '(wheat OR "wheat prices" OR grain OR "grain exports" OR "Black Sea grain")'
  },
  lithium: {
    label: "Литий",
    query: '(lithium OR "lithium prices" OR "battery metals" OR "lithium mine")'
  },
  uranium: {
    label: "Уран",
    query: '(uranium OR "uranium prices" OR nuclear OR "uranium mine" OR "nuclear fuel")'
  }
};

const worldCategoryPresets = {
  all: {
    label: "Политика + обычные",
    topics: ["TOP", "WORLD", "NATION", "BUSINESS", "TECHNOLOGY", "SCIENCE", "HEALTH", "ENTERTAINMENT", "SPORTS"],
    query:
      '(politics OR election OR government OR parliament OR diplomacy OR "world news" OR economy OR markets OR technology OR health OR science OR sports OR culture OR entertainment OR weather OR travel)',
    googleQuery:
      "politics OR election OR government OR economy OR technology OR health OR science OR sports OR entertainment"
  },
  politics: {
    label: "Политика",
    topics: ["WORLD", "NATION"],
    query:
      '(politics OR election OR government OR parliament OR president OR diplomacy OR sanctions OR conflict OR "foreign policy" OR minister)',
    googleQuery: "politics OR election OR government OR parliament OR diplomacy"
  },
  ordinary: {
    label: "Обычные новости",
    topics: ["TOP", "HEALTH", "SCIENCE", "TECHNOLOGY", "ENTERTAINMENT", "SPORTS"],
    query:
      '("top stories" OR health OR science OR technology OR sports OR culture OR entertainment OR weather OR travel OR education OR lifestyle)',
    googleQuery: "top stories OR health OR science OR technology OR sports OR entertainment"
  },
  economy: {
    label: "Экономика",
    topics: ["BUSINESS", "WORLD"],
    query:
      '(economy OR markets OR inflation OR "central bank" OR rates OR trade OR business OR jobs OR GDP)',
    googleQuery: "economy OR markets OR inflation OR central bank OR business"
  },
  technology: {
    label: "Технологии",
    topics: ["TECHNOLOGY", "SCIENCE", "BUSINESS"],
    query:
      '(technology OR AI OR chips OR software OR cybersecurity OR science OR startup OR "electric vehicles")',
    googleQuery: "technology OR AI OR chips OR cybersecurity OR science"
  }
};

const sourcePresets = {
  auto: "Авто: Google + сайты",
  google: "Google News",
  feeds: "Популярные сайты",
  yahoo: "Yahoo Finance",
  investing: "Investing.com",
  benzinga: "Benzinga",
  cnbc: "CNBC",
  marketwatch: "MarketWatch",
  nytimes: "NYTimes",
  npr: "NPR",
  fox: "Fox News",
  gdelt: "GDELT"
};

const commodityKeywords = {
  copper: ["copper", "lme copper", "copper futures", "copper mine"],
  gold: ["gold", "xau", "gold futures", "central bank gold"],
  silver: ["silver", "silver futures"],
  oil: ["oil", "crude", "brent", "wti", "opec"],
  gas: ["natural gas", "lng", "gas prices"],
  wheat: ["wheat", "grain", "grain exports"],
  lithium: ["lithium", "battery metals"],
  uranium: ["uranium", "nuclear fuel"]
};

const focusPresets = {
  all: "Все темы",
  politics: "Политика",
  markets: "Рынки",
  companies: "Компании",
  commodities: "Сырье",
  tech: "Технологии",
  science: "Наука и здоровье"
};

const languagePresets = {
  any: "Любой язык",
  english: "English",
  russian: "Русский"
};

const sourceTypePresets = {
  any: "Все источники",
  major: "Крупные медиа",
  market: "Рынки и финансы",
  specialist: "Нишевые источники"
};

const sortModePresets = {
  relevance: "По релевантности",
  newest: "Сначала новые",
  quality: "Сначала сильные источники"
};

const matchModePresets = {
  balanced: "Баланс",
  strict: "Строго",
  broad: "Шире"
};

const countryLexicon = {
  canada: ["canada", "canadian", "канада", "канада", "ottawa", "ontario", "toronto", "quebec"],
  usa: ["united states", "u.s.", "u.s", "usa", "america", "american", "сша", "америка", "америки", "американский", "американские", "washington"],
  uk: ["united kingdom", "britain", "british", "uk", "англия", "британия", "london", "england"],
  eu: ["european union", "eu", "europe", "евросоюз", "европа", "brussels"],
  china: ["china", "chinese", "китай", "китайский", "beijing"],
  india: ["india", "indian", "индия", "индийский", "new delhi"],
  japan: ["japan", "japanese", "япония", "японский", "tokyo"],
  ukraine: ["ukraine", "ukrainian", "украина", "украинский", "kyiv", "kiev"],
  russia: ["russia", "russian", "россия", "российский", "moscow"],
  israel: ["israel", "israeli", "израиль", "израильский", "tel aviv", "jerusalem"],
  iran: ["iran", "iranian", "иран", "иранский", "tehran"],
  germany: ["germany", "german", "германия", "немецкий", "berlin"],
  france: ["france", "french", "франция", "французский", "paris"],
  mexico: ["mexico", "mexican", "мексика", "мексиканский", "mexico city"],
  australia: ["australia", "australian", "австралия", "австралийский", "sydney", "canberra"]
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

const sourceProfiles = {
  "google news": { tier: "major", type: "aggregator", quality: 80 },
  "yahoo finance": { tier: "market", type: "finance", quality: 74 },
  "investing.com": { tier: "market", type: "finance", quality: 72 },
  benzinga: { tier: "market", type: "market-blog", quality: 70 },
  cnbc: { tier: "major", type: "business-tv", quality: 82 },
  marketwatch: { tier: "market", type: "financial-media", quality: 80 },
  nytimes: { tier: "major", type: "newspaper", quality: 88 },
  "the new york times": { tier: "major", type: "newspaper", quality: 88 },
  npr: { tier: "major", type: "public-media", quality: 85 },
  "fox news": { tier: "major", type: "cable-news", quality: 76 },
  "the washington post": { tier: "major", type: "newspaper", quality: 87 },
  wsj: { tier: "major", type: "business-press", quality: 89 },
  reuters: { tier: "major", type: "wire", quality: 92 },
  bloomberg: { tier: "major", type: "financial-wire", quality: 90 },
  bbc: { tier: "major", type: "public-media", quality: 88 },
  gdelt: { tier: "specialist", type: "dataset", quality: 65 }
};

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

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
  const exists = list.some((existing) => existing.signature === item.signature);
  const next = exists ? list : [item, ...list].slice(0, 30);
  await writeWatchlist(next);
  res.status(exists ? 200 : 201).json({ item, items: next });
});

app.post("/api/user-tags", async (req, res) => {
  const item = normalizeUserTag(req.body);
  if (!item) {
    res.status(400).json({ error: "Некорректный пользовательский тег." });
    return;
  }

  const items = await readUserTags();
  const normalizedName = item.name.toLowerCase();
  const next = [item, ...items.filter((entry) => entry.name.toLowerCase() !== normalizedName)].slice(0, 40);
  await writeUserTags(next);
  res.status(201).json({ item, items: next });
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
  const next = [alert, ...alerts.filter((item) => item.signature !== alert.signature)].slice(0, 40);
  await writeAlerts(next);
  res.status(201).json({ item: alert, items: next });
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
      if (request.trackHistory) await recordSearchHistory(payload.request);
      res.json(payload);
      return;
    }

    const payload = await fetchNews(request);
    cache.set(cacheKey, { createdAt: Date.now(), payload });
    if (request.trackHistory) await recordSearchHistory(payload.request);
    res.json({ ...payload, cached: false });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Не удалось получить новости."
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
  const limit = clamp(Number(queryParams.limit || 30), 5, 60);
  const filters = normalizeFilters(queryParams);
  const trackHistory = queryParams.track !== "0";

  if (mode === "world") {
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
    const ticker = sanitizeTicker(queryParams.ticker || queryParams.query);
    if (!ticker) throw new Error("Введите тикер компании.");
    const resolved = await resolveTicker(ticker);
    const company = resolved.name && resolved.name !== ticker ? resolved.name : "";
    const query = company
      ? `("${resolved.symbol}" OR "${company}") (stock OR shares OR earnings OR revenue OR guidance OR merger OR acquisition OR analyst)`
      : `("${resolved.symbol}" OR "$${resolved.symbol}") (stock OR shares OR earnings OR revenue OR guidance OR merger OR acquisition OR analyst)`;
    return {
      mode,
      source,
      limit,
      timespan,
      trackHistory,
      filters,
      label: company ? `${resolved.symbol} - ${company}` : resolved.symbol,
      tickerSymbol: resolved.symbol,
      company,
      query,
      googleQuery: company ? `${resolved.symbol} ${company} stock` : `${resolved.symbol} stock`
    };
  }

  if (mode === "commodity") {
    const key = String(queryParams.commodity || "gold").toLowerCase();
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

  for (const provider of providers) {
    try {
      const articles = await fetchProviderArticles(provider, request);
      collected.push(...articles.map((article) => ({ ...article, resolvedSource: provider.source })));

      const processed = finalizeArticlesForRequest(collected, request).slice(0, request.limit);
      if (processed.length > 0 && provider.source !== "auto") break;
    } catch (error) {
      errors.push(`${provider.source}: ${error.message}`);
    }
  }

  const processed = finalizeArticlesForRequest(collected, request).slice(0, request.limit);
  if (!processed.length) {
    throw new Error(errors.length ? errors.join("; ") : "Новости не найдены.");
  }

  const clusters = buildStoryClusters(processed).slice(0, request.limit);
  const requestInfo = buildRequestInfo(request, collected.some((article) => article.resolvedSource === "auto") ? "auto" : inferPrimarySource(clusters));

  return {
    request: requestInfo,
    articles: processed,
    clusters,
    stats: buildStats(processed),
    summary: buildBriefing(processed, clusters, requestInfo),
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
  const params = new URLSearchParams({
    hl: "en-US",
    gl: "US",
    ceid: "US:en"
  });

  if (request.mode === "world") {
    const feeds = request.googleTopics.map((topic) => fetchGoogleTopicArticles(topic, params));
    const settled = await Promise.allSettled(feeds);
    const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    return rankWorldArticles(articles, request);
  }

  const query = `${request.googleQuery || request.query} when:${toGoogleWhen(request.timespan)}`;
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
    return {
      title: cleanGoogleTitle(cleanText(item.title), source.name),
      url: item.link,
      image: "",
      domain: source.name || getDomain(item.link),
      sourceCountry: "",
      language: "English",
      publishedAt: normalizeDate(item.pubDate),
      provider: "Google News",
      tags: inferTags(item.title, topic)
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
  if (category === "ordinary") return tags.has("политика") || tags.has("геополитика") ? 0 : 2;
  if (category === "economy") return tags.has("экономика") || tags.has("рынки") || tags.has("макро") ? 3 : 1;
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
    const summary = cleanText(stripHtml(readFeedText(item.description || item.summary || item["content:encoded"] || item.content)));
    const url = normalizeFeedLink(item.link || item.guid || item.id);

    return {
      title,
      url,
      image: "",
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
      ? ["yahoo", "investing", "benzinga", "cnbc", "marketwatch", "nytimes", "npr", "fox"]
      : [sourceMode];
  const feeds = [];
  const add = (source, label, url, topic = "") => {
    if (selectedSources.includes(source)) feeds.push({ source, label, url, topic });
  };

  add("yahoo", "Yahoo Finance", "https://finance.yahoo.com/rss/topstories", "BUSINESS");
  if (request.tickerSymbol) {
    add(
      "yahoo",
      "Yahoo Finance",
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(request.tickerSymbol)}&region=US&lang=en-US`,
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

function articleMatchesRequest(article, request) {
  const tags = new Set(article.tags || []);
  const filters = request.filters || {};
  const score = scoreArticleForRequest(article, request);

  if (filters.language !== "any" && !languageMatches(article, filters.language)) return false;
  if (filters.sourceType !== "any" && inferSourceQuality(article).tier !== filters.sourceType) return false;
  if (filters.country && !articleMatchesCountry(article, filters.country)) return false;
  if (!sourceAllowed(article, filters)) return false;

  if (request.mode === "world") {
    if (request.category === "politics" && !(tags.has("политика") || tags.has("геополитика"))) return false;
    if (request.category === "ordinary" && (tags.has("политика") || tags.has("геополитика"))) return false;
    if (request.category === "economy" && !(tags.has("экономика") || tags.has("рынки") || tags.has("макро"))) return false;
    if (request.category === "technology" && !(tags.has("технологии") || tags.has("наука"))) return false;
  }

  if (filters.focus !== "all" && !articleMatchesFocus(article, filters.focus)) return false;

  if (request.mode === "custom") return score >= minScoreForRequest(request, "custom");
  if (request.mode === "ticker") return score >= minScoreForRequest(request, "ticker");
  if (request.mode === "commodity") return score >= minScoreForRequest(request, "commodity");
  return true;
}

function getRequestTerms(request) {
  if (request.mode === "ticker") {
    return compactTerms([
      request.tickerSymbol,
      request.company,
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

function compactTerms(terms) {
  const stopwords = new Set([
    "and",
    "or",
    "the",
    "for",
    "with",
    "stock",
    "shares",
    "inc",
    "corp",
    "company",
    "price",
    "prices",
    "news",
    "latest",
    "headlines",
    "today",
    "новости",
    "новость",
    "сегодня",
    "срочно",
    "главное"
  ]);
  return [...new Set(terms.map((term) => cleanText(term).toLowerCase()).filter((term) => term.length > 2 && !stopwords.has(term)))];
}

function splitSearchTerms(value) {
  return String(value || "").split(/[^\p{L}\p{N}$.-]+/u);
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

function compareArticlesByRelevance(a, b) {
  if ((b.relevanceScore || 0) !== (a.relevanceScore || 0)) {
    return (b.relevanceScore || 0) - (a.relevanceScore || 0);
  }
  if ((b.sourceQuality?.quality || 0) !== (a.sourceQuality?.quality || 0)) {
    return (b.sourceQuality?.quality || 0) - (a.sourceQuality?.quality || 0);
  }
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
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
  const text = `${article.title} ${article.summary || ""} ${article.domain || ""}`.toLowerCase();
  const title = String(article.title || "").toLowerCase();
  const quality = inferSourceQuality(article).quality;
  const requestCountry = request.filters?.country || request.parsedQuery?.country || "";
  const countryStrength = requestCountry ? countryMentionStrength(article, requestCountry) : 0;
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

  if (request.filters?.focus !== "all" && articleMatchesFocus(article, request.filters.focus)) score += 4;
  if (request.mode === "world") score += getWorldPriority(article, request.category || "all");

  return score;
}

function articleMatchesFocus(article, focus) {
  if (focus === "all") return true;
  const tags = new Set(article.tags || []);
  if (focus === "politics") return tags.has("политика") || tags.has("геополитика");
  if (focus === "markets") return tags.has("рынки") || tags.has("макро") || tags.has("экономика");
  if (focus === "companies") return tags.has("рынки") || tags.has("экономика");
  if (focus === "commodities") return tags.has("сырье");
  if (focus === "tech") return tags.has("технологии");
  if (focus === "science") return tags.has("наука") || tags.has("здоровье");
  return true;
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
  return countryMentionStrength(article, country) > 0;
}

function countryMentionStrength(article, country) {
  if (!country) return 0;
  const terms = getCountryTerms(country);
  const title = String(article.title || "").toLowerCase();
  const summary = `${article.summary || ""} ${article.sourceCountry || ""} ${article.domain || ""}`.toLowerCase();

  const titleMatch = terms.some((term) => matchesNewsTerm(title, term));
  const summaryMatch = terms.some((term) => matchesNewsTerm(summary, term));

  if (titleMatch && summaryMatch) return 4;
  if (titleMatch) return 3;
  if (summaryMatch) return 2;
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
    ticker: request.tickerSymbol || ""
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
    const value = {
      symbol,
      name: cleanText(quote.longname || quote.shortname || symbol)
    };
    tickerCache.set(symbol, { createdAt: Date.now(), value });
    return value;
  } catch {
    const value = { symbol, name: symbol };
    tickerCache.set(symbol, { createdAt: Date.now(), value });
    return value;
  }
}

async function fetchJson(url, timeoutMs) {
  const text = await fetchText(url, timeoutMs);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(cleanText(text).slice(0, 160) || "Некорректный JSON-ответ.");
  }
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "GlobalNewsAgent/1.0"
      }
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${cleanText(text).slice(0, 120)}`);
    }
    if (/please limit requests/i.test(text)) {
      throw new Error("Источник просит делать запросы реже. Попробуйте еще раз через несколько секунд.");
    }
    return text;
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
  return readItemsFile(WATCHLIST_FILE);
}

async function writeWatchlist(items) {
  await writeItemsFile(WATCHLIST_FILE, items);
}

async function readSearchHistory() {
  return readItemsFile(SEARCH_HISTORY_FILE);
}

async function writeSearchHistory(items) {
  await writeItemsFile(SEARCH_HISTORY_FILE, items);
}

async function readAlerts() {
  return readItemsFile(ALERTS_FILE);
}

async function writeAlerts(items) {
  await writeItemsFile(ALERTS_FILE, items);
}

async function readUserTags() {
  return readItemsFile(USER_TAGS_FILE);
}

async function writeUserTags(items) {
  await writeItemsFile(USER_TAGS_FILE, items);
}

async function readPushSubscriptions() {
  return readItemsFile(PUSH_SUBSCRIPTIONS_FILE);
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
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeItemsFile(filePath, items) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ items }, null, 2));
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
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

function normalizeWatchItem(body) {
  const mode = String(body?.mode || "").toLowerCase();
  const request = body?.request && typeof body.request === "object" ? body.request : null;
  const label = cleanText(body?.label || request?.label || body?.query || body?.ticker || body?.commodity || "");
  const value = cleanText(body?.value || body?.query || body?.ticker || body?.commodity || "");

  if (!["world", "ticker", "commodity", "custom"].includes(mode)) return null;
  if (mode !== "world" && !value && !request) return null;

  const signature = buildRequestSignature(request || { mode, label, value });
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode,
    label: label || "Мировые новости",
    value,
    request,
    signature,
    createdAt: new Date().toISOString()
  };
}

function normalizeAlert(body) {
  const request = body?.request && typeof body.request === "object" ? body.request : null;
  const label = cleanText(body?.label || request?.label || "");
  const intervalMinutes = clamp(Number(body?.intervalMinutes || 60), 5, 1440);
  if (!request || !label) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    signature: buildRequestSignature(request),
    request,
    intervalMinutes,
    createdAt: new Date().toISOString(),
    status: "ACTIVE"
  };
}

function normalizeUserTag(body) {
  const request = body?.request && typeof body.request === "object" ? body.request : null;
  const name = cleanText(body?.name || body?.label || "");
  if (!request || !name) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    label: name,
    signature: buildRequestSignature(request),
    request,
    createdAt: new Date().toISOString()
  };
}

function normalizePushSubscription(body) {
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
    createdAt: new Date().toISOString()
  };
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
    label: requestInfo.label,
    value: requestInfo.value,
    source: requestInfo.source,
    category: requestInfo.category,
    timespan: requestInfo.timespan,
    filters: requestInfo.filters,
    parsedQuery: requestInfo.parsedQuery,
    ticker: requestInfo.ticker,
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

function matchesNewsTerm(value, term) {
  if (/^[a-z0-9.-]+$/i.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(value);
  }
  return value.includes(term);
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
    ticker: request?.ticker,
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
    if (value == null || value === "" || value === "all" || value === "any") return;
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
  if (country && topicTerms.length === 0) {
    excludeTerms.push("sport", "sports", "football", "soccer", "hockey", "basketball");
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
    searchQuery
  };
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
  const value = String(source || "auto").toLowerCase();
  return Object.prototype.hasOwnProperty.call(sourcePresets, value) ? value : "auto";
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
