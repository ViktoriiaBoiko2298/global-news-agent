import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "output", "search-audit");
const dataDir = path.join(outputDir, "data");
const port = Number(process.env.SEARCH_AUDIT_PORT || 3020);
const baseUrl = `http://127.0.0.1:${port}`;
const requestTimeoutMs = Number(process.env.SEARCH_AUDIT_TIMEOUT_MS || 35000);

const matrix = [
  {
    id: "world-all",
    label: "World / All",
    params: { mode: "world", category: "all", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "all" }
  },
  {
    id: "world-politics",
    label: "World / Politics",
    params: { mode: "world", category: "politics", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "politics" }
  },
  {
    id: "world-ordinary",
    label: "World / Ordinary",
    params: { mode: "world", category: "ordinary", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "ordinary" }
  },
  {
    id: "world-economy",
    label: "World / Economy",
    params: { mode: "world", category: "economy", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "economy" }
  },
  {
    id: "world-stocks",
    label: "World / Stocks",
    params: { mode: "world", category: "stocks", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "stocks" }
  },
  {
    id: "world-crypto",
    label: "World / Crypto",
    params: { mode: "world", category: "crypto", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "crypto" }
  },
  {
    id: "world-technology",
    label: "World / Technology",
    params: { mode: "world", category: "technology", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "world", category: "technology" }
  },
  {
    id: "ticker-nvda",
    label: "Ticker / NVDA",
    params: { mode: "ticker", ticker: "NVDA", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "contains-any", anchors: ["nvda", "nvidia"] }
  },
  {
    id: "ticker-aapl",
    label: "Ticker / AAPL",
    params: { mode: "ticker", ticker: "AAPL", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "contains-any", anchors: ["aapl", "apple"] }
  },
  {
    id: "commodity-gold",
    label: "Commodity / Gold",
    params: { mode: "commodity", commodity: "gold", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "contains-any", anchors: ["gold", "xau"] }
  },
  {
    id: "commodity-copper",
    label: "Commodity / Copper",
    params: { mode: "commodity", commodity: "copper", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "contains-any", anchors: ["copper", "lme copper"] }
  },
  {
    id: "commodity-oil",
    label: "Commodity / Oil",
    params: { mode: "commodity", commodity: "oil", source: "auto", timespan: "24h", track: "0" },
    validator: { type: "contains-any", anchors: ["oil", "crude", "brent", "wti"] }
  },
  {
    id: "custom-america-news",
    label: "Custom / America news",
    params: { mode: "custom", query: "America news", source: "auto", timespan: "24h", track: "0" },
    validator: {
      type: "country",
      anchors: ["united states", "u.s.", "u.s", "usa", "america", "american", "states"],
      excludes: ["bank of america", "voice of america", "american airlines"]
    }
  },
  {
    id: "custom-canada-news",
    label: "Custom / Canada news",
    params: { mode: "custom", query: "Canada news", source: "auto", timespan: "24h", track: "0" },
    validator: {
      type: "country",
      anchors: ["canada", "canadian", "ottawa", "ontario", "toronto", "quebec"],
      excludes: []
    }
  },
  {
    id: "custom-ukraine-news",
    label: "Custom / Ukraine news",
    params: { mode: "custom", query: "Ukraine news", source: "auto", timespan: "24h", track: "0" },
    validator: {
      type: "country",
      anchors: ["ukraine", "ukrainian", "kyiv", "kiev"],
      excludes: []
    }
  },
  {
    id: "custom-canada-politics",
    label: "Custom / Canada politics",
    params: { mode: "custom", query: "Canada politics", source: "auto", timespan: "24h", track: "0" },
    validator: {
      type: "country-topic",
      countryAnchors: ["canada", "canadian", "ottawa", "ontario", "toronto", "quebec"],
      topicAnchors: ["politic", "election", "government", "minister", "parliament", "policy", "senate"]
    }
  },
  {
    id: "custom-iran-oil-news",
    label: "Custom / Iran oil news",
    params: { mode: "custom", query: "Iran oil news", source: "auto", timespan: "24h", track: "0" },
    validator: {
      type: "country-topic",
      countryAnchors: ["iran", "iranian", "tehran", "hormuz"],
      topicAnchors: ["oil", "crude", "brent", "wti", "opec"]
    }
  },
  {
    id: "custom-ai-chip-export-restrictions",
    label: "Custom / AI chip export restrictions",
    params: { mode: "custom", query: "AI chip export restrictions", source: "auto", timespan: "24h", track: "0" },
    validator: {
      type: "contains-multi",
      anchors: ["ai", "chip", "export", "restriction"]
    }
  }
];

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const server = startServer();

  try {
    await waitForHealth();
    const results = [];

    for (const test of matrix) {
      console.log(`Running ${test.id}...`);
      results.push(await runCase(test));
    }

    const report = buildReport(results);
    await writeReport(report);

    console.log(`Search audit complete: ${path.join(outputDir, "latest.md")}`);
  } finally {
    server.kill("SIGINT");
  }
}

