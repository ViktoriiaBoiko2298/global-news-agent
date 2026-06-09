const state = {
  locale: localStorage.getItem("news-agent-locale") || "en",
  mode: "world",
  presets: {},
  focuses: {},
  languages: {},
  sortModes: {},
  matchModes: {},
  sourceTypes: {},
  sources: {},
  worldCategories: {},
  currentPayload: null,
  lastRequest: null,
  refreshTimer: null,
  alertMonitorTimer: null,
  activeTagFilter: "",
  userTags: [],
  notificationsEnabled: localStorage.getItem("news-agent-notifications") === "on",
  alertSnapshot: new Map(),
  alertsBootstrapped: false,
  pushSupported: false,
  serviceWorkerRegistration: null,
  pushPublicKey: "",
  pushSubscription: null
};

const elements = {
  localeButtons: document.querySelectorAll("[data-locale]"),
  tabs: document.querySelectorAll(".tab"),
  form: document.querySelector("#searchForm"),
  fields: document.querySelectorAll(".mode-field"),
  worldCategorySelect: document.querySelector("#worldCategorySelect"),
  tickerInput: document.querySelector("#tickerInput"),
  commoditySelect: document.querySelector("#commoditySelect"),
  queryInput: document.querySelector("#queryInput"),
  timespanSelect: document.querySelector("#timespanSelect"),
  sourceSelect: document.querySelector("#sourceSelect"),
  limitSelect: document.querySelector("#limitSelect"),
  countryInput: document.querySelector("#countryInput"),
  languageSelect: document.querySelector("#languageSelect"),
  focusSelect: document.querySelector("#focusSelect"),
  sourceTypeSelect: document.querySelector("#sourceTypeSelect"),
  sortModeSelect: document.querySelector("#sortModeSelect"),
  matchModeSelect: document.querySelector("#matchModeSelect"),
  excludeInput: document.querySelector("#excludeInputCustom"),
  sourceIncludeInput: document.querySelector("#sourceIncludeInput"),
  sourceExcludeInput: document.querySelector("#sourceExcludeInput"),
  saveWatchButton: document.querySelector("#saveWatchButton"),
  shareSearchButton: document.querySelector("#shareSearchButton"),
  createAlertButton: document.querySelector("#createAlertButton"),
  saveUserTagButton: document.querySelector("#saveUserTagButton"),
  clearTagFilterButton: document.querySelector("#clearTagFilterButton"),
  shareOverlay: document.querySelector("#shareOverlay"),
  closeShareDialogButton: document.querySelector("#closeShareDialogButton"),
  shareCaption: document.querySelector("#shareCaption"),
  shareLinkPreview: document.querySelector("#shareLinkPreview"),
  autoRefreshToggle: document.querySelector("#autoRefreshToggle"),
  refreshInterval: document.querySelector("#refreshInterval"),
  refreshWatchlist: document.querySelector("#refreshWatchlist"),
  refreshAlerts: document.querySelector("#refreshAlerts"),
  refreshHistory: document.querySelector("#refreshHistory"),
  enableNotificationsButton: document.querySelector("#enableNotificationsButton"),
  notificationStatus: document.querySelector("#notificationStatus"),
  status: document.querySelector("#connectionStatus"),
  resultsList: document.querySelector("#resultsList"),
  message: document.querySelector("#message"),
  totalCount: document.querySelector("#totalCount"),
  sourceName: document.querySelector("#sourceName"),
  sortName: document.querySelector("#sortName"),
  matchName: document.querySelector("#matchName"),
  tagCloud: document.querySelector("#tagCloud"),
  userTagInput: document.querySelector("#userTagInput"),
  userTagCloud: document.querySelector("#userTagCloud"),
  watchlist: document.querySelector("#watchlist"),
  alertsList: document.querySelector("#alertsList"),
  historyList: document.querySelector("#historyList"),
  activeMode: document.querySelector("#activeMode"),
  activeLabel: document.querySelector("#activeLabel"),
  lastUpdated: document.querySelector("#lastUpdated"),
  briefingLines: document.querySelector("#briefingLines"),
  summaryMode: document.querySelector("#summaryMode")
};

const shareState = {
  title: "",
  text: "",
  englishText: "",
  url: ""
};

