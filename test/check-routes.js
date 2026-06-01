// Validates the product route map against the extracted product data.
// Catches the class of bug where a product is unreachable or a route
// targets a non-existent product key.
const fs = require("fs");
const path = require("path");

global.window = {};
eval(fs.readFileSync(path.join(__dirname, "..", "data", "products.js"), "utf8"));
const productKeys = Object.keys(window.PRODUCTS);

const MAP = [
  [/\/endpoint-protection|\/endpoint/i, "endpoint"],
  [/\/mdr/i, "mdr"],
  [/\/ztna/i, "ztna"],
  [/\/email/i, "email"],
  [/\/itdr|\/identity/i, "itdr"],
  [/\/firewall/i, "firewall"],
  [/\/security-operations|\/xdr|\/taegis/i, "taegis"],
  [/\/ndr/i, "ndr"],
  [/\/cloud-security|\/cnapp|\/cloud-native/i, "cloud"],
  [/\/managed-risk/i, "risk"],
  [/\/advisory/i, "advisory"],
  [/\/server/i, "server"],
  [/\/encryption|\/device-encryption/i, "encryption"],
  [/\/mobile/i, "mobile"],
  [/\/wireless/i, "wireless"],
  [/\/switches/i, "switches"],
  [/\/dns/i, "dns"],
  [/\/protected-browser|\/browser/i, "browser"],
  [/\/phish/i, "phish"],
];

const targets = new Set(MAP.map((m) => m[1]));
const unreachable = productKeys.filter((k) => !targets.has(k));
const bogus = [...targets].filter((t) => !productKeys.includes(t));

console.log("Products with NO route mapping:", unreachable.length ? unreachable.join(", ") : "none");
console.log("Route targets matching no product:", bogus.length ? bogus.join(", ") : "none");
process.exit(unreachable.length || bogus.length ? 1 : 0);
