const settingIds = [
    "showContacts",
    "trackingEnabled",
    "fraudTrackingEnabled",
    "hideSystem",
    "hideTranslateLanguages",
    "attachmentButtonEnabled",
    "scopeEnabled",
    "jlOrderWeightsEnabled",
    "doubleOriginEnabled",
    "charityRestEnabled",
    "statusModeAuto",
    "sizeTooltipEnabled",
    "totalTodayByMsk"
];

const textSettingIds = [
    "doubleOriginIndiaMerchants",
    "doubleOriginTurkeyMerchants"
];

const DEFAULT_DOUBLE_ORIGIN_INDIA = [
    "Himalaya Wellness Poland Sp. z o. o.",
    "Lavish Livings International FZE"
].join(", ");
const DEFAULT_DOUBLE_ORIGIN_TURKEY = "Bugan Group LTD";
const TRACKING_HOST = "babylone.joom.it";
const HOUR_MS = 3600_000;

function getTodayRangeMs(useMsk = false) {
    if (!useMsk) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return { start, end: start + 24 * HOUR_MS };
    }
    const mskOffsetMs = 3 * HOUR_MS;
    const shiftedNow = new Date(Date.now() + mskOffsetMs);
    const mskStartUtc =
        Date.UTC(
            shiftedNow.getUTCFullYear(),
            shiftedNow.getUTCMonth(),
            shiftedNow.getUTCDate()
        ) - mskOffsetMs;
    return { start: mskStartUtc, end: mskStartUtc + 24 * HOUR_MS };
}

function clearTodayStats(cb) {
    chrome.storage.sync.get(["totalTodayByMsk"], syncCfg => {
        const { start, end } = getTodayRangeMs(syncCfg.totalTodayByMsk === true);
        chrome.storage.local.get(["stats", "lastClickByTicket"], res => {
            const stats = { ...(res.stats || {}) };
            const lastClickByTicket = { ...(res.lastClickByTicket || {}) };
            const hostPrefix = `${TRACKING_HOST}::`;

            for (const key in stats) {
                if (!key.startsWith(hostPrefix)) continue;
                for (const hourISO in stats[key]) {
                    const t = Date.parse(hourISO + ":00:00.000Z");
                    if (t >= start && t < end) {
                        delete stats[key][hourISO];
                    }
                }
                if (Object.keys(stats[key]).length === 0) {
                    delete stats[key];
                }
            }

            for (const key in lastClickByTicket) {
                if (lastClickByTicket[key] >= start) {
                    delete lastClickByTicket[key];
                }
            }

            chrome.storage.local.set({ stats, lastClickByTicket }, () => {
                if (typeof cb === "function") cb();
            });
        });
    });
}

function updateTotalTodayModeVisual() {
    const toggle = document.getElementById("totalTodayByMsk");
    const localLabel = document.getElementById("totalTodayLocalLabel");
    const mskLabel = document.getElementById("totalTodayMskLabel");
    if (!toggle || !localLabel || !mskLabel) return;
    const useMsk = toggle.checked;
    localLabel.classList.toggle("active", !useMsk);
    mskLabel.classList.toggle("active", useMsk);
}

function updateDependentVisibility() {
    const trackingToggle = document.getElementById("trackingEnabled");
    const totalTodayRow = document.getElementById("totalTodayRow");
    const clearTodayRow = document.getElementById("clearTodayRow");
    const trackingOn = trackingToggle?.checked !== false;
    if (trackingToggle && totalTodayRow) {
        totalTodayRow.style.display = trackingOn ? "flex" : "none";
    }
    if (clearTodayRow) {
        clearTodayRow.hidden = !trackingOn;
    }

    const doubleOriginToggle = document.getElementById("doubleOriginEnabled");
    const doubleOriginBlock = document.getElementById("doubleOriginOverridesBlock");
    if (doubleOriginToggle && doubleOriginBlock) {
        doubleOriginBlock.style.display = doubleOriginToggle.checked ? "block" : "none";
    }
}

