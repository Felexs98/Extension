(function () {
  "use strict";

  // Shared locale detector for all features. The originals historically had no
  // locale detection (they hardcoded English labels); this is the single source
  // of truth, also used by content/features/agent-info.js.

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  let uiLangPref = "auto";
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(["uiLang"], (cfg) => { if (cfg && cfg.uiLang) uiLangPref = cfg.uiLang; });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.uiLang) uiLangPref = changes.uiLang.newValue || "auto";
      });
    }
  } catch (e) {}

  function detect() {
    // Explicit user preference (extension settings) wins; "auto"/unset falls
    // back to reading Babylone's own language switcher below.
    if (uiLangPref === "ru") return "ru";
    if (uiLangPref === "en") return "en";
    const languageSelectorText = [...document.querySelectorAll("button[aria-haspopup='menu']")]
      .filter(isVisibleElement)
      .map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim())
      .find((text) => text === "English" || text === "Русский");

    if (languageSelectorText === "Русский") return "ru";
    if (languageSelectorText === "English") return "en";

    const lang = `${document.documentElement.lang || navigator.language || ""}`.toLowerCase();
    if (lang.startsWith("ru")) return "ru";
    if (lang.startsWith("en")) return "en";

    const pageText = document.body?.innerText || "";
    if (/\b(Quantity|Payment method|Paid, money|Review|Refund)\b/.test(pageText)) return "en";
    if (/(Количество|Способ оплаты|Оплачено|Отзыв|Возврат)/.test(pageText)) return "ru";
    return /[А-Яа-яЁё]/.test(pageText) ? "ru" : "en";
  }

  // pick("English text", "Русский текст") -> returns the one matching the current locale.
  function pick(en, ru) {
    return detect() === "ru" ? ru : en;
  }

  window.ExtLocale = { detect, pick };
})();
