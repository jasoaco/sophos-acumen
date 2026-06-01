# Sophos Acumen

**The Sophos Sales Engineer's all-in-one companion for Sophos Central.** One Chrome extension that lets you *stage* a compelling demo, *coach* yourself through it with the official field-guide content, and *analyze* whatever's on the live page — all without leaving the Central tab.

> Real product. Authentic UI. The only thing that's fake is the data you choose to inject.

---

## Table of Contents

- [What It Is](#what-it-is)
- [Who It's For](#who-its-for)
- [The Three Pillars](#the-three-pillars)
- [History: A Merge of Three Projects](#history-a-merge-of-three-projects)
- [Architecture](#architecture)
- [How to Deploy](#how-to-deploy)
- [Usage](#usage)
- [Updating Content](#updating-content)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Credits & Acknowledgments](#credits--acknowledgments)
- [Disclaimer](#disclaimer)

---

## What It Is

Sophos Acumen is a Manifest V3 Chrome extension that runs on `central.sophos.com`. It gives a Sales Engineer three things that, until now, lived in three separate tools:

1. A way to **inject realistic, customer-specific demo scenarios** into the live Sophos Central UI — so you can show a ransomware case, an MDR overnight response, or a clean healthy environment without standing up and maintaining a separate demo tenant.
2. A **contextual field guide** that rides along in a side panel — as you navigate to a product, it surfaces the talk track, discovery questions (by audience), objection handlers, and competitive intel for exactly what's on screen.
3. A **page analyzer** that snapshots and interprets the current Central page.

The whole point of combining them: these are three halves of one motion. You *stage* the demo, you *narrate* it with the right words, and you *read the room* — in one tool, on one surface.

---

## Who It's For

- **Sophos Sales Engineers** running live product demos for prospects and customers.
- **New / ramping SEs** learning the Sophos portfolio — the Coach pillar is an enablement tool as much as a demo aid.
- **Partner / MSP SEs** who need compelling demos but don't have a dedicated, populated demo tenant for every scenario.
- **SE managers and enablement teams** who want a single, updatable source of demo scenarios and talk tracks distributed to the field.

It is an **internal field tool**, not a customer-facing product.

---

## The Three Pillars

### 🎬 Inject
Drops fake-but-authentic data into the live Central UI by intercepting the browser's own API calls (`fetch`/`XHR`) — no proxy, no certificates, no separate environment. Pick a scenario, set the customer name and endpoint counts, toggle it on, and the real Central UI renders your scenario: cases with MITRE ATT&CK mappings, detections with command lines, threat graphs, device fleets, health scores, email security stats, and more. Ships with nine built-in scenarios (ransomware, MDR, XDR, phishing, insider threat, BEC, supply-chain, zero-day, and a healthy baseline) plus an animated "Akira" prelude/staging intro.

### 📖 Coach
A side-panel field guide covering **19 Sophos products**. As you navigate Central — or via a manual product picker — it surfaces, per product and per screen:
- **Talk tracks** — what to say, in spoken language
- **Discovery questions** — five per audience (IT Manager, Security Engineer, CTO/CISO, MSP/Partner SE)
- **Objection handlers** — the pushback and the response
- **Competitive intel** — win points vs. named competitors

### 🔎 Analyze
Snapshots the current page (headings, actions, tables, entities) and interprets what you're looking at — the lineage of the original Watchman project.

---

## History: A Merge of Three Projects

Sophos Acumen did not start as one project. It is the combination of **three independent efforts**, brought together because each solved a different part of the same problem.

### 1. Sophos Field Guide — by **Ryan Gebauer**
The foundation of the Coach pillar. Ryan Gebauer built the **Sophos Field Guide**: a comprehensive, single-file enablement reference covering the entire Sophos product portfolio — per-product talk tracks, audience-specific discovery questions, objection handling, competitive positioning, and screen-by-screen demo guidance. **All of the coaching content in this project is derived from Ryan's Sophos Field Guide.** It is the intellectual backbone of the Coach pillar, and credit for that body of work belongs to him.

### 2. Sophos Central Coach
A Chrome extension that took Ryan's Field Guide content and made it *contextual* — instead of a static reference you read separately, the content surfaces in a side panel that follows you as you navigate live Sophos Central. It introduced the product/URL detection, the side-panel UI, the manual product picker, and the build pipeline that extracts the Field Guide content into structured data (`scripts/extract-products.js` → `data/products.js`). Coach itself was built on top of the Watchman page-analysis foundation.

### 3. Demo Injector — *"Be the king of the Demo!"*
A mature Chrome extension that injects realistic demo data into the live Sophos Central UI via MAIN-world `fetch`/`XHR` interception. This is the technically deepest of the three — a ~1,500-line interception engine, a two-layer (MAIN ↔ ISOLATED world) state-relay architecture, nine scenarios, a scenario schema and validator, and an AI-assisted scenario/battle-card/follow-up generator. Its interception engine is the crown jewel of the Inject pillar.

### 4. Watchman
The page-snapshot and interpretation engine ("your built-in cybersecurity analyst") that Coach was originally built on. It contributes the Analyze pillar.

### The Merge
These were three extensions all operating on the same surface (`central.sophos.com`) for the same person (an SE), forcing that SE to juggle multiple tools and mentally bridge them. Sophos Acumen merges them into **one Manifest V3 extension**. The key architectural insight that made this clean: the MAIN-world `fetch`/`XHR` override that powers injection is *exclusive across separate extensions*, but inside a **single** extension there is no conflict — the interceptor owns the page's network layer alone, and the side panel rides alongside it. The fragile, hard-won interception engine was ported untouched; the field-guide side panel was layered on top additively.

---

## Architecture

A single MV3 extension. One MAIN-world content script (the interceptor), one ISOLATED-world content script (the bridge), a service worker, a popup, and a side panel.

```
manifest.json                MV3 — sidePanel + scripting + storage/tabs; scoped to *.sophos.com
background/
  service-worker.js          demo state, scenario management, message relay
content/
  interceptor.js             MAIN world, document_start — monkeypatches fetch/XHR to inject fake API responses
  bridge.js                  ISOLATED world — relays scenario state to the interceptor via DOM events
popup/                       scenario picker + customer config + "Open Coach Panel" launcher
sidepanel.html / sidepanel.js  Coach + Analyze UI; page detection via chrome.scripting.executeScript
data/products.js             the field guide as structured data — 19 products
adapters/sophos-central.js   URL/heading → product + page-type detection
scenarios/                   9 demo scenarios + SCHEMA.md
prelude/                     animated "Akira" staging intro
scripts/
  extract-products.js        Sophos Field Guide HTML → data/products.js
  validate-scenario.mjs      scenario JSON validator
test/
  harness.html               mocks chrome.* to drive the side panel outside the extension
  check-routes.js            asserts every product is reachable by the route map
```

**State flow for injection:** popup → service worker (`chrome.storage.local`) → bridge (ISOLATED) → custom DOM event → interceptor (MAIN) → applied on the next `fetch`/`XHR`.

**Detection for coaching:** the side panel calls `chrome.scripting.executeScript` to snapshot the active tab, extracts the `/manage/{product}/{view}` slug, and maps it to a field-guide product (with a manual picker as override).

---

## How to Deploy

Sophos Acumen is an **unpacked Chrome extension**. There is no build step — it loads directly.

### Prerequisites
- Google Chrome or any Chromium-based browser (Edge, Brave) with Manifest V3 support
- Access to `central.sophos.com`

### Install
1. Clone the repository:
   ```bash
   git clone https://github.com/jasoaco79/sophos-acumen.git
   ```
2. Open `chrome://extensions` in your browser.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the cloned `sophos-acumen` directory (the folder containing `manifest.json`).
5. The Sophos Acumen icon appears in your toolbar. Pin it for convenience.

### Updating
After pulling new commits, return to `chrome://extensions` and click the **refresh** icon on the Sophos Acumen card. Hard-refresh any open Central tab (`Cmd/Ctrl + Shift + R`).

### Distribution to a team
Because it loads unpacked, distribution today is "clone/download the folder and load it." For wider rollout, the repo can later be packaged (`.crx`) or published to the Chrome Web Store as an unlisted/private item — see the Roadmap.

---

## Usage

1. Navigate to `https://central.sophos.com` and sign in.
2. Click the **Sophos Acumen** toolbar icon to open the **injection popup**.
3. **To stage a demo:** pick a scenario, set the customer name and endpoint/server counts, and toggle injection **on**. Optionally launch the **Prelude** staging intro first. Navigate Central — your scenario's data appears in the real UI.
4. **To coach yourself:** click **🦆 Open Coach Panel** in the popup. The side panel opens with the field guide. It auto-detects the product from the page, or you can pick any product from the dropdown. Switch between **Talk Track / Discovery / Objections / Compete**, and choose your audience.
5. **To analyze:** switch the side panel to **Analyst** mode and click **Analyze Page**.

> ⚠️ Injection modifies what *you* see in your browser only. It does not change any data in Sophos Central, your tenant, or anyone else's session. Toggle it off (or close the tab) to return to reality.

---

## Updating Content

- **Field guide (Coach content):** the source of truth is Ryan Gebauer's Sophos Field Guide HTML. Re-extract with:
  ```bash
  node scripts/extract-products.js /path/to/sophos-field-guide.html
  ```
  This regenerates `data/products.js`. Reload the extension afterward.
- **Demo scenarios (Inject content):** add a JSON file under `scenarios/` following `scenarios/SCHEMA.md`, then validate:
  ```bash
  node scripts/validate-scenario.mjs scenarios/your-scenario.json
  ```

---

## Project Structure

See [Architecture](#architecture) above. The phased build plan lives in [`GAMEPLAN.md`](GAMEPLAN.md).

---

## Roadmap

The merge landed as **Phase 0** — a unified extension where injection (popup) and coaching (side panel) coexist but don't yet talk to each other. From here:

### Phase 1 — One unified UI
- Fold the injection controls into the side panel as a third tab (**Inject / Coach / Analyze**), so the whole tool lives in one persistent surface.
- Open the side panel directly from the toolbar icon.

### Phase 2 — Link injection and coaching *(the real payoff)*
- The active scenario **drives** the Coach panel: inject the Akira ransomware scenario and the Coach automatically surfaces the MDR / Endpoint talk track and the scenario's talking points.
- A scenario-specific **demo flow** view: an ordered screen walkthrough driven by the scenario's defined click path.

### Phase 3 — AI & enablement
- Port the Demo Injector's AI tooling (scenario generator, competitive battle cards, post-demo follow-up email, prospect enrichment).
- **Roleplay sparring:** an AI plays a skeptical CISO using the product's objection data, and scores your responses.
- **Flashcards:** spaced-repetition drills over discovery questions and objections.
- **Readiness tracking** per product ("can you demo this?").

### Phase 4 — Polish & scale
- Harvest the real Central URL slugs to complete product detection (only `endpoint` is confirmed today).
- Map a page's sub-view to the matching field-guide screen automatically.
- Global search across all products' talk tracks; a cross-sell map.
- Packaging and managed distribution (`.crx` / private Chrome Web Store listing).

---

## Credits & Acknowledgments

- **Ryan Gebauer** — creator of the **Sophos Field Guide**, the comprehensive SE enablement reference from which all of this project's coaching content is derived. The Coach pillar would not exist without his work.
- **Demo Injector** — the demo-data interception engine, scenario system, and AI tooling that power the Inject pillar.
- **Watchman** — the page-snapshot and interpretation foundation behind the Analyze pillar.

Sophos Acumen is the combination of these three projects into a single tool.

---

## Disclaimer

Sophos Acumen is an **unofficial, internal field tool** for Sophos Sales Engineers. It is not an official Sophos product and is not affiliated with or endorsed by Sophos as a commercial offering.

The **Inject** capability renders fabricated data in your own browser session for demonstration purposes only. It performs **client-side rendering changes** — it does not write to, alter, or exfiltrate any data in Sophos Central, your tenant, or any customer environment. Use it responsibly and transparently in demo contexts. Always be clear with your audience about what is live and what is staged.