function startServer() {
  return spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      NEWS_AGENT_DATA_DIR: dataDir
    },
    stdio: "ignore"
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/health`, requestTimeoutMs);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("Search harness could not start local server.");
}

async function runCase(test) {
  const query = new URLSearchParams(test.params);
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/news?${query.toString()}`, requestTimeoutMs);
    const payload = await response.json();

    if (!response.ok) {
      return {
        id: test.id,
        label: test.label,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: payload.error || `HTTP ${response.status}`
      };
    }

    const evaluatedArticles = payload.articles || [];
    const judged = evaluatedArticles.map((article, index) => judgeArticle(article, test.validator, index));
    const passCount = judged.filter((item) => item.pass).length;
    const failCount = judged.length - passCount;

    return {
      id: test.id,
      label: test.label,
      ok: true,
      durationMs: Date.now() - startedAt,
      totalArticles: payload.articles?.length || 0,
      evaluatedArticles: judged.length,
      source: payload.request?.source || "-",
      summary: payload.summary?.lines || [],
      passCount,
      failCount,
      precision: judged.length ? Number((passCount / judged.length).toFixed(2)) : 0,
      sampleArticles: judged.slice(0, 15)
    };
  } catch (error) {
    return {
      id: test.id,
      label: test.label,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error.message
    };
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function judgeArticle(article, validator, index) {
  const text = `${article.title || ""} ${article.summary || ""}`.toLowerCase();
  let pass = true;
  let reason = "looks on-topic";

  if (validator?.type === "contains-any") {
    pass = validator.anchors.some((term) => text.includes(term));
    if (!pass) reason = `missing anchors: ${validator.anchors.join(", ")}`;
  } else if (validator?.type === "contains-multi") {
    const hits = validator.anchors.filter((term) => text.includes(term));
    pass = hits.length >= Math.max(2, Math.ceil(validator.anchors.length / 2));
    if (!pass) reason = `weak topic overlap: ${hits.join(", ") || "none"}`;
  } else if (validator?.type === "country") {
    const hasCountry = validator.anchors.some((term) => text.includes(term));
    const hasExcluded = (validator.excludes || []).some((term) => text.includes(term));
    pass = hasCountry && !hasExcluded;
    if (!pass) reason = hasExcluded ? "matched excluded country false-positive" : "missing country anchor";
  } else if (validator?.type === "country-topic") {
    const countryHit = validator.countryAnchors.some((term) => text.includes(term));
    const topicHit = validator.topicAnchors.some((term) => text.includes(term));
    pass = countryHit && topicHit;
    if (!pass) reason = `country hit: ${countryHit}, topic hit: ${topicHit}`;
  } else if (validator?.type === "world") {
    pass = judgeWorldArticle(article, validator.category);
    if (!pass) reason = `weak world category fit for ${validator.category}`;
  }

  return {
    rank: index + 1,
    pass,
    reason,
    title: article.title,
    provider: article.provider || "-",
    score: article.relevanceScore || 0,
    tags: article.tags || [],
    publishedAt: article.publishedAt || ""
  };
}

function judgeWorldArticle(article, category) {
  const text = `${article.title || ""} ${article.summary || ""}`.toLowerCase();
  const tags = new Set(article.tags || []);

  if (category === "all") return true;
  if (category === "politics") return tags.has("политика") || tags.has("геополитика");
  if (category === "ordinary") return !(tags.has("политика") || tags.has("геополитика") || tags.has("акции") || tags.has("крипта"));
  if (category === "economy") return tags.has("экономика") || tags.has("рынки") || tags.has("макро");
  if (category === "stocks") return ["stock", "stocks", "equities", "shares", "nasdaq", "nyse", "earnings"].some((term) => text.includes(term)) || tags.has("акции");
  if (category === "crypto") return tags.has("крипта") || ["bitcoin", "crypto", "ethereum", "blockchain"].some((term) => text.includes(term));
  if (category === "technology") return tags.has("технологии") || tags.has("наука") || ["ai", "chip", "software", "technology"].some((term) => text.includes(term));
  return true;
}

function buildReport(results) {
  const okResults = results.filter((item) => item.ok);
  const failedResults = results.filter((item) => !item.ok);
  const summary = {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passedCases: okResults.length,
    failedCases: failedResults.length,
    averagePrecision: okResults.length
      ? Number((okResults.reduce((sum, item) => sum + item.precision, 0) / okResults.length).toFixed(2))
      : 0
  };

  const byMode = {};
  for (const item of okResults) {
    const mode = item.id.split("-")[0];
    byMode[mode] ??= { cases: 0, precision: 0 };
    byMode[mode].cases += 1;
    byMode[mode].precision += item.precision;
  }

  for (const value of Object.values(byMode)) {
    value.precision = Number((value.precision / value.cases).toFixed(2));
  }

  return { summary, byMode, results };
}

async function writeReport(report) {
  const jsonPath = path.join(outputDir, "latest.json");
  const mdPath = path.join(outputDir, "latest.md");

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(mdPath, toMarkdown(report), "utf8");
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Search Harness Report");
  lines.push("");
  lines.push(`Generated: ${report.summary.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total cases: ${report.summary.totalCases}`);
  lines.push(`- Successful cases: ${report.summary.passedCases}`);
  lines.push(`- Failed cases: ${report.summary.failedCases}`);
  lines.push(`- Average heuristic precision across full evaluated sets: ${report.summary.averagePrecision}`);
  lines.push("");
  lines.push("## Precision by mode");
  lines.push("");

  for (const [mode, stats] of Object.entries(report.byMode)) {
    lines.push(`- ${mode}: ${stats.precision} across ${stats.cases} case(s)`);
  }

  lines.push("");
  lines.push("## Case details");
  lines.push("");

  for (const item of report.results) {
    lines.push(`### ${item.label}`);
    lines.push("");

    if (!item.ok) {
      lines.push(`- Status: failed`);
      lines.push(`- Error: ${item.error}`);
      lines.push("");
      continue;
    }

    lines.push(`- Source plan: ${item.source}`);
    lines.push(`- Returned articles: ${item.totalArticles}`);
    lines.push(`- Evaluated articles: ${item.evaluatedArticles}`);
    lines.push(`- Heuristic precision: ${item.precision}`);
    lines.push(`- Off-topic articles: ${item.failCount}`);
    lines.push(`- Duration: ${item.durationMs} ms`);
    if (item.summary?.length) {
      lines.push(`- Briefing: ${item.summary.join(" ")}`);
    }
    lines.push("");
    lines.push("_Table below shows the first 15 evaluated articles for quick review._");
    lines.push("");
    lines.push("| # | Pass | Source | Score | Tags | Title |");
    lines.push("|---|---|---|---:|---|---|");

    for (const article of item.sampleArticles) {
      const passLabel = article.pass ? "yes" : `no (${article.reason})`;
      lines.push(
        `| ${article.rank} | ${escapeCell(passLabel)} | ${escapeCell(article.provider)} | ${article.score} | ${escapeCell(article.tags.join(", "))} | ${escapeCell(article.title)} |`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

function escapeCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
