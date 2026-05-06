(function () {
  async function apiSupportPostJson(url, bodyObj) {
    return fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj)
    });
  }

  async function fetchJsonWithQueryIdFallback(url, id) {
    let res = await apiSupportPostJson(url, { query: { id } });
    if (!res.ok) {
      res = await apiSupportPostJson(url, { id });
    }
    return res;
  }

  function parseOrderGetResponse(data, orderId, friendlyId) {
    if (data.item) return data.item;
    if (data.items && Array.isArray(data.items)) {
      let order = data.items.find(item => item.id === orderId);
      if (!order && friendlyId) {
        order = data.items.find(item => item.friendlyId === friendlyId);
      }
      if (order) return order;
    }
    return null;
  }

  function parseProductGetResponse(data, productId) {
    if (data.item) return data.item;
    if (data.items && Array.isArray(data.items)) {
      return data.items.find(item => item.id === productId) || data.items[0];
    }
    return data;
  }

  function buildLogisticsOrdersFindAllBody(orderNumber) {
    return {
      limit: 1,
      offset: 0,
      sorting: [{ fieldName: "createdTime", order: "desc" }],
      filter: {
        id: "and",
        content: {
          and: {
            items: [
              {
                id: "orderNumber",
                content: {
                  values: {
                    values: [orderNumber]
                  }
                }
              }
            ]
          }
        }
      }
    };
  }

  function pickLogisticsOrderRow(items, orderNumber) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items.find(it => it.orderNumber === orderNumber) || items[0];
  }

  function weightFromLogisticsRow(row) {
    if (!row) return null;
    const w = row.measuredWeight ?? row.weight;
    return typeof w === "number" && !isNaN(w) ? w : null;
  }

  function mapOrderCountryToCharityCountry(code) {
    if (!code) return null;
    const c = String(code).toUpperCase();
    if (c === "DE") return "PT";
    if (c === "GB") return "UK";
    return c;
  }

  window.ExtApiHelpers = {
    apiSupportPostJson,
    fetchJsonWithQueryIdFallback,
    parseOrderGetResponse,
    parseProductGetResponse,
    buildLogisticsOrdersFindAllBody,
    pickLogisticsOrderRow,
    weightFromLogisticsRow,
    mapOrderCountryToCharityCountry
  };
})();
