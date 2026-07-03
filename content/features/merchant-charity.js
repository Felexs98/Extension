(function () {
  let deps = null;
  let merchantObserver = null;
  const tr = (en, ru) => (window.ExtLocale && window.ExtLocale.pick) ? window.ExtLocale.pick(en, ru) : en;

  function createSafeLine(label, value, copyOnClick = false) {
    const wrap = document.createElement("div");
    wrap.className = "merchant-line";
    const b = document.createElement("b");
    b.textContent = label + ": ";
    b.style.marginRight = "6px";
    const span = document.createElement("span");
    span.textContent = value || "—";
    wrap.appendChild(b);
    wrap.appendChild(span);
    if (copyOnClick) {
      wrap.style.cursor = "pointer";
      wrap.title = tr("Click to copy", "Нажмите, чтобы скопировать");
      wrap.style.transition = "background-color 0.18s ease, transform 0.12s ease";
      wrap.style.borderRadius = "6px";
      wrap.style.padding = "2px 4px";
      wrap.addEventListener("click", async () => {
        const textToCopy = String(value || "");
        if (!textToCopy) return;
        try {
          await navigator.clipboard?.writeText(textToCopy);
          const prevBg = wrap.style.backgroundColor;
          const prevTitle = wrap.title;
          wrap.style.backgroundColor = "rgba(34, 197, 94, 0.18)";
          wrap.style.transform = "scale(0.995)";
          wrap.title = tr("Copied", "Скопировано");
          setTimeout(() => {
            wrap.style.backgroundColor = prevBg;
            wrap.style.transform = "";
            wrap.title = prevTitle;
          }, 500);
        } catch {}
      });
    }
    return wrap;
  }

  function createReturnAddressLine(value, telValue) {
    const wrap = document.createElement("div");
    wrap.className = "merchant-line";
    const b = document.createElement("b");
    b.textContent = tr("Return Address: ", "Адрес возврата: ");
    b.style.marginRight = "6px";
    const span = document.createElement("span");
    const full = String(value || "");
    const telText = telValue ? `Tel: ${telValue}` : "";
    const idx = telText ? full.lastIndexOf(telText) : -1;
    if (idx >= 0) {
      const before = full.slice(0, idx);
      const telSuffix = full.slice(idx);
      if (before) span.appendChild(document.createTextNode(before));
      const telEl = document.createElement("span");
      telEl.textContent = telSuffix;
      telEl.style.cursor = "pointer";
      telEl.style.textDecoration = "underline";
      telEl.title = tr("Click to copy phone", "Скопировать телефон");
      telEl.addEventListener("click", async e => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard?.writeText(String(telValue || ""));
          const prevBg = telEl.style.backgroundColor;
          const prevTitle = telEl.title;
          telEl.style.backgroundColor = "rgba(34, 197, 94, 0.18)";
          telEl.title = tr("Copied", "Скопировано");
          setTimeout(() => {
            telEl.style.backgroundColor = prevBg;
            telEl.title = prevTitle;
          }, 500);
        } catch {}
      });
      span.appendChild(telEl);
    } else {
      span.textContent = full || "—";
    }
    wrap.appendChild(b);
    wrap.appendChild(span);
    return wrap;
  }

  function createTitleLine(label) {
    const div = document.createElement("div");
    div.className = "merchant-title-line";
    div.textContent = label;
    return div;
  }

  function createEmptyLine() {
    const div = document.createElement("div");
    div.style.height = "6px";
    return div;
  }

  function getCurrentUserId() {
    const userLink =
      document.querySelector('div.Fb8YGqn0TKfpVYuyhiq2 a[href*="/users/"]') ||
      document.querySelector('a[href*="/users/"]');
    if (userLink) {
      const m = userLink.href.match(/\/users\/([a-f0-9]{8,32})/i);
      if (m) return m[1];
    }
    const devicesLink = document.querySelector(
      'span[data-testid="customer-card-region"] a[href*="devices.list_userId="]'
    );
    if (devicesLink) {
      const m = devicesLink.href.match(/devices\.list_userId=([a-f0-9]{8,32})/i);
      if (m) return m[1];
    }
    return null;
  }

  function getCharityRestEnabled() {
    return deps?.getCharityRestEnabled?.() === true;
  }

  function applyCharityButtonVisibility(charityBtn, block) {
    charityBtn.style.display = "none";
    if (!getCharityRestEnabled()) return;
    (async () => {
      try {
        const { getOrderIdFromURL, getOrderIdFromDOM, loadOrderData, mapOrderCountryToCharityCountry } = deps;
        let orderInfo = getOrderIdFromURL() || getOrderIdFromDOM(block);
        if (!orderInfo) return;
        if (typeof orderInfo === "string") orderInfo = { id: orderInfo };
        const orderData = await loadOrderData(orderInfo);
        const addrCountry = orderData?.customerInfo?.address?.country;
        if (String(addrCountry || "").toUpperCase() === "PT") return;
        const mapped = mapOrderCountryToCharityCountry(addrCountry);
        const allowed = ["PT", "AT", "CH", "PL", "UK", "CA", "AU", "IE"];
        if (mapped && allowed.includes(mapped)) charityBtn.style.display = "";
      } catch {}
    })();
  }

  function refresh() {
    if (!getCharityRestEnabled()) {
      document.querySelectorAll(".merchant-charity-popup").forEach(p => {
        p.style.display = "none";
      });
    }
    document.querySelectorAll(".merchant-charity-btn").forEach(charityBtn => {
      const buttonsRow = charityBtn.parentElement;
      const block = buttonsRow && buttonsRow.previousElementSibling;
      if (!block || !block.matches("div.QC2SXR_FQamr1zhmgiQT")) return;
      applyCharityButtonVisibility(charityBtn, block);
    });
  }

  function insertMerchantButtons() {
    const {
      loadMerchantData,
      loadReturnAddressPhone,
      getOrderIdFromURL,
      getOrderIdFromDOM,
      getCurrentTicketLinkUrl,
      loadOrderData,
      loadOrderCostGmvActualUsd,
      mapOrderCountryToCharityCountry,
      saveCharityPopupPosition,
      loadCharityPopupPosition
    } = deps;
    const blocks = document.querySelectorAll("div.QC2SXR_FQamr1zhmgiQT");
    for (const block of blocks) {
      const parent = block.parentElement;
      if (!parent) continue;
      if (parent.querySelector(".check-merchant-btn")) continue;
      const link = block.querySelector("a[href*='merchants/']");
      const merchantId = link?.href?.split("/").pop();
      const merchantName = link?.textContent?.trim();
      if (!merchantId) continue;

      const btn = document.createElement("button");
      btn.className = "check-merchant-btn charity-action-btn";
      btn.textContent = tr("Check merchant contacts", "Проверить контакты продавца");

      const charityBtn = document.createElement("button");
      charityBtn.className = "merchant-charity-btn charity-action-btn";
      charityBtn.textContent = "Charity";
      charityBtn.style.display = "none";

      const infoBox = document.createElement("div");
      infoBox.className = "merchant-info";

      btn.addEventListener("click", async () => {
        infoBox.style.display = "block";
        infoBox.textContent = tr("Loading merchant data...", "Загрузка данных продавца...");
        try {
          const merchant = await loadMerchantData(merchantId);
          if (!merchant) throw new Error("Merchant not found");
          const returnPhoneData = await loadReturnAddressPhone(merchantId);
          const email = merchant.publicContact?.email ?? "—";
          const formatPhone = obj => window.ExtPhoneUtils?.formatPhoneFromObject?.(obj, "—") || "—";
          const returnPhone = formatPhone(returnPhoneData);
          const publicPhone = formatPhone(merchant.publicContact?.phone);
          const addr = merchant.returnAddress?.en || {};
          const addressParts = [
            merchant.returnAddress?.zipCode,
            merchant.returnAddress?.country,
            addr.city,
            addr.region,
            addr.address,
            "Tel: " + returnPhone
          ].filter(Boolean);
          infoBox.innerHTML = "";
          infoBox.append(
            createTitleLine(tr("Public Info", "Публичная информация")),
            createSafeLine(tr("Email", "Эл. почта"), email, true),
            createSafeLine(tr("Phone", "Телефон"), publicPhone, true),
            createEmptyLine(),
            createReturnAddressLine(addressParts.join(", "), returnPhone)
          );
        } catch (err) {
          infoBox.textContent = tr("Error: ", "Ошибка: ") + err.message;
        }
      });

      const charityPopup = document.createElement("div");
      charityPopup.className = "merchant-charity-popup";
      const charityHeader = document.createElement("div");
      charityHeader.className = "charity-header";
      const charityTitle = document.createElement("div");
      charityTitle.textContent = "Charity";
      charityTitle.className = "charity-title";
      const charityClose = document.createElement("button");
      charityClose.type = "button";
      charityClose.textContent = "×";
      charityClose.className = "charity-close-btn";
      charityClose.onclick = () => {
        charityPopup.style.display = "none";
      };
      charityHeader.appendChild(charityTitle);
      charityHeader.appendChild(charityClose);
      charityPopup.appendChild(charityHeader);

      const form = document.createElement("div");
      form.className = "charity-form";
      function createField(labelText, inputEl) {
        const row = document.createElement("label");
        row.className = "charity-field";
        const lbl = document.createElement("span");
        lbl.textContent = labelText;
        lbl.className = "charity-field-label";
        row.appendChild(lbl);
        row.appendChild(inputEl);
        return row;
      }
      const countrySelect = document.createElement("select");
      countrySelect.className = "charity-input";
      ["", "PT", "AT", "CH", "PL", "UK", "CA", "AU", "IE"].forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = code || tr("Select country", "Выберите страну");
        countrySelect.appendChild(opt);
      });
      const gmvInput = document.createElement("input");
      gmvInput.type = "text";
      gmvInput.placeholder = tr("e.g. 1234.56", "напр. 1234.56");
      gmvInput.className = "charity-input";
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.className = "charity-input";
      (() => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;
        dateInput.max = todayStr;
        dateInput.addEventListener("change", () => {
          if (dateInput.value && dateInput.value > todayStr) dateInput.value = todayStr;
        });
      })();
      const linkInput = document.createElement("input");
      linkInput.type = "text";
      linkInput.placeholder = "https://";
      linkInput.className = "charity-input";
      const trackInput = document.createElement("input");
      trackInput.type = "text";
      trackInput.placeholder = tr("Track number", "Трек-номер");
      trackInput.className = "charity-input";
      const countryField = createField(tr("Country", "Страна"), countrySelect);
      const gmvField = createField("GMV", gmvInput);
      const dateField = createField(tr("Date", "Дата"), dateInput);
      const linkField = createField(tr("Link", "Ссылка"), linkInput);
      const trackField = createField(tr("Track", "Трек"), trackInput);
      trackField.style.display = "none";
      countrySelect.addEventListener("change", () => {
        trackField.style.display = countrySelect.value === "PT" ? "" : "none";
      });
      form.appendChild(countryField);
      form.appendChild(gmvField);
      form.appendChild(dateField);
      form.appendChild(linkField);
      form.appendChild(trackField);

      const ordersContainer = document.createElement("div");
      ordersContainer.className = "charity-orders-container";
      const ordersTitle = document.createElement("div");
      ordersTitle.textContent = tr("Orders in this ticket:", "Заказы в этом тикете:");
      ordersTitle.className = "charity-orders-title";
      ordersContainer.appendChild(ordersTitle);
      const actionsRow = document.createElement("div");
      actionsRow.className = "charity-actions-row";
      const targetsRow = document.createElement("div");
      targetsRow.className = "charity-targets-row";
      function createTargetCheckbox(labelText, defaultChecked = true) {
        const wrap = document.createElement("label");
        wrap.className = "charity-target-checkbox";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = defaultChecked;
        const span = document.createElement("span");
        span.textContent = labelText;
        wrap.appendChild(cb);
        wrap.appendChild(span);
        return { wrap, cb };
      }
      const profileTarget = createTargetCheckbox(tr("Profile", "Профиль"), true);
      const orderTarget = createTargetCheckbox(tr("Order", "Заказ"), true);
      targetsRow.appendChild(profileTarget.wrap);
      targetsRow.appendChild(orderTarget.wrap);

      function buildCharityCommentBody() {
        const countryVal = countrySelect.value || "";
        const gmvVal = gmvInput.value || "";
        let dateVal = dateInput.value || "";
        const linkVal = linkInput.value || "";
        const trackVal = countryVal === "PT" && trackField.style.display !== "none" ? trackInput.value || "" : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
          const [y, m, d] = dateVal.split("-");
          dateVal = `${d}.${m}.${y}`;
        }
        const parts = [
          "Возврат в Charity",
          countryVal || "-",
          gmvVal || "-",
          dateVal || "-",
          linkVal || "-",
          countryVal === "PT" && trackVal ? trackVal : null
        ].filter(p => p !== null);
        return `${parts.join(" - ")}`;
      }

      async function sendCharityToOrders(body) {
        let orderIds = [];
        const selected = Array.from(
          ordersContainer.querySelectorAll('input[type="checkbox"][data-order-id]')
        ).filter(ch => ch.checked);
        if (selected.length > 0) {
          orderIds = selected.map(ch => ch.getAttribute("data-order-id"));
        } else {
          let orderId = null;
          const info = getOrderIdFromURL() || getOrderIdFromDOM(block);
          if (typeof info === "string") orderId = info;
          else if (info && typeof info === "object" && info.id) orderId = info.id;
          if (orderId) orderIds.push(orderId);
        }
        if (!orderIds.length) return;
        await fetch("https://api-support.joom.it/1.0/orderComments/create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds, body })
        });
      }

      async function sendCharityToProfile(body) {
        const userId = getCurrentUserId() || "6967fa77a856cf3550c29df4";
        await fetch("https://api-support.joom.it/1.0/userComments/create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, body })
        });
      }

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = tr("Cancel", "Отмена");
      cancelBtn.className = "charity-action-btn charity-secondary-btn charity-secondary-btn-cancel";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = tr("Create", "Создать");
      saveBtn.className = "charity-action-btn charity-secondary-btn charity-secondary-btn-save";
      cancelBtn.onclick = () => {
        charityPopup.style.display = "none";
      };
      saveBtn.onclick = async () => {
        if (!countrySelect.value || !gmvInput.value || !dateInput.value || !linkInput.value) return;
        if (countrySelect.value === "PT" && !trackInput.value) return;
        if (!profileTarget.cb.checked && !orderTarget.cb.checked) return;
        const body = buildCharityCommentBody();
        if (orderTarget.cb.checked) await sendCharityToOrders(body);
        if (profileTarget.cb.checked) await sendCharityToProfile(body);
        charityPopup.style.display = "none";
      };
      actionsRow.appendChild(cancelBtn);
      actionsRow.appendChild(saveBtn);
      charityPopup.appendChild(form);
      charityPopup.appendChild(ordersContainer);
      charityPopup.appendChild(targetsRow);
      charityPopup.appendChild(actionsRow);
      document.body.appendChild(charityPopup);

      let dragState = null;
      charityHeader.addEventListener("mousedown", e => {
        if (e.target === charityClose) return;
        e.preventDefault();
        const rect = charityPopup.getBoundingClientRect();
        dragState = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top, width: rect.width, height: rect.height };
      });
      document.addEventListener("mousemove", e => {
        if (!dragState || charityPopup.style.display !== "block") return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const newLeft = Math.min(window.innerWidth - dragState.width - 8, Math.max(8, dragState.startLeft + dx));
        const newTop = Math.min(window.innerHeight - dragState.height - 8, Math.max(8, dragState.startTop + dy));
        charityPopup.style.left = `${newLeft}px`;
        charityPopup.style.top = `${newTop}px`;
      });
      document.addEventListener("mouseup", () => {
        if (dragState && charityPopup.style.display === "block") {
          const rect = charityPopup.getBoundingClientRect();
          saveCharityPopupPosition(rect.left, rect.top);
        }
        dragState = null;
      });

      function recalcGmvFromSelection() {
        let sum = 0;
        ordersContainer.querySelectorAll('input[type="checkbox"][data-order-id]').forEach(ch => {
          if (!ch.checked) return;
          const v = parseFloat(ch.dataset.orderGmv || "");
          if (!isNaN(v)) sum += v;
        });
        gmvInput.value = sum > 0 ? sum.toFixed(2) + "$" : "";
      }

      async function prepareCharityDefaults() {
        linkInput.value = getCurrentTicketLinkUrl();
        gmvInput.value = "";
        ordersContainer.querySelectorAll("div[data-order-row]").forEach(n => n.remove());
        try {
          const orderLinks = Array.from(document.querySelectorAll('a[href*="/orders/"]'));
          const seen = new Set();
          orderLinks.forEach(a => {
            const m = a.href.match(/\/orders\/([a-f0-9]{24})/i);
            if (!m) return;
            const id = m[1];
            if (seen.has(id)) return;
            seen.add(id);
            const friendlyId = a.textContent.trim() || null;
            const row = document.createElement("div");
            row.dataset.orderRow = "true";
            row.className = "charity-order-row";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = true;
            cb.setAttribute("data-order-id", id);
            if (friendlyId) cb.setAttribute("data-order-friendlyId", friendlyId);
            const label = document.createElement("span");
            label.textContent = friendlyId || id;
            label.className = "charity-order-label";
            label.addEventListener("click", () => {
              cb.checked = !cb.checked;
              recalcGmvFromSelection();
            });
            cb.addEventListener("change", recalcGmvFromSelection);
            row.appendChild(cb);
            row.appendChild(label);
            ordersContainer.appendChild(row);
            (async () => {
              try {
                const [orderData, gmvUsd] = await Promise.all([
                  loadOrderData({ id }),
                  loadOrderCostGmvActualUsd(id)
                ]);
                if (gmvUsd != null) {
                  cb.dataset.orderGmv = String(gmvUsd);
                  recalcGmvFromSelection();
                }
                const addrCountry = orderData?.customerInfo?.address?.country;
                const mapped = mapOrderCountryToCharityCountry(addrCountry);
                if (mapped && !countrySelect.value) {
                  const option = Array.from(countrySelect.options).find(o => o.value === mapped);
                  if (option) {
                    countrySelect.value = mapped;
                    countrySelect.dispatchEvent(new Event("change"));
                  }
                }
              } catch {}
            })();
          });
        } catch {}
        charityPopup.dataset.charityDefaultsLoaded = "1";
      }

      function hideCharityPopup() {
        charityPopup.style.display = "none";
      }

      function toggleCharityPopup() {
        if (charityPopup.style.display === "block") {
          hideCharityPopup();
          return;
        }
        if (!charityPopup.dataset.positioned) {
          charityPopup.style.display = "block";
          const rect = charityPopup.getBoundingClientRect();
          const stored = loadCharityPopupPosition();
          let top;
          let left;
          if (stored) {
            left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, stored.left));
            top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, stored.top));
          } else {
            top = Math.max(8, (window.innerHeight - rect.height) / 2);
            left = Math.max(8, (window.innerWidth - rect.width) / 2);
          }
          charityPopup.style.top = `${top}px`;
          charityPopup.style.left = `${left}px`;
          charityPopup.dataset.positioned = "true";
        } else {
          charityPopup.style.display = "block";
        }
        const ticketUrlNow = getCurrentTicketLinkUrl();
        if (charityPopup.dataset.charityTicketUrl && charityPopup.dataset.charityTicketUrl !== ticketUrlNow) {
          delete charityPopup.dataset.charityDefaultsLoaded;
        }
        charityPopup.dataset.charityTicketUrl = ticketUrlNow;
        if (charityPopup.dataset.charityDefaultsLoaded !== "1") {
          prepareCharityDefaults();
        }
      }

      charityBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        toggleCharityPopup();
      });

      const buttonsRow = document.createElement("div");
      buttonsRow.className = "charity-buttons-row";
      buttonsRow.appendChild(btn);
      buttonsRow.appendChild(charityBtn);

      if (!window._charityOutsideClickBound) {
        window._charityOutsideClickBound = true;
        document.addEventListener("click", e => {
          document.querySelectorAll(".merchant-charity-popup").forEach(popup => {
            const relatedBtn = document.querySelector(".merchant-charity-btn");
            if (!popup.contains(e.target) && e.target !== relatedBtn) popup.style.display = "none";
          });
        });
      }

      parent.insertBefore(buttonsRow, block.nextSibling);
      parent.insertBefore(infoBox, buttonsRow.nextSibling);
      applyCharityButtonVisibility(charityBtn, block);
    }
  }

  function enable() {
    insertMerchantButtons();
    if (merchantObserver) merchantObserver.disconnect();
    merchantObserver = new MutationObserver(() => {
      clearTimeout(window._merchantTimer);
      window._merchantTimer = setTimeout(insertMerchantButtons, 50);
    });
    merchantObserver.observe(document.body, { childList: true, subtree: true });
  }

  function disable() {
    if (merchantObserver) {
      merchantObserver.disconnect();
      merchantObserver = null;
    }
    document.querySelectorAll(".check-merchant-btn, .merchant-info, .merchant-charity-popup").forEach(el => el.remove());
  }

  window.ExtMerchantCharity = {
    init(nextDeps) {
      deps = nextDeps;
    },
    enable,
    disable,
    refresh
  };
})();