const I18N = {
  en: {
    htmlLang: "en",
    title: "News Agent",
    heroNote: "Global radar for world events, equities, crypto, commodities, and company signals.",
    ribbon: ["Politics", "Macro", "Equities", "Metals"],
    status: {
      ready: "ready",
      cached: "cached",
      searching: "searching",
      error: "error",
      saving: "saving",
      alert: "alert",
      link: "link",
      checking: "checking",
      tag: "tag",
      noApi: "no api",
      blocked: "blocked",
      pushOff: "push off",
      pushOn: "push on",
      noPush: "no push",
      notifications: "notifications",
      share: "share",
      instagram: "instagram",
      x: "x",
      facebook: "facebook",
      linkedin: "linkedin",
      tagName: "tag name"
    },
    ui: {
      signalDesk: "Signal desk",
      commandDeck: "Command deck",
      liveFilters: "Live filters",
      controlIntroTitle: "Find the signal",
      controlIntroCopy: "Search faster with a cleaner first step, then open deeper filters only when you need them.",
      languageSwitcher: "Language switcher",
      summaryPanel: "Summary",
      newsPanel: "News",
      searchPanel: "Search panel",
      searchMode: "Search mode",
      advanced: {
        title: "Advanced filters",
        copy: "Country, focus, language, source rules",
        pill: "Optional"
      },
      tabs: { world: "24h", ticker: "Ticker", commodity: "Commodities", custom: "Query" },
      labels: {
        worldCategorySelect: "Topics",
        tickerInput: "Ticker",
        commoditySelect: "Asset",
        queryInput: "Query",
        timespanSelect: "Time range",
        sourceSelect: "Source",
        limitSelect: "Limit",
        countryInput: "Country",
        languageSelect: "Language",
        focusSelect: "Focus",
        sourceTypeSelect: "Source type",
        sortModeSelect: "Sort",
        matchModeSelect: "Match",
        excludeInputCustom: "Exclude terms",
        sourceIncludeInput: "Include sources",
        sourceExcludeInput: "Exclude sources"
      },
      placeholders: {
        worldCategorySelect: "Choose a topic",
        tickerInput: "NVDA",
        queryInput: "central bank gold buying",
        countryInput: "Canada",
        excludeInputCustom: "hockey, weather",
        sourceIncludeInput: "reuters, bbc, cnbc",
        sourceExcludeInput: "fox, blog, tabloid",
        userTagInput: "canada macro"
      },
      buttons: {
        search: "Search",
        save: "Save",
        share: "Share",
        alert: "Alert",
        autoRefresh: "Auto-refresh"
      },
      metricLabels: ["Found", "Source", "Sort", "Match"],
      sections: {
        saved: "Saved",
        alerts: "Alerts",
        history: "History",
        myTags: "My tags",
        feedTopics: "Feed topics"
      },
      aria: {
        refreshSaved: "Refresh saved list",
        enableNotifications: "Enable notifications",
        disableNotifications: "Disable notifications",
        checkAlerts: "Check alerts",
        refreshHistory: "Refresh history",
        addCustomTag: "Add custom tag",
        resetTopicFilter: "Reset topic filter",
        shareArticle: "Share story",
        closeShare: "Close share dialog",
        removeItem: "Remove item"
      },
      notifications: {
        pushOn: "Push notifications on",
        unsupported: "Notifications unsupported",
        browserOn: "Browser notifications on",
        blocked: "Notifications blocked",
        off: "Notifications off"
      },
      results: {
        activeModes: {
          world: "News in the last 24 hours",
          ticker: "Company ticker",
          commodity: "Commodities and metals",
          custom: "Search query"
        },
        defaults: {
          world: "Latest 24 hours",
          ticker: "Issuer news",
          commodity: "Market news",
          custom: "Global search"
        },
        idleLabel: "Choose what to search",
        updated: "Updated",
        briefing: "Briefing",
        heuristic: "Heuristic",
        ai: "AI",
        empty: "No news right now",
        idle: "Choose a topic or search mode, then press Search.",
        noTags: "no tags",
        summaryPlaceholder: "A short summary will appear after the first search.",
        loading: "Gathering the feed and reranking sources.",
        score: "score",
        alsoFrom: "Also from",
        sourceCount: (count) => `${count} sources`
      },
      share: {
        title: "Share",
        currentCaption: "Share the current search or the site itself.",
        articleCaption: "Share this story.",
        copy: "Copy link",
        currentPrompt: "Copy this link",
        instagramReady: "instagram",
        linkReady: "link"
      },
      watch: {
        empty: "empty",
        unavailable: "unavailable",
        noRules: "no rules",
        historyEmpty: "history is empty",
        tagsEmpty: "no custom tags",
        noTags: "no tags",
        hits: "hits",
        minutesShort: "m"
      },
      prompts: {
        chooseTopic: "Choose a topic first.",
        alertInterval: "Alert interval in minutes",
        enterQuery: "Enter a search query."
      },
      badges: {
        world: "feed",
        custom: "query",
        commodity: "commodity",
        ticker: "ticker"
      }
    }
  },
  ru: {
    htmlLang: "ru",
    title: "News Agent",
    heroNote: "Глобальный радар для мировых событий, акций, крипты, сырья и корпоративных сигналов.",
    ribbon: ["Политика", "Макро", "Акции", "Металлы"],
    status: {
      ready: "готов",
      cached: "кеш",
      searching: "поиск",
      error: "ошибка",
      saving: "сохраняю",
      alert: "алерт",
      link: "ссылка",
      checking: "чекаю",
      tag: "тег",
      noApi: "нет api",
      blocked: "блок",
      pushOff: "push выкл",
      pushOn: "push вкл",
      noPush: "без push",
      notifications: "уведомления",
      share: "шаринг",
      instagram: "instagram",
      x: "x",
      facebook: "facebook",
      linkedin: "linkedin",
      tagName: "имя тега"
    },
    ui: {
      signalDesk: "Сигнальный пульт",
      commandDeck: "Командный пульт",
      liveFilters: "Живые фильтры",
      controlIntroTitle: "Найти сигнал",
      controlIntroCopy: "Сначала быстрый запрос, а более глубокие фильтры открываются только когда они реально нужны.",
      languageSwitcher: "Переключение языка",
      summaryPanel: "Сводка",
      newsPanel: "Новости",
      searchPanel: "Панель поиска",
      searchMode: "Режим поиска",
      advanced: {
        title: "Расширенные фильтры",
        copy: "Страна, фокус, язык и правила по источникам",
        pill: "Опционально"
      },
      tabs: { world: "24 часа", ticker: "Тикер", commodity: "Сырье", custom: "Запрос" },
      labels: {
        worldCategorySelect: "Темы",
        tickerInput: "Тикер",
        commoditySelect: "Товар",
        queryInput: "Запрос",
        timespanSelect: "Период",
        sourceSelect: "Источник",
        limitSelect: "Лимит",
        countryInput: "Страна",
        languageSelect: "Язык",
        focusSelect: "Фокус",
        sourceTypeSelect: "Тип источника",
        sortModeSelect: "Сортировка",
        matchModeSelect: "Совпадение",
        excludeInputCustom: "Минус-слова",
        sourceIncludeInput: "Только источники",
        sourceExcludeInput: "Минус-источники"
      },
      placeholders: {
        worldCategorySelect: "Выбери тему",
        tickerInput: "NVDA",
        queryInput: "покупки золота центробанками",
        countryInput: "Канада",
        excludeInputCustom: "хоккей, погода",
        sourceIncludeInput: "reuters, bbc, cnbc",
        sourceExcludeInput: "fox, blog, tabloid",
        userTagInput: "canada macro"
      },
      buttons: {
        search: "Найти",
        save: "Закрепить",
        share: "Поделиться",
        alert: "Алерт",
        autoRefresh: "Автообновление"
      },
      metricLabels: ["Найдено", "Источник", "Сортировка", "Совпадение"],
      sections: {
        saved: "Закрепленные",
        alerts: "Алерты",
        history: "История",
        myTags: "Мои теги",
        feedTopics: "Темы ленты"
      },
      aria: {
        refreshSaved: "Обновить список",
        enableNotifications: "Включить уведомления",
        disableNotifications: "Выключить уведомления",
        checkAlerts: "Проверить алерты",
        refreshHistory: "Обновить историю",
        addCustomTag: "Добавить пользовательский тег",
        resetTopicFilter: "Сбросить фильтр тем",
        shareArticle: "Поделиться новостью",
        closeShare: "Закрыть окно шаринга",
        removeItem: "Удалить элемент"
      },
      notifications: {
        pushOn: "Push-уведомления включены",
        unsupported: "Уведомления не поддерживаются",
        browserOn: "Уведомления вкладки включены",
        blocked: "Уведомления заблокированы",
        off: "Уведомления выключены"
      },
      results: {
        activeModes: {
          world: "Новости за 24 часа",
          ticker: "Тикер компании",
          commodity: "Сырье и металлы",
          custom: "Поисковый запрос"
        },
        defaults: {
          world: "Последние 24 часа",
          ticker: "Новости эмитента",
          commodity: "Рыночные новости",
          custom: "Глобальный поиск"
        },
        idleLabel: "Выбери, что искать",
        updated: "Обновлено",
        briefing: "Брифинг",
        heuristic: "Эвристический",
        ai: "AI",
        empty: "Новости отсутствуют",
        idle: "Выбери тему или режим поиска, потом нажми Найти.",
        noTags: "без тегов",
        summaryPlaceholder: "Краткая сводка появится после первого поиска.",
        loading: "Собираю ленту и пересортировываю источники.",
        score: "оценка",
        alsoFrom: "Еще из",
        sourceCount: (count) => `${count} источника`
      },
      share: {
        title: "Поделиться",
        currentCaption: "Поделиться текущим поиском или самим сайтом.",
        articleCaption: "Поделиться конкретной новостью.",
        copy: "Копировать ссылку",
        currentPrompt: "Скопируй ссылку",
        instagramReady: "instagram",
        linkReady: "ссылка"
      },
      watch: {
        empty: "пусто",
        unavailable: "недоступно",
        noRules: "нет правил",
        historyEmpty: "история пуста",
        tagsEmpty: "свои теги пусты",
        noTags: "без тегов",
        hits: "совп.",
        minutesShort: "м"
      },
      prompts: {
        chooseTopic: "Сначала выбери тему.",
        alertInterval: "Интервал алерта в минутах",
        enterQuery: "Введите поисковый запрос."
      },
      badges: {
        world: "лента",
        custom: "запрос",
        commodity: "сырье",
        ticker: "тикер"
      }
    }
  },
  uk: {
    htmlLang: "uk",
    title: "News Agent",
    heroNote: "Глобальний радар для світових подій, акцій, крипти, сировини та корпоративних сигналів.",
    ribbon: ["Політика", "Макро", "Акції", "Метали"],
    status: {
      ready: "готово",
      cached: "кеш",
      searching: "пошук",
      error: "помилка",
      saving: "зберігаю",
      alert: "алерт",
      link: "посилання",
      checking: "перевірка",
      tag: "тег",
      noApi: "нема api",
      blocked: "блок",
      pushOff: "push вимк",
      pushOn: "push увімк",
      noPush: "без push",
      notifications: "сповіщення",
      share: "шер",
      instagram: "instagram",
      x: "x",
      facebook: "facebook",
      linkedin: "linkedin",
      tagName: "назва тега"
    },
    ui: {
      signalDesk: "Сигнальний пульт",
      commandDeck: "Командний пульт",
      liveFilters: "Живі фільтри",
      controlIntroTitle: "Знайти сигнал",
      controlIntroCopy: "Спочатку швидкий запит, а глибші фільтри відкриваються лише коли вони справді потрібні.",
      languageSwitcher: "Перемикач мови",
      summaryPanel: "Зведення",
      newsPanel: "Новини",
      searchPanel: "Панель пошуку",
      searchMode: "Режим пошуку",
      advanced: {
        title: "Розширені фільтри",
        copy: "Країна, фокус, мова та правила для джерел",
        pill: "Опційно"
      },
      tabs: { world: "24 години", ticker: "Тікер", commodity: "Сировина", custom: "Запит" },
      labels: {
        worldCategorySelect: "Теми",
        tickerInput: "Тікер",
        commoditySelect: "Актив",
        queryInput: "Запит",
        timespanSelect: "Період",
        sourceSelect: "Джерело",
        limitSelect: "Ліміт",
        countryInput: "Країна",
        languageSelect: "Мова",
        focusSelect: "Фокус",
        sourceTypeSelect: "Тип джерела",
        sortModeSelect: "Сортування",
        matchModeSelect: "Збіг",
        excludeInputCustom: "Мінус-слова",
        sourceIncludeInput: "Лише джерела",
        sourceExcludeInput: "Мінус-джерела"
      },
      placeholders: {
        worldCategorySelect: "Оберіть тему",
        tickerInput: "NVDA",
        queryInput: "закупівля золота центробанками",
        countryInput: "Канада",
        excludeInputCustom: "хокей, погода",
        sourceIncludeInput: "reuters, bbc, cnbc",
        sourceExcludeInput: "fox, blog, tabloid",
        userTagInput: "canada macro"
      },
      buttons: {
        search: "Знайти",
        save: "Зберегти",
        share: "Поділитися",
        alert: "Алерт",
        autoRefresh: "Автооновлення"
      },
      metricLabels: ["Знайдено", "Джерело", "Сортування", "Збіг"],
      sections: {
        saved: "Збережені",
        alerts: "Алерти",
        history: "Історія",
        myTags: "Мої теги",
        feedTopics: "Теми стрічки"
      },
      aria: {
        refreshSaved: "Оновити список",
        enableNotifications: "Увімкнути сповіщення",
        disableNotifications: "Вимкнути сповіщення",
        checkAlerts: "Перевірити алерти",
        refreshHistory: "Оновити історію",
        addCustomTag: "Додати власний тег",
        resetTopicFilter: "Скинути фільтр тем",
        shareArticle: "Поділитися новиною",
        closeShare: "Закрити вікно поширення",
        removeItem: "Видалити елемент"
      },
      notifications: {
        pushOn: "Push-сповіщення увімкнені",
        unsupported: "Сповіщення не підтримуються",
        browserOn: "Сповіщення вкладки увімкнені",
        blocked: "Сповіщення заблоковані",
        off: "Сповіщення вимкнені"
      },
      results: {
        activeModes: {
          world: "Новини за 24 години",
          ticker: "Тікер компанії",
          commodity: "Сировина та метали",
          custom: "Пошуковий запит"
        },
        defaults: {
          world: "Останні 24 години",
          ticker: "Новини емітента",
          commodity: "Ринкові новини",
          custom: "Глобальний пошук"
        },
        idleLabel: "Оберіть, що шукати",
        updated: "Оновлено",
        briefing: "Брифінг",
        heuristic: "Евристичний",
        ai: "AI",
        empty: "Новини відсутні",
        idle: "Оберіть тему або режим пошуку, потім натисніть Знайти.",
        noTags: "без тегів",
        summaryPlaceholder: "Коротке зведення з’явиться після першого пошуку.",
        loading: "Збираю стрічку та перевпорядковую джерела.",
        score: "оцінка",
        alsoFrom: "Ще з",
        sourceCount: (count) => `${count} джерела`
      },
      share: {
        title: "Поділитися",
        currentCaption: "Поділитися поточним пошуком або самим сайтом.",
        articleCaption: "Поділитися конкретною новиною.",
        copy: "Скопіювати посилання",
        currentPrompt: "Скопіюй посилання",
        instagramReady: "instagram",
        linkReady: "посилання"
      },
      watch: {
        empty: "порожньо",
        unavailable: "недоступно",
        noRules: "нема правил",
        historyEmpty: "історія порожня",
        tagsEmpty: "власні теги порожні",
        noTags: "без тегів",
        hits: "збіг.",
        minutesShort: "хв"
      },
      prompts: {
        chooseTopic: "Спочатку оберіть тему.",
        alertInterval: "Інтервал алерта в хвилинах",
        enterQuery: "Введіть пошуковий запит."
      },
      badges: {
        world: "стрічка",
        custom: "запит",
        commodity: "сировина",
        ticker: "тікер"
      }
    }
  }
};

