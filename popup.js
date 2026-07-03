// popup.js — только метрика
const HOUR_MS = 3600_000;
const MINUTE_MS = 60_000;
const SUPPORTED_TRACKING_HOSTS = new Set(["babylone.joom.it"]);
const t = (k) => (window.PageI18n ? window.PageI18n.t(k) : k);

// --- утилиты ---
function tabsQuery(q){return new Promise(r=>chrome.tabs.query(q,t=>r(t||[])))}
function storageGet(k){return new Promise(r=>chrome.storage.local.get(k,res=>r(res||{})))}
function storageSet(o){return new Promise(r=>chrome.storage.local.set(o,()=>r(true)))}
function storageSyncGet(k){return new Promise(r=>chrome.storage.sync.get(k,res=>r(res||{})))}
function storageSyncSet(o){return new Promise(r=>chrome.storage.sync.set(o,()=>r(true)))}

// --- форматирование ---
function fmt2(n){return Number.isFinite(n)?(Math.round(n*100)/100).toString():"—"}
function fmtDur(ms){
    if(!Number.isFinite(ms)||ms<=0) return "—";
    const h=Math.floor(ms/HOUR_MS), m=Math.floor((ms%HOUR_MS)/60000);
    return `${h}${t("durH")} ${m}${t("durM")}`;
}

function getTodayRangeMs(useMsk = false){
    if(!useMsk){
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return { start, end: start + 24 * HOUR_MS };
    }
    const mskOffsetMs = 3 * HOUR_MS;
    const shiftedNow = new Date(Date.now() + mskOffsetMs);
    const mskStartUtc = Date.UTC(
        shiftedNow.getUTCFullYear(),
        shiftedNow.getUTCMonth(),
        shiftedNow.getUTCDate()
    ) - mskOffsetMs;
    return { start: mskStartUtc, end: mskStartUtc + 24 * HOUR_MS };
}

// --- контекст активной вкладки ---
async function getActiveContext() {
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    let host = "";
    try { host = new URL(tabs[0]?.url || "").host; } catch {}
    const normalizedHost = host.replace(/^iap-support\./, "");
    const { lastSelectorByHost = {} } = await storageGet(["lastSelectorByHost"]);
    const selector = lastSelectorByHost[normalizedHost] || "Reply";
    const siteKey  = `${normalizedHost}::${selector}`;
    const keyPrefix = `${siteKey}::`;
    return {
        host: normalizedHost,
        selector,
        siteKey,
        keyPrefix,
        isSupportedHost: SUPPORTED_TRACKING_HOSTS.has(normalizedHost)
    };
}

// --- агрегация ---
function aggregateBuckets(stats, keyPrefix){
    const buckets = {};
    for(const k in stats){
        if(!k.startsWith(keyPrefix)) continue;
        for(const hourISO in stats[k]){
            buckets[hourISO] = (buckets[hourISO] || 0) + (stats[k][hourISO] || 0);
        }
    }
    return buckets;
}

// --- сумма за сегодня ---
function sumToday(buckets, useMsk = false){
    const { start, end } = getTodayRangeMs(useMsk);
    let sum=0;
    for(const h in buckets){
        const t=Date.parse(h+":00:00.000Z");
        const lt=new Date(t).getTime();
        if(lt>=start && lt<end) sum+=buckets[h]||0;
    }
    return sum;
}

// --- чтение состояния ---
async function readState(){
    const { host, selector, siteKey, keyPrefix, isSupportedHost } = await getActiveContext();
    const { stats = {}, sessions = {} } = await storageGet(["stats","sessions"]);
    const buckets = aggregateBuckets(stats, keyPrefix);
    const fraudKeyPrefix = `${host}::Fraud::`;
    const fraudBuckets = aggregateBuckets(stats, fraudKeyPrefix);
    const session = sessions[siteKey] || null;
    return { host, selector, siteKey, keyPrefix, buckets, fraudBuckets, session, isSupportedHost };
}

