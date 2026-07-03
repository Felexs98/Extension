(function () {
  let processedPlatformContainers = new WeakSet();
  const processedSizeContainers = new WeakSet();
  const tr = (en, ru) => (window.ExtLocale && window.ExtLocale.pick) ? window.ExtLocale.pick(en, ru) : en;

  function init(deps = {}) {
    const {
      getOrderIdFromURL,
      getOrderIdFromDOM,
      loadOrderData,
      loadProductData,
      loadLogisticsMeasuredWeightFromFindAll,
      safeStorageSyncGet
    } = deps;
    if (
      typeof getOrderIdFromURL !== "function" ||
      typeof getOrderIdFromDOM !== "function" ||
      typeof loadOrderData !== "function" ||
      typeof loadProductData !== "function" ||
      typeof loadLogisticsMeasuredWeightFromFindAll !== "function" ||
      typeof safeStorageSyncGet !== "function"
    ) {
      return;
    }

    function normalizeSizeName(sizeName) {
      if (!sizeName) return "";
      const normalized = sizeName.trim().toLowerCase();
      const sizeMap = {
        "extra small": "xs",
        "small": "s",
        "medium": "m",
        "large": "l",
        "extra large": "xl",
        "xxl": "xxl",
        "xxxl": "xxxl"
      };
      return sizeMap[normalized] || normalized;
    }

    function findSizeInTables(sizeName, detailedSizeTables) {
      if (!detailedSizeTables?.tables || !Array.isArray(detailedSizeTables.tables)) return null;
      const normalized = normalizeSizeName(sizeName);
      for (const table of detailedSizeTables.tables) {
        if (!table.sizesList || !Array.isArray(table.sizesList)) continue;
        for (const size of table.sizesList) {
          const sizeNameNormalized = normalizeSizeName(size.sizeName);
          if (sizeNameNormalized === normalized || size.sizeName?.toLowerCase() === sizeName.toLowerCase()) {
            return { size, measuresOrder: table.measuresOrder };
          }
        }
      }
      return null;
    }

    function createSizeTooltip(sizeData, measuresOrder) {
      if (!sizeData || !sizeData.measures) return null;
      const tooltip = document.createElement("div");
      tooltip.dataset.sizeTooltip = "true";
      tooltip.style.cssText = "position:absolute;background:rgb(39, 40, 48);color:rgb(255, 255, 255);padding:12px;border-radius:6px;font-size:12px;line-height:1.5;z-index:10000;box-shadow:0 4px 12px rgba(0, 0, 0, 0.3);cursor:pointer;white-space:nowrap;max-width:300px;";
      const title = document.createElement("div");
      title.textContent = tr("Size: ", "Размер: ") + sizeData.sizeName;
      title.style.cssText = "font-weight:600;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255, 255, 255, 0.2);";
      tooltip.appendChild(title);
      const measures = sizeData.measures || [];
      let orderedMeasures = measures;
      if (measuresOrder && Array.isArray(measuresOrder) && measuresOrder.length > 0) {
        const orderMap = new Map();
        measuresOrder.forEach((mo, index) => orderMap.set(mo.type, index));
        orderedMeasures = [...measures].sort((a, b) => {
          const aType = a.type?.type;
          const bType = b.type?.type;
          const aIndex = orderMap.has(aType) ? orderMap.get(aType) : Infinity;
          const bIndex = orderMap.has(bType) ? orderMap.get(bType) : Infinity;
          return aIndex - bIndex;
        });
      }
      const lengthMeasures = orderedMeasures.filter(m => m.type?.type === "length");
      let lengthCounter = 0;
      orderedMeasures.forEach(measure => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;gap:12px;margin-bottom:4px;";
        const label = document.createElement("span");
        let measureLabel = measure.type?.name || measure.type?.fullName || measure.type?.type || "Unknown";
        if (measure.type?.type === "length" && lengthMeasures.length > 1) {
          const commonNames = ["jacket length", "pants length", "dress length", "top length"];
          if (lengthCounter < commonNames.length) measureLabel = commonNames[lengthCounter];
          else measureLabel = "length " + (lengthCounter + 1);
          lengthCounter++;
        }
        label.textContent = measureLabel;
        label.style.cssText = "text-transform:capitalize;opacity:0.9;";
        const value = document.createElement("span");
        value.textContent = `${measure.value?.value || ""} ${measure.value?.unit || ""}`.trim();
        value.style.cssText = "font-weight:500;";
        row.appendChild(label);
        row.appendChild(value);
        tooltip.appendChild(row);
      });
      return tooltip;
    }

    async function processSizeTooltip(container, orderData) {
      const cfg = await new Promise(resolve => chrome.storage.sync.get(["sizeTooltipEnabled"], resolve));
      if (cfg.sizeTooltipEnabled !== true) return;
      const dl = container.querySelector('dl.fDdY762K9InyWOIzQnnQ');
      if (!dl) return;
      const sizeRow = Array.from(dl.querySelectorAll('.QC2SXR_FQamr1zhmgiQT')).find(row => {
        const dt = row.querySelector('dt.LopFYFidxh4rRWmRWoRO');
        return dt && (dt.textContent.includes("Size") || dt.textContent.includes("Размер"));
      });
      if (!sizeRow) return;
      const dd = sizeRow.querySelector('dd.KTfP5OLXQ1pwKnA3pnbW');
      if (!dd || dd.dataset.sizeTooltipAdded) return;
      const sizeName = dd.textContent.trim();
      if (!sizeName) return;
      const productId = orderData?.productInfo?.productId;
      if (!productId) return;
      const productData = await loadProductData(productId);
      if (!productData?.detailedSizeTables) return;
      const sizeData = findSizeInTables(sizeName, productData.detailedSizeTables);
      if (!sizeData) return;
      dd.dataset.sizeTooltipAdded = "true";
      dd.style.cssText = "position:relative;cursor:help;";
      let tooltip = null;
      let isPinned = false;
      const updateTooltipPosition = () => {
        if (!tooltip) return;
        const rect = dd.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        let top = rect.bottom + 8;
        if (left < 8) left = 8;
        if (left + tooltipRect.width > window.innerWidth - 8) left = window.innerWidth - tooltipRect.width - 8;
        if (top + tooltipRect.height > window.innerHeight - 8) top = rect.top - tooltipRect.height - 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };
      const showTooltip = async () => {
        const cfg2 = await new Promise(resolve => chrome.storage.sync.get(["sizeTooltipEnabled"], resolve));
        if (cfg2.sizeTooltipEnabled !== true) return;
        if (tooltip) {
          if (!isPinned) updateTooltipPosition();
          return;
        }
        tooltip = createSizeTooltip(sizeData.size, sizeData.measuresOrder);
        if (!tooltip) return;
        tooltip.onclick = () => {
          if (isPinned) {
            isPinned = false;
            if (tooltip) {
              tooltip.remove();
              tooltip = null;
            }
          }
        };
        document.body.appendChild(tooltip);
        updateTooltipPosition();
      };
      const hideTooltip = () => {
        if (tooltip && !isPinned) {
          tooltip.remove();
          tooltip = null;
        }
      };
      const togglePin = e => {
        e.stopPropagation();
        isPinned = !isPinned;
        if (tooltip && !isPinned) hideTooltip();
        else if (isPinned) showTooltip();
      };
      dd.addEventListener("mouseenter", showTooltip);
      dd.addEventListener("mouseleave", hideTooltip);
      dd.addEventListener("click", togglePin);
      dd.addEventListener("mousemove", () => {
        if (tooltip && !isPinned) updateTooltipPosition();
      });
    }

    function formatWeightDisplayFromKg(kg) {
      if (kg == null || typeof kg !== "number" || isNaN(kg)) return null;
      const grams = kg * 1000;
      if (grams > 1000) {
        const r = Math.round(kg * 1000) / 1000;
        return `${r.toFixed(3)} kg`;
      }
      const g = Math.round(grams * 1000) / 1000;
      return `${String(Number(g.toFixed(3)))} g`;
    }

    function pickJlItemWeightKgFromLine(o) {
      if (!o) return null;
      const jl = o.jlShippingInfo?.itemWeight;
      if (typeof jl === "number" && !isNaN(jl)) return jl;
      const w = o.itemWeight ?? o.itemweight ?? o.weight;
      if (typeof w === "number" && !isNaN(w)) return w;
      return null;
    }

    function extractJlProductWeightKg(orderData) {
      if (!orderData) return null;
      return pickJlItemWeightKgFromLine(orderData) ?? pickJlItemWeightKgFromLine(orderData.items?.[0]) ?? null;
    }

    function pickShippingWeightKgFromLine(o) {
      const weights = o?.shippingData?.weights;
      if (!weights || typeof weights !== "object") return null;
      for (const key of ["measuredWeight", "merchantWeight", "predictedWeight"]) {
        const v = weights[key];
        if (typeof v === "number" && !isNaN(v)) return v;
      }
      return null;
    }

    function extractMeasuredWeightKg(orderData) {
      return pickShippingWeightKgFromLine(orderData) ?? pickShippingWeightKgFromLine(orderData?.items?.[0]) ?? null;
    }

    function pickJlOrderNumberFromLine(o) {
      return o?.state?.shipping?.orderNumber ?? o?.orderNumber ?? null;
    }

    function extractJlOrderNumber(orderData) {
      let n = pickJlOrderNumberFromLine(orderData);
      if (typeof n !== "string" || !n.trim()) n = pickJlOrderNumberFromLine(orderData?.items?.[0]);
      return typeof n === "string" && n.trim() ? n.trim() : null;
    }

    function fillDefinitionValue(dd, valueContent) {
      dd.replaceChildren();
      if (typeof valueContent === "string") dd.textContent = valueContent;
      else if (valueContent) dd.appendChild(valueContent);
      else dd.textContent = "—";
    }

    // Upsert keyed by data-jl-key so a row is updated in place (e.g. on a live
    // language switch) instead of duplicated when the label text changes.
    function appendDefinitionRow(dl, labelText, valueContent, key) {
      const existing = key ? dl.querySelector(`.jl-order-weights-row[data-jl-key="${key}"]`) : null;
      const valueText = typeof valueContent === "string" ? valueContent : ((valueContent && valueContent.textContent) || "—");
      if (existing) {
        const dt = existing.querySelector("dt");
        const dd = existing.querySelector("dd");
        if (dt && dd && dt.textContent === labelText && dd.textContent === valueText) return;
        if (dt) dt.textContent = labelText;
        if (dd) fillDefinitionValue(dd, valueContent);
        return;
      }
      const row = document.createElement("div");
      row.className = "QC2SXR_FQamr1zhmgiQT jl-order-weights-row";
      if (key) row.dataset.jlKey = key;
      const dt = document.createElement("dt");
      dt.className = "LopFYFidxh4rRWmRWoRO";
      dt.textContent = labelText;
      const dd = document.createElement("dd");
      dd.className = "KTfP5OLXQ1pwKnA3pnbW";
      fillDefinitionValue(dd, valueContent);
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    }

    function hasJlRow(dl, labelText) {
      return Array.from(dl.querySelectorAll(".jl-order-weights-row dt")).some(dt => (dt.textContent || "").trim() === labelText);
    }

    function createPlatformNotice(platformText, labelText) {
      const notice = document.createElement("div");
      notice.className = "platform-label platform-label-notice";
      const label = document.createElement("span");
      label.className = "platform-label-notice__label";
      label.textContent = labelText;
      const value = document.createElement("span");
      value.className = "platform-label-notice__value";
      value.textContent = platformText;
      notice.appendChild(label);
      notice.appendChild(value);
      return notice;
    }

    function getPlatformLabelText(orderPanelSection) {
      const text = (orderPanelSection?.innerText || "").trim();
      return text.startsWith("Заказ\n") ? "Платформа" : "Platform";
    }

    function isOrderPanelSection(el) {
      const text = (el?.innerText || "").trim();
      const hasOrderTitle = text.startsWith("Order\n") || text.startsWith("Заказ\n");
      const hasAddressee = text.includes("Addressee:") || text.includes("Адресат:");
      const hasDeliveryAddress = text.includes("Delivery address:") || text.includes("Адрес доставки:");
      const hasShippingDetails = text.includes("Shipping details:") || text.includes("Детали доставки:");
      return (
        hasOrderTitle &&
        hasAddressee &&
        hasDeliveryAddress &&
        hasShippingDetails
      );
    }

    function findOrderPanelSection(container) {
      let current = container;
      for (let i = 0; i < 8 && current; i++, current = current.parentElement) {
        const section = Array.from(current.children || []).find(isOrderPanelSection);
        if (section) return section;
      }
      return null;
    }

    function removeLegacyPlatformRows(container) {
      container.querySelectorAll(".platform-label:not(.platform-label-notice)").forEach(el => el.remove());
    }

    function insertPlatformNotice(container, platformText) {
      const target = findOrderPanelSection(container) || container;
      const labelText = getPlatformLabelText(target);
      const existingNotice =
        target.previousElementSibling?.classList?.contains("platform-label-notice")
          ? target.previousElementSibling
          : container.querySelector(":scope > .platform-label-notice");
      if (existingNotice) {
        existingNotice.querySelector(".platform-label-notice__label").textContent = labelText;
        existingNotice.querySelector(".platform-label-notice__value").textContent = platformText;
        return;
      }

      const notice = createPlatformNotice(platformText, labelText);
      if (target.parentElement) target.parentElement.insertBefore(notice, target);
      else container.prepend(notice);
    }

    async function processJlWeightsContainer(container) {
      const dl = container.querySelector("dl.fDdY762K9InyWOIzQnnQ");
      if (!dl) return;
      let orderInfo = getOrderIdFromURL() || getOrderIdFromDOM(container);
      if (!orderInfo) return;
      if (typeof orderInfo === "string") orderInfo = { id: orderInfo };
      try {
        const orderData = await loadOrderData(orderInfo);
        if (!orderData) return;
        const orderNo = extractJlOrderNumber(orderData);
        const jlKg = extractJlProductWeightKg(orderData);
        let measuredKg = extractMeasuredWeightKg(orderData);
        if (measuredKg == null && orderNo) measuredKg = await loadLogisticsMeasuredWeightFromFindAll(orderNo);
        const jlDisp = formatWeightDisplayFromKg(jlKg);
        const measuredDisp = formatWeightDisplayFromKg(measuredKg);
        const lblJlWeight = tr("JL product weight", "Вес товара (JL)");
        const lblMeasured = tr("Measured weight", "Измеренный вес");
        const lblJlOrderNo = tr("JL order number", "Номер заказа (JL)");
        if (jlDisp != null) appendDefinitionRow(dl, lblJlWeight, jlDisp, "jlWeight");
        if (measuredDisp != null) appendDefinitionRow(dl, lblMeasured, measuredDisp, "measured");
        if (orderNo) {
          const a = document.createElement("a");
          a.href = `https://support.joom.it/logistics/orders/${encodeURIComponent(orderNo)}`;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = orderNo;
          a.style.color = "#2563eb";
          a.style.textDecoration = "underline";
          appendDefinitionRow(dl, lblJlOrderNo, a, "jlOrderNo");
        }
      } catch {}
    }

    async function processPlatformContainer(container) {
      if (processedPlatformContainers.has(container)) return;
      removeLegacyPlatformRows(container);
      const dl = container.querySelector('dl.fDdY762K9InyWOIzQnnQ');
      if (!dl) return;
      let orderInfo = getOrderIdFromURL() || getOrderIdFromDOM(container);
      if (!orderInfo) return;
      if (typeof orderInfo === "string") orderInfo = { id: orderInfo };
      try {
        const orderData = await loadOrderData(orderInfo);
        if (!orderData) return;
        await processSizeTooltip(container, orderData);
        const scope = orderData.scope?.toLowerCase();
        let platformText = null;
        if (scope === "coolbe") platformText = "Ayzeze";
        else if (scope === "geek") platformText = "Joom Geek";
        else if (scope === "korami") platformText = "Korami";
        if (!platformText) {
          processedPlatformContainers.add(container);
          return;
        }
        insertPlatformNotice(container, platformText);
        processedPlatformContainers.add(container);
      } catch {}
    }

    async function processSizeContainer(container) {
      const cfg = await safeStorageSyncGet(["sizeTooltipEnabled"], { sizeTooltipEnabled: false });
      if (cfg.sizeTooltipEnabled !== true) return;
      if (processedSizeContainers.has(container)) return;
      const dl = container.querySelector('dl.fDdY762K9InyWOIzQnnQ');
      if (!dl) return;
      const sizeRow = Array.from(dl.querySelectorAll('.QC2SXR_FQamr1zhmgiQT')).find(row => {
        const dt = row.querySelector('dt.LopFYFidxh4rRWmRWoRO');
        return dt && (dt.textContent.includes("Size") || dt.textContent.includes("Размер"));
      });
      if (!sizeRow) return;
      const dd = sizeRow.querySelector('dd.KTfP5OLXQ1pwKnA3pnbW');
      if (!dd || dd.dataset.sizeTooltipAdded) return;
      let orderInfo = getOrderIdFromURL() || getOrderIdFromDOM(container);
      if (!orderInfo) return;
      if (typeof orderInfo === "string") orderInfo = { id: orderInfo };
      try {
        const orderData = await loadOrderData(orderInfo);
        if (orderData) {
          await processSizeTooltip(container, orderData);
          processedSizeContainers.add(container);
        }
      } catch {}
    }

    function initSizeTooltipExtension() {
      if (window._sizeObserver) {
        window._sizeObserver.disconnect();
        window._sizeObserver = null;
      }
      document.querySelectorAll('[data-size-tooltip]').forEach(tooltip => tooltip.remove());
      document.querySelectorAll("div.wesSN81QRkBs9SczFpkT").forEach(container => {
        const dl = container.querySelector('dl.fDdY762K9InyWOIzQnnQ');
        if (!dl) return;
        const sizeRow = Array.from(dl.querySelectorAll('.QC2SXR_FQamr1zhmgiQT')).find(row => {
          const dt = row.querySelector('dt.LopFYFidxh4rRWmRWoRO');
          return dt && (dt.textContent.includes("Size") || dt.textContent.includes("Размер"));
        });
        if (!sizeRow) return;
        const dd = sizeRow.querySelector('dd.KTfP5OLXQ1pwKnA3pnbW');
        if (!dd) return;
        if (dd.dataset.sizeTooltipAdded) {
          const clonedDd = dd.cloneNode(true);
          clonedDd.removeAttribute("data-size-tooltip-added");
          clonedDd.style.cssText = "";
          dd.parentNode.replaceChild(clonedDd, dd);
          processedSizeContainers.delete(container);
        }
      });
      safeStorageSyncGet(["sizeTooltipEnabled"], { sizeTooltipEnabled: false }).then(cfg => {
        if (cfg.sizeTooltipEnabled !== true) return;
        function processContainers() {
          document.querySelectorAll("div.wesSN81QRkBs9SczFpkT").forEach(processSizeContainer);
        }
        processContainers();
        window._sizeObserver = new MutationObserver(() => {
          clearTimeout(window._sizeTimer);
          window._sizeTimer = setTimeout(processContainers, 200);
        });
        window._sizeObserver.observe(document.body, { childList: true, subtree: true });
      });
    }

    function initPlatformExtension() {
      if (window._platformObserver) {
        window._platformObserver.disconnect();
        window._platformObserver = null;
      }
      clearTimeout(window._platformTimer);

      chrome.storage.sync.get(["scopeEnabled"], cfg => {
        if (cfg.scopeEnabled === false) {
          document.querySelectorAll(".platform-label").forEach(el => el.remove());
          processedPlatformContainers = new WeakSet();
          return;
        }
        function processContainers() {
          document.querySelectorAll("div.wesSN81QRkBs9SczFpkT").forEach(processPlatformContainer);
        }
        processContainers();
        window._platformObserver = new MutationObserver(() => {
          clearTimeout(window._platformTimer);
          window._platformTimer = setTimeout(processContainers, 200);
        });
        window._platformObserver.observe(document.body, { childList: true, subtree: true });
      });
    }

    function initJlOrderWeightsExtension() {
      if (window._jlWeightsObserver) {
        window._jlWeightsObserver.disconnect();
        window._jlWeightsObserver = null;
      }
      document.querySelectorAll(".jl-order-weights-row").forEach(el => el.remove());
      chrome.storage.sync.get(["jlOrderWeightsEnabled"], cfg => {
        if (cfg.jlOrderWeightsEnabled === false) return;
        function processContainers() {
          document.querySelectorAll("div.wesSN81QRkBs9SczFpkT").forEach(processJlWeightsContainer);
        }
        processContainers();
        window._jlWeightsObserver = new MutationObserver(() => {
          clearTimeout(window._jlWeightsTimer);
          window._jlWeightsTimer = setTimeout(processContainers, 200);
        });
        window._jlWeightsObserver.observe(document.body, { childList: true, subtree: true });
      });
    }

    return {
      initSizeTooltipExtension,
      initPlatformExtension,
      initJlOrderWeightsExtension
    };
  }

  let api = null;
  window.ExtOrderDetailsEnhancements = {
    init(deps) {
      api = init(deps) || api;
    },
    initSizeTooltipExtension() {
      api?.initSizeTooltipExtension?.();
    },
    initPlatformExtension() {
      api?.initPlatformExtension?.();
    },
    initJlOrderWeightsExtension() {
      api?.initJlOrderWeightsExtension?.();
    }
  };
})();
