(function () {
  function parseMongoIdFromOrderHref(href) {
    const m = String(href || "").match(/\/orders\/([a-f0-9]{24})/i);
    return m ? m[1] : null;
  }

  function ticketIdFromHref(href) {
    if (!href) return null;
    const m = String(href).match(/\/tickets\/([a-f0-9]{8,32})/i);
    return m ? m[1] : null;
  }

  window.ExtIdParsers = {
    parseMongoIdFromOrderHref,
    ticketIdFromHref
  };
})();
