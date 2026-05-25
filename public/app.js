const state = {
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

init();

async function init() {
  bindEvents();
  updateNotificationUi();
  await loadPresets();
  hydrateFromUrl();
  setMode(state.mode);
  await setupPushSupport();
  await Promise.all([loadWatchlist(), loadAlerts({ seedOnly: true }), loadHistory(), loadUserTags()]);
  await runSearch({ replaceHistory: true });
  configureAutoRefresh();
  configureAlertMonitor();
  refreshIcons();
}

function bindEvents() {
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

  fillSelect(elements.sourceSelect, state.sources);
  fillSelect(elements.worldCategorySelect, mapPresetLabels(state.worldCategories));
  fillSelect(elements.commoditySelect, mapPresetLabels(state.presets));
  fillSelect(elements.focusSelect, state.focuses);
  fillSelect(elements.languageSelect, state.languages);
  fillSelect(elements.sourceTypeSelect, state.sourceTypes);
  fillSelect(elements.sortModeSelect, state.sortModes);
  fillSelect(elements.matchModeSelect, state.matchModes);
}

function fillSelect(element, values) {
  element.innerHTML = Object.entries(values)
    .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
    .join("");
}

function mapPresetLabels(map) {
  return Object.fromEntries(Object.entries(map).map(([key, preset]) => [key, preset.label]));
}

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.mode = params.get("mode") || "world";
  elements.sourceSelect.value = params.get("source") || "auto";
  elements.timespanSelect.value = params.get("timespan") || "24h";
  elements.limitSelect.value = params.get("limit") || "30";
  elements.worldCategorySelect.value = params.get("category") || "all";
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
    elements.activeMode.textContent = "Новости за 24 часа";
    elements.activeLabel.textContent = selectedWorldCategoryLabel();
  } else if (mode === "ticker") {
    elements.activeMode.textContent = "Тикер компании";
    elements.activeLabel.textContent = "Новости эмитента";
  } else if (mode === "commodity") {
    elements.activeMode.textContent = "Сырье и металлы";
    elements.activeLabel.textContent = "Рыночные новости";
  } else {
    elements.activeMode.textContent = "Поисковый запрос";
    elements.activeLabel.textContent = elements.queryInput.value.trim() || "Глобальный поиск";
  }
}

async function runSearch(options = {}) {
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
    category: elements.worldCategorySelect.value || "all",
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

  elements.message.hidden = true;
  elements.totalCount.textContent = String(totalArticles || clusters.length);
  elements.sourceName.textContent = sourceLabel(request.source);
  elements.sortName.textContent = state.sortModes[request.filters?.sortMode || "relevance"] || "По релевантности";
  elements.matchName.textContent = state.matchModes[request.filters?.matchMode || "balanced"] || "Баланс";
  elements.activeLabel.textContent = request.label || elements.activeLabel.textContent;
  elements.lastUpdated.textContent = formatDateTime(data.generatedAt);
  elements.summaryMode.textContent = data.summary?.mode === "ai" ? "AI" : "Heuristic";

  renderBriefing(data.summary?.lines || []);
  renderTags(data.stats?.topTags || []);

  if (!clusters.length) {
    elements.resultsList.innerHTML = '<div class="empty-state">Новостей не найдено</div>';
    return;
  }

  elements.resultsList.innerHTML = clusters.map(renderCluster).join("");
}

