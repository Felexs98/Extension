(function () {
  const tr = (en, ru) => (window.ExtLocale && window.ExtLocale.pick) ? window.ExtLocale.pick(en, ru) : en;
  function init(deps = {}) {
    const sendRuntimeMessageAsync = deps.sendRuntimeMessageAsync;
    if (typeof sendRuntimeMessageAsync !== "function") return;
    if (document.getElementById("media-picker-root")) return;

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const normalizeUrl = url => {
      try {
        const u = new URL(url, location.href);
        if (u.port === "443") u.port = "";
        u.protocol = "https:";
        return u.toString();
      } catch {
        return url;
      }
    };
    const isVideo = url => /video\.joomcdn\.net/i.test(url) || /\.m3u8(\?|$)/i.test(url) || /\.mp4(\?|$)/i.test(url);
    const closeModals = () => {
      document.querySelector(".lg-close")?.click();
      document.querySelector(".vjs-close-button, .video-js .vjs-close-control")?.click();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    };
    const getMediaUrl = () => {
      const lgItem = document.querySelector(".lg-outer .lg-item.lg-current") ||
        document.querySelector(".lg-outer .lg-current") ||
        document.querySelector(".lg-outer .lg-item:not([aria-hidden='true'])");
      if (lgItem) {
        const img = lgItem.querySelector("img[src*='babylone-api.joom.it'][src*='/download/']");
        if (img?.src) return normalizeUrl(img.src);
      }
      const source = document.querySelector("video.vjs-tech source[src]") ||
        document.querySelector("[id^='vjs_video_'] source[src]") ||
        document.querySelector("video source[src]");
      if (source?.src && !source.src.startsWith("blob:")) return normalizeUrl(source.src);
      const video = document.querySelector("video.vjs-tech[src], video[src]");
      return video?.src && !video.src.startsWith("blob:") ? normalizeUrl(video.src) : null;
    };
    const addButtonPressAnimation = btn => {
      btn.style.transition = "transform 0.1s ease, opacity 0.1s ease";
      btn.addEventListener("mousedown", () => {
        btn.style.transform = "scale(0.95)";
        btn.style.opacity = "0.8";
      });
      btn.addEventListener("mouseup", () => {
        btn.style.transform = "scale(1)";
        btn.style.opacity = "1";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "scale(1)";
        btn.style.opacity = "1";
      });
    };

    const createPrimaryBtn = text => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.style.cssText = "appearance:none;border:0;border-radius:999px;padding:8px 12px;background:rgba(255,255,255,0.14);color:#fff;font-size:13px;cursor:pointer;";
      addButtonPressAnimation(btn);
      return btn;
    };
    const createSecondaryBtn = text => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      btn.style.cssText = "appearance:none;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:6px 10px;background:rgba(0,0,0,0.25);color:#fff;font-size:12px;cursor:pointer;";
      addButtonPressAnimation(btn);
      return btn;
    };
    const setBtnState = (btn, disabled) => {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? "0.55" : "1";
      btn.style.cursor = disabled ? "not-allowed" : "pointer";
    };

    const root = document.createElement("div");
    root.id = "media-picker-root";
    root.style.cssText = "position:fixed;inset:0;z-index:999999;display:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Ubuntu,Cantarell,sans-serif;";

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.45);";

    const modal = document.createElement("div");
    modal.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(1100px,92vw);height:min(760px,86vh);min-width:560px;min-height:460px;max-width:96vw;max-height:92vh;resize:both;overflow:hidden;background:rgba(0,0,0,0.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,0.45);color:#fff;display:flex;flex-direction:column";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;padding:14px;border-bottom:1px solid rgba(255,255,255,0.12);gap:12px;cursor:move;user-select:none;";

    const headerLeft = document.createElement("div");
    headerLeft.style.cssText = "display:flex;flex-direction:column;gap:10px;min-width:0;flex:1;";

    const titleRow = document.createElement("div");
    titleRow.style.cssText = "display:flex;align-items:center;gap:10px;min-width:0;";

    const title = document.createElement("div");
    title.textContent = tr("Select images/videos to copy links", "Выберите изображения/видео для копирования ссылок");
    title.style.cssText = "font-size:14px;font-weight:600;white-space:nowrap;";

    const status = document.createElement("div");
    status.textContent = tr("Not scanned yet", "Ещё не отсканировано");
    status.style.cssText = "font-size:12px;opacity:0.85;white-space:nowrap;";

    titleRow.appendChild(title);
    titleRow.appendChild(status);

    const filters = document.createElement("div");
    filters.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:center;";

    const filterLabel = document.createElement("div");
    filterLabel.textContent = tr("Filter:", "Фильтр:");
    filterLabel.style.cssText = "font-size:12px;opacity:0.8;padding:0 2px;";

    const btnAll = createSecondaryBtn(tr("View: All", "Вид: Все"));
    const btnImages = createSecondaryBtn(tr("Images", "Изображения"));
    const btnVideos = createSecondaryBtn(tr("Videos", "Видео"));
    const btnSelected = createSecondaryBtn(tr("Selected", "Выбранные"));
    const btnUnloaded = createSecondaryBtn(tr("Unloaded", "Незагруженные"));
    const btnNotes = createSecondaryBtn(tr("Notes", "Заметки"));
    const btnUser = createSecondaryBtn(tr("User", "Пользователь"));
    const btnAgent = createSecondaryBtn(tr("Agent", "Агент"));
    const btnUserPhotos = createSecondaryBtn(tr("User photos", "Фото пользователя"));
    const btnUserVideos = createSecondaryBtn(tr("User videos", "Видео пользователя"));
    const btnAgentPhotos = createSecondaryBtn(tr("Agent photos", "Фото агента"));
    const btnAgentVideos = createSecondaryBtn(tr("Agent videos", "Видео агента"));
    const btnNotesPhotos = createSecondaryBtn(tr("Notes photos", "Фото из заметок"));
    const btnNotesVideos = createSecondaryBtn(tr("Notes videos", "Видео из заметок"));
    const btnPdf = createSecondaryBtn("PDF");

    filters.appendChild(filterLabel);
    filters.appendChild(btnAll);
    filters.appendChild(btnImages);
    filters.appendChild(btnVideos);
    filters.appendChild(btnNotes);
    filters.appendChild(btnUser);
    filters.appendChild(btnAgent);
    filters.appendChild(btnUserPhotos);
    filters.appendChild(btnUserVideos);
    filters.appendChild(btnAgentPhotos);
    filters.appendChild(btnAgentVideos);
    filters.appendChild(btnNotesPhotos);
    filters.appendChild(btnNotesVideos);
    filters.appendChild(btnPdf);
    filters.appendChild(btnSelected);
    filters.appendChild(btnUnloaded);

    headerLeft.appendChild(titleRow);
    headerLeft.appendChild(filters);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "x";
    closeBtn.setAttribute("aria-label", tr("Close", "Закрыть"));
    closeBtn.style.cssText = "appearance:none;border:0;width:34px;height:34px;border-radius:999px;background:rgba(255,255,255,0.14);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto;";

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);

    const content = document.createElement("div");
    content.style.cssText = "padding:12px;overflow:auto;flex:1;";

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;";

    content.appendChild(grid);

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px;border-top:1px solid rgba(255,255,255,0.12);gap:10px;flex-wrap:wrap;";

    const footerLeft = document.createElement("div");
    footerLeft.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

    const footerRight = document.createElement("div");
    footerRight.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";

    const btnScan = createPrimaryBtn(tr("Scan media", "Сканировать медиа"));
    btnScan.style.background = "#FFD60A";
    btnScan.style.color = "#111";
    btnScan.style.fontWeight = "700";
    btnScan.style.border = "1px solid rgba(0,0,0,0.15)";
    btnScan.style.boxShadow = "0 10px 24px rgba(255,214,10,0.35), 0 8px 18px rgba(0,0,0,0.25)";

    const btnSelectAll = createPrimaryBtn(tr("Select all", "Выбрать все"));
    const btnSelectNone = createPrimaryBtn(tr("Select none", "Снять выбор"));
    const btnOnlyImages = createPrimaryBtn(tr("Only images (0)", "Только изображения (0)"));
    const btnOnlyVideos = createPrimaryBtn(tr("Only videos (0)", "Только видео (0)"));
    const btnGetLinks = createPrimaryBtn(tr("Get links", "Получить ссылки"));
    const btnCopyLinks = createPrimaryBtn(tr("Copy in buffer", "Копировать в буфер"));
    const btnDownloadLinks = createPrimaryBtn(tr("Download", "Скачать"));
    btnGetLinks.style.background = "rgba(255,255,255,0.22)";
    btnCopyLinks.style.background = "rgba(255,255,255,0.22)";
    btnDownloadLinks.style.background = "rgba(255,255,255,0.22)";

    footerLeft.appendChild(btnScan);
    footerLeft.appendChild(btnSelectAll);
    footerLeft.appendChild(btnSelectNone);
    footerLeft.appendChild(btnOnlyImages);
    footerLeft.appendChild(btnOnlyVideos);
    footerRight.appendChild(btnGetLinks);
    footerRight.appendChild(btnCopyLinks);
    footerRight.appendChild(btnDownloadLinks);

    footer.appendChild(footerLeft);
    footer.appendChild(footerRight);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);

    root.appendChild(overlay);
    root.appendChild(modal);
    document.body.appendChild(root);

    const resizeHandle = document.createElement("div");
    resizeHandle.style.cssText = "position:absolute;right:8px;bottom:8px;width:16px;height:16px;opacity:0.8;cursor:nwse-resize;";
    resizeHandle.innerHTML = "<svg viewBox='0 0 16 16' width='16' height='16' xmlns='http://www.w3.org/2000/svg'><path d='M3 13h10v1H3v-1Zm2-3h8v1H5v-1Zm2-3h6v1H7V7Zm2-3h4v1H9V4Z' fill='rgba(255,255,255,0.55)'/></svg>";
    modal.appendChild(resizeHandle);

    const state = { items: [], scanning: false, scanned: false, view: "all" };
    let scanStyle = null;

    const updateStatus = text => status.textContent = text;
    const updateCounts = () => {
      const imgCount = state.items.filter(item => item.mediaUrl && item.type === "image").length;
      const vidCount = state.items.filter(item => item.mediaUrl && item.type === "video").length;
      btnOnlyImages.textContent = tr("Only images (", "Только изображения (") + imgCount + ")";
      btnOnlyVideos.textContent = tr("Only videos (", "Только видео (") + vidCount + ")";
    };
    const updateView = () => {
      [
        [btnAll, "all"], [btnImages, "images"], [btnVideos, "videos"], [btnNotes, "notes"], [btnUser, "user"],
        [btnAgent, "agent"], [btnUserPhotos, "user_photos"], [btnUserVideos, "user_videos"], [btnAgentPhotos, "agent_photos"],
        [btnAgentVideos, "agent_videos"], [btnNotesPhotos, "notes_photos"], [btnNotesVideos, "notes_videos"], [btnPdf, "pdf"],
        [btnSelected, "selected"], [btnUnloaded, "unloaded"]
      ].forEach(([btn, view]) => {
        btn.style.background = state.view === view ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.25)";
      });
    };
    const getFilteredItems = () => {
      if (state.view === "images") return state.items.filter(item => item.type === "image");
      if (state.view === "videos") return state.items.filter(item => item.type === "video");
      if (state.view === "notes") return state.items.filter(item => item.fromNotes);
      if (state.view === "user") return state.items.filter(item => item.fromUser);
      if (state.view === "agent") return state.items.filter(item => item.fromAgent);
      if (state.view === "user_photos") return state.items.filter(item => item.fromUser && item.type === "image");
      if (state.view === "user_videos") return state.items.filter(item => item.fromUser && item.type === "video");
      if (state.view === "agent_photos") return state.items.filter(item => item.fromAgent && item.type === "image");
      if (state.view === "agent_videos") return state.items.filter(item => item.fromAgent && item.type === "video");
      if (state.view === "notes_photos") return state.items.filter(item => item.fromNotes && item.type === "image");
      if (state.view === "notes_videos") return state.items.filter(item => item.fromNotes && item.type === "video");
      if (state.view === "pdf") return state.items.filter(item => item.type === "pdf");
      if (state.view === "selected") return state.items.filter(item => item.checked);
      if (state.view === "unloaded") return state.items.filter(item => !item.mediaUrl);
      return state.items;
    };
    const getPreviewUrl = item => {
      if (item.type === "video") return item.thumbUrl || item.mediaUrl;
      if (state.scanning) return item.thumbUrl || item.mediaUrl;
      if (item.mediaUrl && !isVideo(item.mediaUrl)) return item.mediaUrl;
      return item.thumbUrl || item.mediaUrl;
    };
    const inferTypeFromElement = el => {
      const rawSrc = el.getAttribute("src");
      const baseUrl = el.dataset.extMediaUrl || rawSrc || (el.href || "");
      const url = normalizeUrl(baseUrl);
      const explicitType = el.dataset.extMediaType || "";
      if (explicitType) return explicitType;
      if (/\/attachments\//i.test(url) || /\.pdf(\?|$)/i.test(url)) return "pdf";
      return url.includes("/videos/") ? "video" : "image";
    };
    const shouldScanByView = (meta, view) => {
      if (!view || view === "all" || view === "selected" || view === "unloaded") return true;
      const t = meta.type;
      if (view === "images") return t === "image";
      if (view === "videos") return t === "video";
      if (view === "pdf") return t === "pdf";
      if (view === "notes") return !!meta.fromNotes;
      if (view === "user") return !!meta.fromUser;
      if (view === "agent") return !!meta.fromAgent;
      if (view === "notes_photos") return !!meta.fromNotes && t === "image";
      if (view === "notes_videos") return !!meta.fromNotes && t === "video";
      if (view === "user_photos") return !!meta.fromUser && t === "image";
      if (view === "user_videos") return !!meta.fromUser && t === "video";
      if (view === "agent_photos") return !!meta.fromAgent && t === "image";
      if (view === "agent_videos") return !!meta.fromAgent && t === "video";
      return true;
    };
    const createItemCard = item => {
      const card = document.createElement("div");
      card.dataset.id = item.id;
      card.style.cssText = "background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.10);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;";
      const imgContainer = document.createElement("div");
      imgContainer.style.cssText = "position:relative;aspect-ratio:1/1;background:rgba(0,0,0,0.25);width:100%;flex-shrink:0;";

      if (item.type === "pdf") {
        const pdfBlock = document.createElement("div");
        pdfBlock.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,0.28);padding:10px;box-sizing:border-box;";
        pdfBlock.innerHTML =
          '<svg width="44" height="44" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#ef4444" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8z"/><path fill="#fff" d="M14 2v6h6"/><path fill="#fff" d="M8 14h8v1.5H8zm0 3h5v1.5H8z"/></svg>';
        const fileNameEl = document.createElement("div");
        fileNameEl.textContent = item.displayText || "document.pdf";
        fileNameEl.style.cssText = "font-size:11px;color:#fff;opacity:.95;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;";
        pdfBlock.appendChild(fileNameEl);
        imgContainer.appendChild(pdfBlock);
      } else {
        const img = document.createElement("img");
        img.src = getPreviewUrl(item);
        img.alt = "";
        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
        imgContainer.appendChild(img);
      }

      if (item.type === "video") {
        const videoLabel = document.createElement("div");
        videoLabel.textContent = tr("VIDEO", "ВИДЕО");
        videoLabel.style.cssText = "position:absolute;top:8px;left:8px;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,0.55);font-size:11px;border:1px solid rgba(255,255,255,0.14);";
        imgContainer.appendChild(videoLabel);
      }
      if (item.fromUser) {
        const userLabel = document.createElement("div");
        userLabel.textContent = tr("User", "Пользователь");
        userLabel.style.cssText =
          item.type === "video"
            ? "position:absolute;bottom:8px;left:8px;padding:4px 8px;border-radius:999px;background:rgba(34,197,94,0.45);font-size:11px;border:1px solid rgba(34,197,94,0.85);color:#fff;"
            : "position:absolute;top:8px;left:8px;padding:4px 8px;border-radius:999px;background:rgba(34,197,94,0.45);font-size:11px;border:1px solid rgba(34,197,94,0.85);color:#fff;";
        imgContainer.appendChild(userLabel);
      }
      if (item.fromAgent) {
        const agentLabel = document.createElement("div");
        agentLabel.textContent = tr("Agent", "Агент");
        agentLabel.style.cssText =
          item.type === "video"
            ? "position:absolute;bottom:8px;right:8px;padding:4px 8px;border-radius:999px;background:rgba(99,102,241,0.45);font-size:11px;border:1px solid rgba(99,102,241,0.9);color:#fff;"
            : "position:absolute;top:8px;right:8px;padding:4px 8px;border-radius:999px;background:rgba(99,102,241,0.45);font-size:11px;border:1px solid rgba(99,102,241,0.9);color:#fff;";
        imgContainer.appendChild(agentLabel);
      }
      if (item.fromNotes) {
        const notesLabel = document.createElement("div");
        notesLabel.textContent = tr("Notes", "Заметки");
        notesLabel.style.cssText = "position:absolute;top:8px;right:8px;left:auto;padding:4px 8px;border-radius:999px;background:rgba(255,149,0,0.35);font-size:11px;border:1px solid rgba(255,149,0,0.65);color:#fff;";
        if (item.fromAgent) notesLabel.style.top = "38px";
        imgContainer.appendChild(notesLabel);
      }
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.checked;
      checkbox.style.cssText = "width:16px;height:16px;cursor:pointer;flex-shrink:0;";
      checkbox.addEventListener("change", () => {
        item.checked = checkbox.checked;
        if (state.view === "selected") renderItems();
      });
      const label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px;cursor:pointer;margin-top:auto;min-width:0;";
      label.appendChild(checkbox);
      const urlText = document.createElement("div");
      urlText.textContent = item.displayText || item.mediaUrl || tr("Not loaded", "Не загружено");
      urlText.style.cssText = "font-size:12px;opacity:0.9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;";
      label.appendChild(urlText);
      card.appendChild(imgContainer);
      card.appendChild(label);
      return card;
    };
    const renderItems = () => {
      updateView();
      grid.innerHTML = "";
      getFilteredItems().forEach(item => grid.appendChild(createItemCard(item)));
    };
    const setButtonsEnabled = enabled => {
      [
        btnSelectAll, btnSelectNone, btnOnlyImages, btnOnlyVideos, btnGetLinks, btnCopyLinks, btnDownloadLinks, btnAll,
        btnImages, btnVideos, btnNotes, btnUser, btnAgent, btnUserPhotos, btnUserVideos, btnAgentPhotos, btnAgentVideos,
        btnNotesPhotos, btnNotesVideos, btnPdf, btnSelected, btnUnloaded
      ].forEach(btn => setBtnState(btn, !enabled));
    };
    const NOTES_WRAPPER_SEL = "div.mBYkc2H0HypzHiO4rmqB.D5jJJ2n07hicRNRxyw0O";
    const CHAT_ATTACHMENT_SEL = ".mBYkc2H0HypzHiO4rmqB";
    const USER_ATTACHMENT_SEL = ".mBYkc2H0HypzHiO4rmqB.RN1F5H8AsUGuoZUfRuYA";
    const AGENT_ATTACHMENT_SEL = ".mBYkc2H0HypzHiO4rmqB.fGEQnijm2URuf4LxdzkZ";
    const PDF_LINK_SEL = "a.CChkZRBSpElFoQpt3NJQ.w0LCMVA3i6ES0UiMkei9[href*='/attachments/']";
    const PDF_NAME_SEL = ".JGblqVonhPjIQB0LhVym";
    const findMediaElements = scanCfg => {
      const allowNotes = scanCfg.attachmentScanNotes !== false;
      const allowUser = scanCfg.attachmentScanUser !== false;
      const allowPdf = scanCfg.attachmentScanPdf !== false;
      const selectors = [];
      if (allowUser) {
        selectors.push(
          CHAT_ATTACHMENT_SEL + " img[src*='babylone-api.joom.it'][src*='/images/']",
          CHAT_ATTACHMENT_SEL + " img[src*='babylone-api.joom.it'][src*='/videos/'][src*='/thumb/']"
        );
      }
      if (allowNotes) {
        selectors.push(
          NOTES_WRAPPER_SEL + " img[src*='babylone-api.joom.it'][src*='/images/']",
          NOTES_WRAPPER_SEL + " img[src*='babylone-api.joom.it'][src*='/download/']",
          NOTES_WRAPPER_SEL + " img[src*='babylone-api.joom.it'][src*='/videos/'][src*='/thumb/']"
        );
      }
      if (allowPdf) {
        selectors.push(PDF_LINK_SEL);
      }
      const seen = new Set();
      const out = [];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          if (seen.has(el)) return;
          seen.add(el);
          if (sel === PDF_LINK_SEL || el.matches?.(PDF_LINK_SEL)) {
            const link = el;
            const nameEl = link.parentElement && link.parentElement.querySelector(PDF_NAME_SEL);
            const name = (nameEl && nameEl.textContent && nameEl.textContent.trim()) || "document.pdf";
            const inNotes = Boolean(link.closest(NOTES_WRAPPER_SEL));
            const fromUser = Boolean(link.closest(USER_ATTACHMENT_SEL)) && !inNotes;
            const fromAgent = Boolean(link.closest(AGENT_ATTACHMENT_SEL)) && !inNotes;
            link.dataset.extMediaType = "pdf";
            link.dataset.extMediaUrl = link.href || "";
            link.dataset.extDisplayText = name;
            out.push({ el: link, fromNotes: inNotes, fromUser, fromAgent, displayText: name });
            return;
          }
          const inNotes = Boolean(el.closest(NOTES_WRAPPER_SEL));
          const fromUser = Boolean(el.closest(USER_ATTACHMENT_SEL)) && !inNotes;
          const fromAgent = Boolean(el.closest(AGENT_ATTACHMENT_SEL)) && !inNotes;
          out.push({ el, fromNotes: inNotes, fromUser, fromAgent, displayText: "" });
        });
      }
      return out;
    };
    const applyScanHighlight = (el, on, fromNotes) => {
      if (!el) return;
      if (on) {
        el.dataset._extScanOutline = el.style.outline;
        el.dataset._extScanOutlineOffset = el.style.outlineOffset;
        el.style.outline = fromNotes ? "3px solid #ff9500" : "3px solid rgba(148,163,184,0.9)";
        el.style.outlineOffset = "2px";
      } else {
        el.style.outline = el.dataset._extScanOutline || "";
        el.style.outlineOffset = el.dataset._extScanOutlineOffset || "";
      }
    };
    const hideModal = () => root.style.display = "none";
    const setScanVisuals = enabled => {
      if (enabled) {
        if (!scanStyle) {
          scanStyle = document.createElement("style");
          scanStyle.id = "media-scan-style";
          scanStyle.textContent = "body.media-scan-hide .lg-outer,body.media-scan-hide .lg-backdrop,body.media-scan-hide .lg-toolbar,body.media-scan-hide .lg-sub-html,body.media-scan-hide .video-js,body.media-scan-hide .vjs-modal-dialog{opacity:0!important;pointer-events:none!important;}";
          document.head.appendChild(scanStyle);
        }
        document.body.classList.add("media-scan-hide");
      } else {
        document.body.classList.remove("media-scan-hide");
      }
    };

    closeBtn.onclick = hideModal;
    overlay.onclick = hideModal;

    btnScan.onclick = async () => {
      if (state.scanning) return;
      state.scanning = true;
      setButtonsEnabled(false);
      setBtnState(btnScan, true);
      updateStatus(tr("Scanning...", "Сканирование..."));
      setScanVisuals(true);
      const scanCfg = await new Promise(resolve => chrome.storage.sync.get(["attachmentScanNotes", "attachmentScanUser", "attachmentScanPdf"], resolve));
      const elements = findMediaElements(scanCfg).filter(({ el, fromNotes, fromUser, fromAgent }) => {
        const type = inferTypeFromElement(el);
        return shouldScanByView({ fromNotes, fromUser, fromAgent, type }, state.view);
      });
      state.items = elements.map(({ el, fromNotes, fromUser, fromAgent, displayText }, idx) => {
        const rawSrc = el.getAttribute("src");
        const baseUrl = el.dataset.extMediaUrl || rawSrc || (el.href || "");
        const url = normalizeUrl(baseUrl);
        const type = inferTypeFromElement(el);
        let fullUrl = url;
        if (type === "image" && url.includes("/images/")) fullUrl = url.replace("/images/", "/download/");
        return {
          id: "m_" + idx + "_" + Math.random().toString(16).slice(2),
          thumbEl: el,
          thumbUrl: rawSrc || url,
          mediaUrl: fullUrl,
          type,
          fromNotes,
          fromUser,
          fromAgent,
          displayText: displayText || el.dataset.extDisplayText || "",
          checked: true
        };
      });
      updateCounts();
      renderItems();
      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        const el = item.thumbEl;
        if (item.type === "pdf") {
          // PDF link is already available in href; do not click anchor
          // to avoid opening a new browser tab during scanning.
          continue;
        }
        applyScanHighlight(el, true, item.fromNotes);
        try {
          const scrollY = window.scrollY;
          item.thumbEl.closest("button, a")?.click() || item.thumbEl.click();
          let mediaUrl = null;
          const startTime = Date.now();
          while (Date.now() - startTime < 7000 && !mediaUrl) {
            mediaUrl = getMediaUrl();
            await delay(50);
          }
          closeModals();
          window.scrollTo(0, scrollY);
          await delay(120);
          if (mediaUrl) {
            item.mediaUrl = mediaUrl;
            item.type = isVideo(mediaUrl) ? "video" : "image";
          }
        } finally {
          applyScanHighlight(el, false);
        }
      }
      state.items.forEach(item => delete item.thumbEl);
      state.scanning = false;
      updateCounts();
      renderItems();
      updateStatus(tr("Done. Found ", "Готово. Найдено ") + state.items.filter(item => item.mediaUrl).length + "/" + state.items.length + tr(" links", " ссылок"));
      setBtnState(btnScan, false);
      setButtonsEnabled(true);
      setScanVisuals(false);
    };

    btnSelectAll.onclick = () => {
      state.items.forEach(item => item.checked = true);
      renderItems();
    };
    btnSelectNone.onclick = () => {
      state.items.forEach(item => item.checked = false);
      renderItems();
    };
    btnOnlyImages.onclick = () => {
      state.items.forEach(item => item.checked = item.type === "image" && !!item.mediaUrl);
      renderItems();
    };
    btnOnlyVideos.onclick = () => {
      state.items.forEach(item => item.checked = item.type === "video" && !!item.mediaUrl);
      renderItems();
    };
    btnAll.onclick = () => { state.view = "all"; renderItems(); };
    btnImages.onclick = () => { state.view = "images"; renderItems(); };
    btnVideos.onclick = () => { state.view = "videos"; renderItems(); };
    btnSelected.onclick = () => { state.view = "selected"; renderItems(); };
    btnUnloaded.onclick = () => { state.view = "unloaded"; renderItems(); };
    btnNotes.onclick = () => { state.view = "notes"; renderItems(); };
    btnUser.onclick = () => { state.view = "user"; renderItems(); };
    btnAgent.onclick = () => { state.view = "agent"; renderItems(); };
    btnUserPhotos.onclick = () => { state.view = "user_photos"; renderItems(); };
    btnUserVideos.onclick = () => { state.view = "user_videos"; renderItems(); };
    btnAgentPhotos.onclick = () => { state.view = "agent_photos"; renderItems(); };
    btnAgentVideos.onclick = () => { state.view = "agent_videos"; renderItems(); };
    btnNotesPhotos.onclick = () => { state.view = "notes_photos"; renderItems(); };
    btnNotesVideos.onclick = () => { state.view = "notes_videos"; renderItems(); };
    btnPdf.onclick = () => { state.view = "pdf"; renderItems(); };
    const collectSelectedLinks = (dedupe = false) => {
      const selected = state.items
        .filter(item => item.checked && item.mediaUrl)
        .map(item => item.mediaUrl);
      const links = dedupe ? [...new Set(selected)] : selected;
      if (!links.length) return null;
      return { links, text: links.join("\n") };
    };
    btnGetLinks.onclick = async () => {
      const data = collectSelectedLinks(false);
      if (!data) return;
      try {
        await navigator.clipboard.writeText(data.text);
        updateStatus(tr("Copied ", "Скопировано ") + data.links.length + tr(" links", " ссылок"));
      } catch {
        window.prompt(tr("Clipboard blocked. Copy manually:", "Буфер обмена заблокирован. Скопируйте вручную:"), data.text);
      }
    };
    btnCopyLinks.onclick = async () => {
      const selectedImages = state.items.filter(
        item => item.checked && item.mediaUrl && item.type === "image"
      );
      if (!selectedImages.length) {
        updateStatus(tr("Copy in buffer supports selected images only", "Копирование в буфер поддерживает только выбранные изображения"));
        return;
      }
      try {
        const url = selectedImages[0].mediaUrl;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("image fetch failed");
        let blob = await res.blob();
        let mime = blob.type || "image/png";
        if (!mime.startsWith("image/")) {
          throw new Error("selected file is not an image");
        }
        // Convert non-PNG images to PNG for wider clipboard compatibility.
        if (mime !== "image/png") {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas unavailable");
          ctx.drawImage(bitmap, 0, 0);
          blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
              b => (b ? resolve(b) : reject(new Error("png conversion failed"))),
              "image/png"
            );
          });
          mime = "image/png";
        }
        await navigator.clipboard.write([
          new ClipboardItem({ [mime]: blob })
        ]);
        updateStatus(
          selectedImages.length > 1
            ? tr("Copied first image to buffer (", "Скопировано первое изображение в буфер (") + selectedImages.length + tr(" selected)", " выбрано)")
            : tr("Copied image to buffer", "Изображение скопировано в буфер")
        );
      } catch (e) {
        updateStatus(tr("Copy in buffer failed: ", "Не удалось скопировать в буфер: ") + (e?.message || tr("unknown error", "неизвестная ошибка")));
      }
    };
    btnDownloadLinks.onclick = async () => {
      const data = collectSelectedLinks(true);
      if (!data) return;
      const resp = await sendRuntimeMessageAsync({ type: "DOWNLOAD_URLS", urls: data.links });
      updateStatus(resp?.ok ? tr("Download started", "Загрузка началась") : tr("Download failed: ", "Ошибка загрузки: ") + (resp?.error || tr("unknown error", "неизвестная ошибка")));
    };

    let isResizing = false;
    let isDragging = false;
    header.addEventListener("mousedown", e => {
      const interactive = e.target.closest("button, input, select, textarea, a, label");
      if (interactive || isResizing) return;
      e.preventDefault();
      isDragging = true;
      const rect = modal.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;

      // Switch from centered transform layout to explicit coordinates for dragging.
      modal.style.left = startLeft + "px";
      modal.style.top = startTop + "px";
      modal.style.transform = "none";

      const onMouseMove = e2 => {
        if (!isDragging) return;
        const dx = e2.clientX - startX;
        const dy = e2.clientY - startY;
        const nextLeft = Math.max(8, Math.min(window.innerWidth - rect.width - 8, startLeft + dx));
        const nextTop = Math.max(8, Math.min(window.innerHeight - rect.height - 8, startTop + dy));
        modal.style.left = nextLeft + "px";
        modal.style.top = nextTop + "px";
      };

      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    resizeHandle.addEventListener("mousedown", e => {
      e.preventDefault();
      isResizing = true;
      const rect = modal.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = rect.width;
      const startHeight = rect.height;
      const onMouseMove = e2 => {
        if (!isResizing) return;
        const newWidth = Math.max(560, Math.min((96 * window.innerWidth) / 100, startWidth + (e2.clientX - startX)));
        const newHeight = Math.max(460, Math.min((92 * window.innerHeight) / 100, startHeight + (e2.clientY - startY)));
        modal.style.width = newWidth + "px";
        modal.style.height = newHeight + "px";
      };
      const onMouseUp = () => {
        isResizing = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  window.ExtMediaPicker = { init };
})();
