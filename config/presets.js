export const commodityPresets = {
  copper: {
    label: "Медь",
    query: '(copper OR "copper prices" OR "LME copper" OR "copper futures" OR "copper mine")'
  },
  gold: {
    label: "Золото",
    query: '(gold OR XAU OR bullion OR "gold prices" OR "gold futures" OR "central bank gold" OR "gold reserves" OR "safe haven gold" OR "spot gold")'
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

export const worldCategoryPresets = {
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
    googleQuery:
      '"top stories" OR health OR science OR technology OR sports OR entertainment OR weather OR travel -stock -stocks -equities -earnings -bitcoin -crypto'
  },
  economy: {
    label: "Экономика",
    topics: ["BUSINESS", "WORLD"],
    query:
      '(economy OR inflation OR CPI OR GDP OR jobs OR unemployment OR payrolls OR "central bank" OR "interest rates" OR Fed OR ECB OR tariffs OR trade OR exports OR imports OR "bond yields" OR recession OR growth)',
    googleQuery: 'economy OR inflation OR GDP OR jobs OR "central bank" OR "interest rates" OR Fed OR ECB OR tariffs OR trade'
  },
  stocks: {
    label: "Сток маркет",
    topics: ["BUSINESS", "TECHNOLOGY", "WORLD"],
    query:
      '("stock market" OR stocks OR equities OR shares OR nasdaq OR nyse OR s&p 500 OR dow OR earnings OR analysts OR "market rally" OR "market selloff")',
    googleQuery: "\"stock market\" OR stocks OR equities OR earnings OR nasdaq OR nyse"
  },
  crypto: {
    label: "Крипта",
    topics: ["BUSINESS", "TECHNOLOGY", "WORLD"],
    query:
      '(crypto OR cryptocurrency OR bitcoin OR btc OR ethereum OR eth OR solana OR stablecoin OR blockchain OR "digital assets" OR "crypto market")',
    googleQuery: "crypto OR bitcoin OR ethereum OR stablecoin OR blockchain"
  },
  technology: {
    label: "Технологии",
    topics: ["TECHNOLOGY", "SCIENCE", "BUSINESS"],
    query:
      '(technology OR AI OR chips OR software OR cybersecurity OR science OR startup OR "electric vehicles")',
    googleQuery: "technology OR AI OR chips OR cybersecurity OR science"
  }
};

export const sourcePresets = {
  auto: "Google News",
  google: "Google News",
  feeds: "Популярные сайты США",
  stocktitan: "Stock Titan",
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

export const focusPresets = {
  all: "Все темы",
  politics: "Политика",
  markets: "Рынки",
  stocks: "Сток маркет",
  crypto: "Крипта",
  companies: "Компании",
  commodities: "Сырье",
  tech: "Технологии",
  science: "Наука и здоровье"
};

export const languagePresets = {
  any: "Любой язык",
  english: "English",
  russian: "Русский"
};

export const sourceTypePresets = {
  any: "Все источники",
  major: "Крупные медиа",
  market: "Рынки и финансы",
  specialist: "Нишевые источники"
};

export const sortModePresets = {
  relevance: "По релевантности",
  newest: "Сначала новые",
  quality: "Сначала сильные источники"
};

export const matchModePresets = {
  balanced: "Баланс",
  strict: "Строго",
  broad: "Шире"
};
