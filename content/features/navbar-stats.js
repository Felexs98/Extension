(function () {
  "use strict";
  if (window.top !== window) return;

  const HOUR_MS = 3600_000;
  const TRACKING_HOST = "babylone.joom.it";
  const COUNTER_ATTR = "data-ext-navbar-ticket-count";
  const TOOLBAR_SEL = '[class*="Navbar__toolbar__"]';

  let deps = null;
  let bound = false;
  let refreshTimer = null;
  let healthTimer = null;
  let domObserver = null;
  const HEALTH_INTERVAL_MS = 20_000;
  let lastDisplayedToday = null;
  let lastDisplayedFraudToday = null;

  function normalizedHost() {
    return location.host.replace(/^iap-support\./, "");
  }

  function isBabyloneHost() {
    return normalizedHost() === TRACKING_HOST;
  }

  function isTrackingEnabled() {
    return deps?.isTrackingEnabled?.() !== false;
  }

  function getTodayRangeMs(useMsk) {
    if (!useMsk) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return { start, end: start + 24 * HOUR_MS };
    }
    const mskOffsetMs = 3 * HOUR_MS;
    const shiftedNow = new Date(Date.now() + mskOffsetMs);
    const mskStartUtc =
      Date.UTC(
        shiftedNow.getUTCFullYear(),
        shiftedNow.getUTCMonth(),
        shiftedNow.getUTCDate()
      ) - mskOffsetMs;
    return { start: mskStartUtc, end: mskStartUtc + 24 * HOUR_MS };
  }

  function aggregateBuckets(stats, keyPrefix) {
    const buckets = {};
    for (const k in stats) {
      if (!k.startsWith(keyPrefix)) continue;
      for (const hourISO in stats[k]) {
        buckets[hourISO] = (buckets[hourISO] || 0) + (stats[k][hourISO] || 0);
      }
    }
    return buckets;
  }

  function sumToday(buckets, useMsk) {
    const { start, end } = getTodayRangeMs(useMsk);
    let sum = 0;
    for (const h in buckets) {
      const t = Date.parse(h + ":00:00.000Z");
      if (t >= start && t < end) sum += buckets[h] || 0;
    }
    return sum;
  }

  function sumAllTime(buckets) {
    let sum = 0;
    for (const h in buckets) sum += buckets[h] || 0;
    return sum;
  }

  function calcSessionClicks(session, buckets) {
    if (!session?.startTs) return 0;
    const now = Date.now();
    const end = session.isPaused ? session.pauseTs : now;
    const alignedStart = session.alignedStart ?? Math.floor(session.startTs / HOUR_MS) * HOUR_MS;
    let clicks = 0;
    for (const h in buckets) {
      const t = Date.parse(h + ":00:00.000Z");
      if (t >= alignedStart && t <= end) clicks += buckets[h] || 0;
    }
    if (session.baselineHourISO && buckets[session.baselineHourISO] !== undefined) {
      clicks -= session.baselineHourCount || 0;
    }
    return Math.max(0, clicks);
  }

  function readCounts(cb) {
    const host = normalizedHost();
    const replySiteKey = `${host}::Reply`;
    const replyKeyPrefix = `${replySiteKey}::`;
    const fraudKeyPrefix = `${host}::Fraud::`;
    chrome.storage.sync.get(
      ["trackingEnabled", "fraudTrackingEnabled", "totalTodayByMsk"],
      syncCfg => {
        if (syncCfg.trackingEnabled === false) {
          cb(null);
          return;
        }
        chrome.storage.local.get(["stats", "sessions"], res => {
          const stats = res.stats || {};
          const sessions = res.sessions || {};
          const replyBuckets = aggregateBuckets(stats, replyKeyPrefix);
          const fraudBuckets = aggregateBuckets(stats, fraudKeyPrefix);
          const session = sessions[replySiteKey] || null;
          const useMsk = syncCfg.totalTodayByMsk === true;
          const fraudEnabled = syncCfg.fraudTrackingEnabled === true;
          cb({
            today: sumToday(replyBuckets, useMsk),
            session: calcSessionClicks(session, replyBuckets),
            allTime: sumAllTime(replyBuckets),
            fraudEnabled,
            fraudToday: fraudEnabled ? sumToday(fraudBuckets, useMsk) : 0,
            fraudSession: fraudEnabled ? calcSessionClicks(session, fraudBuckets) : 0,
            fraudAllTime: fraudEnabled ? sumAllTime(fraudBuckets) : 0
          });
        });
      }
    );
  }

  function findToolbar() {
    return document.querySelector(TOOLBAR_SEL);
  }

  function findSearchToolbarItem(toolbar) {
    const items = toolbar.querySelectorAll('[class*="Item__item__"]');
    for (const item of items) {
      const path = item.querySelector('svg path[d*="M12.5 11h-.79"]');
      if (path) return item;
    }
    return items[0] || null;
  }

  function counterInnerHtml() {
    return (
      '<span class="ext-navbar-health ext-navbar-health--ok" aria-hidden="true"></span>' +
      '<span class="ext-navbar-ticket-count__group">' +
      '<span class="ext-navbar-ticket-count__label"></span>' +
      '<span class="ext-navbar-ticket-count__value">—</span>' +
      "</span>" +
      '<span class="ext-navbar-ticket-count__sep" hidden>·</span>' +
      '<span class="ext-navbar-ticket-count__group ext-navbar-ticket-count__group--fraud" hidden>' +
      '<span class="ext-navbar-ticket-count__label-fraud">Fraud</span>' +
      '<span class="ext-navbar-ticket-count__value-fraud">0</span>' +
      "</span>"
    );
  }

  function counterNeedsUpgrade(node) {
    return (
      !node.querySelector(".ext-navbar-ticket-count__group--fraud") ||
      !node.querySelector(".ext-navbar-health")
    );
  }

  function mountCounterNode(toolbar) {
    let node = toolbar.querySelector(`[${COUNTER_ATTR}="1"]`);
    if (!node) {
      node = document.createElement("div");
      node.setAttribute(COUNTER_ATTR, "1");
      node.className = "ext-navbar-ticket-count";
      node.innerHTML = counterInnerHtml();
    } else if (counterNeedsUpgrade(node)) {
      node.innerHTML = counterInnerHtml();
    }
    const searchItem = findSearchToolbarItem(toolbar);
    if (searchItem) {
      toolbar.insertBefore(node, searchItem);
    } else {
      toolbar.appendChild(node);
    }
    return node;
  }

  function removeCounter() {
    document.querySelector(`[${COUNTER_ATTR}="1"]`)?.remove();
    lastDisplayedToday = null;
    lastDisplayedFraudToday = null;
  }

  function maybeAnimateIncrement(node, valueEl, prev, next) {
    if (prev !== null && next > prev) {
      playIncrementAnimation(node, valueEl, next - prev);
    }
  }

  function isExtensionContextValid() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function isTrackingModulePresent() {
    return typeof window.ExtTracking?.initReplyTracking === "function";
  }

  function pingBackground() {
    return new Promise(resolve => {
      if (!isExtensionContextValid()) {
        resolve({ ok: false, reason: "extension_context_invalid" });
        return;
      }
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(
        () => finish({ ok: false, reason: "background_timeout" }),
        2500
      );
      try {
        chrome.runtime.sendMessage({ type: "HEALTH_PING" }, resp => {
          if (chrome.runtime.lastError) {
            finish({ ok: false, reason: chrome.runtime.lastError.message });
            return;
          }
          finish(
            resp?.ok === true
              ? { ok: true, reason: "ok" }
              : { ok: false, reason: "bad_response" }
          );
        });
      } catch (e) {
        finish({ ok: false, reason: String(e) });
      }
    });
  }

  async function checkContentScriptHealth() {
    if (!isExtensionContextValid()) {
      return { ok: false, reason: "extension_context_invalid" };
    }
    if (!isTrackingModulePresent()) {
      return { ok: false, reason: "tracking_module_missing" };
    }
    return pingBackground();
  }

  function isRuLocale() {
    return document.documentElement.lang?.toLowerCase().startsWith("ru")
      || /[А-Яа-яЁё]/.test(document.body?.innerText?.slice(0, 500) || "");
  }

  function healthStatusText(health, ru) {
    if (health.ok) {
      return ru ? "Трекинг: работает" : "Tracking: active";
    }
    return ru
      ? "Трекинг: не работает — обновите вкладку (F5)"
      : "Tracking: inactive — reload tab (F5)";
  }

  function setHealthDot(node, health, ru) {
    const dot = node.querySelector(".ext-navbar-health");
    if (!dot) return;
    dot.classList.toggle("ext-navbar-health--ok", health.ok);
    dot.classList.toggle("ext-navbar-health--bad", !health.ok);
    dot.title = healthStatusText(health, ru)
      + (!health.ok && health.reason ? ` (${health.reason})` : "");
  }

  async function updateHealthIndicator(node, ru) {
    const target = node || document.querySelector(`[${COUNTER_ATTR}="1"]`);
    if (!target) return null;
    const health = await checkContentScriptHealth();
    setHealthDot(target, health, ru ?? isRuLocale());
    return health;
  }

  function playIncrementAnimation(node, valueEl, delta) {
    const group = valueEl.closest(".ext-navbar-ticket-count__group") || node;
    group.classList.remove("ext-navbar-ticket-count--bump");
    void group.offsetWidth;
    group.classList.add("ext-navbar-ticket-count--bump");
    valueEl.classList.remove("ext-navbar-ticket-count__value--up");
    void valueEl.offsetWidth;
    valueEl.classList.add("ext-navbar-ticket-count__value--up");

    const pop = document.createElement("span");
    pop.className = "ext-navbar-ticket-count__pop";
    pop.textContent = delta > 1 ? `+${delta}` : "+1";
    valueEl.appendChild(pop);
    pop.addEventListener("animationend", () => pop.remove(), { once: true });

    const cleanup = () => {
      group.classList.remove("ext-navbar-ticket-count--bump");
      valueEl.classList.remove("ext-navbar-ticket-count__value--up");
    };
    group.addEventListener("animationend", cleanup, { once: true });
    setTimeout(cleanup, 500);
  }

  function renderCounter() {
    if (!isBabyloneHost() || !isTrackingEnabled()) {
      removeCounter();
      return;
    }
    const toolbar = findToolbar();
    if (!toolbar) return;

    readCounts(async counts => {
      if (!counts) {
        removeCounter();
        return;
      }
      const toolbarNow = findToolbar();
      if (!toolbarNow) return;
      const node = mountCounterNode(toolbarNow);
      const labelEl = node.querySelector(".ext-navbar-ticket-count__label");
      const valueEl = node.querySelector(".ext-navbar-ticket-count__value");
      const sepEl = node.querySelector(".ext-navbar-ticket-count__sep");
      const fraudGroup = node.querySelector(".ext-navbar-ticket-count__group--fraud");
      const fraudValueEl = node.querySelector(".ext-navbar-ticket-count__value-fraud");
      if (!labelEl || !valueEl) return;

      const ru = isRuLocale();
      const fraudOn = counts.fraudEnabled === true;
      const health = await updateHealthIndicator(node, ru);

      labelEl.textContent = ru ? "Всего" : "Total";
      const next = counts.today;
      maybeAnimateIncrement(node, valueEl, lastDisplayedToday, next);
      valueEl.textContent = String(next);
      lastDisplayedToday = next;

      if (sepEl) {
        sepEl.hidden = !fraudOn;
        sepEl.style.display = fraudOn ? "" : "none";
      }
      if (fraudGroup) {
        fraudGroup.hidden = !fraudOn;
        fraudGroup.style.display = fraudOn ? "" : "none";
      }
      if (fraudOn && fraudValueEl) {
        const fraudNext = counts.fraudToday;
        maybeAnimateIncrement(node, fraudValueEl, lastDisplayedFraudToday, fraudNext);
        fraudValueEl.textContent = String(fraudNext);
        lastDisplayedFraudToday = fraudNext;
      } else {
        lastDisplayedFraudToday = null;
      }

      const titleLines = [
        healthStatusText(health, ru),
        ru
          ? `Сегодня: ${counts.today}`
          : `Today: ${counts.today}`,
        ru
          ? `Сессия: ${counts.session}`
          : `Session: ${counts.session}`,
        ru
          ? `За 14 дней: ${counts.allTime}`
          : `All time: ${counts.allTime}`
      ];
      if (fraudOn) {
        titleLines.push(
          ru
            ? `Fraud сегодня: ${counts.fraudToday}\nFraud сессия: ${counts.fraudSession}\nFraud за 14 дней: ${counts.fraudAllTime}`
            : `Fraud today: ${counts.fraudToday}\nFraud session: ${counts.fraudSession}\nFraud all time: ${counts.fraudAllTime}`
        );
      }
      node.title = titleLines.join("\n");
    });
  }

  function onStorageChanged(changes, area) {
    if (
      area === "local" &&
      (changes.stats || changes.sessions || changes.lastSelectorByHost)
    ) {
      renderCounter();
      return;
    }
    if (area === "sync" && (changes.trackingEnabled || changes.fraudTrackingEnabled || changes.totalTodayByMsk)) {
      renderCounter();
    }
  }

  function ensureDomWatch() {
    if (domObserver) return;
    domObserver = new MutationObserver(() => {
      if (!isBabyloneHost() || !isTrackingEnabled()) return;
      if (!document.querySelector(`[${COUNTER_ATTR}="1"]`) && findToolbar()) {
        renderCounter();
      }
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init(initDeps = {}) {
    deps = initDeps;
    if (!isBabyloneHost()) return;
    if (!bound) {
      bound = true;
      ensureDomWatch();
      if (!refreshTimer) {
        refreshTimer = setInterval(renderCounter, 60_000);
      }
      if (!healthTimer) {
        healthTimer = setInterval(() => {
          if (!isBabyloneHost() || !isTrackingEnabled()) return;
          updateHealthIndicator();
        }, HEALTH_INTERVAL_MS);
      }
      chrome.storage.onChanged.addListener(onStorageChanged);
    }
    renderCounter();
  }

  function refresh() {
    renderCounter();
  }

  window.ExtNavbarStats = { init, refresh };
})();
