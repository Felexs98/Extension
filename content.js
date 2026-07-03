(function () {
  // Глобальные флаги рантайма для управления фичами.
  let charityRestEnabled = false;
  let enableClickTracking = true;
  let enableFraudTracking = false;
  let globalMessageObserver = null;
  // Общие helper-функции, подключенные из utility-скриптов в manifest.
  const {
    buildSheetHyperlinkFormula,
    buildSheetMultiOrderHyperlinkFormula,
    parseSheetHyperlinkFormula,
    extractOrderIdFromOrderCellValue,
    buildSheetRowLink
  } = window.ExtSheetUtils || {};
  const {
    parseMongoIdFromOrderHref,
    ticketIdFromHref
  } = window.ExtIdParsers || {};
  const {
    getOrderIdFromURL,
    getOrderIdFromDOM,
    getTicketId,
    getTicketIdFromContext,
    getCurrentTicketLinkUrl
  } = window.ExtTicketOrderLocators || {};
  const {
    apiSupportPostJson,
    fetchJsonWithQueryIdFallback,
    parseOrderGetResponse,
    parseProductGetResponse,
    buildLogisticsOrdersFindAllBody,
    pickLogisticsOrderRow,
    weightFromLogisticsRow,
    mapOrderCountryToCharityCountry
  } = window.ExtApiHelpers || {};
  const CHARITY_POPUP_POSITION_KEY = "support_charity_popup_position";

  // Позиция charity-попапа сохраняется между перезагрузками.
  function saveCharityPopupPosition(left, top) {
    try {
      localStorage.setItem(
        CHARITY_POPUP_POSITION_KEY,
        JSON.stringify({ left, top })
      );
    } catch (e) {}
  }

  function loadCharityPopupPosition() {
    try {
      const raw = localStorage.getItem(CHARITY_POPUP_POSITION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed &&
        typeof parsed.left === "number" &&
        typeof parsed.top === "number"
      ) {
        return parsed;
      }
    } catch (e) {}
    return null;
  }

  function applySettings(cfg) {
    const showContacts = cfg.showContacts !== false;

    if (showContacts) {
      initMerchantExtension();
    } else {
      window.ExtMerchantCharity?.disable?.();
    }

    enableClickTracking = cfg.trackingEnabled !== false;
    enableFraudTracking = cfg.fraudTrackingEnabled === true;
    window.ExtNavbarStats?.refresh?.();
  }

  function applyFraudTrackingChange(enabled) {
    enableFraudTracking = enabled === true;
    window.ExtNavbarStats?.refresh?.();
  }

  const FILTERS = {
    system: {
      enabled: false,
      match: text =>
          text.startsWith("bot branch:") ||
          (text.includes("---") && text.includes("system"))
    },
    translate: {
      enabled: false,
      languages: [],
      extractLang(text) {
        const m = text.match(/translation for entry[^,]*,\s*([a-z]{2})\s*->\s*[a-z]{2}\s*:/i);
        return m ? m[1].toLowerCase() : null;
      }
    }
  };

  // Фильтрация системных и переводных сообщений в чате.
  function hideElement(el) {
    if (!el) return;
    el.style.display = "none";
    el.style.margin = "0";
    el.style.padding = "0";
    el.style.height = "0";
    el.style.overflow = "hidden";
  }

  function showElement(el) {
    if (!el) return;
    el.style.display = "";
    el.style.margin = "";
    el.style.padding = "";
    el.style.height = "";
    el.style.overflow = "";
  }

  function findMessageWrapper(el) {
    return el.closest(`
      div.vaX6DNWAxJ6EhHoZ7bgl,
      div.bt3ThIUimhuJ9PoypLK7,
      div[class*="mBYkc2H0HypzHiO4rmqB"]
    `);
  }

  function getTranslationLang(wrap) {
    const p = wrap.querySelector("div.kk1eEa8z5P94KONlF4Oq > p");
    if (!p) return null;
    const text = p.innerText.trim().toLowerCase();
    return FILTERS.translate.extractLang(text);
  }

  function getSilentLang(wrap) {
    const raw = wrap.innerText.toLowerCase();
    const m =
        raw.match(/translated from\s+([a-z]{2})/) ||
        raw.match(/\bfrom\s+([a-z]{2})\b/);
    return m ? m[1] : null;
  }

  function processMessageNode(el) {
    const wrap = findMessageWrapper(el);
    if (!wrap) return;

    const outer = wrap.closest("div[data-entry-wrapper-id]");
    const msg = wrap.querySelector("div.kk1eEa8z5P94KONlF4Oq > p");
    const text = (msg ? msg.innerText : "").trim().toLowerCase();

    if (FILTERS.system.enabled && FILTERS.system.match(text)) {
      hideElement(wrap);
      if (outer) hideElement(outer);
      return;
    }

    if (
        FILTERS.translate.enabled &&
        wrap.classList.contains("vaX6DNWAxJ6EhHoZ7bgl") &&
        wrap.classList.contains("bt3ThIUimhuJ9PoypLK7") &&
        !text.startsWith("translation for entry")
    ) {
      const silentLang = getSilentLang(wrap);

      if (silentLang && FILTERS.translate.languages.includes(silentLang)) {
        hideElement(wrap);
        if (outer) hideElement(outer);
        } else {
        showElement(wrap);
      }
      return;
    }

    if (FILTERS.translate.enabled && text.startsWith("translation for entry")) {
      const lang = getTranslationLang(wrap);

      if (lang && FILTERS.translate.languages.includes(lang)) {
        hideElement(wrap);
        if (outer) hideElement(outer);
      } else {
        showElement(wrap);
      }
      return;
    }

  }

  function startGlobalMessageObserver() {
    if (globalMessageObserver) globalMessageObserver.disconnect();

    globalMessageObserver = new MutationObserver(muts => {
      for (const mut of muts) {
        for (const node of mut.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches("div.kk1eEa8z5P94KONlF4Oq")) {
            processMessageNode(node);
          } else {
            node
                .querySelectorAll?.("div.kk1eEa8z5P94KONlF4Oq")
                .forEach(processMessageNode);
          }
        }
      }
    });

    globalMessageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function applyMessageFilters(cfg) {
    FILTERS.system.enabled = !!cfg.hideSystem;
    FILTERS.translate.enabled = (cfg.hideTranslateLanguages || []).length > 0;
    FILTERS.translate.languages = cfg.hideTranslateLanguages || [];

    document
        .querySelectorAll("div.kk1eEa8z5P94KONlF4Oq")
        .forEach(processMessageNode);

    startGlobalMessageObserver();
  }

  let processedAttachmentButtons = new WeakSet();
  let attachmentObserver = null;

  // Media picker вынесен в feature-модуль, здесь только инициализация.
  function initMediaPicker() {
    window.ExtMediaPicker?.init?.({
      sendRuntimeMessageAsync
    });
  }

  function addAttachmentButton(addonContainer) {
    if (processedAttachmentButtons.has(addonContainer)) return;
    
    const innerDiv = addonContainer.querySelector('div.qJX6vDnGMSF2t79xfDHN');
    if (!innerDiv) return;
    
    const existingButton = innerDiv.querySelector('button.zAVYnifBrUNS9GC8yf3l');
    if (!existingButton) return;
    
    if (innerDiv.querySelector('.attachment-photo-btn')) return;

    const attachmentBtn = document.createElement("button");
    attachmentBtn.type = "button";
    attachmentBtn.className = "zAVYnifBrUNS9GC8yf3l attachment-photo-btn";
    attachmentBtn.style.opacity = "0.6";
    attachmentBtn.style.transition = "opacity 0.2s";
    
    let tooltipTimeout = null;
    let tooltipElement = null;
    
    attachmentBtn.onmouseenter = () => {
      attachmentBtn.style.opacity = "1";
      tooltipTimeout = setTimeout(() => {
        tooltipElement = document.createElement("div");
        tooltipElement.textContent = (window.ExtLocale && window.ExtLocale.pick) ? window.ExtLocale.pick("Attachments", "Вложения") : "Attachments";
        tooltipElement.style.cssText = `
          position: absolute;
          background: rgb(39, 40, 48);
          color: rgb(255, 255, 255);
          padding: 4px 8px;
          border-radius: 3.5px;
          font-size: 12.25px;
          white-space: nowrap;
          z-index: 9999;
          pointer-events: none;
          opacity: 0;
          transition-property: opacity;
          transition-duration: 500ms;
          display: block;
        `;
        document.body.appendChild(tooltipElement);
        
        const rect = attachmentBtn.getBoundingClientRect();
        const tooltipWidth = tooltipElement.offsetWidth;
        tooltipElement.style.left = rect.left + (rect.width / 2) - (tooltipWidth / 2) + "px";
        tooltipElement.style.top = rect.bottom + 8 + "px";
        tooltipElement.style.transform = `translate(0, 0)`;
        
        setTimeout(() => {
          if (tooltipElement) tooltipElement.style.opacity = "1";
        }, 10);
      }, 100);
    };
    
    attachmentBtn.onmouseleave = () => {
      attachmentBtn.style.opacity = "0.6";
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }
      if (tooltipElement) {
        tooltipElement.style.opacity = "0";
        setTimeout(() => {
          if (tooltipElement && tooltipElement.parentNode) {
            tooltipElement.parentNode.removeChild(tooltipElement);
          }
          tooltipElement = null;
        }, 150);
      }
    };
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "1.2em");
    svg.setAttribute("height", "1.2em");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("fill", "currentColor");
    
    const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path1.setAttribute("d", "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z");
    
    g.appendChild(path1);
    svg.appendChild(g);
    attachmentBtn.appendChild(svg);
    
    attachmentBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initMediaPicker();
      const root = document.getElementById("media-picker-root");
      if (root) root.style.display = "block";
    });
    
    innerDiv.insertBefore(attachmentBtn, existingButton);
    processedAttachmentButtons.add(addonContainer);
  }

  function initAttachmentButtonExtension() {
    chrome.storage.sync.get(["attachmentButtonEnabled"], cfg => {
      if (attachmentObserver) {
        attachmentObserver.disconnect();
        attachmentObserver = null;
      }
      clearTimeout(window._attachmentTimer);

      if (cfg.attachmentButtonEnabled === false) {
        document.querySelectorAll('.attachment-photo-btn').forEach(btn => btn.remove());
        processedAttachmentButtons = new WeakSet();
        return;
      }

      function processAddons() {
        document.querySelectorAll("div.Tabs__addon__IZT-J.Tabs__addonRight__mgNVi").forEach(addAttachmentButton);
      }

      processAddons();

      attachmentObserver = new MutationObserver(() => {
        clearTimeout(window._attachmentTimer);
        window._attachmentTimer = setTimeout(processAddons, 50);
      });

      attachmentObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  chrome.storage.sync.get(
      [
        "showContacts",
        "trackingEnabled",
        "fraudTrackingEnabled",
        "hideSystem",
        "hideTranslateLanguages",
        "charityRestEnabled"
      ],
      cfg => {
        charityRestEnabled = cfg.charityRestEnabled === true;
        initMerchantCharityFeature();
        applySettings(cfg);
        applyMessageFilters(cfg);
        initOrderDetailsEnhancements();
        initReplyTracking();
        initOrderFlagExtension();
        initPlatformExtension();
        initJlOrderWeightsExtension();
        initAttachmentButtonExtension();
        initSizeTooltipExtension();
      }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.fraudTrackingEnabled) {
        applyFraudTrackingChange(changes.fraudTrackingEnabled.newValue);
      }
      chrome.storage.sync.get(
          [
            "showContacts",
            "trackingEnabled",
            "fraudTrackingEnabled",
            "hideSystem",
            "hideTranslateLanguages",
            "attachmentButtonEnabled",
            "scopeEnabled",
            "jlOrderWeightsEnabled",
            "doubleOriginEnabled",
            "doubleOriginIndiaMerchants",
            "doubleOriginTurkeyMerchants",
            "sizeTooltipEnabled",
            "charityRestEnabled"
          ],
          cfg => {
            charityRestEnabled = cfg.charityRestEnabled === true;
            initMerchantCharityFeature();
            applySettings(cfg);
            applyMessageFilters(cfg);

            if (changes.charityRestEnabled) {
              refreshCharityButtonsForPage();
            }
            
            if (changes.attachmentButtonEnabled) {
              initAttachmentButtonExtension();
            }
            if (changes.scopeEnabled) {
              initPlatformExtension();
            }
            if (changes.jlOrderWeightsEnabled) {
              initJlOrderWeightsExtension();
            }
            if (changes.doubleOriginEnabled) {
              initOrderFlagExtension();
            }
            if (changes.doubleOriginIndiaMerchants || changes.doubleOriginTurkeyMerchants) {
              initOrderFlagExtension();
            }
            if (changes.sizeTooltipEnabled) {
              initSizeTooltipExtension();
            }
          }
      );
    }
  });

  // Безопасная обертка над chrome.storage.sync.get.
  function safeStorageSyncGet(keys, fallback = {}) {
    return new Promise(resolve => {
      try {
        if (!chrome?.runtime?.id) {
          resolve(fallback);
          return;
        }
        chrome.storage.sync.get(keys, res => {
          if (chrome.runtime.lastError) {
            resolve(fallback);
            return;
          }
          resolve(res || fallback);
        });
      } catch {
        resolve(fallback);
      }
    });
  }

  const MERCHANT_CACHE_TTL_MS = 10 * 60 * 1000;
  const merchantDataCache = new Map();
  const merchantDataInflight = new Map();
  const returnPhoneCache = new Map();
  const returnPhoneInflight = new Map();

  // Блок data-loader'ов с кешем и дедупликацией in-flight запросов.
  async function loadMerchantData(id) {
    if (!id) return null;
    const now = Date.now();
    const cached = merchantDataCache.get(id);
    if (cached && now - cached.ts < MERCHANT_CACHE_TTL_MS) {
      return cached.value;
    }
    if (merchantDataInflight.has(id)) {
      return merchantDataInflight.get(id);
    }

    const p = (async () => {
    const res = await fetch("https://api-support.joom.it/1.0/merchantsBasic/get/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: { id } })
    });
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
      const value = data.items?.[0] ?? null;
      merchantDataCache.set(id, { ts: Date.now(), value });
      return value;
    })().finally(() => {
      merchantDataInflight.delete(id);
    });

    merchantDataInflight.set(id, p);
    return p;
  }

  async function loadReturnAddressPhone(merchantId) {
    if (!merchantId) return null;
    if (returnPhoneCache.has(merchantId)) {
      return returnPhoneCache.get(merchantId);
    }
    if (returnPhoneInflight.has(merchantId)) {
      return returnPhoneInflight.get(merchantId);
    }

    const p = (async () => {
    const res = await fetch("https://api-support.joom.it/1.0/merchants/getReturnAddressPhone", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: merchantId })
    });
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
      const value = data.item ?? null;
      returnPhoneCache.set(merchantId, value);
      return value;
    })().finally(() => {
      returnPhoneInflight.delete(merchantId);
    });

    returnPhoneInflight.set(merchantId, p);
    return p;
  }

  async function loadMerchantLabels(merchantId) {
    const res = await fetch("https://api-support.joom.it/1.0/merchants/getLabels", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: merchantId })
    });

    if (!res.ok) throw new Error("API error " + res.status);

    const data = await res.json();
    return data.items || [];
  }

  let agentSelfNameCache = null;
  let agentSelfNameInflight = null;
  async function loadAgentSelfDisplayName() {
    if (agentSelfNameCache !== null) return agentSelfNameCache;
    if (agentSelfNameInflight) return agentSelfNameInflight;
    agentSelfNameInflight = (async () => {
      try {
        const res = await fetch("https://babylone-api.joom.it/self", {
          method: "GET",
          credentials: "include"
        });
        if (!res.ok) return "";
      const data = await res.json();
        const first = data?.payload?.agentInfo?.firstName || "";
        const last = data?.payload?.agentInfo?.lastName || "";
        const full = `${first} ${last}`.trim();
        agentSelfNameCache = full;
        return full;
      } catch {
        return "";
      } finally {
        agentSelfNameInflight = null;
      }
    })();
    return agentSelfNameInflight;
  }


  const ORDER_DATA_TTL_MS = 60 * 1000;
  const orderDataCache = new Map();
  const orderDataInflight = new Map();
  const logisticsMeasuredCache = new Map();
  const logisticsMeasuredInflight = new Map();

  async function loadOrderData(orderInfo) {
    const orderId = typeof orderInfo === 'string' ? orderInfo : orderInfo.id;
    const friendlyId = typeof orderInfo === 'object' ? orderInfo.friendlyId : null;
    if (!orderId) return null;

    const now = Date.now();
    const cached = orderDataCache.get(orderId);
    if (cached && now - cached.ts < ORDER_DATA_TTL_MS) {
      return cached.value;
    }
    if (orderDataInflight.has(orderId)) {
      return orderDataInflight.get(orderId);
    }

    const requestPromise = (async () => {
      const res = await fetchJsonWithQueryIdFallback(
        "https://api-support.joom.it/1.0/orders/get",
        orderId
      );
      if (!res.ok) throw new Error("API error " + res.status);

      const data = await res.json();
      const result = parseOrderGetResponse(data, orderId, friendlyId);

      orderDataCache.set(orderId, { ts: Date.now(), value: result });
      return result;
    })().finally(() => {
      orderDataInflight.delete(orderId);
    });

    orderDataInflight.set(orderId, requestPromise);
    return requestPromise;
  }

  /**
   * Когда в orders/get shippingData.weights пустой — measured берём из logistics findAll
   * (поля measuredWeight / weight на строке логистики).
   */
  async function loadLogisticsMeasuredWeightFromFindAll(orderNumber) {
    if (!orderNumber || typeof orderNumber !== "string") return null;
    if (logisticsMeasuredCache.has(orderNumber)) {
      return logisticsMeasuredCache.get(orderNumber);
    }
    if (logisticsMeasuredInflight.has(orderNumber)) {
      return logisticsMeasuredInflight.get(orderNumber);
    }

    const requestPromise = (async () => {
      let value = null;
      try {
        const res = await apiSupportPostJson(
          "https://api-support.joom.it/1.0/logistics/orders/findAll",
          buildLogisticsOrdersFindAllBody(orderNumber)
        );
        if (!res.ok) return null;
        const data = await res.json();
        const row = pickLogisticsOrderRow(data.items, orderNumber);
        value = weightFromLogisticsRow(row);
      } catch {
        /* ignore */
      }
      logisticsMeasuredCache.set(orderNumber, value);
      return value;
    })().finally(() => {
      logisticsMeasuredInflight.delete(orderNumber);
    });

    logisticsMeasuredInflight.set(orderNumber, requestPromise);
    return requestPromise;
  }

  async function loadOrderCostGmvActualUsd(orderId) {
    if (!orderId) return null;
    const res = await fetch(
      `https://api-support.joom.it/1.0/orders/${orderId}/getCost`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const usd = data.item?.costs?.gmvActual?.usd;
    if (typeof usd === "number" && !isNaN(usd)) {
      return Number(usd.toFixed(2));
    }
    return null;
  }

  async function loadProductData(productId) {
    if (!productId) return null;

    try {
      const res = await fetchJsonWithQueryIdFallback(
        "https://api-support.joom.it/1.0/products/get",
        productId
      );
      if (!res.ok) return null;
      const data = await res.json();
      return parseProductGetResponse(data, productId);
    } catch (err) {
      return null;
    }
  }

  // Прокидываем зависимости в вынесенные feature-модули.
  function initOrderDetailsEnhancements() {
    window.ExtOrderDetailsEnhancements?.init?.({
      getOrderIdFromURL,
      getOrderIdFromDOM,
      loadOrderData,
      loadProductData,
      loadLogisticsMeasuredWeightFromFindAll,
      safeStorageSyncGet
    });
  }

  function initMerchantCharityFeature() {
    window.ExtMerchantCharity?.init?.({
      getCharityRestEnabled: () => charityRestEnabled,
      getOrderIdFromURL,
      getOrderIdFromDOM,
      getCurrentTicketLinkUrl,
      loadMerchantData,
      loadReturnAddressPhone,
      loadOrderData,
      loadOrderCostGmvActualUsd,
      mapOrderCountryToCharityCountry,
      saveCharityPopupPosition,
      loadCharityPopupPosition
    });
  }

  function sendRuntimeMessageAsync(message, timeoutMs = 30000) {
    return new Promise(resolve => {
      let done = false;
      const finish = result => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        finish({ ok: false, error: `timeout after ${timeoutMs}ms` });
      }, timeoutMs);
      chrome.runtime.sendMessage(message, resp => {
        if (chrome.runtime.lastError) {
          finish({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
        finish(resp || { ok: false, error: "no response" });
      });
    });
  }

  function initSheetCaseExtension() {
    // Sheet-case feature временно отключен.
    // Для включения вернуть:
    // window.ExtSheetCase?.init?.({
    //   buildSheetHyperlinkFormula,
    //   buildSheetMultiOrderHyperlinkFormula,
    //   parseSheetHyperlinkFormula,
    //   extractOrderIdFromOrderCellValue,
    //   buildSheetRowLink,
    //   parseMongoIdFromOrderHref,
    //   ticketIdFromHref,
    //   getOrderIdFromURL,
    //   getOrderIdFromDOM,
    //   getCurrentTicketLinkUrl,
    //   loadAgentSelfDisplayName,
    //   loadOrderData,
    //   loadMerchantData,
    //   loadReturnAddressPhone,
    //   sendRuntimeMessageAsync
    // });
  }

  function initSizeTooltipExtension() {
    window.ExtOrderDetailsEnhancements?.initSizeTooltipExtension?.();
  }

  function initPlatformExtension() {
    window.ExtOrderDetailsEnhancements?.initPlatformExtension?.();
  }

  function initJlOrderWeightsExtension() {
    window.ExtOrderDetailsEnhancements?.initJlOrderWeightsExtension?.();
  }

  function refreshCharityButtonsForPage() {
    window.ExtMerchantCharity?.refresh?.();
  }

  function initMerchantExtension() {
    window.ExtMerchantCharity?.enable?.();
  }

  function initOrderFlagExtension() {
    window.ExtOrderFlags?.init?.({
      loadMerchantLabels,
      loadOrderData,
      loadMerchantData
    });
  }

  function initReplyTracking() {
    window.ExtTracking?.initReplyTracking?.({
      getTicketId,
      getTicketIdFromContext,
      isTrackingEnabled: () => enableClickTracking,
      isFraudTrackingEnabled: () => enableFraudTracking
    });
  }

  function initNavbarStats() {
    window.ExtNavbarStats?.init?.({
      isTrackingEnabled: () => enableClickTracking,
      isFraudTrackingEnabled: () => enableFraudTracking
    });
  }

  function initAgentStatusAuto() {
    window.ExtTracking?.initAgentStatusAuto?.();
  }

  // Старт глобального трекинга, не привязанного к конкретной странице.
  initAgentStatusAuto();
  initReplyTracking();
  initNavbarStats();
})();
