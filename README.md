# Sophos Acumen

The Sophos Sales Engineer's all-in-one Chrome extension for Sophos Central. Three capabilities, one tool, one surface (`central.sophos.com`):

- **Inject** — drop realistic, customer-specific demo scenarios into the *live* Central UI (real product, fake data) without maintaining a separate demo tenant. *(from demo-injector)*
- **Coach** — a field-guide side panel that surfaces talk tracks, discovery questions by audience, objection handlers, and competitive intel for the product you're looking at. *(from sophos-central-coach)*
- **Analyze** — page snapshot + interpretation of what's on screen. *(from watchman)*

The point of merging: these are three halves of one motion. Inject a scenario → Coach surfaces the right talk track for it → Analyze reads the page. Eventually they link: inject the Akira ransomware scenario and the Coach panel automatically pulls up the MDR talk track and the scenario's talking points.

## Lineage

This repo merges three predecessors:
| Source | Contributed |
|---|---|
| `demo-injector` | `content/interceptor.js` (MAIN-world fetch/XHR injection), `bridge.js`, `service-worker.js`, `popup/`, `scenarios/`, `prelude/` |
| `sophos-central-coach` | `sidepanel.*`, `data/products.js` (19-product field guide), `adapters/`, `scripts/extract-products.js`, `test/` |
| `watchman` | page-snapshot + analysis approach (Analyst mode in the side panel) |

## Architecture

Single MV3 extension. No MAIN-world conflict because it's one extension, not three.

```
manifest.json              MV3 — sidePanel + scripting + storage/tabs; scoped to *.sophos.com
background/service-worker.js   demo state, scenario management, message relay
content/
  interceptor.js           MAIN world, document_start — monkeypatches fetch/XHR to inject fake API responses
  bridge.js                ISOLATED world — relays state → interceptor via DOM events
popup/                     scenario picker + customer config + "Open Coach Panel" button
sidepanel.html / .js       Coach + Analyst UI (side panel). Detection via chrome.scripting.executeScript
data/products.js           field guide — 19 products, talk/discovery/objections/compete
scenarios/                 9 demo scenarios (ransomware, mdr, xdr, phishing, insider, bec, supply-chain, zero-day, healthy)
prelude/                   animated "Akira Windows Sim" intro / staging experience
scripts/                   extract-products.js (field guide → data), validate-scenario.mjs
test/                      harness.html (mocks chrome.* to drive the panel), check-routes.js
```

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this repo's root
3. On `central.sophos.com`: the **action icon** opens the injection popup; the popup's **Open Coach Panel** button opens the field-guide side panel.

## Status

**Phase 0 — unified shell.** Both subsystems coexist in one extension: injection via the popup (unchanged from demo-injector), coaching via the side panel (from coach). They don't talk to each other *yet* — that's Phase 2. See `GAMEPLAN.md`.