// --- расчёт сессии ---
function calcSession(session, buckets){
    if(!session?.startTs) return { clicks:0, dur:NaN, rph:NaN, state:"idle" };
    const now = Date.now();
    const end = session.isPaused ? session.pauseTs : now;
    const alignedStart = session.alignedStart ?? Math.floor(session.startTs/HOUR_MS)*HOUR_MS;
    let clicks = 0;
    for(const h in buckets){
        const t = Date.parse(h+":00:00.000Z");
        if(t>=alignedStart && t<=end) clicks += buckets[h] || 0;
    }
    if(session.baselineHourISO && buckets[session.baselineHourISO] !== undefined){
        clicks -= session.baselineHourCount || 0;
    }
    if(clicks < 0) clicks = 0;
    let dur = end - session.startTs - (session.pausedTotal || 0);
    if(session.isPaused) dur -= (end - session.pauseTs);
    dur = Math.max(0, dur);
    if(session.isPaused){
        if(!Number.isFinite(session.cachedClicks)){
            session.cachedClicks = clicks;
            session.cachedDur = dur;
            session.cachedRph = dur>0 ? clicks/(dur/HOUR_MS) : NaN;
        }
        return { clicks: session.cachedClicks, dur: session.cachedDur, rph: session.cachedRph, state:"paused" };
    }
    const rph = dur>0 ? clicks/(dur/HOUR_MS) : NaN;
    return { clicks, dur, rph, state:"active" };
}

// --- рендер UI ---
async function render(){
    // Проверяем настройку трекинга
    const { trackingEnabled, fraudTrackingEnabled, statusMode: syncStatus, statusModeAuto, totalTodayByMsk } =
        await storageSyncGet(["trackingEnabled","fraudTrackingEnabled","statusMode","statusModeAuto","totalTodayByMsk"]);
    const { statusModeLocal } = await storageGet(["statusModeLocal"]);
    let statusMode;
    if (statusModeAuto === true) {
      statusMode = "auto";
    } else if (statusModeAuto === false) {
      statusMode = "manual";
    } else {
      statusMode = syncStatus ?? statusModeLocal ?? "manual";
    }
    const trackingContent = document.getElementById("trackingContent");
    const trackingDisabledMsg = document.getElementById("trackingDisabled");
    const fraudTodayCard = document.getElementById("fraudTodayCard");

    if (trackingEnabled === false) {
        if (trackingContent) trackingContent.classList.add("hidden");
        if (trackingDisabledMsg) trackingDisabledMsg.classList.remove("hidden");
        return;
    }

    // Показываем интерфейс трекинга, скрываем сообщение
    if (trackingContent) trackingContent.classList.remove("hidden");
    if (trackingDisabledMsg) trackingDisabledMsg.classList.add("hidden");
    if (fraudTodayCard) {
        fraudTodayCard.classList.toggle("hidden", fraudTrackingEnabled !== true);
    }

    const { buckets, fraudBuckets, session, isSupportedHost } = await readState();
    const today = sumToday(buckets, totalTodayByMsk === true);
    const fraudToday = sumToday(fraudBuckets, totalTodayByMsk === true);
    const { clicks, dur, rph, state } = calcSession(session, buckets);
    const el = (id,v)=>{ const x = document.getElementById(id); if(x) x.textContent = v; };
    const pauseBtn = document.getElementById("pauseBtn");
    const clearBtn = document.getElementById("clearBtn");

    if (!isSupportedHost) {
        el("today", "0");
        el("fraudToday", "0");
        el("sinceStart", "0");
        el("dur", "—");
        el("rph", "—");
        el("since", t("openBabylone"));
        if (pauseBtn) pauseBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        return;
    }

    el("today", String(today));
    el("fraudToday", String(fraudToday));
    el("sinceStart", String(clicks));
    el("dur", fmtDur(dur));
    el("rph", fmt2(rph));

    if (pauseBtn) pauseBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
    const isAutoMode = statusMode === "auto" || statusModeAuto === true;
    if (pauseBtn) pauseBtn.style.display = isAutoMode ? "none" : "inline-flex";

    //  Автозапуск, если сессия ещё не создана
    if (!session?.startTs) {
        await startOrResume(); // создаём сессию автоматически
        return;
    }

    if(state === "idle"){
        if(pauseBtn){ pauseBtn.textContent = t("resume"); pauseBtn.disabled = false; }
        el("since", t("metricIdle"));
    } else if(state === "paused"){
        if(pauseBtn){ pauseBtn.textContent = t("resume"); pauseBtn.disabled = false; }
        el("since", `${t("pausedAt")}${new Date(session.pauseTs).toLocaleString()}`);
    } else {
        if(pauseBtn){ pauseBtn.textContent = t("pause"); pauseBtn.disabled = false; }
        el("since", `${t("runningSince")}${new Date(session.startTs).toLocaleString()}`);
    }
}

