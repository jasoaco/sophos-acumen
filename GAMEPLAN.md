# Sophos Acumen — Build Gameplan

Phased merge of demo-injector + coach + watchman into one extension. Each phase leaves a working tree.

## Phase 0 — Unified shell ✅ (current)
Goal: one extension that loads, with both subsystems intact but independent.
- [x] New repo, merged file tree
- [x] Merged MV3 manifest (interceptor MAIN + bridge ISOLATED + side panel + scripting)
- [x] Popup gains "Open Coach Panel" button (`chrome.sidePanel.open`)
- [x] Static verification: manifest valid, scenarios parse, field guide parses, referenced files present
- [ ] **Gate: load unpacked in Chrome — confirm injection still works AND the coach panel opens** (needs human)

## Phase 1 — One UI ✅
Goal: fold injection controls into the side panel; retire the popup as the primary surface.
- [x] Side panel gets a third tab: **Demo** (scenario picker, customer name/counts, toggle, import/export, launch) — tab order **Coach | Demo | Analyze**. Internal id/mode stays `inject`.
- [x] Inject tab talks to the existing service worker (`LIST_SCENARIOS` / `GET_STATE` / `SET_STATE` / `IMPORT`/`EXPORT`/`DELETE_SCENARIO`) — no interceptor or service-worker changes
- [x] Action icon opens the side panel directly (`default_popup` dropped; `openPanelOnActionClick` set in the service worker)
- [x] Verified via harness (service-worker mock): Inject tab populates, active-tab + panel switching correct (DOM-confirmed)
- [ ] **Open decision: retire `popup/` entirely, or keep a stripped quick-toggle?** Files remain in place, now unreferenced by the action.
- [ ] **Gate: load unpacked in Chrome — confirm icon opens panel, Inject toggle drives injection** (needs human)

## Phase 2 — The link (the actual payoff)
Goal: injection and coaching share state.
- Active scenario → Coach auto-selects the matching product (e.g. ransomware/mdr scenario → MDR or Endpoint talk track)
- Surface scenario `prelude.talkingPoints` / `runbookSteps` inside the Coach panel as a scenario-specific demo flow
- "Demo flow" view: ordered screen walkthrough driven by the scenario's `clickPath`

## Phase 3 — AI + enablement
Goal: port the `intake-site` AI features and add the learning loop.
- [x] Import `intake-site/` (scenario generator, presets, demo-script, battle cards, post-demo follow-up, prospect enrichment, remix/make-mine) — standalone Node server, port 3847, pluggable LLM backend
- [x] `.gitignore` guards keys (`intake-site/.settings.json`, `.env`, `*.key`)
- [ ] Wire intake-site generators into the extension side panel (not just the standalone site)
- [ ] **Roleplay sparring**: AI plays a skeptical CISO using the product's objection data; scores the SE's responses
- [ ] **Flashcards**: spaced-repetition drill over objections + discovery questions
- [ ] Readiness tracking per product

## Phase 4 — Polish
- Harvest real Central URL slugs (only `endpoint` confirmed) → complete `SEGMENT_MAP`
- View → screen auto-select (URL sub-page picks the matching field-guide screen)
- Global search across all products' talk tracks
- Cross-sell map

## Do-not-break invariants
- `content/interceptor.js` is the crown jewel — additive changes only, never refactor its fetch/XHR override
- Keep injection state in `chrome.storage.local.demoState`; if Coach needs to read it, read — don't repurpose the keys
- Only one MAIN-world content script (interceptor). Coach detection stays in `executeScript` from the panel
