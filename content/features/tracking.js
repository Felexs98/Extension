(function () {
  const normalizedHost = location.host.replace(/^iap-support\./, "");
  const TRACKING_HOST = "babylone.joom.it";
  const isTrackingHost = normalizedHost === TRACKING_HOST;
  const lastClickTsByTicket = {};
  let replyTrackingBound = false;
  let statusAutoBound = false;
  let lastAgentStatus = null;

  if (isTrackingHost) {
    chrome.storage.local.get(["lastSelectorByHost"], data => {
      const store = data.lastSelectorByHost || {};
      if (store[normalizedHost] !== "Reply") {
        store[normalizedHost] = "Reply";
        chrome.storage.local.set({ lastSelectorByHost: store });
      }
    });
  }

  const replyOnlyPatterns = ["ответить", "send reply"];
  const createTicketPatterns = ["создать тикет", "create ticket"];

  function isButtonCreateTicketMarkup(el) {
    const textEl = el.querySelector('[class*="Button__text__"]');
    if (!textEl) return false;
    const content = textEl.closest('[class*="Button__content__"]');
    return !!(content && el.contains(content));
  }

  function getTrackedButtonFromTarget(target) {
    if (!target) return null;
    return target.closest("button, [role='button']");
  }

  function isReplyLikeTrackedButton(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag !== "BUTTON" && el.getAttribute("role") !== "button") return false;
    const t = el.textContent.trim().toLowerCase();
    if (replyOnlyPatterns.some(p => t.includes(p))) return true;
    if (createTicketPatterns.some(p => t.includes(p))) {
      return isButtonCreateTicketMarkup(el);
    }
    return false;
  }

  function sendClick(id, isEnabled) {
    if (!isEnabled || !isTrackingHost) return;
    chrome.runtime.sendMessage({
      type: "CLICK_EVENT",
      host: normalizedHost,
      selector: "Reply",
      ticketId: id,
      ts: Date.now()
    });
  }

  function detectAgentStatus() {
    const btn = document.querySelector('button[data-testid="agent-status-button"]');
    if (!btn) return null;
    const txt = (btn.textContent || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase();
    if (
      txt.includes("на перерыве") ||
      txt.includes("недоступен") ||
      txt.includes("away") ||
      txt.includes("unavailable")
    ) return "pause";
    if (txt.includes("доступен") || txt.includes("available")) return "active";
    return null;
  }

  function sendAgentStatus(status) {
    if (!isTrackingHost) return;
    chrome.runtime.sendMessage({
      type: "AGENT_STATUS",
      host: normalizedHost,
      status
    });
  }

  function initReplyTracking(deps = {}) {
    const { getTicketId, isTrackingEnabled } = deps;
    if (!isTrackingHost || typeof getTicketId !== "function") return;
    if (replyTrackingBound) return;
    replyTrackingBound = true;
    document.addEventListener("click", e => {
      const trackingEnabled = typeof isTrackingEnabled === "function" ? isTrackingEnabled() : true;
      if (!trackingEnabled || !e.isTrusted) return;
      const btn = getTrackedButtonFromTarget(e.target);
      if (!btn || !isReplyLikeTrackedButton(btn)) return;
      const id = getTicketId();
      const now = Date.now();
      if (now - (lastClickTsByTicket[id] || 0) < 3 * 60 * 1000) return;
      lastClickTsByTicket[id] = now;
      sendClick(`${id}_${now}`, trackingEnabled);
    });
  }

  function initAgentStatusAuto() {
    if (!isTrackingHost) return;
    if (statusAutoBound) return;
    statusAutoBound = true;
    chrome.storage.sync.get(["trackingEnabled", "statusMode", "statusModeAuto"], syncCfg => {
      chrome.storage.local.get(["statusModeLocal"], localCfg => {
        if (syncCfg.trackingEnabled === false) return;
        let derivedMode;
        if (syncCfg.statusModeAuto === true) {
          derivedMode = "auto";
        } else if (syncCfg.statusModeAuto === false) {
          derivedMode = "manual";
        } else {
          derivedMode = syncCfg.statusMode ?? localCfg.statusModeLocal ?? "manual";
        }
        if (derivedMode !== "auto") return;

        const check = () => {
          const status = detectAgentStatus();
          if (status && status !== lastAgentStatus) {
            lastAgentStatus = status;
            sendAgentStatus(status);
          } else if (status === null && lastAgentStatus !== null) {
            lastAgentStatus = null;
          }
        };

        check();
        let observer = new MutationObserver(() => {
          check();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        const statusChangeListener = (changes, area) => {
          if (area === "sync" && (changes.statusMode || changes.statusModeAuto)) {
            lastAgentStatus = null;
            chrome.storage.sync.get(["trackingEnabled", "statusMode", "statusModeAuto"], cfg => {
              if (cfg.trackingEnabled === false) {
                if (observer) observer.disconnect();
                chrome.storage.onChanged.removeListener(statusChangeListener);
                return;
              }
              let nextMode;
              if (cfg.statusModeAuto === true) nextMode = "auto";
              else if (cfg.statusModeAuto === false) nextMode = "manual";
              else nextMode = cfg.statusMode ?? "manual";
              if (nextMode !== "auto") {
                if (observer) observer.disconnect();
                chrome.storage.onChanged.removeListener(statusChangeListener);
                return;
              }
              if (!observer) {
                observer = new MutationObserver(() => check());
                observer.observe(document.body, { childList: true, subtree: true, characterData: true });
              }
              check();
            });
          }
          if (area === "local" && changes.statusModeLocal) {
            lastAgentStatus = null;
            check();
          }
        };

        chrome.storage.onChanged.addListener(statusChangeListener);
      });
    });
  }

  window.ExtTracking = {
    initReplyTracking,
    initAgentStatusAuto
  };
})();