// --- старт / пауза / очистка ---
async function startOrResume(){
    const { siteKey, keyPrefix, isSupportedHost } = await getActiveContext();
    if (!isSupportedHost) return render();
    const { stats = {}, sessions = {} } = await storageGet(["stats","sessions"]);
    const buckets = aggregateBuckets(stats, keyPrefix);
    const now = Date.now();
    const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
    const currentHourISO = new Date(hourStart).toISOString().slice(0,13);
    const s = sessions[siteKey];
    if(!s?.startTs){
        sessions[siteKey] = {
            startTs: now,
            isPaused: false,
            pausedTotal: 0,
            alignedStart: hourStart,
            baselineHourISO: currentHourISO,
            baselineHourCount: buckets[currentHourISO] || 0
        };
    } else if (s.isPaused){
        if (s.pauseTs) s.pausedTotal = (s.pausedTotal || 0) + (now - s.pauseTs);
        s.isPaused = false;
        delete s.pauseTs; delete s.cachedClicks; delete s.cachedDur; delete s.cachedRph;
        sessions[siteKey] = s;
    } else {
        return render();
    }
    await storageSet({ sessions });
    render();
}

async function togglePause(){
    const { siteKey, isSupportedHost } = await getActiveContext();
    if (!isSupportedHost) return render();
    const { sessions = {} } = await storageGet(["sessions"]);
    const s = sessions[siteKey]; if(!s?.startTs) return;
    if(s.isPaused){ return startOrResume(); }
    s.isPaused = true; s.pauseTs = Date.now();
    sessions[siteKey] = s; await storageSet({ sessions });
    return render();
}

async function clearMetric(){
    const { siteKey, isSupportedHost } = await getActiveContext();
    if (!isSupportedHost) return render();
    const { sessions = {} } = await storageGet(["sessions"]);
    if (sessions[siteKey]) { delete sessions[siteKey]; await storageSet({ sessions }); }
    return render();
}

// --- инициализация ---
function init(){
    const startBtn = document.getElementById("startBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const clearBtn = document.getElementById("clearBtn");
    const settingsBtn = document.getElementById("openSettings");
    const settingsBtnFromDisabled = document.getElementById("openSettingsFromDisabled");
    
    if(startBtn) startBtn.addEventListener("click", startOrResume);
    if(pauseBtn) pauseBtn.addEventListener("click", togglePause);
    if(clearBtn) clearBtn.addEventListener("click", clearMetric);
    
    const openSettings = () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL("settings.html")
        });
    };
    
    if(settingsBtn) {
        settingsBtn.addEventListener("click", openSettings);
    }
    if(settingsBtnFromDisabled) {
        settingsBtnFromDisabled.addEventListener("click", openSettings);
    }
    if (window.PageI18n) window.PageI18n.init(render);
    render();
    setInterval(render, MINUTE_MS);
    
    // Слушаем изменения настроек
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (
            areaName === "sync" &&
            (changes.trackingEnabled || changes.fraudTrackingEnabled || changes.statusModeAuto || changes.statusMode || changes.totalTodayByMsk)
        ) {
            render();
        }
    });
}
document.addEventListener("DOMContentLoaded", init);