function renderCluster(cluster) {
  const article = cluster.lead;
  const tags = (article.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const summary = excerptText(article.summary || article.title, cluster.size > 1 ? 190 : 170);
  const quality = article.sourceQuality || {};
  const related = cluster.related
    .map((item) => `<a class="related-link" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source)}</a>`)
    .join("");
  const clusterBadge = cluster.size > 1 ? `<span class="story-count">${cluster.size} источника</span>` : "";

  return `
    <article class="article-card${article.image ? "" : " no-image"}">
      <div class="article-content">
        <div class="article-meta">
          <span>${escapeHtml(article.domain || article.provider || "Источник")}</span>
          <span>${escapeHtml(article.language || article.provider || "")}</span>
          <span>${formatDateTime(article.publishedAt)}</span>
          ${clusterBadge}
        </div>
        <a class="article-title" href="${escapeAttribute(article.url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(article.title)}
        </a>
        <p class="article-summary">${escapeHtml(summary)}</p>
        <div class="article-tags">
          ${tags}
          <span>${escapeHtml(quality.tier || "specialist")}</span>
        </div>
        <div class="article-footer">
          <span>${escapeHtml(article.provider || "Source")}</span>
          <span>${escapeHtml(quality.type || "niche")}</span>
          <span>score ${escapeHtml(String(quality.quality || 0))}</span>
        </div>
        ${cluster.related.length ? `<div class="related-links">${related}</div>` : ""}
      </div>
      ${article.image ? `<img class="article-image" src="${escapeAttribute(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
    </article>
  `;
}

function renderBriefing(lines) {
  elements.briefingLines.innerHTML = lines.length
    ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
    : "<p>Краткая сводка появится после первого поиска.</p>";
}

function renderTags(tags) {
  const active = state.activeTagFilter;
  elements.tagCloud.innerHTML = tags.length
    ? tags.map((tag) => `
        <button class="tag actionable-tag${active === tag.label ? " active" : ""}" type="button" data-tag-filter="${escapeAttribute(tag.label)}">
          ${escapeHtml(tag.label)} ${tag.count}
        </button>
      `).join("")
    : '<span class="tag">без тегов</span>';

  elements.tagCloud.querySelectorAll("[data-tag-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.dataset.tagFilter || "";
      state.activeTagFilter = state.activeTagFilter === tag ? "" : tag;
      syncUrl();
      if (state.currentPayload) renderResults(state.currentPayload);
    });
  });
}

function renderLoading() {
  elements.message.hidden = true;
  elements.briefingLines.innerHTML = "<p>Собираю ленту и пересортировываю источники.</p>";
  elements.resultsList.innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton"></div>').join("");
}

function renderError(message) {
  elements.message.textContent = message;
  elements.message.hidden = false;
  elements.resultsList.innerHTML = '<div class="empty-state">Нет данных</div>';
  elements.totalCount.textContent = "0";
  elements.sourceName.textContent = "-";
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
  const interval = Number(prompt("Интервал алерта в минутах", "60") || "60");
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
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  try {
    await navigator.clipboard.writeText(url);
    setReady("ссылка");
  } catch {
    prompt("Скопируй ссылку", url);
  }
}

async function loadWatchlist() {
  try {
    const data = await api("/api/watchlist");
    renderCollection(elements.watchlist, data.items || [], {
      emptyLabel: "пусто",
      onOpen: runSavedRequest,
      onRemove: async (id) => {
        await api(`/api/watchlist/${id}`, { method: "DELETE" });
        await loadWatchlist();
      }
    });
  } catch {
    elements.watchlist.innerHTML = '<span class="tag">недоступно</span>';
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
      emptyLabel: "нет правил",
      onOpen: runSavedRequest,
      onRemove: async (id) => {
        await api(`/api/alerts/${id}`, { method: "DELETE" });
        await loadAlerts();
        configureAlertMonitor();
      },
      showMeta: (item) => item.lastMatchCount ? `${item.lastMatchCount} hit` : `${item.intervalMinutes}m`
    });
  } catch {
    elements.alertsList.innerHTML = '<span class="tag">недоступно</span>';
  } finally {
    refreshIcons();
  }
}

async function loadHistory() {
  try {
    const data = await api("/api/history");
    renderCollection(elements.historyList, data.items || [], {
      emptyLabel: "история пуста",
      onOpen: runSavedRequest,
      removable: false,
      showMeta: (item) => formatDateTime(item.createdAt)
    });
  } catch {
    elements.historyList.innerHTML = '<span class="tag">недоступно</span>';
  } finally {
    refreshIcons();
  }
}

async function loadUserTags() {
  try {
    const data = await api("/api/user-tags");
    state.userTags = data.items || [];
    renderCollection(elements.userTagCloud, state.userTags, {
      emptyLabel: "свои теги пусты",
      onOpen: runSavedRequest,
      onRemove: async (id) => {
        await api(`/api/user-tags/${id}`, { method: "DELETE" });
        await loadUserTags();
      },
      showMeta: (item) => requestBadge(item.request)
    });
  } catch {
    elements.userTagCloud.innerHTML = '<span class="tag">недоступно</span>';
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
        <button type="button" data-open-id="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</button>
        ${options.showMeta ? `<span class="mini-meta">${escapeHtml(options.showMeta(item))}</span>` : ""}
        ${options.removable === false ? "" : `<button type="button" data-remove-id="${escapeAttribute(item.id)}" aria-label="Удалить"><i data-lucide="x"></i></button>`}
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
  if (request.mode === "ticker") return request.ticker?.toUpperCase() || "Ticker";
  if (request.mode === "commodity") return state.presets[request.commodity]?.label || request.commodity;
  if (request.mode === "custom") return request.query || "Запрос";
  return selectedWorldCategoryLabel();
}

function requestBadge(request) {
  if (request?.mode === "ticker") return request.ticker?.toUpperCase() || "ticker";
  if (request?.mode === "commodity") return state.presets[request.commodity]?.label || request.commodity || "сырье";
  if (request?.mode === "custom") return "запрос";
  return state.worldCategories[request?.category || "all"]?.label || "лента";
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
    elements.notificationStatus.textContent = "Браузер не поддерживает уведомления";
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
    ? "Push-уведомления включены"
    : permission === "unsupported"
      ? "Уведомления не поддерживаются"
      : browserMode
        ? "Уведомления вкладки включены"
        : permission === "denied"
          ? "Уведомления заблокированы"
          : "Уведомления выключены";

  elements.enableNotificationsButton.classList.toggle("active", pushMode || browserMode);
  elements.enableNotificationsButton.setAttribute(
    "aria-label",
    pushMode || browserMode ? "Выключить уведомления" : "Включить уведомления"
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
  const body = alert.latestHeadline || `${alert.lastMatchCount} новых совпадений по алерту`;
  window.dispatchEvent(new CustomEvent("news-agent-alert", {
    detail: {
      id: alert.id,
      label: alert.label,
      body
    }
  }));
  const notification = new Notification(`Алерт: ${alert.label}`, {
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
  return state.worldCategories[value]?.label || "Политика + обычные";
}

function sourceLabel(source) {
  const map = {
    auto: "Google + сайты",
    google: "Google",
    feeds: "Сайты",
    yahoo: "Yahoo",
    investing: "Investing",
    benzinga: "Benzinga",
    cnbc: "CNBC",
    marketwatch: "MarketWatch",
    nytimes: "NYTimes",
    npr: "NPR",
    fox: "Fox",
    gdelt: "GDELT"
  };
  return map[source] || state.sources[source] || "-";
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
    data = { error: text || "Некорректный ответ сервера." };
  }

  if (!response.ok) {
    throw new Error(data.error || "Запрос не выполнен.");
  }

  return data;
}

function setBusy(label) {
  elements.status.className = "status-pill busy";
  elements.status.querySelector("span:last-child").textContent = label;
}

function setReady(label) {
  elements.status.className = "status-pill";
  elements.status.querySelector("span:last-child").textContent = label;
}

function setError(label) {
  elements.status.className = "status-pill error";
  elements.status.querySelector("span:last-child").textContent = label;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ru-RU", {
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
