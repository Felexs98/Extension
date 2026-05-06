(function () {
  function buildSheetHyperlinkFormula(url, label) {
    if (!url) return "";
    const safeUrl = String(url).replace(/"/g, '""');
    const safeLabel = String(label || url).replace(/"/g, '""');
    return `=HYPERLINK("${safeUrl}";"${safeLabel}")`;
  }

  function buildSheetMultiOrderHyperlinkFormula(orders) {
    if (!Array.isArray(orders) || !orders.length) return "";
    if (orders.length === 1) {
      return buildSheetHyperlinkFormula(orders[0].url, orders[0].friendlyId || orders[0].id);
    }
    const parts = orders
      .filter(o => o && o.url && (o.friendlyId || o.id))
      .map(o => {
        const safeUrl = String(o.url).replace(/"/g, '""');
        const safeLabel = String(o.friendlyId || o.id).replace(/"/g, '""');
        return `HYPERLINK("${safeUrl}";"${safeLabel}")`;
      });
    if (!parts.length) return "";
    return `=${parts.join("&CHAR(10)&")}`;
  }

  function parseSheetHyperlinkFormula(value) {
    const s = String(value || "");
    const m = s.match(/^=HYPERLINK\("([^"]*)";"([^"]*)"\)$/i);
    if (!m) return null;
    return {
      url: m[1].replace(/""/g, '"'),
      label: m[2].replace(/""/g, '"')
    };
  }

  function extractOrderIdFromOrderCellValue(v) {
    const parsed = parseSheetHyperlinkFormula(v);
    const href = parsed?.url || String(v || "");
    const m = href.match(/\/orders\/([a-f0-9]{24})/i);
    return m ? m[1] : null;
  }

  function buildSheetRowLink(sheetDocUrlOrId, rowNo) {
    if (!sheetDocUrlOrId || !rowNo) return "";
    const src = String(sheetDocUrlOrId).trim();
    const idMatch = src.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const pureIdMatch = src.match(/^[a-zA-Z0-9_-]{20,}$/);
    const sheetId = idMatch?.[1] || (pureIdMatch ? pureIdMatch[0] : "");
    if (!sheetId) return "";
    return `https://docs.google.com/spreadsheets/d/${sheetId}/edit?hl=ru&gid=0#gid=0&range=${rowNo}:${rowNo}`;
  }

  window.ExtSheetUtils = {
    buildSheetHyperlinkFormula,
    buildSheetMultiOrderHyperlinkFormula,
    parseSheetHyperlinkFormula,
    extractOrderIdFromOrderCellValue,
    buildSheetRowLink
  };
})();
