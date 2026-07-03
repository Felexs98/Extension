(function () {
  "use strict";
  if (window.top !== window) return;

  const API = "https://api-support.joom.it/1.0";
  const PANEL_ID = "joom-agent-helper";
  const PANEL_STYLES = `
    :host {
      display: block;
      margin: 0;
      background: #ffffff;
      color: #333333;
      font: inherit;
    }

    .jah-section-title {
      padding: 7px 14px;
      background: #f9f9fb;
      color: #7a8294;
      font-size: 0.625em;
      font-weight: 400;
      letter-spacing: 0.125em;
      line-height: 1.5;
      text-transform: uppercase;
    }

    .jah-section-body {
      padding: 0 14px;
    }

    .jah-row {
      display: grid;
      grid-template-columns: minmax(0, 46%) minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      min-height: 0;
      padding: 7px 0;
      border-bottom: 1px solid #f1f1f1;
      font-family: inherit;
      font-size: 0.875em;
      line-height: 1.43;
    }

    .jah-row:last-child {
      border-bottom: 0;
    }

    .jah-key {
      color: #656d81;
      font-weight: inherit;
      line-height: 1.43;
      white-space: nowrap;
    }

    .jah-value {
      min-width: 0;
      color: #333333;
      font-weight: inherit;
      text-align: right;
      line-height: 1.43;
      white-space: nowrap;
    }

    .jah-pill {
      display: inline;
      min-height: 0;
      padding: 0;
      border-radius: 0;
      font-weight: inherit;
      white-space: nowrap;
      background: transparent !important;
    }

    .jah-ok {
      color: #15803d;
    }

    .jah-bad {
      color: #b91c1c;
    }

    .jah-warn {
      color: #a16207;
    }

    .jah-neutral {
      color: #475569;
    }

    .jah-muted {
      color: #7a8194;
      font-weight: 400;
    }

    .jah-alert {
      color: #b91c1c;
      font-weight: 700;
    }

    .jah-error {
      margin: 10px 0 0;
      padding: 10px;
      border-radius: 6px;
      color: #b91c1c;
      background: #fee2e2;
      white-space: pre-wrap;
    }
  `;
  const MODERATION_STATE_STYLE = {
    pendingAuto: "warn",
    approvedManually: "ok",
    rejectedManually: "bad",
    pendingManually: "warn",
    approvedAuto: "ok",
    rejectedAuto: "bad"
  };
  const MODERATION_STATE_LABELS = {
    en: {
      pendingAuto: "Pending auto-check",
      approvedManually: "Approved manually",
      rejectedManually: "Rejected manually",
      pendingManually: "Pending manual review",
      approvedAuto: "Approved automatically",
      rejectedAuto: "Rejected automatically"
    },
    ru: {
      pendingAuto: "Ожидает автопроверки",
      approvedManually: "Одобрен вручную",
      rejectedManually: "Отклонен вручную",
      pendingManually: "Ожидает ручной проверки",
      approvedAuto: "Одобрен автоматически",
      rejectedAuto: "Отклонен автоматически"
    }
  };
  const LABELS = {
    en: {
      sectionTitle: "Agent Info",
      hasActiveVersion: "Has active version",
      moderationState: "Moderation state",
      reviewInfraction: "Review infraction",
      reviewOk: "ok",
      rating: "Rating",
      reviewsCount: "Count of reviews",
      decision: "Decision",
      processByRules: "Process by rules",
      refundNoProof: "Refund without proof",
      product: "Product",
      status: "Status",
      yes: "Yes",
      no: "No",
      unknown: "Unknown",
      undefined: "Undefined",
      notAvailable: "n/a",
      loading: "Loading product signals..."
    },
    ru: {
      sectionTitle: "Инфо для агента",
      hasActiveVersion: "Есть активная версия",
      moderationState: "Статус модерации",
      reviewInfraction: "Результат проверки",
      reviewOk: "ок",
      rating: "Рейтинг",
      reviewsCount: "Количество отзывов",
      decision: "Решение",
      processByRules: "Обработка по правилам",
      refundNoProof: "Рефанд без доказательств",
      product: "Товар",
      status: "Статус",
      yes: "Да",
      no: "Нет",
      unknown: "Неизвестно",
      undefined: "Не определено",
      notAvailable: "н/д",
      loading: "Загружаем сигналы товара..."
    }
  };
  // Decision logic (confirmed with Ksenia 2026-06-24).
  // SAFE = "Обработка по правилам": her approved list + the 3 *Disable twins whose
  // base codes are also safe (invalidPhoto/Name/SKU).
  const SAFE_INFRACTIONS = new Set([
    "missingSize", "missingColor", "irrelevantVariantPhoto", "invalidPhoto", "abusiveContent",
    "brokenPhoto", "separateSizeAndColor", "duplicate", "unclearProductsNumber", "prohibitedOnJoom",
    "thirdPartyUrl", "invalidSKU", "notEnglish", "productLimitReached", "invalidName",
    "imageCopyright", "merchantProtectedBrand", "patent", "manipulativePricing", "contactInfo",
    "otherWarning", "violatesStyle", "inappropriateElements", "sensitiveContent", "notEnoughInfo",
    "permissionRequired", "contradiction", "brandUsage", "needCertificate", "descriptionCopyright",
    "irrelevant", "inappropriate", "incorrectDangerKind", "superfluousInfo", "replica",
    "brandNotFilled", "shippingDimNotClear", "lowQualityPhoto", "watermarkedPhoto", "wideFramePhoto",
    "unclearDimensions", "unclearContent", "noMaterials", "notMatchColor", "notMatchSize",
    "prohibitedMentions", "eroticism", "violence", "dubiousAction", "medicalProduct",
    "smokingProduct", "foodProduct", "unsafeProduct", "mandatoryInfo", "animalHarm",
    "terroristContent", "environDamage", "illegalOrganizations", "childAbuse", "tradeSecret",
    "geoIndicator", "hateSpeach", "discrimination", "defamation", "womenDeepfake",
    "noncompliancePrice", "consumerRight", "tradersInfo", "hiddenCommerce", "animalSales",
    "glueRodentTraps", "disordersEating", "otherDisable", "other", "selfMutilation",
    "suicide", "deepfake",
    "invalidPhotoDisable", "invalidNameDisable", "invalidSKUDisable"
  ]);
  // REFUND = "Рефанд без доказательств": the known serious reasons.
  const REFUND_INFRACTIONS = new Set([
    "counterfeit", "counterfeitV2", "copyright", "copyrightV2", "designCopyright",
    "containsProhibitedBrand", "unauthorizedBrand", "badQuality", "misleadingInfo", "productSubstitution",
    "notMatchBrand", "wrongMaterials", "forbiddenProduct", "illegalProduct", "inconsistentProduct",
    "invalidSizeTable", "invalidDescription", "sizeDoesNotMatchSizeTable",
    "invalidSizeTableDisable", "invalidDescriptionDisable", "misleadingInfoDisable"
  ]);

  // hasActiveVersion=Нет + serious infraction -> refund; in either list/ok/active -> process;
  // anything unrecognized -> Unknown (so new codes never silently become a refund suggestion).
  function computeDecision(product) {
    if (product.hasActiveVersion === true) {
      return { label: t("processByRules"), state: "neutral" };
    }
    const code = product.reviewInfraction;
    if (!code || code === "ok" || code === "undefined") {
      return { label: t("processByRules"), state: "neutral" };
    }
    if (SAFE_INFRACTIONS.has(code)) return { label: t("processByRules"), state: "neutral" };
    if (REFUND_INFRACTIONS.has(code)) return { label: t("refundNoProof"), state: "ok" };
    return { label: t("unknown"), state: "alert" };
  }

  const SECTION_TEXTS = {
    payment: ["PAYMENT", "ОПЛАТА"],
    review: ["REVIEW", "ОТЗЫВЫ", "ОТЗЫВ"],
    refund: ["REFUND", "ВОЗВРАТ"]
  };
  const PRODUCT_CARD_TEXTS = {
    quantity: ["Quantity:", "Количество:"],
    sku: ["SKU:"],
    merchant: ["Merchant:", "Продавец:"]
  };
  const ACTION_TEXTS = {
    sendInfoMail: ["Send Info Mail", "Отправить Email с информацией", "Отправить Email"]
  };

  let lastUrl = "";
  let currentAbortController = null;
  let targetCounter = 0;
  const panelState = new WeakMap();

  function detectLocale() {
    if (window.ExtLocale && window.ExtLocale.detect) return window.ExtLocale.detect();
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

  function t(key) {
    const locale = detectLocale();
    return LABELS[locale]?.[key] || LABELS.en[key] || key;
  }

  function displayModerationState(state) {
    if (!state) return t("unknown");
    const locale = detectLocale();
    return MODERATION_STATE_LABELS[locale]?.[state] || state;
  }

  function getAcceptLanguage() {
    return detectLocale() === "ru" ? "ru-RU,ru;q=0.9,en;q=0.8" : "en-US,en;q=0.9";
  }

  function includesAny(text, candidates) {
    return candidates.some((candidate) => text.includes(candidate));
  }

  function getTargetKey(container, productId) {
    if (!container.dataset.jahTargetKey) {
      targetCounter += 1;
      container.dataset.jahTargetKey = `${productId}-${targetCounter}`;
    }
    return container.dataset.jahTargetKey;
  }

  function createAgentPanel(id, dataset) {
    const existing = document.getElementById(id);
    if (existing && !panelState.has(existing)) {
      existing.remove();
    }

    let panel = document.getElementById(id);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = id;
      panel.className = "jah-agent-section";
      Object.assign(panel.dataset, dataset);
      setupPanelShadow(panel);
    } else {
      Object.assign(panel.dataset, dataset);
      updatePanelTitle(panel);
    }

    return panel;
  }

  function setupPanelShadow(panel) {
    panel.replaceChildren();

    const shadow = panel.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = PANEL_STYLES;

    const title = document.createElement("div");
    title.className = "jah-section-title";
    title.textContent = t("sectionTitle");

    const body = document.createElement("div");
    body.className = "jah-section-body";

    shadow.append(style, title, body);
    panelState.set(panel, { title, body });
  }

  function updatePanelTitle(panel) {
    const state = panelState.get(panel);
    if (state) state.title.textContent = t("sectionTitle");
  }

  function getOrderIdFromUrl() {
    const match = location.pathname.match(/^\/orders\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function getProductIdFromUrlOrLinks() {
    const fromUrl = location.pathname.match(/^\/products\/([a-f0-9]{24})(?:\/|$)/i);
    if (fromUrl) return fromUrl[1];

    for (const link of getProductLinks()) {
      const href = link.href || "";
      const productMatch = href.match(/(?:support\.joom\.it)?\/products\/([a-f0-9]{24})(?:[/?#]|$)/i);
      if (productMatch) return productMatch[1];
    }

    return null;
  }

  function getProductLinks() {
    const links = [...document.querySelectorAll("a[href*='/products/']")]
      .filter((link) => /(?:support\.joom\.it)?\/products\/[a-f0-9]{24}/i.test(link.href || ""));
    const adminLinks = links.filter((link) => {
      const text = (link.innerText || link.textContent || "").replace(/\s+/g, " ").trim();
      return text === "Admin/Joom" || text === "Админка/Joom";
    });
    return adminLinks.length ? adminLinks : links;
  }

  function getBabyloneProductTargets() {
    const targets = [];
    const seen = new Set();

    for (const link of getProductLinks()) {
      const href = link.href || "";
      const productMatch = href.match(/(?:support\.joom\.it)?\/products\/([a-f0-9]{24})(?:[/?#]|$)/i);
      if (!productMatch) continue;

      const productId = productMatch[1];
      const container = findProductDetailsContainer(link);
      if (!container) continue;

      const text = container.innerText || "";
      const hasProductDetails = includesAny(text, PRODUCT_CARD_TEXTS.sku)
        && includesAny(text, PRODUCT_CARD_TEXTS.quantity)
        && includesAny(text, PRODUCT_CARD_TEXTS.merchant);
      if (!hasProductDetails) continue;

      const key = getTargetKey(container, productId);
      if (seen.has(key)) continue;
      seen.add(key);

      targets.push({
        key,
        productId,
        anchor: link,
        container
      });
    }

    return targets;
  }

  async function postJson(path, body, signal) {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": getAcceptLanguage(),
        "content-type": "application/json"
      },
      body: JSON.stringify(body || {}),
      signal
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${path} failed with ${response.status}: ${text.slice(0, 300)}`);
    }
    return data;
  }

  function removeFloatingPanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function isBabyloneTicketPage() {
    return location.hostname === "babylone.joom.it"
      && (location.pathname === "/app/tickets" || location.pathname.startsWith("/app/tickets/"));
  }

  function isVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function findTextElement(text) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.includes(text)) continue;
      const element = node.parentElement;
      if (element && isVisibleElement(element)) return element;
    }
    return null;
  }

  function findFirstTextElement(texts) {
    for (const text of texts) {
      const element = findTextElement(text);
      if (element) return { element, text };
    }
    return null;
  }

  function findCompactAncestor(element, requiredText) {
    let current = element;
    let best = element;
    while (current && current !== document.body) {
      const text = current.innerText || "";
      if (!text.includes(requiredText)) break;
      if (text.length < 180) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function findBabyloneInsertionPoint(target) {
    const { container } = target;
    const payment = findFirstTextElementNear(container, SECTION_TEXTS.payment);
    if (payment) return { mode: "before", target: findSectionTitleElement(payment.element, payment.text) };

    const review = findFirstTextElementNear(container, SECTION_TEXTS.review);
    if (review) return { mode: "before", target: findSectionTitleElement(review.element, review.text) };

    const actionButton = findFirstTextElementNear(container, ACTION_TEXTS.sendInfoMail);
    if (actionButton) return { mode: "after", target: findCompactAncestor(actionButton.element, actionButton.text) };

    return { mode: "append", target: container };
  }

  function findSectionTitleElement(element, text) {
    let current = element;
    let best = element;
    while (current && current !== document.body) {
      const content = (current.innerText || "").trim();
      if (!content.includes(text)) break;
      if (content.length <= 80) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function findProductDetailsContainer(anchor) {
    let current = anchor;
    let best = null;

    while (current && current !== document.body) {
      const text = current.innerText || "";
      const hasProductDetails = includesAny(text, PRODUCT_CARD_TEXTS.sku)
        && includesAny(text, PRODUCT_CARD_TEXTS.merchant)
        && includesAny(text, PRODUCT_CARD_TEXTS.quantity);
      const hasOrderSections = [...SECTION_TEXTS.payment, ...SECTION_TEXTS.refund].some((sectionText) => text.includes(sectionText));
      const isReasonableSize = text.length < 9000;

      if (!best && hasProductDetails && isReasonableSize) {
        best = current;
      }

      if (hasProductDetails && hasOrderSections && isReasonableSize) {
        best = current;
        break;
      }

      current = current.parentElement;
    }

    return best;
  }

  function findTextElementNear(root, text) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.includes(text)) continue;
      const element = node.parentElement;
      if (element && isVisibleElement(element)) return element;
    }
    return null;
  }

  function findFirstTextElementNear(root, texts) {
    for (const text of texts) {
      const element = findTextElementNear(root, text);
      if (element) return { element, text };
    }
    return null;
  }

  function createInlinePanel(target) {
    const { key, productId } = target;
    const panelId = `${PANEL_ID}-${key}`;
    const panel = createAgentPanel(panelId, {
      productId,
      targetKey: key
    });

    const insertion = findBabyloneInsertionPoint(target);
    if (insertion.mode === "after") {
      insertion.target.insertAdjacentElement("afterend", panel);
    } else if (insertion.mode === "append") {
      insertion.target.appendChild(panel);
    } else {
      insertion.target.insertAdjacentElement("beforebegin", panel);
    }
    return panel;
  }

  function setPanelBody(panel, content) {
    const state = panelState.get(panel);
    if (!state) return;
    state.body.replaceChildren(content);
  }

  function textSpan(value, className) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = String(value ?? "");
    return span;
  }

  function pill(value, state) {
    return textSpan(value, `jah-pill jah-${state}`);
  }

  function row(key, value) {
    const rowElement = document.createElement("div");
    rowElement.className = "jah-row";

    const keyElement = document.createElement("div");
    keyElement.className = "jah-key";
    keyElement.textContent = String(key ?? "");

    const valueElement = document.createElement("div");
    valueElement.className = "jah-value";
    if (value instanceof Node) {
      valueElement.append(value);
    } else {
      valueElement.textContent = String(value ?? "");
    }

    rowElement.append(keyElement, valueElement);
    return rowElement;
  }

  function normalizeInfraction(infraction, dictionary) {
    if (!infraction || infraction === "undefined") {
      return { code: null, label: t("undefined"), state: "neutral" };
    }

    if (infraction === "ok") {
      return { code: "ok", label: t("reviewOk"), state: "ok" };
    }

    const metadata = dictionary.find((item) => item.reviewInfraction === infraction);
    const label = metadata?.moderationDescription || infraction;

    return { code: infraction, label, state: "bad" };
  }

  function renderData({ orderId, productId, product, reviewCount, infractions }, panel) {
    const hasActiveVersion = product.hasActiveVersion === true;
    const infraction = normalizeInfraction(product.reviewInfraction, infractions || []);
    const moderationState = displayModerationState(product.moderationState);
    const moderationStyle = MODERATION_STATE_STYLE[product.moderationState] || (product.moderationState ? "neutral" : "warn");
    const rating = typeof product.rating === "number" ? product.rating.toFixed(2) : t("notAvailable");
    const ratingsCount = typeof product.ratingsCount === "number" ? product.ratingsCount : t("notAvailable");
    const count = typeof reviewCount === "number" ? reviewCount : ratingsCount;
    const decision = computeDecision(product);

    const fragment = document.createDocumentFragment();
    [
      row(t("hasActiveVersion"), pill(hasActiveVersion ? t("yes") : t("no"), hasActiveVersion ? "ok" : "bad")),
      row(t("moderationState"), pill(moderationState, moderationStyle)),
      row(
        t("reviewInfraction"),
        pill(infraction.label, infraction.state)
      ),
      row(t("decision"), pill(decision.label, decision.state)),
      row(t("rating"), rating),
      row(t("reviewsCount"), count)
    ].forEach((element) => fragment.append(element));

    setPanelBody(panel, fragment);
  }

  function renderPanelLoading(panel, productId) {
    const fragment = document.createDocumentFragment();
    fragment.append(
      row(t("product"), textSpan(productId, "jah-muted")),
      row(t("status"), textSpan(t("loading"), "jah-muted"))
    );
    setPanelBody(panel, fragment);
  }

  function renderPanelError(panel, productId, error) {
    const fragment = document.createDocumentFragment();
    const errorElement = document.createElement("div");
    errorElement.className = "jah-error";
    errorElement.textContent = String(error.message || error);
    fragment.append(
      row(t("product"), textSpan(productId, "jah-muted")),
      errorElement
    );
    setPanelBody(panel, fragment);
  }

  async function resolvePageContext(signal) {
    const orderId = getOrderIdFromUrl();
    const productIdFromPage = getProductIdFromUrlOrLinks();

    if (orderId) {
      const orderResponse = await postJson("/orders/get", {
        count: 1,
        query: { id: { $in: [orderId] } }
      }, signal);
      const order = orderResponse?.items?.[0];
      const productId = order?.productInfo?.productId || productIdFromPage;
      if (!productId) {
        throw new Error("Order loaded, but productInfo.productId was not present.");
      }
      return { orderId, productId };
    }

    if (productIdFromPage) {
      return { orderId: null, productId: productIdFromPage };
    }

    throw new Error("Could not find an order id or product id on this page.");
  }

  async function loadForCurrentPage(force) {
    if (isBabyloneTicketPage()) {
      await loadBabyloneProducts(force);
      return;
    }

    removeFloatingPanel();
    // The Agent Info panel is for agents in Babylone. The Support Console
    // (support.joom.it) already shows this data natively, so don't inject the
    // panel on /orders/ pages there.
    if (location.hostname !== "babylone.joom.it") return;
    const orderId = getOrderIdFromUrl();
    if (!orderId) return;
    const signature = `${location.href}::${detectLocale()}`;
    if (!force && lastUrl === signature) return;
    lastUrl = signature;

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const { signal } = currentAbortController;

    const panel = createSupportOrderPanel(orderId);
    renderPanelLoading(panel, orderId);

    try {
      const context = await resolvePageContext(signal);
      const { productId } = context;

      const [productResponse, reviewCountResponse, infractionsResponse] = await Promise.all([
        postJson("/products/get/", {
          count: 1,
          query: { id: { $in: [productId] } }
        }, signal),
        postJson("/productReviews/getCount/", {
          query: { productId }
        }, signal).catch(() => ({ count: undefined })),
        postJson("/moderate/infractions/list/", {}, signal).catch(() => ({ items: [] }))
      ]);

      const product = productResponse?.items?.[0];
      if (!product) {
        throw new Error("Product endpoint returned no product.");
      }

      renderData({
        orderId: context.orderId,
        productId,
        product,
        reviewCount: reviewCountResponse?.count,
        infractions: infractionsResponse?.items || []
      }, panel);
    } catch (error) {
      if (error.name !== "AbortError") {
        renderPanelError(panel, orderId, error);
      }
    }
  }

  function createSupportOrderPanel(orderId) {
    const panelId = `${PANEL_ID}-support-${orderId}`;
    const panel = createAgentPanel(panelId, { orderId });

    const target = findSupportInsertionPoint();
    if (target) {
      target.insertAdjacentElement("beforebegin", panel);
    }

    return panel;
  }

  function findSupportInsertionPoint() {
    const payment = findFirstTextElement(SECTION_TEXTS.payment);
    if (payment) return findSectionTitleElement(payment.element, payment.text);

    const review = findFirstTextElement(SECTION_TEXTS.review);
    if (review) return findSectionTitleElement(review.element, review.text);

    return document.querySelector("main") || document.body;
  }

  async function loadBabyloneProducts(force) {
    document.documentElement.classList.add("jah-on-babylone");
    const targets = getBabyloneProductTargets();
    if (!targets.length) return;

    const signature = `${location.href}::${detectLocale()}::${targets.map((target) => target.key).join(",")}`;
    if (!force && lastUrl === signature) return;
    lastUrl = signature;

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const { signal } = currentAbortController;

    removeFloatingPanel();

    document.querySelectorAll(".joom-agent-helper-panel[data-product-id], .jah-agent-section[data-product-id]").forEach((panel) => {
      if (!targets.some((target) => target.key === panel.dataset.targetKey)) {
        panel.remove();
      }
    });

    const infractionsPromise = postJson("/moderate/infractions/list/", {}, signal)
      .then((response) => response?.items || [])
      .catch(() => []);

    const productDataCache = new Map();

    function getProductData(productId) {
      if (!productDataCache.has(productId)) {
        productDataCache.set(productId, Promise.all([
          postJson("/products/get/", {
            count: 1,
            query: { id: { $in: [productId] } }
          }, signal),
          postJson("/productReviews/getCount/", {
            query: { productId }
          }, signal).catch(() => ({ count: undefined })),
          infractionsPromise
        ]));
      }
      return productDataCache.get(productId);
    }

    await Promise.all(targets.map(async (target) => {
      const { productId } = target;
      const panel = createInlinePanel(target);
      renderPanelLoading(panel, productId);

      try {
        const [productResponse, reviewCountResponse, infractions] = await getProductData(productId);

        const product = productResponse?.items?.[0];
        if (!product) {
          throw new Error("Product endpoint returned no product.");
        }

        renderData({
          orderId: "From Babylone product link",
          productId,
          product,
          reviewCount: reviewCountResponse?.count,
          infractions
        }, panel);
      } catch (error) {
        if (error.name !== "AbortError") {
          renderPanelError(panel, productId, error);
        }
      }
    }));
  }

  function watchSpaNavigation() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      queueMicrotask(() => loadForCurrentPage(false));
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      queueMicrotask(() => loadForCurrentPage(false));
      return result;
    };

    window.addEventListener("popstate", () => loadForCurrentPage(false));
    setInterval(() => loadForCurrentPage(false), 1500);
  }

  removeFloatingPanel();
  watchSpaNavigation();
  loadForCurrentPage(true);
})();