const LOCALE_LABELS = {
  worldCategories: {
    en: {
      all: "Politics + general",
      politics: "Politics",
      ordinary: "General news",
      economy: "Economy",
      stocks: "Stock market",
      crypto: "Crypto",
      technology: "Technology"
    },
    ru: {
      all: "Политика + обычные",
      politics: "Политика",
      ordinary: "Обычные новости",
      economy: "Экономика",
      stocks: "Сток маркет",
      crypto: "Крипта",
      technology: "Технологии"
    },
    uk: {
      all: "Політика + загальні",
      politics: "Політика",
      ordinary: "Звичайні новини",
      economy: "Економіка",
      stocks: "Сток маркет",
      crypto: "Крипта",
      technology: "Технології"
    }
  },
  commodities: {
    en: { copper: "Copper", gold: "Gold", silver: "Silver", oil: "Oil", gas: "Gas", wheat: "Wheat", lithium: "Lithium", uranium: "Uranium" },
    ru: { copper: "Медь", gold: "Золото", silver: "Серебро", oil: "Нефть", gas: "Газ", wheat: "Пшеница", lithium: "Литий", uranium: "Уран" },
    uk: { copper: "Мідь", gold: "Золото", silver: "Срібло", oil: "Нафта", gas: "Газ", wheat: "Пшениця", lithium: "Літій", uranium: "Уран" }
  },
  sources: {
    en: { auto: "Auto: Google + sites", google: "Google News", feeds: "Popular sites", stocktitan: "Stock Titan", yahoo: "Yahoo Finance", investing: "Investing.com", benzinga: "Benzinga", cnbc: "CNBC", marketwatch: "MarketWatch", nytimes: "NYTimes", npr: "NPR", fox: "Fox News", gdelt: "GDELT" },
    ru: { auto: "Авто: Google + сайты", google: "Google News", feeds: "Популярные сайты", stocktitan: "Stock Titan", yahoo: "Yahoo Finance", investing: "Investing.com", benzinga: "Benzinga", cnbc: "CNBC", marketwatch: "MarketWatch", nytimes: "NYTimes", npr: "NPR", fox: "Fox News", gdelt: "GDELT" },
    uk: { auto: "Авто: Google + сайти", google: "Google News", feeds: "Популярні сайти", stocktitan: "Stock Titan", yahoo: "Yahoo Finance", investing: "Investing.com", benzinga: "Benzinga", cnbc: "CNBC", marketwatch: "MarketWatch", nytimes: "NYTimes", npr: "NPR", fox: "Fox News", gdelt: "GDELT" }
  },
  focuses: {
    en: { all: "All topics", politics: "Politics", markets: "Markets", stocks: "Stock market", crypto: "Crypto", companies: "Companies", commodities: "Commodities", tech: "Technology", science: "Science and health" },
    ru: { all: "Все темы", politics: "Политика", markets: "Рынки", stocks: "Сток маркет", crypto: "Крипта", companies: "Компании", commodities: "Сырье", tech: "Технологии", science: "Наука и здоровье" },
    uk: { all: "Усі теми", politics: "Політика", markets: "Ринки", stocks: "Сток маркет", crypto: "Крипта", companies: "Компанії", commodities: "Сировина", tech: "Технології", science: "Наука та здоров'я" }
  },
  filterLanguages: {
    en: { any: "Any language", english: "English", russian: "Russian" },
    ru: { any: "Любой язык", english: "English", russian: "Русский" },
    uk: { any: "Будь-яка мова", english: "English", russian: "Російська" }
  },
  sourceTypes: {
    en: { any: "All sources", major: "Major outlets", market: "Markets and finance", specialist: "Specialist sources" },
    ru: { any: "Все источники", major: "Крупные медиа", market: "Рынки и финансы", specialist: "Нишевые источники" },
    uk: { any: "Усі джерела", major: "Великі медіа", market: "Ринки та фінанси", specialist: "Нішеві джерела" }
  },
  sortModes: {
    en: { relevance: "Relevance", newest: "Newest first", quality: "Source quality" },
    ru: { relevance: "По релевантности", newest: "Сначала новые", quality: "Сначала сильные источники" },
    uk: { relevance: "За релевантністю", newest: "Спочатку нові", quality: "Якість джерела" }
  },
  matchModes: {
    en: { balanced: "Balanced", strict: "Strict", broad: "Broad" },
    ru: { balanced: "Баланс", strict: "Строго", broad: "Шире" },
    uk: { balanced: "Баланс", strict: "Строго", broad: "Ширше" }
  },
  timespans: {
    en: { "1h": "1 hour", "6h": "6 hours", "12h": "12 hours", "24h": "24 hours", "48h": "48 hours", "72h": "72 hours", "7d": "7 days" },
    ru: { "1h": "1 час", "6h": "6 часов", "12h": "12 часов", "24h": "24 часа", "48h": "48 часов", "72h": "72 часа", "7d": "7 дней" },
    uk: { "1h": "1 година", "6h": "6 годин", "12h": "12 годин", "24h": "24 години", "48h": "48 годин", "72h": "72 години", "7d": "7 днів" }
  },
  tags: {
    en: { "политика": "politics", "рынки": "markets", "акции": "equities", "крипта": "crypto", "сырье": "commodities", "геополитика": "geopolitics", "макро": "macro", "экономика": "economy", "технологии": "technology", "наука": "science", "здоровье": "health", "спорт": "sports", "культура": "culture", "риски": "risk" },
    ru: { "политика": "политика", "рынки": "рынки", "акции": "акции", "крипта": "крипта", "сырье": "сырье", "геополитика": "геополитика", "макро": "макро", "экономика": "экономика", "технологии": "технологии", "наука": "наука", "здоровье": "здоровье", "спорт": "спорт", "культура": "культура", "риски": "риски" },
    uk: { "политика": "політика", "рынки": "ринки", "акции": "акції", "крипта": "крипта", "сырье": "сировина", "геополитика": "геополітика", "макро": "макро", "экономика": "економіка", "технологии": "технології", "наука": "наука", "здоровье": "здоров'я", "спорт": "спорт", "культура": "культура", "риски": "ризики" }
  },
  tiers: {
    en: { major: "major", market: "market", specialist: "specialist" },
    ru: { major: "major", market: "рынки", specialist: "specialist" },
    uk: { major: "major", market: "ринок", specialist: "specialist" }
  },
  qualityTypes: {
    en: { aggregator: "aggregator", finance: "finance", "market-blog": "market blog", "business-tv": "business tv", "financial-media": "financial media", newspaper: "newspaper", "public-media": "public media", "cable-news": "cable news", wire: "wire", "financial-wire": "financial wire", dataset: "dataset", "news-feed": "news feed", niche: "niche" },
    ru: { aggregator: "агрегатор", finance: "финансы", "market-blog": "рыночный блог", "business-tv": "бизнес-tv", "financial-media": "финансовые медиа", newspaper: "газета", "public-media": "public-media", "cable-news": "кабельные новости", wire: "wire", "financial-wire": "финансовый wire", dataset: "dataset", "news-feed": "news-feed", niche: "нишевый" },
    uk: { aggregator: "агрегатор", finance: "фінанси", "market-blog": "ринковий блог", "business-tv": "бізнес-tv", "financial-media": "фінансові медіа", newspaper: "газета", "public-media": "public-media", "cable-news": "кабельні новини", wire: "wire", "financial-wire": "фінансовий wire", dataset: "dataset", "news-feed": "news-feed", niche: "нішевий" }
  }
};

