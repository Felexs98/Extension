// Page-level i18n for the extension's own pages (popup.html, settings.html).
// Separate from content/utils/locale.js, which localizes injected Babylone UI.
// Driven by the shared `uiLang` setting in chrome.storage.sync (auto | en | ru).
(function () {
  "use strict";

  const DICT = {
    // --- settings page ---
    "settings.title": { en: "Settings", ru: "Настройки" },
    "settings.hint": { en: "Quick toggles and language hiding in one place.", ru: "Быстрые переключатели и скрытие языков в одном месте." },
    "language": { en: "Language", ru: "Язык" },
    "langAuto": { en: "Auto", ru: "Авто" },
    "clickTracking": { en: "Click tracking", ru: "Отслеживание кликов" },
    "fraudTracking": { en: "Fraud (suspicious)", ru: "Fraud (suspicious)" },
    "autoPause": { en: "Auto pause by agent status", ru: "Автопауза по статусу агента" },
    "totalTodayMsk": { en: "Total Today reset by MSK", ru: "Сброс «Всего за сегодня» по МСК" },
    "clearTodayStats": { en: "Reset today's count", ru: "Сбросить счётчик за сегодня" },
    "clearTodayDone": { en: "Done", ru: "Готово" },
    "openSessionChart": { en: "Session chart (test)", ru: "График сессии (тест)" },
    "chartTitle": { en: "Session timeline (test)", ru: "График сессии (тест)" },
    "chartHint": {
      en: "Replies and idle gaps since the current tracker session started.",
      ru: "Ответы и паузы между ними с момента старта текущей сессии трекера."
    },
    "chartNoSession": {
      en: "No active session — open popup on Babylone first.",
      ru: "Нет сессии — сначала откройте popup на Babylone."
    },
    "chartNoReplies": { en: "No replies in this session yet.", ru: "В этой сессии пока нет ответов." },
    "chartSessionFrom": { en: "From", ru: "С" },
    "chartPausedAt": { en: "Paused", ru: "Пауза" },
    "chartNow": { en: "Now", ru: "Сейчас" },
    "chartGapList": { en: "Gaps between replies", ru: "Паузы между ответами" },
    "chartReplyAt": { en: "Reply time", ru: "Время ответа" },
    "chartTicket": { en: "Ticket", ru: "Тикет" },
    "chartGapBefore": { en: "Gap before", ru: "Пауза до ответа" },
    "chartAfterLast": { en: "After last reply", ru: "После последнего ответа" },
    "chartWorkTime": { en: "Work time", ru: "Время работы" },
    "chartReplies": { en: "Replies", ru: "Ответов" },
    "chartAvgGap": { en: "Avg gap", ru: "Средняя пауза" },
    "chartStatus": { en: "Status", ru: "Статус" },
    "chartPaused": { en: "Paused", ru: "На паузе" },
    "chartActive": { en: "Active", ru: "Активна" },
    "chartLegendSession": { en: "Work session", ru: "Сессия" },
    "chartLegendReply": { en: "Reply", ru: "Ответ" },
    "chartLegendGap": { en: "Gap between replies", ru: "Пауза между ответами" },
    "chartLegendPause": { en: "Pause", ru: "Пауза трекера" },
    "chartZoom": { en: "Scale (auto)", ru: "Масштаб (авто)" },
    "chartScrollHint": {
      en: "Drag the timeline to pan — scale adjusts automatically",
      ru: "Перетаскивайте график мышью — масштаб подстраивается сам"
    },
    "chartSec": { en: "s", ru: "с" },
    "chartMin": { en: "min", ru: "мин" },
    "local": { en: "Local", ru: "Локально" },
    "msk": { en: "MSK", ru: "МСК" },
    "showContacts": { en: "Show merchant contacts", ru: "Показывать контакты продавца" },
    "hideSystem": { en: "Hide system messages", ru: "Скрывать системные сообщения" },
    "attachment": { en: "Attachment", ru: "Вложения" },
    "platform": { en: "Platform", ru: "Платформа" },
    "jlWeights": { en: "JL weights / order #", ru: "Вес JL / номер заказа" },
    "doubleOrigin": { en: "DoubleOrigin", ru: "Двойной ореджин" },
    "charityRest": { en: "Charity [REST]", ru: "Charity [REST]" },
    "productSizes": { en: "Product sizes", ru: "Размеры товара" },
    "doubleOriginOverrides": { en: "DoubleOrigin merchant overrides", ru: "Переопределения продавцов «Двойной ореджин»" },
    "indiaMerchants": { en: "India Merchants", ru: "Продавцы из Индии" },
    "turkeyMerchants": { en: "Turkey Merchants", ru: "Продавцы из Турции" },
    "hideTranslate": { en: "Hide translate languages", ru: "Скрывать языки перевода" },
    "show": { en: "Show", ru: "Показать" },
    "hide": { en: "Hide", ru: "Скрыть" },
    "searchLanguages": { en: "Search languages...", ru: "Поиск языков..." },

    // --- popup (Support Toolkit) ---
    "trackingDisabled": { en: "Tracking disabled", ru: "Трекинг отключён" },
    "trackingDisabledHint": { en: "Enable tracking in settings to display metrics", ru: "Включите трекинг в настройках, чтобы видеть метрики" },
    "openSettings": { en: "Open Settings", ru: "Открыть настройки" },
    "repliesPerHour": { en: "Replies per Hour", ru: "Ответов в час" },
    "totalToday": { en: "Total Today", ru: "Всего за сегодня" },
    "fraudToday": { en: "Fraud Today", ru: "Fraud сегодня" },
    "sinceStart": { en: "Since Start", ru: "С начала сессии" },
    "duration": { en: "Duration", ru: "Длительность" },
    "pause": { en: "Pause", ru: "Пауза" },
    "resume": { en: "Resume", ru: "Продолжить" },
    "clear": { en: "Clear", ru: "Очистить" },
    "runningSince": { en: "Running since ", ru: "Идёт с " },
    "pausedAt": { en: "Paused: ", ru: "Пауза: " },
    "metricIdle": { en: "Metric is idle — auto start in progress...", ru: "Метрика простаивает — идёт автозапуск..." },
    "openBabylone": { en: "Open babylone.joom.it tab to use tracking metrics.", ru: "Откройте вкладку babylone.joom.it для метрик трекинга." },
    "durH": { en: "h", ru: "ч" },
    "durM": { en: "m", ru: "м" }
  };

  let current = "en";

  // On extension pages there is no Babylone switcher to read, so "auto" falls
  // back to the browser UI language.
  function resolveLang(uiLang) {
    if (uiLang === "ru") return "ru";
    if (uiLang === "en") return "en";
    return (navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
  }

  function t(key) {
    const entry = DICT[key];
    if (!entry) return key;
    return entry[current] || entry.en || key;
  }

  function applyDom(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-ph]").forEach(el => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
  }

  // init(onApply): resolve language from storage, localize static DOM, run the
  // page's dynamic re-localization (onApply), and repeat whenever uiLang changes.
  function init(onApply) {
    const applyAll = () => { applyDom(); if (typeof onApply === "function") onApply(); };
    try {
      chrome.storage.sync.get(["uiLang"], cfg => {
        current = resolveLang((cfg && cfg.uiLang) || "auto");
        applyAll();
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.uiLang) {
          current = resolveLang(changes.uiLang.newValue || "auto");
          applyAll();
        }
      });
    } catch {
      current = resolveLang("auto");
      applyAll();
    }
  }

  window.PageI18n = { t, apply: applyDom, init, resolveLang, get lang() { return current; } };
})();
