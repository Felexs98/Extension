// кулдаун и маршрутизация
const HOUR_MS = 3600_000;
const COOLDOWN_MS = 180_000;
const DOUBLE_GUARD_MS = 800;
const MAX_AGE_DAYS = 30;

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#4b5563" });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg?.type === "DOWNLOAD_URLS") {
    const urls = Array.isArray(msg.urls) ? msg.urls.filter(Boolean) : [];
    if (!urls.length) {
      sendResponse({ ok: false, error: "No URLs provided" });
      return true;
    }

    (async () => {
      let started = 0;
      let failed = 0;
      const errors = [];
      for (const url of urls) {
        const one = await new Promise(resolve => {
          try {
            chrome.downloads.download(
              {
                url,
                saveAs: false,
                conflictAction: "uniquify"
              },
              id => {
                if (chrome.runtime.lastError || !id) {
                  resolve({ ok: false, error: chrome.runtime.lastError?.message || "download failed" });
                } else {
                  resolve({ ok: true, id });
                }
              }
            );
          } catch (e) {
            resolve({ ok: false, error: String(e) });
          }
        });
        if (one.ok) started += 1;
        else {
          failed += 1;
          errors.push(one.error);
        }
      }
      sendResponse({ ok: started > 0, started, failed, errors });
    })();
    return true;
  }

  if (msg?.type === "SHEET_POST") {
    const payload = msg.payload || {};
    (async () => {
      try {
        const res = await fetch(msg.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        const looksLikeHtml =
          contentType.includes("text/html") ||
          /^\s*<!doctype html/i.test(text) ||
          /^\s*<html[\s>]/i.test(text);
        const isJsonResponse = Boolean(json) || contentType.includes("application/json");
        const ok = Boolean(res.ok && isJsonResponse && (!json || json.ok !== false));

        let error = "";
        if (!res.ok) {
          error = `HTTP ${res.status}`;
        } else if (!isJsonResponse || looksLikeHtml) {
          error = "Expected JSON from Apps Script, got HTML. Check Web App /exec URL and redeploy.";
        } else if (json && json.ok === false) {
          error = json.error || "Apps Script returned ok=false";
        }

        sendResponse({ ok, status: res.status, text, json, contentType, error });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // Маршрутизатор для FETCH_ORDER_INFO
  if (msg?.type === "FETCH_ORDER_INFO") {
    chrome.tabs.sendMessage(sender.tab.id, msg, sendResponse);
    return true;
  }

  // Учёт кликов
  if (msg?.type === "CLICK_EVENT") {
    const { host, selector, ts, ticketId } = msg;
    const key = `${host}::${selector}::${ticketId}`;

    chrome.storage.local.get(["stats", "lastClickByTicket"], (res) => {
      const stats = res.stats || {};
      const lastMap = res.lastClickByTicket || {};
      const last = lastMap[key] || 0;

      const guardWindow = Math.max(DOUBLE_GUARD_MS, COOLDOWN_MS);
      if (ts - last < guardWindow) {
        sendResponse({ ok: false, skipped: "cooldown" });
        return;
      }

      lastMap[key] = ts;
      const bucketStart = Math.floor(ts / HOUR_MS) * HOUR_MS;
      const bucketISO = new Date(bucketStart).toISOString().slice(0, 13);

      if (!stats[key]) stats[key] = {};
      stats[key][bucketISO] = (stats[key][bucketISO] || 0) + 1;

      const minTs = Date.now() - MAX_AGE_DAYS * 86400_000;
      for (const k in stats) {
        for (const hourISO in stats[k]) {
          const t = Date.parse(hourISO + ":00:00.000Z");
          if (t < minTs) delete stats[k][hourISO];
        }
        if (Object.keys(stats[k]).length === 0) delete stats[k];
      }

      chrome.storage.local.set({ stats, lastClickByTicket: lastMap }, () => {
        if (sender?.tab?.id != null) {
          const count = stats[key][bucketISO] || 0;
          chrome.action.setBadgeText({ tabId: sender.tab.id, text: String(count) });
        }
        sendResponse({ ok: true, counted: true });
      });
    });

    return true;
  }

  // Авто-пауза по статусу агента
  if (msg?.type === "AGENT_STATUS") {
    const { host, status } = msg || {};
    if (!host || !status) return;

    chrome.storage.local.get(["stats", "sessions", "lastSelectorByHost"], res => {
      const stats = res.stats || {};
      const sessions = res.sessions || {};
      const selector = (res.lastSelectorByHost || {})[host] || "Reply";
      const siteKey = `${host}::${selector}`;
      const keyPrefix = `${siteKey}::`;

      const aggregateBuckets = () => {
        const buckets = {};
        for (const k in stats) {
          if (!k.startsWith(keyPrefix)) continue;
          for (const hourISO in stats[k]) {
            buckets[hourISO] = (buckets[hourISO] || 0) + (stats[k][hourISO] || 0);
          }
        }
        return buckets;
      };

      const buckets = aggregateBuckets();
      const now = Date.now();
      const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
      const currentHourISO = new Date(hourStart).toISOString().slice(0, 13);
      const s = sessions[siteKey] || null;

      if (status === "active") {
        if (!s?.startTs) {
          sessions[siteKey] = {
            startTs: now,
            isPaused: false,
            pausedTotal: 0,
            alignedStart: hourStart,
            baselineHourISO: currentHourISO,
            baselineHourCount: buckets[currentHourISO] || 0
          };
        } else if (s.isPaused) {
          if (s.pauseTs) s.pausedTotal = (s.pausedTotal || 0) + (now - s.pauseTs);
          s.isPaused = false;
          delete s.pauseTs;
          delete s.cachedClicks;
          delete s.cachedDur;
          delete s.cachedRph;
          sessions[siteKey] = s;
        }
      } else if (status === "pause") {
        if (s?.startTs && !s.isPaused) {
          s.isPaused = true;
          s.pauseTs = now;
          sessions[siteKey] = s;
        }
      }

      chrome.storage.local.set({ sessions }, () => sendResponse({ ok: true }));
    });

    return true;
  }
});
