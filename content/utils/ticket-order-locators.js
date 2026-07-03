(function () {
  const SEL_TICKET_LINK_ICON = 'a.WCZ9c3DOtWoymEhUqVxD[href*="/tickets/"]';

  function getOrderIdFromURL() {
    const match = window.location.pathname.match(/\/orders\/([a-f0-9]{24})/i);
    return match ? match[1] : null;
  }

  function getOrderIdFromDOM(container) {
    const parseMongoIdFromOrderHref = window.ExtIdParsers?.parseMongoIdFromOrderHref;
    const linkSelectors = [
      'a.TijHv0zOOldWzA_Ck6tA[href*="/orders/"]',
      'a[href*="/orders/"]'
    ];
    let current = container;
    for (let i = 0; i < 10 && current; i++) {
      for (const sel of linkSelectors) {
        const link = current.querySelector?.(sel);
        if (!link) continue;
        const id = parseMongoIdFromOrderHref ? parseMongoIdFromOrderHref(link.href) : null;
        if (id) {
          return { id, friendlyId: link.textContent.trim() };
        }
      }

      const orderId =
        current.getAttribute?.("data-order-id") ||
        current.getAttribute?.("data-orderid") ||
        current.getAttribute?.("data-id");
      if (orderId && /^[a-f0-9]{24}$/i.test(orderId)) {
        return { id: orderId };
      }

      current = current.parentElement;
    }

    return null;
  }

  function queryTicketHeaderLink() {
    return (
      document.querySelector(
        'div.msM10ctEzV_6N6FABbh9 div.qDPXBNxBFkBmr2AS4ftI a[href*="/tickets/"]'
      ) ||
      document.querySelector(
        'div.qDPXBNxBFkBmr2AS4ftI a[href*="/tickets/"]'
      )
    );
  }

  function resolveAbsoluteTicketHref(anchor, fallbackBase) {
    if (!anchor) return null;
    const base = fallbackBase || window.location.href;
    try {
      return new URL(
        anchor.getAttribute("href") || "",
        window.location.origin
      ).toString();
    } catch {
      return anchor.href || base;
    }
  }

  function getTicketIdFromContext(contextEl) {
    const ticketIdFromHref = window.ExtIdParsers?.ticketIdFromHref;
    if (!ticketIdFromHref || !contextEl) return null;

    let node = contextEl;
    for (let i = 0; i < 40 && node; i++) {
      if (node.matches?.('a[href*="/tickets/"]')) {
        const id = ticketIdFromHref(node.href || node.getAttribute("href"));
        if (id) return id;
      }

      const links = Array.from(node.querySelectorAll('a[href*="/tickets/"]'));
      const ids = [];
      for (const link of links) {
        const id = ticketIdFromHref(link.href || link.getAttribute("href"));
        if (id) ids.push(id);
      }
      const unique = [...new Set(ids)];
      if (unique.length === 1) return unique[0];

      node = node.parentElement;
    }
    return null;
  }

  function getTicketId(contextEl) {
    const ticketIdFromHref = window.ExtIdParsers?.ticketIdFromHref;
    if (!ticketIdFromHref) return "auto_" + Date.now();

    const fromContext = getTicketIdFromContext(contextEl);
    if (fromContext) return fromContext;
    const iconLink = document.querySelector(SEL_TICKET_LINK_ICON);
    let id = ticketIdFromHref(iconLink?.href || iconLink?.getAttribute("href"));
    if (id) return id;

    const headerLink = queryTicketHeaderLink();
    id = ticketIdFromHref(headerLink?.href || headerLink?.getAttribute("href"));
    if (id) return id;

    const anyLink = document.querySelector('a[href*="/tickets/"]');
    id = ticketIdFromHref(anyLink?.href);
    if (id) return id;

    id = ticketIdFromHref(window.location.href);
    if (id) return id;

    return "auto_" + Date.now();
  }

  function getCurrentTicketLinkUrl() {
    const href = window.location.href;
    if (/\/tickets\/[a-f0-9]{8,32}/i.test(href)) {
      return href;
    }
    const iconLink = document.querySelector(SEL_TICKET_LINK_ICON);
    if (iconLink) {
      return resolveAbsoluteTicketHref(iconLink, href);
    }
    const headerLink = queryTicketHeaderLink();
    if (headerLink) {
      return resolveAbsoluteTicketHref(headerLink, href);
    }
    const allLinks = Array.from(
      document.querySelectorAll('a[href*="/tickets/"]')
    );
    const last = allLinks[allLinks.length - 1];
    if (last) {
      return resolveAbsoluteTicketHref(last, href);
    }
    return href;
  }

  window.ExtTicketOrderLocators = {
    getOrderIdFromURL,
    getOrderIdFromDOM,
    queryTicketHeaderLink,
    resolveAbsoluteTicketHref,
    getTicketIdFromContext,
    getTicketId,
    getCurrentTicketLinkUrl
  };
})();
