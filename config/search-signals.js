export const countryLexicon = {
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

export const sourceProfiles = {
  "google news": { tier: "major", type: "aggregator", quality: 80 },
  "stock titan": { tier: "market", type: "news-feed", quality: 76 },
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

export const stockMarketTerms = [
  "stock", "stocks", "equity", "equities", "shares", "share price", "stock price",
  "earnings", "revenue", "guidance", "analyst", "analysts", "upgrade", "downgrade",
  "price target", "buyback", "share repurchase", "ipo", "secondary offering",
  "dividend", "market cap", "nasdaq", "nyse", "s&p 500", "dow jones", "russell 2000",
  "premarket", "pre-market", "after-hours", "after hours", "trading", "ticker", "etf",
  "otc", "listed", "listing", "warrant", "warrants"
];

export const macroEconomyTerms = [
  "economy", "economic", "inflation", "deflation", "cpi", "ppi", "gdp", "recession", "growth",
  "jobs", "jobless", "unemployment", "labor market", "payrolls", "wages", "consumer spending",
  "retail sales", "industrial production", "manufacturing", "pmi", "central bank", "interest rates",
  "rate cut", "rate hike", "fed", "ecb", "bank of england", "treasury yields", "bond yields",
  "tariff", "tariffs", "trade", "exports", "imports", "housing market", "fiscal", "budget deficit"
];

export const goldMarketTerms = [
  "gold", "xau", "bullion", "spot gold", "gold prices", "gold futures", "gold reserves",
  "central bank gold", "reserve asset", "safe haven", "ounce"
];

export const exportControlTerms = [
  "export", "exports", "export control", "export controls", "restriction", "restrictions", "restrict",
  "restricted", "ban", "bans", "curb", "curbs", "licensing", "license", "licenses", "sanction", "sanctions"
];

export const aiChipTerms = [
  "ai", "artificial intelligence", "chip", "chips", "semiconductor", "semiconductors", "gpu", "gpus", "nvidia"
];

export const goldProxyTerms = [
  "gold miner", "gold miners", "gold mining", "mining stock", "producer", "producers", "royalty", "streaming"
];

export const customIntentNoiseTitlePatterns = [
  /\btop news today\b/i,
  /\bnews roundup\b/i,
  /\b& more\b/i,
  /\bmorning news\b/i
];

export const personalFinanceTerms = [
  "savings account", "retirement", "401(k", "401k", "debt", "mortgage", "credit card",
  "budget", "emergency fund", "student loan", "financial advisor", "high-yield savings",
  "hysa", "paycheck", "college", "tuition"
];

export const customQueryFocusLexicon = {
  politics: ["politics", "political", "election", "government", "diplomacy", "sanctions", "parliament"],
  markets: ["market", "markets", "macro", "economy", "inflation", "rates", "fed", "ecb", "central bank"],
  stocks: ["stock", "stocks", "stock market", "equities", "shares", "earnings", "nasdaq", "nyse", "s&p"],
  crypto: ["crypto", "bitcoin", "ethereum", "solana", "stablecoin", "blockchain", "btc", "eth"],
  commodities: ["gold", "silver", "copper", "oil", "gas", "wheat", "uranium", "lithium", "commodities", "metal"],
  tech: ["technology", "tech", "ai", "chips", "software", "cybersecurity", "semiconductor"],
  science: ["science", "health", "medicine", "research", "vaccine"]
};

export const companyNoiseWords = new Set([
  "inc", "inc.", "corp", "corp.", "corporation", "company", "co", "co.", "group", "holdings",
  "holding", "ltd", "ltd.", "limited", "plc", "llc", "sa", "ag", "nv", "the", "and", "class",
  "ordinary", "common", "shares"
]);

export const tickerNoiseTitlePatterns = [
  /^\s*[a-z0-9.-]+\|/i,
  /\bprice\s*:\s*\d/i,
  /\bchg%\s*:?\s*[-+]?\d/i,
  /\blargest position\b/i,
  /\bmakes? new .*investment in\b/i,
  /\bacquires? shares of\b/i,
  /\bshares acquired by\b/i,
  /\bboosts? stock position in\b/i,
  /\blowers? stock position in\b/i,
  /\breduces? stock position in\b/i,
  /\braises? stock position in\b/i,
  /\bincreases? stock position in\b/i,
  /\bownership in\b/i,
  /\bhas\s+\$?\d[\d.,\s]*(million|billion|trillion)?\s+stake\b/i,
  /\bsells?\s+\d[\d,]*\s+shares\b/i,
  /\bposition increased by\b/i,
  /\blive share price\b/i,
  /\bshould you buy\??\b/i,
  /\bin focus\b/i,
  /\bhow to play\b/i,
  /\bholding history\b/i,
  /\bportfolio\b/i,
  /\bbest (forever )?stocks? to buy\b/i,
  /\blagged the market today\b/i,
  /\banalysts offer insights on .* companies\b/i,
  /\b(institutional investor|institutional ownership|13f)\b/i,
  /\b(pension plan|trust fund|asset management|capital management|wealth management|investment management)\b/i,
  /\b(trading up|trading down)\b/i,
  /\bwhat'?s next\??\b/i,
  /\bholdings?\s+(raised|cut|lowered|trimmed|boosted|reduced)\b/i,
  /\bholdings?\s+(decreased|increased)\b/i,
  /\bstock holdings?\s+(raised|cut|lowered|trimmed|boosted|reduced|decreased|increased)\b/i,
  /\b(position|stake)\s+(raised|cut|lowered|trimmed|boosted|reduced)\b/i,
  /\b(position|stake)\s+(decreased|increased)\b/i,
  /\b(raises?|cuts?|lowers?|trims?|boosts?|reduces?)\s+(its\s+)?(position|stake)\b/i
];

export const countryQueryExclusions = {
  usa: ["bank of america", "voice of america", "american airlines"]
};

export const commodityNoiseTitlePatterns = [
  /\bforecast\b/i,
  /\bprice forecast\b/i,
  /\bforecast for (today|tomorrow|next week|next 30 days)\b/i,
  /\bfor today, tomorrow, next week\b/i,
  /\bnext 30 days\b/i,
  /\btechnical analysis\b/i,
  /\belliott wave\b/i,
  /\btrade ideas\b/i,
  /\btraders?\b/i,
  /\bprice prediction\b/i,
  /\bmarket outlook\b/i,
  /\bmarket analysis\b/i,
  /\bhow .* matters\b/i,
  /\blive price\b/i,
  /\bsize, trends and insights\b/i
];

export const commodityProxyTitlePatterns = [
  /\b(etf|stock|stocks|shares|share|equity|equities)\b/i,
  /\bminers?\b/i
];
