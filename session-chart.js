(function () {
  "use strict";

  const HOUR_MS = 3600_000;
  const MINUTE_MS = 60_000;
  const TRACKING_HOST = "babylone.joom.it";
  const REPLY_SELECTOR = "Reply";
  const REFRESH_MS = 30_000;
  const BASE_CHART_INNER_W = 788;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 20;
  const ZOOM_STEP = 0.25;
  const MIN_REPLY_PX = 36;

  let zoomTouchedByUser = false;

  const t = (k) => (window.PageI18n ? window.PageI18n.t(k) : k);

  function storageLocalGet(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, res => resolve(res || {}));
    });
  }

  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function fmtDateTime(ts) {
    return new Date(ts).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function fmtDur(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    if (ms < MINUTE_MS) return `${Math.round(ms / 1000)} ${t("chartSec")}`;
    if (ms < HOUR_MS) {
      const m = Math.floor(ms / MINUTE_MS);
      const s = Math.round((ms % MINUTE_MS) / 1000);
      return s > 0 ? `${m} ${t("chartMin")} ${s} ${t("chartSec")}` : `${m} ${t("chartMin")}`;
    }
    const h = Math.floor(ms / HOUR_MS);
    const m = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return m > 0 ? `${h} ${t("durH")} ${m} ${t("durM")}` : `${h} ${t("durH")}`;
  }

  function parseStorageClickKey(key, keyPrefix) {
    const raw = key.slice(keyPrefix.length);
    const sep = raw.lastIndexOf("_");
    if (sep > 0) {
      const suffix = raw.slice(sep + 1);
      if (/^\d{10,}$/.test(suffix)) {
        return { ticketId: raw.slice(0, sep), recordTs: Number(suffix) };
      }
    }
    return { ticketId: raw, recordTs: null };
  }

  function ticketUrlForId(ticketId) {
    if (!ticketId || /^auto_/i.test(ticketId)) return null;
    if (!/^[a-f0-9]{8,32}$/i.test(ticketId)) return null;
    return `https://${TRACKING_HOST}/app/tickets/${ticketId}`;
  }

  function shortTicketId(ticketId) {
    if (!ticketId) return "—";
    if (ticketId.length <= 12) return ticketId;
    return `${ticketId.slice(0, 8)}…`;
  }

  function collectSessionReplies(lastClickByTicket, keyPrefix, sessionStart, sessionEnd) {
    const replies = [];
    for (const key in lastClickByTicket) {
      if (!key.startsWith(keyPrefix)) continue;
      const ts = lastClickByTicket[key];
      if (ts < sessionStart || ts > sessionEnd) continue;
      const { ticketId } = parseStorageClickKey(key, keyPrefix);
      replies.push({
        ts,
        ticketId,
        ticketUrl: ticketUrlForId(ticketId),
        key
      });
    }
    replies.sort((a, b) => a.ts - b.ts || a.key.localeCompare(b.key));
    return replies;
  }

  function pickTickStep(spanMs) {
    if (spanMs <= 30 * MINUTE_MS) return 5 * MINUTE_MS;
    if (spanMs <= 2 * HOUR_MS) return 15 * MINUTE_MS;
    if (spanMs <= 6 * HOUR_MS) return 30 * MINUTE_MS;
    return HOUR_MS;
  }

  function clampZoom(zoom) {
    const stepped = Math.round(zoom / ZOOM_STEP) * ZOOM_STEP;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped));
  }

  function formatZoomLabel(zoom) {
    return `${zoom % 1 === 0 ? zoom : zoom.toFixed(2)}×`;
  }

  function computeAutoZoom(replies, sessionStart, sessionEnd) {
    const span = Math.max(sessionEnd - sessionStart, MINUTE_MS);
    if (!replies.length) return ZOOM_MIN;

    const pxPerMs = BASE_CHART_INNER_W / span;
    let zoom = ZOOM_MIN;

    for (let i = 1; i < replies.length; i++) {
      const distMs = replies[i].ts - replies[i - 1].ts;
      if (distMs <= 0) {
        zoom = Math.max(zoom, 1 + i * 0.35);
        continue;
      }
      const distPx = distMs * pxPerMs;
      if (distPx < MIN_REPLY_PX) {
        zoom = Math.max(zoom, MIN_REPLY_PX / distPx);
      }
    }

    return clampZoom(zoom);
  }

  function resolveChartZoom(replies, sessionStart, sessionEnd, zoomInput) {
    const autoZoom = computeAutoZoom(replies, sessionStart, sessionEnd);
    if (!zoomInput) return autoZoom;
    const manualZoom = Number(zoomInput.value) || ZOOM_MIN;
    if (zoomTouchedByUser) return clampZoom(Math.max(autoZoom, manualZoom));
    return autoZoom;
  }

  function syncZoomUi(zoomInput, zoomVal, zoom) {
    if (!zoomInput) return;
    zoomInput.value = String(zoom);
    if (zoomVal) zoomVal.textContent = formatZoomLabel(zoom);
  }

  function gapColor(ms) {
    if (ms >= 10 * MINUTE_MS) return "#ef4444";
    if (ms >= 5 * MINUTE_MS) return "#f97316";
    return "#fbbf24";
  }

  function renderChart(svg, session, replies, sessionEnd, chartScroll, zoom) {
    const NS = "http://www.w3.org/2000/svg";
    const padL = 52;
    const padR = 20;
    const padB = 52;
    const laneY = 118;
    const laneH = 28;
    const start = session.startTs;
    const span = Math.max(sessionEnd - start, MINUTE_MS);
    const wasAtEnd = chartScroll
      ? chartScroll.scrollWidth - chartScroll.scrollLeft - chartScroll.clientWidth < 48
      : true;
    const prevScrollW = chartScroll?.scrollWidth || 0;

    const chartW = BASE_CHART_INNER_W * zoom;
    const W = Math.max(860, padL + chartW + padR);
    const H = 260;
    const xAt = ts => padL + ((ts - start) / span) * chartW;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.replaceChildren();

    const mk = (name, attrs) => {
      const el = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      return el;
    };

    svg.appendChild(mk("text", {
      x: padL,
      y: 22,
      fill: "#6b7280",
      "font-size": 11
    })).textContent = `${t("chartSessionFrom")} ${fmtDateTime(start)}`;

    const endLabel = session.isPaused ? t("chartPausedAt") : t("chartNow");
    const endText = svg.appendChild(mk("text", {
      x: W - padR,
      y: 22,
      fill: "#6b7280",
      "font-size": 11,
      "text-anchor": "end"
    }));
    endText.textContent = `${endLabel}: ${fmtDateTime(sessionEnd)}`;

    svg.appendChild(mk("rect", {
      x: padL,
      y: laneY - 6,
      width: chartW,
      height: laneH + 12,
      rx: 6,
      fill: "#eff6ff",
      stroke: "#bfdbfe"
    }));

    if (session.isPaused && session.pauseTs > start) {
      const pauseX = xAt(session.pauseTs);
      svg.appendChild(mk("rect", {
        x: pauseX,
        y: laneY - 6,
        width: Math.max(padL + chartW - pauseX, 0),
        height: laneH + 12,
        fill: "rgba(252, 165, 165, 0.35)"
      }));
    }

    let prev = start;
    replies.forEach(reply => {
      const ts = reply.ts;
      const gapW = Math.max(xAt(ts) - xAt(prev), 1);
      if (ts > prev) {
        const gapMs = ts - prev;
        svg.appendChild(mk("rect", {
          x: xAt(prev),
          y: laneY,
          width: gapW,
          height: laneH,
          fill: gapColor(gapMs),
          opacity: 0.55,
          rx: 3
        }));
        if (gapW > 36) {
          const label = svg.appendChild(mk("text", {
            x: xAt(prev) + gapW / 2,
            y: laneY + laneH / 2 + 4,
            fill: "#78350f",
            "font-size": 10,
            "text-anchor": "middle",
            "font-weight": 600
          }));
          label.textContent = fmtDur(gapMs);
        }
      }
      prev = ts;
    });

    const tailMs = sessionEnd - prev;
    if (tailMs > 0 && sessionEnd > prev) {
      const tailW = Math.max(xAt(sessionEnd) - xAt(prev), 1);
      svg.appendChild(mk("rect", {
        x: xAt(prev),
        y: laneY,
        width: tailW,
        height: laneH,
        fill: "#e5e7eb",
        opacity: 0.85,
        rx: 3
      }));
      if (tailW > 44) {
        const label = svg.appendChild(mk("text", {
          x: xAt(prev) + tailW / 2,
          y: laneY + laneH / 2 + 4,
          fill: "#6b7280",
          "font-size": 10,
          "text-anchor": "middle"
        }));
        label.textContent = fmtDur(tailMs);
      }
    }

    replies.forEach((reply, i) => {
      const ts = reply.ts;
      const cx = xAt(ts);
      const marker = reply.ticketUrl
        ? (() => {
            const link = mk("a", {
              href: reply.ticketUrl,
              target: "_blank",
              rel: "noopener noreferrer"
            });
            link.appendChild(mk("circle", {
              cx,
              cy: laneY + laneH / 2,
              r: 9,
              fill: "#16a34a",
              stroke: "#fff",
              "stroke-width": 2,
              style: "cursor:pointer"
            }));
            const title = document.createElementNS(NS, "title");
            title.textContent = reply.ticketId;
            link.appendChild(title);
            return link;
          })()
        : mk("circle", {
            cx,
            cy: laneY + laneH / 2,
            r: 7,
            fill: "#16a34a",
            stroke: "#fff",
            "stroke-width": 2
          });

      svg.appendChild(mk("line", {
        x1: cx,
        y1: laneY - 8,
        x2: cx,
        y2: laneY + laneH + 8,
        stroke: "#16a34a",
        "stroke-width": 2
      }));
      svg.appendChild(marker);
      svg.appendChild(mk("text", {
        x: cx,
        y: laneY + laneH + 24,
        fill: "#15803d",
        "font-size": 10,
        "text-anchor": "middle",
        "font-weight": 600
      })).textContent = `#${i + 1}`;
      svg.appendChild(mk("text", {
        x: cx,
        y: laneY - 14,
        fill: "#374151",
        "font-size": 9,
        "text-anchor": "middle"
      })).textContent = fmtClock(ts);
    });

    const step = pickTickStep(span);
    const firstTick = Math.ceil(start / step) * step;
    for (let tick = firstTick; tick <= sessionEnd; tick += step) {
      const x = xAt(tick);
      svg.appendChild(mk("line", {
        x1: x,
        y1: H - padB,
        x2: x,
        y2: H - padB + 6,
        stroke: "#9ca3af"
      }));
      svg.appendChild(mk("text", {
        x,
        y: H - 12,
        fill: "#6b7280",
        "font-size": 10,
        "text-anchor": "middle"
      })).textContent = fmtClock(tick);
    }

    svg.appendChild(mk("line", {
      x1: padL,
      y1: H - padB,
      x2: padL + chartW,
      y2: H - padB,
      stroke: "#d1d5db"
    }));

    if (chartScroll) {
      requestAnimationFrame(() => {
        if (wasAtEnd) {
          chartScroll.scrollLeft = chartScroll.scrollWidth;
        } else if (prevScrollW > 0 && chartScroll.scrollWidth > prevScrollW) {
          chartScroll.scrollLeft += chartScroll.scrollWidth - prevScrollW;
        }
      });
    }
  }

  function renderGapTable(container, sessionStart, sessionEnd, replies) {
    container.replaceChildren();
    const h2 = document.createElement("h2");
    h2.textContent = t("chartGapList");
    container.appendChild(h2);

    if (!replies.length) {
      const p = document.createElement("p");
      p.style.cssText = "margin:0;color:#6b7280;font-size:12px";
      p.textContent = t("chartNoReplies");
      container.appendChild(p);
      return;
    }

    const table = document.createElement("table");
    table.className = "gap-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>${t("chartReplyAt")}</th>
          <th>${t("chartTicket")}</th>
          <th>${t("chartGapBefore")}</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    let prev = sessionStart;
    replies.forEach((reply, idx) => {
      const ts = reply.ts;
      const gap = ts - prev;
      const tr = document.createElement("tr");
      const durClass = gap >= 5 * MINUTE_MS ? "gap-dur long" : "gap-dur";
      const ticketCell = document.createElement("td");
      if (reply.ticketUrl) {
        const a = document.createElement("a");
        a.href = reply.ticketUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = shortTicketId(reply.ticketId);
        a.title = reply.ticketId;
        ticketCell.appendChild(a);
      } else {
        ticketCell.textContent = shortTicketId(reply.ticketId);
        ticketCell.style.color = "#9ca3af";
      }
      tr.appendChild(document.createElement("td")).textContent = String(idx + 1);
      const timeTd = document.createElement("td");
      timeTd.textContent = fmtDateTime(ts);
      tr.appendChild(timeTd);
      tr.appendChild(ticketCell);
      const gapTd = document.createElement("td");
      gapTd.className = durClass;
      gapTd.textContent = fmtDur(gap);
      tr.appendChild(gapTd);
      tbody.appendChild(tr);
      prev = ts;
    });
    const tail = sessionEnd - prev;
    if (tail > 0) {
      const tr = document.createElement("tr");
      const durClass = tail >= 5 * MINUTE_MS ? "gap-dur long" : "gap-dur";
      tr.innerHTML = `
        <td>…</td>
        <td>${t("chartAfterLast")}</td>
        <td>—</td>
        <td class="${durClass}">${fmtDur(tail)}</td>
      `;
      tbody.appendChild(tr);
    }
    container.appendChild(table);
  }

  function renderSummary(container, session, replies, sessionEnd) {
    const activeMs = sessionEnd - session.startTs - (session.pausedTotal || 0);
    const gaps = [];
    let prev = session.startTs;
    replies.forEach(reply => {
      gaps.push(reply.ts - prev);
      prev = reply.ts;
    });
    const avgGap = gaps.length
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length
      : NaN;

    const cards = [
      { label: t("chartWorkTime"), value: fmtDur(activeMs) },
      { label: t("chartReplies"), value: String(replies.length) },
      { label: t("chartAvgGap"), value: fmtDur(avgGap) },
      {
        label: t("chartStatus"),
        value: session.isPaused ? t("chartPaused") : t("chartActive")
      }
    ];

    container.replaceChildren();
    cards.forEach(card => {
      const div = document.createElement("div");
      div.className = "summary-card";
      div.innerHTML = `<div class="label">${card.label}</div><div class="value">${card.value}</div>`;
      container.appendChild(div);
    });
  }

  async function render() {
    const siteKey = `${TRACKING_HOST}::${REPLY_SELECTOR}`;
    const keyPrefix = `${siteKey}::`;
    const { sessions = {}, lastClickByTicket = {} } = await storageLocalGet([
      "sessions",
      "lastClickByTicket"
    ]);

    const session = sessions[siteKey] || null;
    const summaryEl = document.getElementById("summary");
    const svg = document.getElementById("timeline");
    const gapListEl = document.getElementById("gapList");
    const emptyEl = document.getElementById("empty");
    const chartWrap = document.getElementById("chartWrap");

    if (!session?.startTs) {
      summaryEl.classList.add("hidden");
      chartWrap.classList.add("hidden");
      gapListEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      emptyEl.textContent = t("chartNoSession");
      return;
    }

    const sessionEnd = session.isPaused ? session.pauseTs : Date.now();
    const replies = collectSessionReplies(
      lastClickByTicket,
      keyPrefix,
      session.startTs,
      sessionEnd
    );

    summaryEl.classList.remove("hidden");
    chartWrap.classList.remove("hidden");
    gapListEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");

    const chartScroll = document.getElementById("chartScroll");
    const zoomInput = document.getElementById("chartZoom");
    const zoomVal = document.getElementById("chartZoomVal");
    const autoZoom = computeAutoZoom(replies, session.startTs, sessionEnd);
    if (autoZoom > (Number(zoomInput?.dataset.lastAuto) || 0)) {
      zoomTouchedByUser = false;
    }
    const zoom = resolveChartZoom(replies, session.startTs, sessionEnd, zoomInput);
    syncZoomUi(zoomInput, zoomVal, zoom);
    if (zoomInput) zoomInput.dataset.lastAuto = String(autoZoom);

    renderSummary(summaryEl, session, replies, sessionEnd);
    renderChart(svg, session, replies, sessionEnd, chartScroll, zoom);
    renderGapTable(gapListEl, session.startTs, sessionEnd, replies);
  }

  function initChartZoom() {
    const zoomInput = document.getElementById("chartZoom");
    const zoomVal = document.getElementById("chartZoomVal");
    if (!zoomInput || zoomInput.dataset.zoomInit) return;
    zoomInput.dataset.zoomInit = "1";
    zoomInput.min = String(ZOOM_MIN);
    zoomInput.max = String(ZOOM_MAX);
    zoomInput.step = String(ZOOM_STEP);
    zoomInput.value = String(ZOOM_MIN);
    if (zoomVal) zoomVal.textContent = formatZoomLabel(ZOOM_MIN);
    zoomInput.addEventListener("input", () => {
      zoomTouchedByUser = true;
      if (zoomVal) zoomVal.textContent = formatZoomLabel(Number(zoomInput.value) || ZOOM_MIN);
      const chartScroll = document.getElementById("chartScroll");
      const svg = document.getElementById("timeline");
      storageLocalGet(["sessions", "lastClickByTicket"]).then(data => {
        const siteKey = `${TRACKING_HOST}::${REPLY_SELECTOR}`;
        const session = (data.sessions || {})[siteKey];
        if (!session?.startTs || !svg) return;
        const sessionEnd = session.isPaused ? session.pauseTs : Date.now();
        const replies = collectSessionReplies(
          data.lastClickByTicket || {},
          `${siteKey}::`,
          session.startTs,
          sessionEnd
        );
        const zoom = clampZoom(Number(zoomInput.value) || ZOOM_MIN);
        renderChart(svg, session, replies, sessionEnd, chartScroll, zoom);
      });
    });
  }

  function initChartPan() {
    const chartScroll = document.getElementById("chartScroll");
    if (!chartScroll || chartScroll.dataset.panInit) return;
    chartScroll.dataset.panInit = "1";

    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    chartScroll.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.pageX;
      startScroll = chartScroll.scrollLeft;
      chartScroll.classList.add("is-panning");
    });

    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 4) moved = true;
      chartScroll.scrollLeft = startScroll - dx;
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      chartScroll.classList.remove("is-panning");
    });

    chartScroll.addEventListener("click", e => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    chartScroll.addEventListener("dragstart", e => e.preventDefault());
  }

  function init() {
    initChartZoom();
    initChartPan();
    if (window.PageI18n) window.PageI18n.init(render);
    else render();
    setInterval(render, REFRESH_MS);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && (changes.stats || changes.sessions || changes.lastClickByTicket)) {
        render();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