const STATUS_TOKEN_MAP = {
  "готов": "ready",
  "ready": "ready",
  "кеш": "cached",
  "cached": "cached",
  "поиск": "searching",
  "searching": "searching",
  "ошибка": "error",
  "error": "error",
  "сохраняю": "saving",
  "saving": "saving",
  "алерт": "alert",
  "alert": "alert",
  "ссылка": "link",
  "link": "link",
  "чекаю": "checking",
  "checking": "checking",
  "тег": "tag",
  "tag": "tag",
  "нет api": "noApi",
  "blocked": "blocked",
  "push off": "pushOff",
  "push on": "pushOn",
  "без push": "noPush",
  "уведомления": "notifications",
  "notifications": "notifications",
  "share": "share",
  "instagram": "instagram",
  "x": "x",
  "facebook": "facebook",
  "linkedin": "linkedin",
  "имя тега": "tagName"
};

init();

async function init() {
  bindEvents();
  await loadPresets();
  applyLocale();
  const hasPrefilledRequest = hydrateFromUrl();
  setMode(state.mode);
  updateNotificationUi();
  await setupPushSupport();
  await Promise.all([loadWatchlist(), loadAlerts({ seedOnly: true }), loadHistory(), loadUserTags()]);
  if (hasPrefilledRequest) {
    await runSearch({ replaceHistory: true });
  } else {
    renderIdleState();
    setReady("ready");
  }
  configureAutoRefresh();
  configureAlertMonitor();
  refreshIcons();
}

function bindEvents() {
  elements.localeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const locale = button.dataset.locale || "en";
      if (locale === state.locale) return;
      state.locale = locale;
      localStorage.setItem("news-agent-locale", locale);
      applyLocale();
      if (state.currentPayload) renderResults(state.currentPayload);
      void Promise.all([loadWatchlist(), loadAlerts({ passive: true }), loadHistory(), loadUserTags()]);
    });
  });

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setMode(tab.dataset.mode);
      syncUrl();
    });
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });

  elements.worldCategorySelect.addEventListener("change", () => {
    if (state.mode === "world") elements.activeLabel.textContent = selectedWorldCategoryLabel();
  });

  elements.saveWatchButton.addEventListener("click", saveCurrentWatch);
  elements.shareSearchButton.addEventListener("click", shareCurrentSearch);
  elements.createAlertButton.addEventListener("click", createAlertFromCurrentSearch);
  elements.saveUserTagButton.addEventListener("click", saveUserTag);
  elements.clearTagFilterButton.addEventListener("click", clearTagFilter);
  elements.closeShareDialogButton.addEventListener("click", closeShareDialog);
  elements.shareOverlay.addEventListener("click", (event) => {
    if (event.target === elements.shareOverlay) closeShareDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.shareOverlay.hidden) closeShareDialog();
  });
  elements.refreshWatchlist.addEventListener("click", loadWatchlist);
  elements.enableNotificationsButton.addEventListener("click", toggleNotifications);
  elements.refreshAlerts.addEventListener("click", checkAlerts);
  elements.refreshHistory.addEventListener("click", loadHistory);
  elements.autoRefreshToggle.addEventListener("change", configureAutoRefresh);
  elements.refreshInterval.addEventListener("change", configureAutoRefresh);
  elements.userTagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveUserTag();
    }
  });
}

async function loadPresets() {
  const data = await api("/api/presets");
  state.presets = data.commodities || {};
  state.focuses = data.focuses || {};
  state.languages = data.languages || {};
  state.sortModes = data.sortModes || {};
  state.matchModes = data.matchModes || {};
  state.sourceTypes = data.sourceTypes || {};
  state.sources = data.sources || {};
  state.worldCategories = data.worldCategories || {};
  renderPresetOptions();
}

function fillSelect(element, values) {
  element.innerHTML = Object.entries(values)
    .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
    .join("");
}

function currentDict() {
  return I18N[state.locale] || I18N.en;
}

function currentUi() {
  return currentDict().ui;
}

function localizedMap(group) {
  return LOCALE_LABELS[group]?.[state.locale] || LOCALE_LABELS[group]?.en || {};
}

function renderPresetOptions() {
  const selectedSource = elements.sourceSelect.value || "auto";
  const selectedCategory = elements.worldCategorySelect.value || "";
  const selectedCommodity = elements.commoditySelect.value || "gold";
  const selectedFocus = elements.focusSelect.value || "all";
  const selectedFilterLanguage = elements.languageSelect.value || "any";
  const selectedSourceType = elements.sourceTypeSelect.value || "any";
  const selectedSort = elements.sortModeSelect.value || "relevance";
  const selectedMatch = elements.matchModeSelect.value || "balanced";
  const selectedTimespan = elements.timespanSelect.value || "24h";
  const selectedRefresh = elements.refreshInterval.value || "900000";

  fillSelect(elements.sourceSelect, localizedMap("sources"));
  fillSelect(elements.worldCategorySelect, {
    "": currentUi().placeholders.worldCategorySelect,
    ...localizedMap("worldCategories")
  });
  fillSelect(elements.commoditySelect, localizedMap("commodities"));
  fillSelect(elements.focusSelect, localizedMap("focuses"));
  fillSelect(elements.languageSelect, localizedMap("filterLanguages"));
  fillSelect(elements.sourceTypeSelect, localizedMap("sourceTypes"));
  fillSelect(elements.sortModeSelect, localizedMap("sortModes"));
  fillSelect(elements.matchModeSelect, localizedMap("matchModes"));
  fillSelect(elements.timespanSelect, localizedMap("timespans"));
  fillSelect(elements.refreshInterval, localizedRefreshIntervals());

  elements.sourceSelect.value = selectedSource;
  elements.worldCategorySelect.value = selectedCategory;
  elements.commoditySelect.value = selectedCommodity;
  elements.focusSelect.value = selectedFocus;
  elements.languageSelect.value = selectedFilterLanguage;
  elements.sourceTypeSelect.value = selectedSourceType;
  elements.sortModeSelect.value = selectedSort;
  elements.matchModeSelect.value = selectedMatch;
  elements.timespanSelect.value = selectedTimespan;
  elements.refreshInterval.value = selectedRefresh;
}

function localizedRefreshIntervals() {
  if (state.locale === "ru") {
    return { "300000": "5 минут", "900000": "15 минут", "1800000": "30 минут" };
  }
  if (state.locale === "uk") {
    return { "300000": "5 хв", "900000": "15 хв", "1800000": "30 хв" };
  }
  return { "300000": "5 min", "900000": "15 min", "1800000": "30 min" };
}

function translateTag(tag) {
  return localizedMap("tags")[tag] || tag;
}

function translateTier(value) {
  return localizedMap("tiers")[value] || value;
}

function translateQualityType(value) {
  return localizedMap("qualityTypes")[value] || value;
}

