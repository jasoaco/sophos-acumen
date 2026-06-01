# Sophos Acumen — Build Gameplan

Phased merge of demo-injector + coach + watchman into one extension. Each phase leaves a working tree.

## Phase 0 — Unified shell ✅ (current)
Goal: one extension that loads, with both subsystems intact but independent.
- [x] New repo, merged file tree
- [x] Merged MV3 manifest (interceptor MAIN + bridge ISOLATED + side panel + scripting)
- [x] Popup gains "Open Coach Panel" button (`chrome.sidePanel.open`)
- [x] Static verification: manifest valid, scenarios parse, field guide parses, referenced files present
- [ ] **Gate: load unpacked in Chrome — confirm injection still works AND the coach panel opens** (needs human)

## Phase 1 — One UI
Goal: fold injection controls into the side panel; retire the popup as the primary surface.
- Side panel gets a third tab: **Inject** (scenario picker, customer name/counts, toggle) alongside Coach + Analyst
- Inject tab talks to the existing service worker (`SET_STATE` / `LIST_SCENARIOS`) — no interceptor changes
- Action icon opens the side panel directly (drop `default_popup`, set `openPanelOnActionClick`)
- Popup either removed or kept as a quick-toggle shortcut

## Phase 2 — The link (the actual payoff)
Goal: injection and coaching share state.
- Active scenario → Coach auto-selects the matching product (e.g. ransomware/mdr scenario → MDR or Endpoint talk track)
- Surface scenario `prelude.talkingPoints` / `runbookSteps` inside the Coach panel as a scenario-specific demo flow
- "Demo flow" view: ordered screen walkthrough driven by the scenario's `clickPath`

## Phase 3 — AI + enablement
Goal: port the `intake-site` AI features and add the learning loop.
- Port `intake-site/server` endpoints: scenario generator, battle cards, post-demo follow-up, prospect enrichment
- **Roleplay sparring**: AI plays a skeptical CISO using the product's objection data; scores the SE's responses
- **Flashcards**: spaced-repetition drill over objections + discovery questions
- Readiness tracking per product

## Phase 4 — Polish
- Harvest real Central URL slugs (only `endpoint` confirmed) → complete `SEGMENT_MAP`
- View → screen auto-select (URL sub-page picks the matching field-guide screen)
- Global search across all products' talk tracks
- Cross-sell map

## Do-not-break invariants
- `content/interceptor.js` is the crown jewel — additive changes only, never refactor its fetch/XHR override
- Keep injection state in `chrome.storage.local.demoState`; if Coach needs to read it, read — don't repurpose the keys
- Only one MAIN-world content script (interceptor). Coach detection stays in `executeScript` from the panel
