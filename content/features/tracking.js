(function () {
  const normalizedHost = location.host.replace(/^iap-support\./, "");
  const TRACKING_HOST = "babylone.joom.it";
  const isTrackingHost = normalizedHost === TRACKING_HOST;
  const lastClickTsByTicket = {};
  const lastFraudClickTsByTicket = {};
  const CLICK_COOLDOWN_MS = 3 * 60 * 1000;
  const FRAUD_SELECTOR = "Fraud";
  const SUSPICIOUS_TAG_TEXT = /^suspicious$/i;
  const SUSPICIOUS_TAG_SCAN_SEL = "div, span, li, label, a";
  const LOG_PREFIX = "[ExtTracking]";
  const DEBUG_LOG_KEY = "extTrackingDebugLog";
  const DEBUG_LOG_MAX = 80;
  const EXT_VERSION = (() => {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "unknown";
    }
  })();
  const TRACKING_LABEL_HINT =
    /approve|одобр|decline|отклон|refund|возврат|partial|частичн|request details|детали|ответить|send reply|create ticket|создать тикет/i;
  const REPLY_LABEL_HINT = /ответить|send reply/i;
  let replyTrackingBound = false;
  let statusAutoBound = false;
  let lastAgentStatus = null;
  let debugLogPersistTimer = null;
  const debugLogBuffer = [];

  function baseMeta(extra) {
    return {
      v: EXT_VERSION,
      host: normalizedHost,
      url: location.href,
      ts: Date.now(),
      ...extra
    };
  }

  function persistDebugLogSoon() {
    if (debugLogPersistTimer) return;
    debugLogPersistTimer = setTimeout(() => {
      debugLogPersistTimer = null;
      const slice = debugLogBuffer.slice(-DEBUG_LOG_MAX);
      try {
        chrome.storage.local.set({ [DEBUG_LOG_KEY]: slice });
      } catch {}
    }, 250);
  }

  function log(event, detail) {
    const entry = {
      event,
      ...(detail !== undefined ? { detail } : {})
    };
    debugLogBuffer.push(entry);
    if (debugLogBuffer.length > DEBUG_LOG_MAX * 2) {
      debugLogBuffer.splice(0, debugLogBuffer.length - DEBUG_LOG_MAX);
    }
    persistDebugLogSoon();
    if (detail !== undefined) {
      console.log(LOG_PREFIX, event, detail);
    } else {
      console.log(LOG_PREFIX, event);
    }
  }

  function isReplyLabelText(text) {
    const t = String(text || "").toLowerCase();
    return REPLY_LABEL_HINT.test(t);
  }

  function findReplyHintElement(target) {
    if (!target) return null;
    const candidates = [];
    let node = target;
    for (let i = 0; i < 8 && node; i++) {
      if (node.matches?.("button, [role='button'], [class*='Button']")) {
        candidates.push(node);
      }
      node = node.parentElement;
    }
    return candidates.find(el => isReplyLabelText(el.textContent)) || null;
  }

  function ticketIdMeta(id) {
    return {
      ticketId: id,
      ticketIdAuto: String(id || "").startsWith("auto_")
    };
  }

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
  // Refund claim — two-step UI. Step 1 (ticket panel): entry/shared labels — do not count.
  // Step 2 (confirm modal): confirm/shared labels — count. Exact normalized match only.
  const claimEntryOnlyLabels = new Set([
    "request details", "детали запроса",
    "decline refund claim", "отклонить заявку на возврат"
  ]);
  const claimSharedLabels = new Set([
    "approve", "одобрить",
    "offer partial refund", "предложить частичный возврат"
  ]);
  const claimConfirmOnlyLabels = new Set([
    "send", "отправить",
    "decline", "отклонить"
  ]);
  const REFUND_CONFIRM_ARM_MS = 3 * 60 * 1000;
  const refundConfirmArmedByTicket = {};

  function normalizeButtonLabel(text) {
    return (text || "").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  }

  function classifyClaimLabel(normalized) {
    if (claimEntryOnlyLabels.has(normalized)) return "entry";
    if (claimConfirmOnlyLabels.has(normalized)) return "confirm";
    if (claimSharedLabels.has(normalized)) return "shared";
    return null;
  }

  function isInRefundConfirmContext(el) {
    let node = el;
    for (let i = 0; i < 30 && node; i++) {
      if (node.nodeType !== 1) {
        node = node.parentElement;
        continue;
      }
      const role = node.getAttribute?.("role");
      if (role === "dialog" || node.getAttribute?.("aria-modal") === "true") {
        return true;
      }
      const cls = typeof node.className === "string" ? node.className : "";
      if (/Modal|Dialog|Drawer|Popup|Overlay|modal|dialog|popover/i.test(cls)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function armRefundConfirm(ticketId) {
    if (!ticketId) return;
    refundConfirmArmedByTicket[ticketId] = Date.now() + REFUND_CONFIRM_ARM_MS;
  }

  function isRefundConfirmArmed(ticketId) {
    if (!ticketId) return false;
    const expiresAt = refundConfirmArmedByTicket[ticketId];
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      delete refundConfirmArmedByTicket[ticketId];
      return false;
    }
    return true;
  }

  function clearRefundConfirmArm(ticketId) {
    if (ticketId) delete refundConfirmArmedByTicket[ticketId];
  }

  function resolveClaimClick(btn, normalized, ticketId) {
    const claimStep = classifyClaimLabel(normalized);
    if (!claimStep) {
      return { count: false, reason: "not_claim" };
    }
    const inModal = isInRefundConfirmContext(btn);
    const armed = isRefundConfirmArmed(ticketId);

    if (claimStep === "entry") {
      armRefundConfirm(ticketId);
      return { count: false, reason: "claim_entry", claimStep, inModal, armed };
    }

    if (claimStep === "confirm" || claimStep === "shared") {
      if (inModal || armed) {
        clearRefundConfirmArm(ticketId);
        const via = inModal ? "modal" : "armed";
        return {
          count: true,
          reason: claimStep === "confirm" ? `claim_confirm_${via}` : `claim_shared_${via}`,
          claimStep,
          inModal,
          armed
        };
      }
      if (claimStep === "shared") {
        armRefundConfirm(ticketId);
        return { count: false, reason: "claim_entry_shared", claimStep, inModal, armed };
      }
      return { count: false, reason: "claim_confirm_no_context", claimStep, inModal, armed };
    }

    return { count: false, reason: "claim_unknown", claimStep, inModal, armed };
  }

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

  function classifyTrackedButton(el) {
    if (!el) return { kind: null, reason: "no_element" };
    const tag = el.tagName;
    if (tag !== "BUTTON" && el.getAttribute("role") !== "button") {
      return { kind: null, reason: "not_button", tag };
    }
    const raw = el.textContent.trim();
    const t = raw.toLowerCase();
    const normalized = normalizeButtonLabel(raw);
    const claimStep = classifyClaimLabel(normalized);
    if (replyOnlyPatterns.some(p => t.includes(p))) {
      return { kind: "reply", raw, normalized };
    }
    if (createTicketPatterns.some(p => t.includes(p))) {
      if (isButtonCreateTicketMarkup(el)) {
        return { kind: "createTicket", raw, normalized };
      }
      return { kind: null, reason: "create_ticket_markup", raw, normalized };
    }
    if (claimStep) {
      return { kind: "claim", raw, normalized, claimStep };
    }
    return { kind: null, reason: "no_pattern", raw, normalized };
  }

  function isReplyLikeTrackedButton(el) {
    return classifyTrackedButton(el).kind != null;
  }

  function textHasSuspiciousTag(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    if (SUSPICIOUS_TAG_TEXT.test(trimmed)) return true;
    return trimmed.split(",").some(part => SUSPICIOUS_TAG_TEXT.test(part.trim()));
  }

  function isSuspiciousTagElement(el) {
    if (!el?.textContent) return false;
    return textHasSuspiciousTag(el.textContent);
  }

  function parseTicketIdFromHref(href) {
    return window.ExtIdParsers?.ticketIdFromHref?.(href) || null;
  }

  function getTicketIdFromCard(card) {
    const link = card?.querySelector?.('a[href*="/tickets/"]');
    if (!link) return null;
    return parseTicketIdFromHref(link.href || link.getAttribute("href"));
  }

  function subtreeTicketIds(node) {
    const ids = new Set();
    if (!node?.querySelectorAll) return ids;
    for (const link of node.querySelectorAll('a[href*="/tickets/"]')) {
      const id = parseTicketIdFromHref(link.href || link.getAttribute("href"));
      if (id) ids.add(id);
    }
    return ids;
  }

  function isSubtreeScopedToTicket(node, ticketId) {
    const ids = subtreeTicketIds(node);
    if (ids.size === 0) return true;
    return ids.size === 1 && ids.has(ticketId);
  }

  function findTicketTabPanel(ticketId) {
    if (!ticketId) return null;
    return document.querySelector(
      `#tab-panel-${ticketId},[data-test-item="tab-panel-${ticketId}"]`
    );
  }

  function findTicketScopeRoot(contextEl, ticketId) {
    if (!contextEl) return null;
    if (!ticketId || String(ticketId).startsWith("auto_")) return contextEl;

    const tabPanel = findTicketTabPanel(ticketId);
    if (tabPanel?.contains(contextEl)) return tabPanel;

    let best = contextEl;
    let node = contextEl;
    for (let i = 0; i < 40 && node; i++) {
      if (node.matches?.('[data-testid="customer-ticket-card"]')) {
        const cardId = getTicketIdFromCard(node);
        if (cardId && cardId !== ticketId) {
          node = node.parentElement;
          continue;
        }
      }
      if (isSubtreeScopedToTicket(node, ticketId)) {
        best = node;
      } else {
        break;
      }
      node = node.parentElement;
    }
    return best;
  }

  function isSuspiciousTicketContext(contextEl, ticketId) {
    const scope = findTicketScopeRoot(contextEl, ticketId);
    if (!scope) return false;
    const tags = scope.querySelectorAll?.(SUSPICIOUS_TAG_SCAN_SEL);
    if (!tags) return false;
    for (const tag of tags) {
      if (isSuspiciousTagElement(tag)) return true;
    }
    return false;
  }

  function tryRecordClick({
    id,
    now,
    meta,
    cooldownMap,
    selector,
    enabled,
    logKind
  }) {
    if (!enabled) return false;
    const lastTs = cooldownMap[id] || 0;
    const elapsedMs = now - lastTs;
    const eventMeta = { ...meta, selector, tracker: logKind };
    if (elapsedMs < CLICK_COOLDOWN_MS) {
      log("skip:cooldown", {
        ...eventMeta,
        elapsedMs,
        cooldownMs: CLICK_COOLDOWN_MS,
        remainingMs: CLICK_COOLDOWN_MS - elapsedMs
      });
      return false;
    }
    cooldownMap[id] = now;
    log("counted", eventMeta);
    sendClick(`${id}_${now}`, true, eventMeta, selector);
    return true;
  }

  function sendClick(id, isEnabled, meta, selector = "Reply") {
    if (!isEnabled) {
      log("skip:tracking_disabled", meta);
      return;
    }
    if (!isTrackingHost) {
      log("skip:wrong_host", { host: normalizedHost, ...meta });
      return;
    }
    const ts = Date.now();
    const payload = {
      type: "CLICK_EVENT",
      host: normalizedHost,
      selector,
      ticketId: id,
      ts
    };
    log("send", { ...meta, ticketId: id, ts, selector });
    chrome.runtime.sendMessage(payload, response => {
      if (chrome.runtime.lastError) {
        log("send:error", {
          ...meta,
          ticketId: id,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      log("send:response", { ...meta, ticketId: id, response });
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
    const { getTicketId, getTicketIdFromContext, isTrackingEnabled, isFraudTrackingEnabled } = deps;
    if (!isTrackingHost) {
      log("init:skip", baseMeta({ reason: "wrong_host" }));
      return;
    }
    if (typeof getTicketId !== "function") {
      log("init:skip", baseMeta({ reason: "no_getTicketId" }));
      return;
    }
    if (replyTrackingBound) return;
    replyTrackingBound = true;
    log("init:bound", baseMeta({ cooldownMs: CLICK_COOLDOWN_MS }));
    document.addEventListener("click", e => {
      const trackingEnabled = typeof isTrackingEnabled === "function" ? isTrackingEnabled() : true;
      const fraudTrackingEnabled =
        typeof isFraudTrackingEnabled === "function" ? isFraudTrackingEnabled() : false;
      const replyHintEl = findReplyHintElement(e.target);

      if (!trackingEnabled && !fraudTrackingEnabled) {
        if (replyHintEl) {
          log("skip:tracking_disabled", baseMeta({
            label: replyHintEl.textContent.trim(),
            isTrusted: e.isTrusted
          }));
        }
        return;
      }

      if (!e.isTrusted) {
        if (replyHintEl) {
          log("skip:untrusted", baseMeta({
            label: replyHintEl.textContent.trim(),
            targetTag: e.target?.tagName
          }));
        }
        return;
      }

      const btn = getTrackedButtonFromTarget(e.target);
      if (!btn) {
        if (replyHintEl) {
          log("skip:not_button", baseMeta({
            label: replyHintEl.textContent.trim(),
            hintTag: replyHintEl.tagName,
            hintRole: replyHintEl.getAttribute("role"),
            targetTag: e.target?.tagName
          }));
        }
        return;
      }

      const match = classifyTrackedButton(btn);
      if (!match.kind) {
        if (
          match.reason === "create_ticket_markup" ||
          (match.reason === "no_pattern" && TRACKING_LABEL_HINT.test(match.normalized || "")) ||
          (match.reason === "not_button" && isReplyLabelText(match.raw))
        ) {
          log("skip:no_match", baseMeta(match));
        }
        return;
      }

      const contextId =
        typeof getTicketIdFromContext === "function"
          ? getTicketIdFromContext(btn)
          : null;
      const id = contextId || getTicketId(btn);
      const now = Date.now();
      const meta = baseMeta({
        kind: match.kind,
        label: match.raw,
        normalized: match.normalized,
        ...ticketIdMeta(id),
        ticketIdSource: contextId ? "context" : "global",
        suspicious: isSuspiciousTicketContext(btn, id)
      });

      if (match.kind === "claim") {
        const claim = resolveClaimClick(btn, match.normalized, id);
        meta.claimStep = claim.claimStep;
        meta.inConfirmModal = claim.inModal;
        meta.refundConfirmArmed = claim.armed;
        if (!claim.count) {
          log(`skip:${claim.reason}`, meta);
          return;
        }
        meta.claimVia = claim.reason;
      }

      if (trackingEnabled) {
        tryRecordClick({
          id,
          now,
          meta,
          cooldownMap: lastClickTsByTicket,
          selector: "Reply",
          enabled: true,
          logKind: "reply"
        });
      }

      if (match.kind === "reply" && fraudTrackingEnabled && meta.suspicious) {
        tryRecordClick({
          id,
          now,
          meta,
          cooldownMap: lastFraudClickTsByTicket,
          selector: FRAUD_SELECTOR,
          enabled: true,
          logKind: "fraud"
        });
      }
    });
  }

  function getDebugLog() {
    return debugLogBuffer.slice();
  }

  async function copyDebugLog() {
    const lines = debugLogBuffer.map(entry => JSON.stringify(entry)).join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      log("debug:copied", baseMeta({ lines: debugLogBuffer.length }));
      return { ok: true, lines: debugLogBuffer.length };
    } catch (err) {
      log("debug:copy_failed", baseMeta({ error: String(err) }));
      return { ok: false, error: String(err), lines: debugLogBuffer };
    }
  }

  function clearDebugLog() {
    debugLogBuffer.length = 0;
    chrome.storage.local.remove(DEBUG_LOG_KEY);
    log("debug:cleared", baseMeta());
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
    initAgentStatusAuto,
    getDebugLog,
    copyDebugLog,
    clearDebugLog
  };
})();