function applyLocale() {
  const dict = currentDict();
  const ui = dict.ui;
  document.documentElement.lang = dict.htmlLang;
  document.title = dict.title;
  elements.localeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.locale === state.locale);
  });

  const setText = (selector, text) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };

  document.querySelector(".locale-switch")?.setAttribute("aria-label", ui.languageSwitcher);
  setText(".brand-block .eyebrow", ui.signalDesk);
  setText(".hero-note", dict.heroNote);
  document.querySelectorAll(".signal-ribbon span").forEach((node, index) => {
    node.textContent = dict.ribbon[index] || node.textContent;
  });
  setText(".control-panel .panel-topline .eyebrow", ui.commandDeck);
  setText(".control-panel .panel-code", ui.liveFilters);
  setText(".panel-intro h2", ui.controlIntroTitle);
  setText(".panel-intro p", ui.controlIntroCopy);
  setText(".advanced-title", ui.advanced.title);
  setText(".advanced-copy", ui.advanced.copy);
  setText(".advanced-pill", ui.advanced.pill);
  setText(".tab[data-mode='world'] span", ui.tabs.world);
  setText(".tab[data-mode='ticker'] span", ui.tabs.ticker);
  setText(".tab[data-mode='commodity'] span", ui.tabs.commodity);
  setText(".tab[data-mode='custom'] span", ui.tabs.custom);

  Object.entries(ui.labels).forEach(([id, label]) => {
    const node = document.querySelector(`label[for="${id}"]`);
    if (node) node.textContent = label;
  });

  Object.entries(ui.placeholders).forEach(([id, placeholder]) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.setAttribute("placeholder", placeholder);
  });

  setText(".primary span", ui.buttons.search);
  setText("#saveWatchButton span", ui.buttons.save);
  setText("#shareSearchButton span", ui.buttons.share);
  setText("#createAlertButton span", ui.buttons.alert);
  setText(".automation-row .switch-label", ui.buttons.autoRefresh);

  document.querySelector(".control-panel")?.setAttribute("aria-label", ui.searchPanel);
  document.querySelector(".tabs")?.setAttribute("aria-label", ui.searchMode);
  document.querySelector(".side-panel")?.setAttribute("aria-label", ui.summaryPanel);
  document.querySelector(".results-panel")?.setAttribute("aria-label", ui.newsPanel);

  document.querySelectorAll(".metric-label").forEach((node, index) => {
    node.textContent = ui.metricLabels[index] || node.textContent;
  });

  const watchHeadings = document.querySelectorAll(".side-panel .watch-panel h2");
  if (watchHeadings[0]) watchHeadings[0].textContent = ui.sections.saved;
  if (watchHeadings[1]) watchHeadings[1].textContent = ui.sections.alerts;
  if (watchHeadings[2]) watchHeadings[2].textContent = ui.sections.history;

  const statsHeadings = document.querySelectorAll(".side-panel .stats-panel h2");
  if (statsHeadings[0]) statsHeadings[0].textContent = ui.sections.myTags;
  if (statsHeadings[1]) statsHeadings[1].textContent = ui.sections.feedTopics;
  setText(".results-timestamp .timestamp-label", ui.results.updated);
  setText(".briefing-panel h2", ui.results.briefing);
  setText("#shareDialogTitle", ui.share.title);
  setText(".share-dialog-head .eyebrow", ui.buttons.share);

  elements.refreshWatchlist.setAttribute("aria-label", ui.aria.refreshSaved);
  elements.refreshHistory.setAttribute("aria-label", ui.aria.refreshHistory);
  elements.saveUserTagButton.setAttribute("aria-label", ui.aria.addCustomTag);
  elements.clearTagFilterButton.setAttribute("aria-label", ui.aria.resetTopicFilter);
  elements.refreshAlerts.setAttribute("aria-label", ui.aria.checkAlerts);
  elements.closeShareDialogButton.setAttribute("aria-label", ui.aria.closeShare);

  setText(".share-grid [data-share-target='native'] span", ui.buttons.share);
  setText(".share-grid [data-share-target='copy'] span", ui.share.copy);
  elements.shareCaption.textContent = ui.share.currentCaption;
  const statusLabel = elements.status.querySelector("span:last-child");
  if (statusLabel) statusLabel.textContent = translateStatusToken(statusLabel.textContent);

  renderPresetOptions();
  setMode(state.mode);
  if (!state.currentPayload && !state.lastRequest) renderIdleState();
  updateNotificationUi();
}

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const hasRequestParams = ["category", "ticker", "commodity", "query", "country", "focus", "source", "tag"]
    .some((key) => params.has(key));
  state.mode = params.get("mode") || "world";
  elements.sourceSelect.value = params.get("source") || "auto";
  elements.timespanSelect.value = params.get("timespan") || "24h";
  elements.limitSelect.value = params.get("limit") || "30";
  elements.worldCategorySelect.value = params.get("category") || "";
  elements.tickerInput.value = params.get("ticker") || "";
  elements.commoditySelect.value = params.get("commodity") || "gold";
  elements.queryInput.value = params.get("query") || "";
  elements.countryInput.value = params.get("country") || "";
  elements.languageSelect.value = params.get("language") || "any";
  elements.focusSelect.value = params.get("focus") || "all";
  elements.sourceTypeSelect.value = params.get("sourceType") || "any";
  elements.sortModeSelect.value = params.get("sortMode") || "relevance";
  elements.matchModeSelect.value = params.get("matchMode") || "balanced";
  elements.excludeInput.value = params.get("exclude") || "";
  elements.sourceIncludeInput.value = params.get("sourceInclude") || "";
  elements.sourceExcludeInput.value = params.get("sourceExclude") || "";
  state.activeTagFilter = params.get("tag") || "";
  return hasRequestParams;
}

function setMode(mode) {
  state.mode = mode;

  elements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });

  elements.fields.forEach((field) => {
    field.hidden = field.dataset.field !== mode;
  });

  if (mode === "world") {
    elements.activeMode.textContent = currentUi().results.activeModes.world;
    elements.activeLabel.textContent = selectedWorldCategoryLabel();
  } else if (mode === "ticker") {
    elements.activeMode.textContent = currentUi().results.activeModes.ticker;
    elements.activeLabel.textContent = currentUi().results.defaults.ticker;
  } else if (mode === "commodity") {
    elements.activeMode.textContent = currentUi().results.activeModes.commodity;
    elements.activeLabel.textContent = currentUi().results.defaults.commodity;
  } else {
    elements.activeMode.textContent = currentUi().results.activeModes.custom;
    elements.activeLabel.textContent = elements.queryInput.value.trim() || currentUi().results.defaults.custom;
  }
}

async function runSearch(options = {}) {
  if (state.mode === "world" && !elements.worldCategorySelect.value) {
    renderIdleState(currentUi().prompts.chooseTopic);
    setError("error");
    elements.worldCategorySelect.focus();
    return;
  }

  const request = buildRequest();
  state.lastRequest = request;
  syncUrl();
  setBusy("поиск");
  renderLoading();

  try {
    const data = await api(`/api/news?${new URLSearchParams(request).toString()}`);
    state.currentPayload = data;
    renderResults(data);
    setReady(data.cached ? "кеш" : "готов");
    if (!options.skipLists) await loadHistory();
  } catch (error) {
    renderError(error.message);
    setError("ошибка");
  } finally {
    configureAutoRefresh();
    refreshIcons();
  }
}

function buildRequest(overrides = {}) {
  const base = {
    mode: state.mode,
    source: elements.sourceSelect.value,
    timespan: elements.timespanSelect.value,
    limit: elements.limitSelect.value,
    category: elements.worldCategorySelect.value,
    country: elements.countryInput.value.trim(),
    language: elements.languageSelect.value,
    focus: elements.focusSelect.value,
    sourceType: elements.sourceTypeSelect.value,
    sortMode: elements.sortModeSelect.value,
    matchMode: elements.matchModeSelect.value,
    exclude: elements.excludeInput.value.trim(),
    sourceInclude: elements.sourceIncludeInput.value.trim(),
    sourceExclude: elements.sourceExcludeInput.value.trim()
  };

  if (state.mode === "ticker") base.ticker = elements.tickerInput.value.trim();
  if (state.mode === "commodity") base.commodity = elements.commoditySelect.value;
  if (state.mode === "custom") base.query = elements.queryInput.value.trim();

  return { ...base, ...overrides };
}

