(function () {
  function fallbackFormat(code, number, emptyValue) {
    const normalizedCode = String(code || "").trim();
    const num = String(number || "").replace(/\D+/g, "");
    if (!normalizedCode || !num) return emptyValue;
    return (`+${normalizedCode} ${num}`).trim();
  }

  function formatInternationalPhone(raw, emptyValue = "") {
    if (!raw) return emptyValue;
    try {
      const parser = window.libphonenumber?.parsePhoneNumberWithError;
      if (typeof parser !== "function") return raw;
      const prepared = raw.startsWith("+") ? raw : `+${raw}`;
      const parsed = parser(prepared);
      return parsed?.formatInternational?.() || raw;
    } catch {
      return raw;
    }
  }

  function formatPhoneFromObject(phoneObj, emptyValue = "") {
    if (!phoneObj) return emptyValue;
    const code = String(phoneObj.code || "").trim();
    const number = String(phoneObj.number || "").replace(/\D+/g, "");
    if (!code || !number) return emptyValue;
    const raw = `+${code}${number}`;
    const formatted = formatInternationalPhone(raw, emptyValue);
    if (!formatted || formatted === raw) {
      return fallbackFormat(code, number, emptyValue);
    }
    return formatted;
  }

  window.ExtPhoneUtils = {
    formatInternationalPhone,
    formatPhoneFromObject
  };
})();