const languages = [
    { code: "en", name: "English" },
    { code: "ru", name: "Русский" },
    { code: "es", name: "Español" },
    { code: "de", name: "Deutsch" },
    { code: "fr", name: "Français" },
    { code: "it", name: "Italiano" },
    { code: "pt", name: "Português" },
    { code: "pl", name: "Polski" },
    { code: "ro", name: "Română" },
    { code: "tr", name: "Türkçe" },
    { code: "ar", name: "العربية" },
    { code: "uk", name: "Українська" },
    { code: "he", name: "עברית" },
    { code: "el", name: "Ελληνικά" },
    { code: "cs", name: "Čeština" },
    { code: "nl", name: "Nederlands" },
    { code: "sv", name: "Svenska" },
    { code: "no", name: "Norsk" },
    { code: "et", name: "Eesti" },
    { code: "lv", name: "Latviešu" },
    { code: "sk", name: "Slovenčina" },
    { code: "hu", name: "Magyar" },
    { code: "lt", name: "Lietuvių" },
    { code: "hr", name: "Hrvatski" },
    { code: "ka", name: "ქართული" },
    { code: "sr", name: "Српски" },
    { code: "bg", name: "Български" },
    { code: "kk", name: "Қазақ" },
    { code: "uz", name: "O'zbek" }
];

function renderLanguages(filter = "") {
    const grid = document.getElementById("languagesGrid");
    if (!grid) return;

    const searchLower = filter.toLowerCase();
    const filtered = languages.filter(lang => 
        lang.name.toLowerCase().includes(searchLower) || 
        lang.code.toLowerCase().includes(searchLower)
    );

    grid.replaceChildren();
    filtered.forEach(lang => {
        const item = document.createElement("div");
        item.className = "language-item";
        item.dataset.lang = lang.code;

        const text = document.createElement("span");
        text.textContent = `${lang.name} (${lang.code})`;

        const label = document.createElement("label");
        label.className = "switch";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = `hideTranslate_${lang.code}`;
        input.dataset.lang = lang.code;

        const slider = document.createElement("span");
        slider.className = "slider";

        label.appendChild(input);
        label.appendChild(slider);
        item.appendChild(text);
        item.appendChild(label);
        grid.appendChild(item);
    });

    chrome.storage.sync.get(["hideTranslateLanguages"], (cfg) => {
        const selected = cfg.hideTranslateLanguages || [];
        filtered.forEach(lang => {
            const cb = document.getElementById(`hideTranslate_${lang.code}`);
            if (cb) cb.checked = selected.includes(lang.code);
        });
    });

    filtered.forEach(lang => {
        const cb = document.getElementById(`hideTranslate_${lang.code}`);
        if (!cb) return;

        cb.addEventListener("change", () => {
            chrome.storage.sync.get(["hideTranslateLanguages"], (cfg) => {
                let selected = cfg.hideTranslateLanguages || [];

                if (cb.checked) {
                    if (!selected.includes(lang.code)) selected.push(lang.code);
                } else {
                    selected = selected.filter(l => l !== lang.code);
                }

                chrome.storage.sync.set({ hideTranslateLanguages: selected });
            });
        });
    });
}