function syncUrl() {
  const request = buildRequest({ track: undefined });
  const params = new URLSearchParams();
  Object.entries(request).forEach(([key, value]) => {
    if (value === "" || value === "any" || value === "all" || value == null) return;
    if (key === "category" && state.mode !== "world") return;
    if (key === "commodity" && state.mode !== "commodity") return;
    if (key === "ticker" && state.mode !== "ticker") return;
    if (key === "query" && state.mode !== "custom") return;
    params.set(key, String(value));
  });
  params.set("mode", state.mode);
  if (state.activeTagFilter) params.set("tag", state.activeTagFilter);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function renderResults(data) {
  const request = data.request || {};
  const clusters = filterClustersByActiveTag(data.clusters || []);
  const totalArticles = state.activeTagFilter
    ? countClusterArticles(clusters)
    : data.stats?.total || countClusterArticles(clusters);
  const ui = currentUi();

  elements.message.textContent = "";
  elements.message.hidden = true;
  if (elements.totalCount) elements.totalCount.textContent = String(totalArticles || clusters.length);
  if (elements.sourceName) elements.sourceName.textContent = sourceLabel(request.source);
  if (elements.sortName) {
    elements.sortName.textContent =
      localizedMap("sortModes")[request.filters?.sortMode || "relevance"] || localizedMap("sortModes").relevance;
  }
  if (elements.matchName) {
    elements.matchName.textContent =
      localizedMap("matchModes")[request.filters?.matchMode || "balanced"] || localizedMap("matchModes").balanced;
  }
  elements.activeLabel.textContent = localizedRequestLabel(request);
  elements.lastUpdated.textContent = formatDateTime(data.generatedAt);
  elements.summaryMode.textContent = data.summary?.mode === "ai" ? ui.results.ai : ui.results.heuristic;

  renderBriefing(buildLocalizedBriefing(data, request, clusters));
  renderTags(data.stats?.topTags || []);

  if (!clusters.length) {
    elements.resultsList.innerHTML = `<div class="empty-state">${escapeHtml(ui.results.empty)}</div>`;
    return;
  }

  elements.resultsList.innerHTML = clusters.map((cluster, index) => renderCluster(cluster, index === 0)).join("");
  bindResultActions();
}

function renderCluster(cluster, featured = false) {
  const article = cluster.lead;
  const tags = selectCardTags(article.tags || [])
    .map((tag) => `<span>${escapeHtml(translateTag(tag))}</span>`)
    .join("");
  const summary = excerptText(article.summary || article.title, cluster.size > 1 ? 172 : 150);
  const quality = article.sourceQuality || {};
  const related = cluster.related
    .slice(0, 3)
    .map((item) => `<a class="related-link" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source)}</a>`)
    .join("");
  const clusterBadge = cluster.size > 1 ? `<span class="story-count">${escapeHtml(currentUi().results.sourceCount(cluster.size))}</span>` : "";
  const sourceChip = escapeHtml(article.provider || article.domain || "Source");
  const scoreChip = quality.quality ? `<span>${escapeHtml(currentUi().results.score)} ${escapeHtml(String(quality.quality))}</span>` : "";
  const relatedRow = cluster.related.length
    ? `<div class="related-strip"><span class="related-label">${escapeHtml(currentUi().results.alsoFrom)}</span><div class="related-links">${related}</div></div>`
    : "";

  return `
    <article class="article-card${article.image ? "" : " no-image"}${featured ? " featured" : ""}">
      <div class="article-content">
        <div class="article-meta-row">
          <div class="article-meta">
            <span>${escapeHtml(article.domain || article.provider || "Источник")}</span>
            <span>${escapeHtml(article.language || article.provider || "")}</span>
            <span>${formatDateTime(article.publishedAt)}</span>
            ${clusterBadge}
          </div>
          <button
            class="icon-button article-share-button"
            type="button"
            aria-label="${escapeAttribute(currentUi().aria.shareArticle)}"
            data-share-article='${escapeAttribute(JSON.stringify({
              title: article.title,
              url: article.url,
              provider: article.provider || article.domain || "News Agent"
            }))}'
          >
            <i data-lucide="share-2"></i>
          </button>
        </div>
        <a class="article-title" href="${escapeAttribute(article.url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(article.title)}
        </a>
        <p class="article-summary">${escapeHtml(summary)}</p>
        ${tags ? `<div class="article-tags">${tags}</div>` : ""}
        <div class="article-footer">
          <span>${sourceChip}</span>
          ${scoreChip}
        </div>
        ${relatedRow}
      </div>
      ${article.image ? `<img class="article-image" src="${escapeAttribute(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
    </article>
  `;
}

function renderBriefing(lines) {
  elements.briefingLines.innerHTML = lines.length
    ? lines.slice(0, 2).map((line) => `<p>${escapeHtml(line)}</p>`).join("")
    : `<p>${escapeHtml(currentUi().results.summaryPlaceholder)}</p>`;
}

function renderTags(tags) {
  const active = state.activeTagFilter;
  elements.tagCloud.innerHTML = tags.length
    ? tags.map((tag) => `
        <button class="tag actionable-tag${active === tag.label ? " active" : ""}" type="button" data-tag-filter="${escapeAttribute(tag.label)}">
          ${escapeHtml(translateTag(tag.label))} ${tag.count}
        </button>
      `).join("")
    : `<span class="tag">${escapeHtml(currentUi().results.noTags)}</span>`;

  elements.tagCloud.querySelectorAll("[data-tag-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.dataset.tagFilter || "";
      state.activeTagFilter = state.activeTagFilter === tag ? "" : tag;
      syncUrl();
      if (state.currentPayload) renderResults(state.currentPayload);
    });
  });
}

function localizedRequestLabel(request, locale = state.locale) {
  const sources = LOCALE_LABELS.sources[locale] || LOCALE_LABELS.sources.en;
  const categories = LOCALE_LABELS.worldCategories[locale] || LOCALE_LABELS.worldCategories.en;
  const commodities = LOCALE_LABELS.commodities[locale] || LOCALE_LABELS.commodities.en;
  const ui = (I18N[locale] || I18N.en).ui;

  if (request.mode === "ticker") {
    return request.ticker || request.label || ui.results.defaults.ticker;
  }
  if (request.mode === "commodity") {
    return commodities[request.commodity] || request.label || ui.results.defaults.commodity;
  }
  if (request.mode === "custom") {
    return request.query || request.label || ui.results.defaults.custom;
  }
  if (request.mode === "world") {
    return categories[request.category || "all"] || request.label || ui.results.defaults.world;
  }
  return request.label || "News Agent";
}

function buildLocalizedBriefing(data, request, clusters) {
  const ui = currentUi();
  const total = data.stats?.total || countClusterArticles(clusters);
  const topTags = (data.stats?.topTags || []).slice(0, 3).map((entry) => translateTag(entry.label)).join(", ");
  const leadCluster = clusters[0];
  const label = localizedRequestLabel(request);
  const timeLabel = localizedMap("timespans")[request.timespan] || request.timespan;
  const leadLine = leadCluster
    ? `${leadCluster.lead.title}${leadCluster.size > 1 ? ` (${currentUi().results.sourceCount(leadCluster.size)})` : ""}.`
    : "";

  if (state.locale === "ru") {
    return [
      `${total} материалов за ${timeLabel} по теме "${label}".`,
      leadLine ? `В центре внимания: ${leadLine}` : (topTags ? `Главные темы: ${topTags}.` : "")
    ].filter(Boolean);
  }

  if (state.locale === "uk") {
    return [
      `${total} матеріалів за ${timeLabel} за темою "${label}".`,
      leadLine ? `У фокусі: ${leadLine}` : (topTags ? `Головні теми: ${topTags}.` : "")
    ].filter(Boolean);
  }

  return [
    `${total} stories in ${timeLabel} for "${label}".`,
    leadLine ? `Focus: ${leadLine}` : (topTags ? `Main themes: ${topTags}.` : "")
  ].filter(Boolean);
}

function selectCardTags(tags) {
  const preferredOrder = ["геополитика", "политика", "рынки", "акции", "крипта", "сырье", "экономика", "технологии", "риски"];
  const unique = [...new Set(tags)];
  const ordered = preferredOrder.filter((tag) => unique.includes(tag));
  const fallback = unique.filter((tag) => !ordered.includes(tag));
  return [...ordered, ...fallback].slice(0, 2);
}

function renderLoading() {
  elements.message.textContent = "";
  elements.message.hidden = true;
  if (elements.totalCount) elements.totalCount.textContent = "—";
  if (elements.sourceName) elements.sourceName.textContent = sourceLabel(elements.sourceSelect.value);
  if (elements.sortName) elements.sortName.textContent = localizedMap("sortModes")[elements.sortModeSelect.value] || localizedMap("sortModes").relevance;
  if (elements.matchName) elements.matchName.textContent = localizedMap("matchModes")[elements.matchModeSelect.value] || localizedMap("matchModes").balanced;
  elements.briefingLines.innerHTML = `<p>${escapeHtml(currentUi().results.loading)}</p>`;
  elements.resultsList.innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton"></div>').join("");
}

function renderIdleState(message = "") {
  state.currentPayload = null;
  state.lastRequest = null;
  elements.message.textContent = "";
  elements.message.hidden = true;
  if (message) {
    elements.message.textContent = message;
    elements.message.hidden = false;
  }
  elements.activeMode.textContent = currentUi().results.activeModes[state.mode] || currentUi().results.activeModes.world;
  elements.activeLabel.textContent = currentUi().results.idleLabel;
  elements.lastUpdated.textContent = "-";
  elements.summaryMode.textContent = "";
  if (elements.totalCount) elements.totalCount.textContent = "0";
  if (elements.sourceName) elements.sourceName.textContent = sourceLabel(elements.sourceSelect.value);
  if (elements.sortName) elements.sortName.textContent = localizedMap("sortModes")[elements.sortModeSelect.value] || localizedMap("sortModes").relevance;
  if (elements.matchName) elements.matchName.textContent = localizedMap("matchModes")[elements.matchModeSelect.value] || localizedMap("matchModes").balanced;
  elements.briefingLines.innerHTML = `<p>${escapeHtml(currentUi().results.summaryPlaceholder)}</p>`;
  elements.resultsList.innerHTML = `<div class="empty-state">${escapeHtml(currentUi().results.idle)}</div>`;
}

function renderError(message) {
  elements.message.textContent = message;
  elements.message.hidden = false;
  elements.resultsList.innerHTML = `<div class="empty-state">${escapeHtml(currentUi().results.empty)}</div>`;
  if (elements.totalCount) elements.totalCount.textContent = "0";
  if (elements.sourceName) elements.sourceName.textContent = "-";
}

async function saveCurrentWatch() {
  const request = buildRequest();
  const payload = toWatchItem(request);
  if (!payload) return;

  setBusy("сохраняю");

  try {
    await api("/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    await loadWatchlist();
    setReady("готов");
  } catch (error) {
    renderError(error.message);
    setError("ошибка");
  }
}

function toWatchItem(request) {
  return {
    mode: request.mode,
    label: watchLabel(request),
    value: request.query || request.ticker || request.commodity || request.category || "",
    request
  };
}

async function createAlertFromCurrentSearch() {
  const request = buildRequest();
  const interval = Number(prompt(currentUi().prompts.alertInterval, "60") || "60");
  if (!Number.isFinite(interval) || interval <= 0) return;

  setBusy("алерт");

  try {
    await api("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: watchLabel(request),
        intervalMinutes: interval,
        request
      })
    });
    await loadAlerts();
    configureAlertMonitor();
    setReady("готов");
  } catch (error) {
    renderError(error.message);
    setError("ошибка");
  }
}

async function shareCurrentSearch() {
  syncUrl();
  openShareDialog(buildCurrentPageSharePayload());
}

function buildCurrentPageSharePayload() {
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const label = localizedRequestLabel(buildRequest());
  const englishLabel = localizedRequestLabel(buildRequest(), "en");
  const mode = currentUi().results.activeModes[state.mode] || "News";
  return {
    title: `${label} - News Agent`,
    text: `${mode}: ${label}`,
    englishText: `${I18N.en.ui.results.activeModes[state.mode] || "News"}: ${englishLabel}`,
    url,
    caption: currentUi().share.currentCaption
  };
}

function bindResultActions() {
  elements.resultsList.querySelectorAll("[data-share-article]").forEach((button) => {
    button.addEventListener("click", () => {
      const raw = button.getAttribute("data-share-article");
      if (!raw) return;
      try {
        const article = JSON.parse(raw);
        openShareDialog({
          title: article.title || "News story",
          text: `${article.provider || "Source"} - ${article.title || "News story"}`,
          englishText: `News Agent story: ${article.title || "News story"}`,
          url: article.url || window.location.href,
          caption: currentUi().share.articleCaption
        });
      } catch {
        openShareDialog(buildCurrentPageSharePayload());
      }
    });
  });
}

function openShareDialog(payload) {
  shareState.title = payload.title || "News Agent";
  shareState.text = payload.text || "News Agent";
  shareState.englishText = payload.englishText || payload.text || "News Agent";
  shareState.url = payload.url || window.location.href;
  elements.shareCaption.textContent = payload.caption || currentUi().share.currentCaption;
  elements.shareLinkPreview.textContent = shareState.url;
  elements.shareOverlay.hidden = false;
  refreshIcons();
  elements.shareOverlay.querySelectorAll("[data-share-target]").forEach((button) => {
    button.onclick = () => {
      void handleShareTarget(button.dataset.shareTarget || "");
    };
  });
}

function closeShareDialog() {
  elements.shareOverlay.hidden = true;
}

async function handleShareTarget(target) {
  if (!target) return;

  if (target === "copy") {
    await copyShareLink();
    closeShareDialog();
    return;
  }

  if (target === "native") {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareState.title,
          text: shareState.text,
          url: shareState.url
        });
        setReady("share");
      } catch {
        await copyShareLink();
      }
    } else {
      await copyShareLink();
    }
    closeShareDialog();
    return;
  }

  if (target === "instagram") {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareState.title,
          text: shareState.text,
          url: shareState.url
        });
        setReady("instagram");
        closeShareDialog();
        return;
      } catch {
        // fall through to copy + open
      }
    }

    await copyShareLink("insta");
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    closeShareDialog();
    return;
  }

  const shareUrl = getPlatformShareUrl(target, shareState);
  if (shareUrl) {
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=720,height=640");
    setReady(target);
    closeShareDialog();
  }
}

function getPlatformShareUrl(target, payload) {
  const url = encodeURIComponent(payload.url || window.location.href);
  const text = encodeURIComponent(
    target === "x"
      ? (payload.englishText || payload.text || payload.title || "News Agent")
      : (payload.text || payload.title || "News Agent")
  );

  if (target === "x") {
    return `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
  }
  if (target === "facebook") {
    return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  }
  if (target === "linkedin") {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
  }
  return "";
}

