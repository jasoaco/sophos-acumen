// Maps Sophos Central URL paths and page content to product keys and page types

const PRODUCT_ROUTE_MAP = [
  { pattern: /\/endpoint-protection|\/endpoint/i,  product: "endpoint" },
  { pattern: /\/mdr/i,                             product: "mdr" },
  { pattern: /\/ztna/i,                            product: "ztna" },
  { pattern: /\/email/i,                           product: "email" },
  { pattern: /\/itdr|\/identity/i,                 product: "itdr" },
  { pattern: /\/firewall/i,                        product: "firewall" },
  { pattern: /\/security-operations|\/xdr|\/taegis/i, product: "taegis" },
  { pattern: /\/ndr/i,                             product: "ndr" },
  { pattern: /\/cloud-security|\/cnapp|\/cloud-native/i, product: "cloud" },
  { pattern: /\/managed-risk/i,                    product: "risk" },
  { pattern: /\/advisory/i,                        product: "advisory" },
  { pattern: /\/server/i,                          product: "server" },
  { pattern: /\/encryption|\/device-encryption/i,  product: "encryption" },
  { pattern: /\/mobile/i,                          product: "mobile" },
  { pattern: /\/wireless/i,                        product: "wireless" },
  { pattern: /\/switches/i,                        product: "switches" },
  { pattern: /\/dns/i,                             product: "dns" },
  { pattern: /\/protected-browser|\/browser/i,     product: "browser" },
  { pattern: /\/phish/i,                           product: "phish" },
];

// Sub-page type within a product section
const PAGE_TYPE_MAP = [
  { pattern: /\/alerts?/i,                         pageType: "alerts-list" },
  { pattern: /\/cases?/i,                          pageType: "cases-list" },
  { pattern: /\/detections?/i,                     pageType: "detections" },
  { pattern: /\/endpoints?|\/devices?/i,           pageType: "endpoint-view" },
  { pattern: /\/threat-graphs?|\/graphs?/i,        pageType: "threat-graphs" },
  { pattern: /\/policies?/i,                       pageType: "policies" },
  { pattern: /\/reports?/i,                        pageType: "reports" },
  { pattern: /\/settings?/i,                       pageType: "settings" },
  { pattern: /\/dashboard/i,                       pageType: "dashboard" },
];

export function detectSophosCentralPage(snapshot) {
  const url = snapshot?.url || '';
  const route = snapshot?.route || '';
  const title = (snapshot?.title || '').toLowerCase();
  const headingBlob = (snapshot?.headings || []).join(' ').toLowerCase();

  const isSophosCentral =
    url.includes('central.sophos.com') ||
    title.includes('sophos central') ||
    headingBlob.includes('sophos central');

  if (!isSophosCentral) {
    return { supported: false, app: 'unknown', product: null, pageType: 'generic', confidence: 0.2 };
  }

  // Detect product from URL route
  let product = null;
  for (const entry of PRODUCT_ROUTE_MAP) {
    if (entry.pattern.test(route)) {
      product = entry.product;
      break;
    }
  }

  // Fall back to heading text if route doesn't match
  if (!product) {
    const corpus = `${route} ${headingBlob}`;
    for (const entry of PRODUCT_ROUTE_MAP) {
      if (entry.pattern.test(corpus)) {
        product = entry.product;
        break;
      }
    }
  }

  // Detect sub-page type
  let pageType = 'dashboard';
  for (const entry of PAGE_TYPE_MAP) {
    if (entry.pattern.test(route)) {
      pageType = entry.pageType;
      break;
    }
  }

  return {
    supported: true,
    app: 'sophos-central',
    product,
    pageType,
    confidence: product ? 0.92 : 0.72,
  };
}