function initSettings() {
    chrome.storage.sync.get([...settingIds, ...textSettingIds], (cfg) => {
        settingIds.forEach(id => {
            if (id === "hideTranslateLanguages") {
                return;
            }

            const el = document.getElementById(id);
            if (!el) return;

            if (id === "charityRestEnabled") {
                el.checked = cfg.charityRestEnabled === true;
            } else if (id === "fraudTrackingEnabled") {
                el.checked = cfg.fraudTrackingEnabled === true;
            } else {
                el.checked =
                    id === "showContacts" ||
                    id === "trackingEnabled" ||
                    id === "attachmentButtonEnabled" ||
                    id === "scopeEnabled" ||
                    id === "jlOrderWeightsEnabled" ||
                    id === "doubleOriginEnabled" ||
                    id === "statusModeAuto" ||
                    id === "sizeTooltipEnabled"
                        ? cfg[id] !== false
                        : Boolean(cfg[id]);
            }
        });
        updateTotalTodayModeVisual();
        updateDependentVisibility();

        const autoRow = document.getElementById("autoPauseRow");
        if (autoRow) {
            const trackingEnabled = cfg.trackingEnabled !== false;
            autoRow.style.display = trackingEnabled ? "flex" : "none";
        }

        textSettingIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof cfg[id] === "string") {
                el.value = cfg[id];
                return;
            }
            if (id === "doubleOriginIndiaMerchants") {
                el.value = DEFAULT_DOUBLE_ORIGIN_INDIA;
                chrome.storage.sync.set({ doubleOriginIndiaMerchants: DEFAULT_DOUBLE_ORIGIN_INDIA });
                return;
            }
            if (id === "doubleOriginTurkeyMerchants") {
                el.value = DEFAULT_DOUBLE_ORIGIN_TURKEY;
                chrome.storage.sync.set({ doubleOriginTurkeyMerchants: DEFAULT_DOUBLE_ORIGIN_TURKEY });
                return;
            }
            el.value = "";
        });

    });

    settingIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el || id === "hideTranslateLanguages") return;

        el.addEventListener("change", () => {
            chrome.storage.sync.set({ [id]: el.checked });
            if (id === "totalTodayByMsk") {
                updateTotalTodayModeVisual();
            }

            if (id === "trackingEnabled") {
                const autoRow = document.getElementById("autoPauseRow");
                if (autoRow) autoRow.style.display = el.checked ? "flex" : "none";
                if (!el.checked) {
                    const autoToggle = document.getElementById("statusModeAuto");
                    if (autoToggle) autoToggle.checked = false;
                    chrome.storage.sync.set({ statusModeAuto: false, statusMode: "manual" });
                }
            } else if (id === "statusModeAuto") {
                chrome.storage.sync.set({ statusMode: el.checked ? "auto" : "manual" });
            }
            updateDependentVisibility();
        });
    });

    textSettingIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const save = () => chrome.storage.sync.set({ [id]: el.value || "" });
        el.addEventListener("change", save);
        el.addEventListener("blur", save);
    });

    renderLanguages();

    const clearTodayBtn = document.getElementById("clearTodayBtn");
    if (clearTodayBtn) {
        const t = (k) => (window.PageI18n ? window.PageI18n.t(k) : k);
        clearTodayBtn.addEventListener("click", () => {
            if (clearTodayBtn.disabled) return;
            clearTodayBtn.disabled = true;
            clearTodayStats(() => {
                const doneLabel = t("clearTodayDone");
                const defaultLabel = t("clearTodayStats");
                clearTodayBtn.textContent = doneLabel;
                setTimeout(() => {
                    clearTodayBtn.textContent = defaultLabel;
                    clearTodayBtn.disabled = false;
                }, 1800);
            });
        });
    }

    const openSessionChartBtn = document.getElementById("openSessionChartBtn");
    if (openSessionChartBtn) {
        openSessionChartBtn.addEventListener("click", () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("session-chart.html") });
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initSettings, 50);

    const t = (k) => (window.PageI18n ? window.PageI18n.t(k) : k);

    const toggleBtn = document.getElementById("toggleLanguages");
    const languagesContainer = document.getElementById("languagesContainer");
    const searchInput = document.getElementById("languageSearch");
    const toggleDoubleOriginBtn = document.getElementById("toggleDoubleOrigin");
    const doubleOriginContainer = document.getElementById("doubleOriginContainer");

    // Show/Hide labels depend on expanded state, so they're set here (not via data-i18n alone).
    const updateToggleTexts = () => {
        if (toggleBtn && languagesContainer) {
            toggleBtn.textContent = languagesContainer.classList.contains("expanded") ? t("hide") : t("show");
        }
        if (toggleDoubleOriginBtn && doubleOriginContainer) {
            toggleDoubleOriginBtn.textContent = doubleOriginContainer.classList.contains("expanded") ? t("hide") : t("show");
        }
    };

    if (toggleBtn && languagesContainer) {
        toggleBtn.addEventListener("click", () => {
            languagesContainer.classList.toggle("expanded");
            updateToggleTexts();
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            renderLanguages(e.target.value);
        });
    }

    if (toggleDoubleOriginBtn && doubleOriginContainer) {
        toggleDoubleOriginBtn.addEventListener("click", () => {
            doubleOriginContainer.classList.toggle("expanded");
            updateToggleTexts();
        });
    }

    // Language selector (Auto / English / Русский) -> stored as uiLang.
    const uiLangSelect = document.getElementById("uiLangSelect");
    if (uiLangSelect) {
        chrome.storage.sync.get(["uiLang"], (cfg) => {
            uiLangSelect.value = (cfg && cfg.uiLang) || "auto";
        });
        uiLangSelect.addEventListener("change", () => {
            chrome.storage.sync.set({ uiLang: uiLangSelect.value });
        });
    }

    // Localize static DOM now and on every uiLang change; fix state-dependent labels after.
    if (window.PageI18n) window.PageI18n.init(updateToggleTexts);
});