async function copyShareLink(readyLabel = currentUi().share.linkReady) {
  try {
    await navigator.clipboard.writeText(shareState.url);
    setReady(readyLabel);
  } catch {
    prompt(currentUi().share.currentPrompt, shareState.url);
  }
}

async function loadWatchlist() {
  try {
    const data = await api("/api/watchlist");
    renderCollection(elements.watchlist, data.items || [], {
      emptyLabel: currentUi().watch.empty,
      getLabel: displaySavedItemLabel,
      onOpen: runSavedRequest,
      onRemove: async (id) => {
        await api(`/api/watchlist/${id}`, { method: "DELETE" });
        await loadWatchlist();
      }
    });
  } catch {
    elements.watchlist.innerHTML = `<span class="tag">${escapeHtml(currentUi().watch.unavailable)}</span>`;
  } finally {
    refreshIcons();
  }
}

async function loadAlerts(options = {}) {
  try {
    const data = await api("/api/alerts");
    const items = data.items || [];
    maybeNotifyAlertChanges(items, options);
    renderCollection(elements.alertsList, items, {
      emptyLabel: currentUi().watch.noRules,
      getLabel: displaySavedItemLabel,
      onOpen: runSavedRequest,
      onRemove: async (id) => {
        await api(`/api/alerts/${id}`, { method: "DELETE" });
        await loadAlerts();
        configureAlertMonitor();
      },
      showMeta: (item) => formatAlertMeta(item)
    });
  } catch {
    elements.alertsList.innerHTML = `<span class="tag">${escapeHtml(currentUi().watch.unavailable)}</span>`;
  } finally {
    refreshIcons();
  }
}

async function loadHistory() {
  try {
    const data = await api("/api/history");
    renderCollection(elements.historyList, data.items || [], {
      emptyLabel: currentUi().watch.historyEmpty,
      getLabel: displaySavedItemLabel,
      onOpen: runSavedRequest,
      removable: false,
      showMeta: (item) => formatDateTime(item.createdAt)
    });
  } catch {
    elements.historyList.innerHTML = `<span class="tag">${escapeHtml(currentUi().watch.unavailable)}</span>`;
  } finally {
    refreshIcons();
  }
}

async function loadUserTags() {
  try {
    const data = await api("/api/user-tags");
    state.userTags = data.items || [];
    renderCollection(elements.userTagCloud, state.userTags, {
      emptyLabel: currentUi().watch.tagsEmpty,
      getLabel: (item) => item.name || displaySavedItemLabel(item),
      onOpen: runSavedRequest,
      onRemove: async (id) => {
        await api(`/api/user-tags/${id}`, { method: "DELETE" });
        await loadUserTags();
      },
      showMeta: (item) => requestBadge(item.request)
    });
  } catch {
    elements.userTagCloud.innerHTML = `<span class="tag">${escapeHtml(currentUi().watch.unavailable)}</span>`;
  } finally {
    refreshIcons();
  }
}

async function checkAlerts() {
  setBusy("чекаю");
  try {
    await api("/api/alerts/check", { method: "POST" });
    await loadAlerts();
    setReady("готов");
  } catch (error) {
    renderError(error.message);
    setError("ошибка");
  }
}

function renderCollection(container, items, options) {
  if (!items.length) {
    container.innerHTML = `<span class="tag">${escapeHtml(options.emptyLabel)}</span>`;
    return;
  }

  container.innerHTML = items
    .map((item) => `
      <span class="watch-item">
        <button type="button" data-open-id="${escapeAttribute(item.id)}">${escapeHtml(options.getLabel ? options.getLabel(item) : item.label)}</button>
        ${options.showMeta ? `<span class="mini-meta">${escapeHtml(options.showMeta(item))}</span>` : ""}
        ${options.removable === false ? "" : `<button type="button" data-remove-id="${escapeAttribute(item.id)}" aria-label="${escapeAttribute(currentUi().aria.removeItem)}"><i data-lucide="x"></i></button>`}
      </span>
    `)
    .join("");

  container.querySelectorAll("[data-open-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((entry) => entry.id === button.dataset.openId);
      if (item) options.onOpen(item);
    });
  });

  container.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await options.onRemove(button.dataset.removeId);
    });
  });
}

function runSavedRequest(item) {
  const request = item.request || item;
  applyRequestToForm(request);
  state.activeTagFilter = "";
  runSearch({ skipLists: true });
}

function applyRequestToForm(request) {
  state.mode = request.mode || "world";
  setMode(state.mode);
  elements.sourceSelect.value = request.source || "auto";
  elements.timespanSelect.value = request.timespan || "24h";
  elements.limitSelect.value = String(request.limit || 30);
  elements.worldCategorySelect.value = request.category || "all";
  elements.tickerInput.value = request.ticker || "";
  elements.commoditySelect.value = request.commodity || "gold";
  elements.queryInput.value = request.query || "";
  elements.countryInput.value = request.filters?.country || request.country || "";
  elements.languageSelect.value = request.filters?.language || request.language || "any";
  elements.focusSelect.value = request.filters?.focus || request.focus || "all";
  elements.sourceTypeSelect.value = request.filters?.sourceType || request.sourceType || "any";
  elements.sortModeSelect.value = request.filters?.sortMode || request.sortMode || "relevance";
  elements.matchModeSelect.value = request.filters?.matchMode || request.matchMode || "balanced";
  elements.excludeInput.value = (request.filters?.excludeTerms || []).join(", ") || request.exclude || "";
  elements.sourceIncludeInput.value = (request.filters?.sourceInclude || []).join(", ") || request.sourceInclude || "";
  elements.sourceExcludeInput.value = (request.filters?.sourceExclude || []).join(", ") || request.sourceExclude || "";
}

function watchLabel(request) {
  return localizedRequestLabel(request);
}

function requestBadge(request) {
  if (request?.mode === "ticker") return request.ticker?.toUpperCase() || currentUi().badges.ticker;
  if (request?.mode === "commodity") return localizedMap("commodities")[request.commodity] || request.commodity || currentUi().badges.commodity;
  if (request?.mode === "custom") return currentUi().badges.custom;
  return localizedMap("worldCategories")[request?.category || "all"] || currentUi().badges.world;
}

function displaySavedItemLabel(item) {
  return localizedRequestLabel(item.request || item);
}

