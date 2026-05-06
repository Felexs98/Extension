(function () {
  let sheetCaseDraftKey = null;
  let sheetCaseDraftData = {};
  let initialized = false;

  function init(deps = {}) {
    const {
      buildSheetHyperlinkFormula,
      buildSheetMultiOrderHyperlinkFormula,
      parseSheetHyperlinkFormula,
      extractOrderIdFromOrderCellValue,
      buildSheetRowLink,
      parseMongoIdFromOrderHref,
      ticketIdFromHref,
      getOrderIdFromURL,
      getOrderIdFromDOM,
      getCurrentTicketLinkUrl,
      loadAgentSelfDisplayName,
      loadOrderData,
      loadMerchantData,
      loadReturnAddressPhone,
      sendRuntimeMessageAsync
    } = deps;

    if (
      typeof buildSheetHyperlinkFormula !== "function" ||
      typeof parseMongoIdFromOrderHref !== "function" ||
      typeof sendRuntimeMessageAsync !== "function"
    ) {
      return;
    }

    function getMerchantLinkUrlFromContainer(container) {
      const a = container.querySelector('a[href*="/merchants/"]');
      return a?.href || "";
    }

    function getMerchantIdFromOrderData(orderData) {
      return orderData?.merchantId || orderData?.items?.[0]?.merchantId || "";
    }

    function getMerchantUrlFromOrderData(orderData) {
      const merchantId = getMerchantIdFromOrderData(orderData);
      if (!merchantId) return "";
      return "https://support.joom.it/merchants/" + merchantId;
    }

    async function sendReturnNoteToOrder(orderId, body) {
      if (!orderId || !body) return;
      try {
        await fetch("https://api-support.joom.it/1.0/orderComments/create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: [orderId], body })
        });
      } catch {}
    }

    function toRuDateFromIso(isoDate) {
      if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "";
      const [y, m, d] = isoDate.split("-");
      return d + "." + m + "." + y;
    }

    function normalizeSheetCaseContextKey(ticketUrl, orderUrl) {
      const t = ticketIdFromHref(ticketUrl) || String(ticketUrl || "");
      const o = parseMongoIdFromOrderHref(orderUrl) || String(orderUrl || "");
      return t + "::" + o;
    }

    function openSheetCaseModal(prefill = {}, contextKey = "") {
      const old = document.getElementById("jl-sheet-case-overlay");
      if (old) old.remove();

      if (contextKey && sheetCaseDraftKey !== contextKey) {
        sheetCaseDraftKey = contextKey;
        sheetCaseDraftData = {};
      }
      const initialData =
        contextKey && sheetCaseDraftKey === contextKey
          ? { ...prefill, ...sheetCaseDraftData }
          : { ...prefill };

      const overlay = document.createElement("div");
      overlay.id = "jl-sheet-case-overlay";
      overlay.className = "sheet-overlay";
      const card = document.createElement("div");
      card.className = "sheet-card";
      const title = document.createElement("div");
      title.textContent = "Отправка кейса в Google Таблицу";
      title.className = "sheet-title";

      const status = document.createElement("div");
      status.className = "sheet-status";
      const sheetTargets = ["Eврокитайские возвраты", "Подозрительные возвраты"];
      const sheetWrap = document.createElement("div");
      sheetWrap.className = "sheet-wrap";
      const sheetLabel = document.createElement("div");
      sheetLabel.textContent = "Куда отправить";
      sheetLabel.className = "sheet-label";
      const sheetSelect = document.createElement("select");
      sheetSelect.className = "sheet-select";
      sheetTargets.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sheetSelect.appendChild(opt);
      });
      const draftSheetName = String(initialData.sheetName || "").trim();
      if (draftSheetName && sheetTargets.includes(draftSheetName)) {
        sheetSelect.value = draftSheetName;
      }
      sheetSelect.addEventListener("change", () => {
        sheetCaseDraftData.sheetName = sheetSelect.value || "";
      });
      sheetWrap.appendChild(sheetLabel);
      sheetWrap.appendChild(sheetSelect);

      chrome.storage.local.get(["sheetTargetName"], cfg => {
        const fromStorage = String(cfg.sheetTargetName || "").trim();
        if (!draftSheetName && fromStorage && sheetTargets.includes(fromStorage)) {
          sheetSelect.value = fromStorage;
        }
      });

      const todayIso = new Date().toISOString().slice(0, 10);
      const selectedOrderItems = [];

      const addOrderItem = order => {
        if (!order?.id) return;
        if (selectedOrderItems.some(o => o.id === order.id)) return;
        const orderUrl = order.url || "https://support.joom.it/orders/" + order.id;
        const label = order.friendlyId || order.id;
        selectedOrderItems.push({
          id: order.id,
          friendlyId: label,
          url: orderUrl,
          formula: buildSheetHyperlinkFormula(orderUrl, label)
        });
      };

      const initialOrderParsed = parseSheetHyperlinkFormula(initialData.orderUrl || "");
      const initialOrderHref = initialOrderParsed?.url || String(initialData.orderUrl || "");
      const initialOrderId = parseMongoIdFromOrderHref(initialOrderHref);
      if (initialOrderId) {
        addOrderItem({
          id: initialOrderId,
          friendlyId: initialOrderParsed?.label || initialOrderId,
          url: initialOrderHref
        });
      }

      const mkInput = (label, key, opts = {}) => {
        const { isArea = false, inputType = "text", max = "", selectOptions = null, displayAsLink = false } = opts;
        const wrap = document.createElement("div");
        wrap.className = "sheet-input-wrap";
        const l = document.createElement("div");
        l.textContent = label;
        l.className = "sheet-input-label";
        const initialValue = initialData[key] || "";

        if (!isArea && displayAsLink) {
          const parsed = parseSheetHyperlinkFormula(initialValue);
          const linkUrl = parsed?.url || "";
          const linkLabel = parsed?.label || initialValue || "—";

          const row = document.createElement("div");
          row.className = "sheet-link-row";
          const text = document.createElement("input");
          text.type = "text";
          text.value = linkLabel;
          text.readOnly = true;
          text.className = "sheet-link-text";
          const open = document.createElement("a");
          open.textContent = "Открыть";
          open.href = linkUrl || "#";
          open.target = "_blank";
          open.rel = "noopener noreferrer";
          open.className = "sheet-link-open";
          if (!linkUrl) {
            open.style.pointerEvents = "none";
            open.style.opacity = "0.5";
          }
          row.appendChild(text);
          row.appendChild(open);
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.setAttribute("data-key", key);
          hidden.value = initialValue;
          wrap.appendChild(l);
          wrap.appendChild(row);
          wrap.appendChild(hidden);
          return wrap;
        }

        const inp = isArea
          ? document.createElement("textarea")
          : (Array.isArray(selectOptions) ? document.createElement("select") : document.createElement("input"));
        inp.setAttribute("data-key", key);
        if (!isArea && Array.isArray(selectOptions)) {
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "—";
          inp.appendChild(empty);
          selectOptions.forEach(v => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = v;
            inp.appendChild(opt);
          });
        } else {
          inp.value = initialValue;
        }
        if (!isArea && !Array.isArray(selectOptions)) inp.type = inputType;
        if (!isArea && !Array.isArray(selectOptions) && max) inp.max = max;
        if (!isArea && Array.isArray(selectOptions)) inp.value = initialData[key] || "";
        inp.addEventListener("input", () => {
          sheetCaseDraftData[key] = inp.value || "";
        });
        inp.addEventListener("change", () => {
          sheetCaseDraftData[key] = inp.value || "";
        });
        inp.className = "sheet-input";
        if (isArea) inp.rows = 2;
        wrap.appendChild(l);
        wrap.appendChild(inp);
        return wrap;
      };

      const grid = document.createElement("div");
      grid.className = "sheet-grid";
      [
        ["Запрос от", "requestFrom", {}],
        ["Первоначальная дата обращения пользователя", "firstUserContactDate", { inputType: "date", max: todayIso }],
        ["Ссылка на тикет", "ticketUrl", {}],
        ["Ссылка на мерчанта", "merchantUrl", { displayAsLink: true }],
        ["Трек-номер", "trackingNumber", {}],
        ["Ссылка на отслеживание от юзера", "userTrackingUrl", {}],
        ["Дата отправки", "shipDate", { inputType: "date", max: todayIso }],
        ["Подтверждение получения от мерчанта", "merchantReceiveConfirm", {}],
        ["Return reason", "returnReason", { selectOptions: ["Желание юзера (отправка за его счёт)", "Дефект товара (компенсация баллами/лейбл)", "Дефект товара (отправка в офис)"] }],
        ["Пояснение причины \"Желание юзера\"", "userWishReasonComment", {}],
        ["Заносился ли кейс ранее", "wasLoggedBefore", {}]
      ].forEach(([label, key, opts]) => grid.appendChild(mkInput(label, key, opts)));

      const ordersWrap = document.createElement("div");
      ordersWrap.className = "sheet-orders-wrap";
      const ordersHead = document.createElement("div");
      ordersHead.className = "sheet-orders-head";
      const ordersLabel = document.createElement("div");
      ordersLabel.textContent = "Заказ";
      ordersLabel.className = "sheet-label";
      const addOrderBtn = document.createElement("button");
      addOrderBtn.type = "button";
      addOrderBtn.textContent = "+";
      addOrderBtn.title = "Добавить заказ";
      addOrderBtn.className = "sheet-add-order-btn";
      ordersHead.appendChild(ordersLabel);
      ordersHead.appendChild(addOrderBtn);

      const selectedOrdersBox = document.createElement("div");
      selectedOrdersBox.className = "sheet-selected-orders";
      const candidatesBox = document.createElement("div");
      candidatesBox.className = "sheet-candidates";

      const renderSelectedOrders = () => {
        selectedOrdersBox.innerHTML = "";
        if (!selectedOrderItems.length) {
          const empty = document.createElement("div");
          empty.textContent = "Заказы не выбраны";
          empty.className = "sheet-muted";
          selectedOrdersBox.appendChild(empty);
          return;
        }
        selectedOrderItems.forEach(order => {
          const row = document.createElement("div");
          row.className = "sheet-order-row";
          const label = document.createElement("span");
          label.textContent = order.friendlyId || order.id;
          label.className = "sheet-order-name";
          const remove = document.createElement("button");
          remove.type = "button";
          remove.textContent = "Удалить";
          remove.className = "sheet-remove-btn";
          remove.onclick = () => {
            const idx = selectedOrderItems.findIndex(o => o.id === order.id);
            if (idx >= 0) selectedOrderItems.splice(idx, 1);
            renderSelectedOrders();
            const cb = candidatesBox.querySelector("input[data-order-id='" + order.id + "']");
            if (cb) cb.checked = false;
          };
          row.appendChild(label);
          row.appendChild(remove);
          selectedOrdersBox.appendChild(row);
        });
      };

      const loadCandidateOrders = async () => {
        candidatesBox.innerHTML = "";
        const titleEl = document.createElement("div");
        titleEl.textContent = "Выбери заказы из этого тикета (только тот же мерчант)";
        titleEl.className = "sheet-candidate-title";
        candidatesBox.appendChild(titleEl);
        const expectedMerchantId = String(initialData.orderMerchantId || "").trim();
        const orderLinks = Array.from(document.querySelectorAll("a[href*='/orders/']"));
        const seen = new Set();
        const candidateIds = [];
        orderLinks.forEach(a => {
          const id = parseMongoIdFromOrderHref(a.href || "");
          if (!id || seen.has(id)) return;
          seen.add(id);
          candidateIds.push(id);
        });
        if (!candidateIds.length) {
          const none = document.createElement("div");
          none.textContent = "В тикете не найдены заказы.";
          none.className = "sheet-muted";
          candidatesBox.appendChild(none);
          return;
        }
        const rows = await Promise.all(candidateIds.map(async id => {
          try {
            const orderData = await loadOrderData({ id });
            const merchantId = getMerchantIdFromOrderData(orderData) || "";
            if (expectedMerchantId && merchantId !== expectedMerchantId) return null;
            const friendlyId = orderData?.friendlyId || id;
            return { id, friendlyId, url: "https://support.joom.it/orders/" + id };
          } catch {
            return null;
          }
        }));
        const filtered = rows.filter(Boolean);
        if (!filtered.length) {
          const none = document.createElement("div");
          none.textContent = "Подходящих заказов того же мерчанта не найдено.";
          none.className = "sheet-muted";
          candidatesBox.appendChild(none);
          return;
        }
        filtered.forEach(order => {
          const row = document.createElement("label");
          row.className = "sheet-candidate-row";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.setAttribute("data-order-id", order.id);
          cb.checked = selectedOrderItems.some(o => o.id === order.id);
          const text = document.createElement("span");
          text.textContent = order.friendlyId;
          cb.addEventListener("change", () => {
            if (cb.checked) addOrderItem(order);
            else {
              const idx = selectedOrderItems.findIndex(o => o.id === order.id);
              if (idx >= 0) selectedOrderItems.splice(idx, 1);
            }
            renderSelectedOrders();
          });
          row.appendChild(cb);
          row.appendChild(text);
          candidatesBox.appendChild(row);
        });
      };

      addOrderBtn.onclick = async () => {
        const isHidden = getComputedStyle(candidatesBox).display === "none";
        candidatesBox.style.display = isHidden ? "block" : "none";
        if (isHidden && !candidatesBox.dataset.loaded) {
          addOrderBtn.disabled = true;
          await loadCandidateOrders();
          candidatesBox.dataset.loaded = "1";
          addOrderBtn.disabled = false;
        }
      };

      renderSelectedOrders();
      ordersWrap.appendChild(ordersHead);
      ordersWrap.appendChild(selectedOrdersBox);
      ordersWrap.appendChild(candidatesBox);

      const address = mkInput("Адрес мерчанта", "merchantAddress", { isArea: true });
      const comment = mkInput("Комментарий (если требуется)", "comment", { isArea: true });
      const noteWrap = document.createElement("label");
      noteWrap.className = "sheet-note-wrap";
      const noteCb = document.createElement("input");
      noteCb.type = "checkbox";
      noteCb.checked = true;
      const noteText = document.createElement("span");
      noteText.textContent = "Добавить в заметку";
      noteWrap.appendChild(noteCb);
      noteWrap.appendChild(noteText);

      const btnRow = document.createElement("div");
      btnRow.className = "sheet-btn-row";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Отмена";
      cancel.className = "sheet-btn-cancel";
      const send = document.createElement("button");
      send.type = "button";
      send.textContent = "Отправить";
      send.className = "sheet-btn-send";

      cancel.onclick = () => overlay.remove();
      send.onclick = async () => {
        send.disabled = true;
        try {
          const inputs = overlay.querySelectorAll("[data-key]");
          const payload = {};
          inputs.forEach(el => {
            const key = el.getAttribute("data-key");
            let value = el.value || "";
            if (key === "firstUserContactDate" || key === "shipDate") value = toRuDateFromIso(value);
            payload[key] = value;
          });
          payload.f = new Date().toLocaleDateString("ru-RU");
          if (selectedOrderItems.length) {
            payload.orderLinks = selectedOrderItems.map(o => ({ id: o.id, label: o.friendlyId || o.id, url: o.url }));
            payload.orderUrl = buildSheetMultiOrderHyperlinkFormula(selectedOrderItems);
            if (!payload.orderUrl) payload.orderUrl = selectedOrderItems.map(o => o.friendlyId + ": " + o.url).join("\n");
          }
          payload.sheetName = sheetSelect.value || sheetTargets[0];
          const cfg = await new Promise(resolve => chrome.storage.local.get(["sheetTestUrl", "sheetTestToken", "sheetDocUrl"], resolve));
          if (!cfg.sheetTestUrl || !cfg.sheetTestToken) {
            status.textContent = "Сначала укажи URL Apps Script и токен в настройках.";
            return;
          }
          payload.token = cfg.sheetTestToken;
          chrome.storage.local.set({ sheetTargetName: payload.sheetName });
          status.textContent = "Отправка...";
          const resp = await sendRuntimeMessageAsync({ type: "SHEET_POST", url: cfg.sheetTestUrl, payload }, 30000);
          if (resp.ok) {
            const rowNo = resp?.json?.row ?? resp?.json?.rowIndex ?? resp?.json?.rowNumber;
            const rowLinkFromApi = String(resp?.json?.rowUrl || "").trim();
            if (rowNo) {
              const rowLinkForStatus = rowLinkFromApi || buildSheetRowLink(cfg.sheetDocUrl, rowNo);
              if (rowLinkForStatus) {
                status.innerHTML = "";
                const text = document.createElement("span");
                text.textContent = "Успешно, строка ";
                const a = document.createElement("a");
                a.href = rowLinkForStatus;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.textContent = String(rowNo);
                a.className = "sheet-row-link";
                status.appendChild(text);
                status.appendChild(a);
              } else {
                status.textContent = "Успешно, строка " + rowNo;
              }
            } else {
              status.textContent = "Успешно";
            }
            const selectedOrderIds = Array.from(new Set(selectedOrderItems.map(o => o.id).filter(Boolean)));
            const fallbackOrderId = extractOrderIdFromOrderCellValue(String(payload.orderUrl || "").split("\n")[0] || "");
            if (!selectedOrderIds.length && fallbackOrderId) selectedOrderIds.push(fallbackOrderId);
            if (noteCb.checked && selectedOrderIds.length) {
              const rowLink = rowLinkFromApi || buildSheetRowLink(cfg.sheetDocUrl, rowNo);
              const noteBody = rowLink ? "Возврат " + rowLink : "Возврат";
              await Promise.all(selectedOrderIds.map(orderId => sendReturnNoteToOrder(orderId, noteBody)));
            }
            if (contextKey && sheetCaseDraftKey === contextKey) sheetCaseDraftData = {};
          } else {
            status.textContent = "Ошибка: " + (resp.status || "") + " " + (resp?.json?.error || resp.error || resp.text || "request failed");
          }
        } catch (e) {
          status.textContent = "Ошибка: " + (e?.message || String(e));
        } finally {
          send.disabled = false;
        }
      };

      btnRow.appendChild(cancel);
      btnRow.appendChild(send);
      card.appendChild(title);
      card.appendChild(sheetWrap);
      card.appendChild(grid);
      grid.appendChild(ordersWrap);
      card.appendChild(address);
      card.appendChild(comment);
      card.appendChild(noteWrap);
      card.appendChild(status);
      card.appendChild(btnRow);
      overlay.appendChild(card);
      overlay.addEventListener("click", e => {
        if (e.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    }

    function createSheetIconButton() {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jl-sheet-open-btn";
      btn.title = "Отправить кейс в Google Таблицу";
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#16a34a" d="M19 2H8c-1.1 0-2 .9-2 2v3h2V4h11v16H8v-3H6v3c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Z"/><path fill="#16a34a" d="M3 9h12v2H3zm0 4h12v2H3z"/></svg>';
      return btn;
    }

    function processSheetCaseContainer(container) {
      const orderAnchors = container.querySelectorAll('a.TijHv0zOOldWzA_Ck6tA[href*="/orders/"], a[href*="support.joom.it/orders/"]');
      orderAnchors.forEach(anchor => {
        const findActionButtonsBlock = () => {
          const panel = anchor.closest("div.Panel__panel__ao0AT") || container.closest("div.Panel__panel__ao0AT");
          if (panel) {
            const inPanel = panel.querySelector("div.VuFNRR_tldlLl8hs9O0L") || panel.querySelector('div[class*="VuFNRR_tldlLl8hs9O0L"]');
            if (inPanel) return inPanel;
          }
          const directByClass = container.querySelector("div.VuFNRR_tldlLl8hs9O0L") || container.querySelector('div[class*="VuFNRR_tldlLl8hs9O0L"]');
          if (directByClass) return directByClass;
          const scope = anchor.closest("div.wesSN81QRkBs9SczFpkT, div.urAePSnth3D9SQOm0KLQ") || container;
          const blocks = Array.from(scope.querySelectorAll("div"));
          return blocks.find(div => {
            const text = Array.from(div.querySelectorAll("button")).map(b => (b.textContent || "").trim()).join(" | ");
            return text.includes("Отменить заказ") && text.includes("Добавить заметку");
          }) || null;
        };
        const btnHost = findActionButtonsBlock();
        const scopeForExisting = anchor.closest("div.Panel__panel__ao0AT") || container.closest("div.Panel__panel__ao0AT") || container;
        if (!btnHost) {
          Array.from(scopeForExisting.querySelectorAll(".jl-sheet-open-btn")).forEach(btn => btn.remove());
          return;
        }
        const existingBtns = Array.from(scopeForExisting.querySelectorAll(".jl-sheet-open-btn"));
        if (existingBtns.length) {
          const keepBtn = existingBtns[0];
          if (keepBtn.parentElement !== btnHost) btnHost.appendChild(keepBtn);
          existingBtns.slice(1).forEach(btn => btn.remove());
          return;
        }
        if (btnHost.querySelector(".jl-sheet-open-btn")) return;

        const btn = createSheetIconButton();
        btn.addEventListener("click", async e => {
          e.preventDefault();
          e.stopPropagation();
          const requestFrom = await loadAgentSelfDisplayName();
          let merchantUrl = getMerchantLinkUrlFromContainer(container);
          let merchantAddress = "";
          let orderUrl = anchor.href || "";
          let orderMerchantId = "";
          try {
            let orderInfo = getOrderIdFromURL() || getOrderIdFromDOM(container);
            if (typeof orderInfo === "string") orderInfo = { id: orderInfo };
            if (orderInfo?.id) {
              const orderData = await loadOrderData(orderInfo);
              const orderId = orderData?.id || orderInfo.id;
              const friendlyId = orderData?.friendlyId || orderInfo.friendlyId || orderId;
              if (orderId) {
                orderUrl = buildSheetHyperlinkFormula("https://support.joom.it/orders/" + orderId, friendlyId);
              }
              const merchantId = getMerchantIdFromOrderData(orderData);
              orderMerchantId = merchantId || "";
              const merchantUrlRaw = getMerchantUrlFromOrderData(orderData) || merchantUrl;
              if (merchantId && merchantUrlRaw) {
                const merchant = await loadMerchantData(merchantId);
                const merchantName = merchant?.name || merchantId;
                merchantUrl = buildSheetHyperlinkFormula(merchantUrlRaw, merchantName);
                const returnPhoneData = await loadReturnAddressPhone(merchantId);
                const formatPhone = obj => window.ExtPhoneUtils?.formatPhoneFromObject?.(obj, "") || "";
                const addr = merchant?.returnAddress?.en || {};
                const parts = [
                  merchant?.returnAddress?.country ? "Country: " + merchant.returnAddress.country : "",
                  merchant?.returnAddress?.zipCode ? "ZIP: " + merchant.returnAddress.zipCode : "",
                  addr.region ? "Region: " + addr.region : "",
                  addr.city ? "City: " + addr.city : "",
                  addr.address ? "Address: " + addr.address : "",
                  addr.name ? "Recipient: " + addr.name : "",
                  formatPhone(returnPhoneData) ? "Phone number: " + formatPhone(returnPhoneData) : ""
                ].filter(Boolean);
                merchantAddress = parts.join("\n");
              } else {
                merchantUrl = merchantUrlRaw;
              }
            }
          } catch {}
          const ticketUrl = getCurrentTicketLinkUrl();
          openSheetCaseModal(
            { requestFrom, ticketUrl, orderUrl, orderMerchantId, merchantUrl, merchantAddress },
            normalizeSheetCaseContextKey(ticketUrl, anchor.href || "")
          );
        });
        btnHost.appendChild(btn);
      });
    }

    if (window._sheetCaseObserver) {
      window._sheetCaseObserver.disconnect();
      window._sheetCaseObserver = null;
    }
    function processContainers() {
      document.querySelectorAll("div.wesSN81QRkBs9SczFpkT, div.urAePSnth3D9SQOm0KLQ").forEach(processSheetCaseContainer);
    }
    processContainers();
    window._sheetCaseObserver = new MutationObserver(() => {
      clearTimeout(window._sheetCaseTimer);
      window._sheetCaseTimer = setTimeout(processContainers, 120);
    });
    window._sheetCaseObserver.observe(document.body, { childList: true, subtree: true });
    initialized = true;
  }

  function isInitialized() {
    return initialized;
  }

  function disable() {
    if (window._sheetCaseObserver) {
      window._sheetCaseObserver.disconnect();
      window._sheetCaseObserver = null;
    }
    document.querySelectorAll(".jl-sheet-open-btn").forEach(btn => btn.remove());
    document.getElementById("jl-sheet-case-overlay")?.remove();
  }

  window.ExtSheetCase = { init, isInitialized, disable };
})();
