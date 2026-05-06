(function () {
  let orderFlagObserver = null;
  let processedOrderElements = new WeakSet();
  const merchantContextByOrderId = new Map();

  function init(deps = {}) {
    const { loadMerchantLabels, loadOrderData, loadMerchantData } = deps;
    if (
      typeof loadMerchantLabels !== "function" ||
      typeof loadOrderData !== "function" ||
      typeof loadMerchantData !== "function"
    ) return;

    function findOrderFlagInfo(root) {
      if (!root) return null;
      const flagSelectors = [
        'span[class*="CountryFlag"]',
        'img[class*="CountryFlag"]',
        'svg[class*="CountryFlag"]',
        'span[style*="/flags/"]',
        'span[style*="flags/"]',
        'img[src*="/flags/"]',
        'img[src*="flags/"]'
      ];
      const firstFlag = root.querySelector(flagSelectors.join(","));
      if (!firstFlag) return null;
      const flagContainer =
        firstFlag.closest("span[style*='font-size']") ||
        firstFlag.parentElement;
      if (!flagContainer) return null;
      return { firstFlag, flagContainer };
    }

    function hasChinaFlag(container) {
      if (!container) return false;
      return Boolean(
        container.querySelector(
          '[aria-label="CN"], [alt="CN"], [style*="cn.svg"], [style*="cn.png"], img[src*="/cn."]'
        )
      );
    }

    function getOrderIdFromOrderCard(orderCard) {
      if (!orderCard) return null;
      const link =
        orderCard.querySelector('a.TijHv0zOOldWzA_Ck6tA[href*="/orders/"]') ||
        orderCard.querySelector('a[href*="/orders/"]');
      if (!link) return null;
      const m = link.href.match(/\/orders\/([a-f0-9]{24})/i);
      return m ? m[1] : null;
    }

    function clearExtensionInjectedExtraFlags() {
      document.querySelectorAll('[data-extension-extra-flag="1"]').forEach(el => el.remove());
    }

    function replaceCountryInUrl(url, code) {
      if (!url) return "";
      const next = url.replace(/\/([a-z]{2})\.(svg|png|webp)(\?|$)/i, `/${code}.$2$3`);
      return next !== url ? next : "";
    }

    function countryEmoji(code) {
      const c = String(code || "").toLowerCase();
      if (c === "cn") return "\u{1F1E8}\u{1F1F3}";
      if (c === "in") return "\u{1F1EE}\u{1F1F3}";
      if (c === "tr") return "\u{1F1F9}\u{1F1F7}";
      return "";
    }

    function createFlagNode(baseFlag, orderId, countryCode) {
      const cc = String(countryCode || "").toLowerCase();
      const upperCode = cc.toUpperCase();
      const flagNode = baseFlag.cloneNode(false);
      flagNode.setAttribute("aria-label", upperCode);
      flagNode.setAttribute("role", "img");
      flagNode.setAttribute("data-extension-extra-flag", "1");
      flagNode.setAttribute("data-extension-country", cc);
      if (orderId) flagNode.setAttribute("data-extension-order-id", orderId);
      flagNode.style.marginLeft = "6px";

      const computed = getComputedStyle(baseFlag);
      const bg = baseFlag.style.backgroundImage || computed.backgroundImage || "";
      const mask = baseFlag.style.maskImage || computed.maskImage || "";
      const webkitMask = baseFlag.style.webkitMaskImage || computed.webkitMaskImage || "";
      flagNode.style.backgroundImage = "";
      flagNode.style.maskImage = "";
      flagNode.style.webkitMaskImage = "";
      const flagText = baseFlag.textContent || "";
      const hasEmojiInText = /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(flagText);
      const hasNoBackground = (bg === "none" || bg === "") && (mask === "none" || mask === "") && (webkitMask === "none" || webkitMask === "");
      const isEmojiFlag =
        String(baseFlag.className || "").includes("Emoji") ||
        (baseFlag.tagName === "SPAN" && hasNoBackground && hasEmojiInText) ||
        (baseFlag.tagName === "SPAN" && hasNoBackground && !bg && !mask && !webkitMask && flagText.trim().length > 0);
      if (isEmojiFlag) {
        const emoji = countryEmoji(cc);
        if (emoji) flagNode.textContent = emoji;
        flagNode.style.backgroundImage = "";
        flagNode.style.backgroundColor = "";
        flagNode.style.maskImage = "";
        flagNode.style.webkitMaskImage = "";
        return flagNode;
      }
      if (flagNode.tagName === "IMG") {
        const src = baseFlag.getAttribute("src") || "";
        const nextSrc = replaceCountryInUrl(src, cc) || `/generated/flags/4x3/${cc}.svg`;
        flagNode.setAttribute("src", nextSrc);
        flagNode.setAttribute("alt", upperCode);
      } else {
        flagNode.style.backgroundImage = `url("/generated/flags/4x3/${cc}.svg")`;
        flagNode.style.maskImage = "";
        flagNode.style.webkitMaskImage = "";
        flagNode.style.backgroundColor = "";
      }
      return flagNode;
    }

    function parseMerchantNameList(raw) {
      return new Set(
        String(raw || "")
          .split(/[\n,]+/)
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
      );
    }

    async function resolveMerchantContext(orderCard) {
      const orderId = getOrderIdFromOrderCard(orderCard);
      if (orderId && merchantContextByOrderId.has(orderId)) {
        return merchantContextByOrderId.get(orderId);
      }

      let merchantId = "";
      let merchantName = "";

      const merchantLink = orderCard.querySelector("a[href*='merchants/']");
      if (merchantLink) {
        merchantId = merchantLink.href.split("/").pop() || "";
        merchantName = (merchantLink.textContent || "").trim();
      }

      if ((!merchantId || !merchantName) && orderId) {
        try {
          const orderData = await loadOrderData({ id: orderId });
          if (!merchantId) merchantId = orderData?.merchantId || orderData?.items?.[0]?.merchantId || "";
        } catch {}
      }

      if (merchantId && !merchantName) {
        try {
          const merchant = await loadMerchantData(merchantId);
          merchantName = merchant?.name || "";
        } catch {}
      }

      const ctx = {
        orderId,
        merchantId: String(merchantId || ""),
        merchantName: String(merchantName || "").trim().toLowerCase()
      };
      if (orderId) merchantContextByOrderId.set(orderId, ctx);
      return ctx;
    }

    async function processOrderElement(orderElement, countryByMerchantName) {
      const orderCard =
        orderElement.closest('[data-testid="order-card"]') || orderElement;
      const hasInjectedFlag = Boolean(
        orderCard.querySelector('[data-extension-extra-flag="1"]')
      );
      if (processedOrderElements.has(orderElement) && hasInjectedFlag) return;

      const { orderId, merchantId, merchantName } = await resolveMerchantContext(orderCard);
      if (!merchantId) return;
      const flagInfo =
        findOrderFlagInfo(orderElement) || findOrderFlagInfo(orderCard);
      if (!flagInfo) return;
      const { firstFlag, flagContainer } = flagInfo;
      if (!firstFlag || !flagContainer) return;
      try {
        const labels = await loadMerchantLabels(merchantId);
        const targetCountries = [];
        if (labels.includes("euChinese")) targetCountries.push("cn");
        const customCountry = merchantName ? countryByMerchantName.get(merchantName) : null;
        if (customCountry) targetCountries.push(customCountry);
        if (!targetCountries.length) {
          processedOrderElements.add(orderElement);
          return;
        }

        for (const countryCode of targetCountries) {
          const duplicateSelector = orderId
            ? `[data-extension-extra-flag="1"][data-extension-country="${countryCode}"][data-extension-order-id="${orderId}"]`
            : `[data-extension-extra-flag="1"][data-extension-country="${countryCode}"]`;
          if (flagContainer.querySelector(duplicateSelector)) continue;
          if (!orderId && countryCode === "cn" && hasChinaFlag(flagContainer)) continue;
          const flagNode = createFlagNode(firstFlag, orderId, countryCode);
          flagContainer.appendChild(flagNode);
        }
        processedOrderElements.add(orderElement);
      } catch {
        processedOrderElements.delete(orderElement);
      }
    }

    chrome.storage.sync.get(
      ["doubleOriginEnabled", "doubleOriginIndiaMerchants", "doubleOriginTurkeyMerchants"],
      cfg => {
        if (cfg.doubleOriginEnabled === false) {
          if (orderFlagObserver) orderFlagObserver.disconnect();
          clearExtensionInjectedExtraFlags();
          processedOrderElements = new WeakSet();
          return;
        }

        const inMerchants = parseMerchantNameList(cfg.doubleOriginIndiaMerchants);
        const trMerchants = parseMerchantNameList(cfg.doubleOriginTurkeyMerchants);
        const countryByMerchantName = new Map();
        inMerchants.forEach(name => countryByMerchantName.set(name, "in"));
        trMerchants.forEach(name => countryByMerchantName.set(name, "tr"));

        function processOrderElements() {
          const orderCards = document.querySelectorAll('[data-testid="order-card"]');
          const targets = orderCards.length
            ? orderCards
            : document.querySelectorAll("div.PRKNhI9g69iDhC3UZ2Ke");
          targets.forEach(el => processOrderElement(el, countryByMerchantName));
        }

        processOrderElements();

        if (!window._orderFlagClickListenerAdded) {
          window._orderFlagClickListenerAdded = true;
          document.addEventListener("click", e => {
            const orderLink = e.target.closest('a[href*="/orders/"]');
            if (!orderLink) return;
            clearExtensionInjectedExtraFlags();
            processedOrderElements = new WeakSet();
            clearTimeout(window._orderFlagTimer);
            window._orderFlagTimer = setTimeout(processOrderElements, 50);
          });
        }

        if (orderFlagObserver) orderFlagObserver.disconnect();
        orderFlagObserver = new MutationObserver(() => {
          clearTimeout(window._orderFlagTimer);
          window._orderFlagTimer = setTimeout(processOrderElements, 50);
        });
        orderFlagObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    );
  }

  window.ExtOrderFlags = { init };
})();