function formatAlertMeta(item) {
  if (Number(item.lastMatchCount || 0) > 0) {
    return `${item.lastMatchCount} ${currentUi().watch.hits}`;
  }
  return `${item.intervalMinutes}${currentUi().watch.minutesShort}`;
}

async function saveUserTag() {
  const name = elements.userTagInput.value.trim();
  const request = buildRequest();

  if (!name) {
    elements.userTagInput.focus();
    setError("имя тега");
    return;
  }

  setBusy("тег");

  try {
    await api("/api/user-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        request
      })
    });
    elements.userTagInput.value = "";
    await loadUserTags();
    setReady("готов");
  } catch (error) {
    renderError(error.message);
    setError("ошибка");
  }
}

function clearTagFilter() {
  state.activeTagFilter = "";
  syncUrl();
  if (state.currentPayload) renderResults(state.currentPayload);
}

function configureAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = null;

  if (!elements.autoRefreshToggle.checked || !state.lastRequest) return;

  state.refreshTimer = setInterval(() => {
    runSearch({ skipLists: true });
  }, Number(elements.refreshInterval.value));
}

function configureAlertMonitor() {
  if (state.alertMonitorTimer) clearInterval(state.alertMonitorTimer);
  state.alertMonitorTimer = null;

  state.alertMonitorTimer = setInterval(() => {
    loadAlerts({ passive: true });
  }, 60000);
}

async function toggleNotifications() {
  if (!("Notification" in window)) {
    elements.notificationStatus.textContent = currentUi().notifications.unsupported;
    setError("нет api");
    return;
  }

  if (state.pushSupported) {
    await togglePushNotifications();
    return;
  }

  await toggleBrowserNotifications();
}

function updateNotificationUi() {
  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const pushMode = state.pushSupported && state.pushSubscription;
  const browserMode = state.notificationsEnabled && permission === "granted" && !pushMode;

  elements.notificationStatus.textContent = pushMode
    ? currentUi().notifications.pushOn
    : permission === "unsupported"
      ? currentUi().notifications.unsupported
      : browserMode
        ? currentUi().notifications.browserOn
        : permission === "denied"
          ? currentUi().notifications.blocked
          : currentUi().notifications.off;

  elements.enableNotificationsButton.classList.toggle("active", pushMode || browserMode);
  elements.enableNotificationsButton.setAttribute(
    "aria-label",
    pushMode || browserMode ? currentUi().aria.disableNotifications : currentUi().aria.enableNotifications
  );
}

function maybeNotifyAlertChanges(items, options = {}) {
  const nextSnapshot = new Map(items.map((item) => [item.id, snapshotAlert(item)]));
  const canNotify =
    state.notificationsEnabled &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    !state.pushSubscription;

  if (!state.alertsBootstrapped || options.seedOnly) {
    state.alertSnapshot = nextSnapshot;
    state.alertsBootstrapped = true;
    updateNotificationUi();
    return;
  }

  if (canNotify) {
    for (const item of items) {
      const previous = state.alertSnapshot.get(item.id);
      if (!previous) continue;
      if (!shouldNotifyAlert(previous, item)) continue;
      showAlertNotification(item);
    }
  }

  state.alertSnapshot = nextSnapshot;
  state.alertsBootstrapped = true;
  updateNotificationUi();
}

function snapshotAlert(item) {
  return {
    id: item.id,
    lastCheckedAt: item.lastCheckedAt || "",
    lastMatchCount: Number(item.lastMatchCount || 0),
    latestHeadline: item.latestHeadline || ""
  };
}

function shouldNotifyAlert(previous, current) {
  if (!current || current.status !== "ACTIVE") return false;
  if (!current.lastCheckedAt || current.lastCheckedAt === previous.lastCheckedAt) return false;
  if (Number(current.lastMatchCount || 0) <= 0) return false;
  if ((current.latestHeadline || "") && current.latestHeadline !== previous.latestHeadline) return true;
  return Number(current.lastMatchCount || 0) > Number(previous.lastMatchCount || 0);
}

function showAlertNotification(alert) {
  const body = alert.latestHeadline || `${alert.lastMatchCount} new matches`;
  window.dispatchEvent(new CustomEvent("news-agent-alert", {
    detail: {
      id: alert.id,
      label: alert.label,
      body
    }
  }));
  const notification = new Notification(`${currentUi().sections.alerts}: ${displaySavedItemLabel(alert)}`, {
    body,
    tag: `news-agent-alert-${alert.id}`,
    renotify: true
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    runSavedRequest(alert);
  };
}

async function setupPushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
    state.pushSupported = false;
    updateNotificationUi();
    return;
  }

  try {
    const config = await api("/api/notifications/config");
    if (!config?.publicKey) {
      state.pushSupported = false;
      updateNotificationUi();
      return;
    }

    state.pushPublicKey = config.publicKey;
    state.serviceWorkerRegistration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    state.pushSubscription = await state.serviceWorkerRegistration.pushManager.getSubscription();
    state.pushSupported = true;

    if (state.pushSubscription) {
      state.notificationsEnabled = true;
      localStorage.setItem("news-agent-notifications", "on");
    }
  } catch (error) {
    console.warn("Push setup skipped:", error.message);
    state.pushSupported = false;
  }

  updateNotificationUi();
}

async function togglePushNotifications() {
  if (!state.serviceWorkerRegistration) {
    await setupPushSupport();
  }

  if (state.pushSubscription) {
    const endpoint = state.pushSubscription.endpoint;
    await state.pushSubscription.unsubscribe();
    await api("/api/notifications/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint })
    });
    state.pushSubscription = null;
    state.notificationsEnabled = false;
    localStorage.setItem("news-agent-notifications", "off");
    updateNotificationUi();
    setReady("push off");
    return;
  }

  const permission = await ensureNotificationPermission();
  if (permission !== "granted") return;

  const subscription = await state.serviceWorkerRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(state.pushPublicKey)
  });

  await api("/api/notifications/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });

  state.pushSubscription = subscription;
  state.notificationsEnabled = true;
  localStorage.setItem("news-agent-notifications", "on");
  updateNotificationUi();
  setReady("push on");
}

async function toggleBrowserNotifications() {
  if (state.notificationsEnabled && Notification.permission === "granted") {
    state.notificationsEnabled = false;
    localStorage.setItem("news-agent-notifications", "off");
    updateNotificationUi();
    setReady("без push");
    return;
  }

  const permission = await ensureNotificationPermission();
  if (permission !== "granted") return;

  state.notificationsEnabled = true;
  localStorage.setItem("news-agent-notifications", "on");
  updateNotificationUi();
  setReady("уведомления");
}

async function ensureNotificationPermission() {
  if (Notification.permission === "denied") {
    state.notificationsEnabled = false;
    localStorage.setItem("news-agent-notifications", "off");
    updateNotificationUi();
    setError("blocked");
    return "denied";
  }

  if (Notification.permission === "granted") return "granted";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    state.notificationsEnabled = false;
    localStorage.setItem("news-agent-notifications", "off");
    updateNotificationUi();
    setError("blocked");
  }
  return permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function selectedWorldCategoryLabel() {
  const value = elements.worldCategorySelect.value || "all";
  if (!elements.worldCategorySelect.value) return currentUi().results.idleLabel;
  return localizedMap("worldCategories")[value] || state.worldCategories[value]?.label || currentUi().results.defaults.world;
}

function sourceLabel(source) {
  return localizedMap("sources")[source] || state.sources[source] || "-";
}

function mapTagToFocus(tag) {
  const value = String(tag || "").toLowerCase();
  if (value.includes("полит")) return "politics";
  if (value.includes("геопол") || value.includes("эконом") || value.includes("рынк")) return "markets";
  if (value.includes("сырье")) return "commodities";
  if (value.includes("технолог")) return "tech";
  if (value.includes("наука") || value.includes("здоров")) return "science";
  return "all";
}

function filterClustersByActiveTag(clusters) {
  if (!state.activeTagFilter) return clusters;
  return clusters.filter((cluster) => clusterHasTag(cluster, state.activeTagFilter));
}

function clusterHasTag(cluster, tag) {
  const target = String(tag || "").toLowerCase();
  if (!target) return true;

  const values = new Set([
    ...(cluster.lead?.tags || []),
    ...(cluster.related || []).flatMap((item) => item.tags || [])
  ]);

  return [...values].some((value) => String(value || "").toLowerCase() === target);
}

function countClusterArticles(clusters) {
  return clusters.reduce((total, cluster) => total + Number(cluster.size || 1), 0);
}

async function api(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Server returned an invalid response." };
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function translateStatusToken(label) {
  const key = STATUS_TOKEN_MAP[String(label || "").trim().toLowerCase()] || "ready";
  return currentDict().status[key] || label;
}

function setBusy(label) {
  elements.status.className = "status-pill busy";
  elements.status.querySelector("span:last-child").textContent = translateStatusToken(label);
}

function setReady(label) {
  elements.status.className = "status-pill";
  elements.status.querySelector("span:last-child").textContent = translateStatusToken(label);
}

function setError(label) {
  elements.status.className = "status-pill error";
  elements.status.querySelector("span:last-child").textContent = translateStatusToken(label);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const locale = state.locale === "ru" ? "ru-RU" : state.locale === "uk" ? "uk-UA" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function excerptText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}
