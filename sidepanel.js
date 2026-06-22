// ── State ──
let currentMode = 'coach';
let currentProduct = null;
let currentScreenIdx = 0;
let currentCoachTab = 'talk';
let currentAudience = 'IT Manager';
let lastAnalysisPayload = null;
let visibleMode = 'deciphered';
let pinnedProduct = null; // set when the user manually picks a product; pauses auto-detect

// ── Sophos Central detection (inlined — no ES module imports in sidepanel) ──
// Central routes follow /manage/{segment}/{view}. Confirmed real slug: "endpoint"
// (from /manage/endpoint/policies-list). The map keys are the {segment} slugs;
// values are field-guide product keys. Slugs not yet confirmed against live
// Central are best-guesses — the empty state names any unmapped slug so it can
// be added here.
const SEGMENT_MAP = {
  endpoint: 'endpoint',          // confirmed
  server: 'server',
  mdr: 'mdr',
  ztna: 'ztna',
  email: 'email',
  itdr: 'itdr',
  identity: 'itdr',
  firewall: 'firewall',
  xdr: 'taegis',
  taegis: 'taegis',
  'security-operations': 'taegis',
  ndr: 'ndr',
  cloud: 'cloud',
  'cloud-security': 'cloud',
  cnapp: 'cloud',
  'managed-risk': 'risk',
  risk: 'risk',
  advisory: 'advisory',
  encryption: 'encryption',
  'device-encryption': 'encryption',
  mobile: 'mobile',
  wireless: 'wireless',
  switches: 'switches',
  dns: 'dns',
  browser: 'browser',
  'protected-browser': 'browser',
  phish: 'phish',
  'phish-threat': 'phish',
};

// Fallback substring patterns (used only if segment extraction misses)
const PRODUCT_ROUTE_MAP = [
  { pattern: /\/endpoint/i,    product: 'endpoint' },
  { pattern: /\/mdr/i,         product: 'mdr' },
  { pattern: /\/ztna/i,        product: 'ztna' },
  { pattern: /\/email/i,       product: 'email' },
  { pattern: /\/itdr|\/identity/i, product: 'itdr' },
  { pattern: /\/firewall/i,    product: 'firewall' },
  { pattern: /\/security-operations|\/xdr|\/taegis/i, product: 'taegis' },
  { pattern: /\/ndr/i,         product: 'ndr' },
  { pattern: /\/cloud-security|\/cnapp|\/cloud-native/i, product: 'cloud' },
  { pattern: /\/managed-risk/i, product: 'risk' },
  { pattern: /\/advisory/i,    product: 'advisory' },
  { pattern: /\/server/i,      product: 'server' },
  { pattern: /\/encryption|\/device-encryption/i, product: 'encryption' },
  { pattern: /\/mobile/i,      product: 'mobile' },
  { pattern: /\/wireless/i,    product: 'wireless' },
  { pattern: /\/switches/i,    product: 'switches' },
  { pattern: /\/dns/i,         product: 'dns' },
  { pattern: /\/protected-browser|\/browser/i, product: 'browser' },
  { pattern: /\/phish/i,       product: 'phish' },
];

// Returns { isCentral, product, segment } — segment is the raw /manage slug,
// surfaced even when unmapped so the empty state can name it.
let currentCentralPage = null; // active platform-page guide id (CENTRAL_CONTENT), or null

// Map a Central platform URL to a CENTRAL_CONTENT page id (Threat Analysis Center /
// My Environment / Reports / Dashboards — the pages PRODUCTS doesn't cover). Derives
// the id from the path and checks it exists, so a wrong guess just returns null.
// Confirmed: /manage/threat-analysis-center/cases = tac_cases.
function detectCentralPage(route) {
  const cc = window.CENTRAL_CONTENT || {};
  const path = (route || '').toLowerCase();
  const after = path.replace(/^.*\/manage\//, '');
  const parts = after.split(/[?#]/)[0].split('/').filter(Boolean);
  const norm = s => (s || '').replace(/-/g, '_');
  if (!parts.length) return null;

  if (parts[0] === 'threat-analysis-center' || parts[0] === 'tac') {
    const id = 'tac_' + norm(parts[1] || 'dashboard');
    return cc[id] ? id : null;
  }
  if (parts[0] === 'environment' || parts[0] === 'my-environment') {
    const id = 'env_' + norm(parts[1] || '');
    return cc[id] ? id : null;
  }
  if (parts[0] === 'dashboard' || parts[0] === 'dashboards') {
    return cc['dashboards_central_overview'] ? 'dashboards_central_overview' : null;
  }
  if (parts[0] === 'reports' || path.includes('/reports')) {
    return cc['reports_reports'] ? 'reports_reports' : null;
  }
  return null;
}

// Short display name for a platform page, from CENTRAL_NAV.
function centralPageTitle(id) {
  const nav = window.CENTRAL_NAV || {};
  for (const section of Object.values(nav)) {
    for (const grp of (section?.sections || [])) {
      for (const it of (grp?.items || [])) {
        if (it.id === id) return it.name;
      }
    }
  }
  return id;
}

function detectCentral(snapshot) {
  const url = snapshot?.url || '';
  const route = snapshot?.route || '';
  const title = (snapshot?.title || '').toLowerCase();

  const isCentral = url.includes('central.sophos.com') || title.includes('sophos central');
  if (!isCentral) return { isCentral: false, product: null, segment: null, centralPage: null };

  // Platform pages first (TAC / My Environment / Reports / Dashboards) — more
  // specific than the product fallback (e.g. /environment/firewalls is the env
  // guide, not the Firewall product).
  const centralPage = detectCentralPage(route);
  if (centralPage) return { isCentral: true, product: null, segment: null, centralPage };

  // Product slug from /manage/{segment}
  const match = route.match(/\/manage\/([^/?#]+)/i);
  const segment = match ? match[1].toLowerCase() : null;
  let product = segment ? (SEGMENT_MAP[segment] || null) : null;

  // Fallback: loose substring match across route + headings
  if (!product) {
    const corpus = route.toLowerCase() + ' ' + (snapshot?.headings || []).join(' ').toLowerCase();
    for (const entry of PRODUCT_ROUTE_MAP) {
      if (entry.pattern.test(corpus)) { product = entry.product; break; }
    }
  }

  return { isCentral: true, product, segment, centralPage: null };
}

// ── Snapshot via scripting injection ──
async function getPageSnapshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const textOf = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
        const collectTexts = (sel, n = 20) => [...document.querySelectorAll(sel)].map(textOf).filter(Boolean).slice(0, n);
        const collectActions = (n = 40) => {
          const seen = new Set(), out = [];
          for (const el of document.querySelectorAll('button,[role="button"],a')) {
            const label = (textOf(el) || el.getAttribute('aria-label') || '').trim();
            if (!label || seen.has(label.toLowerCase())) continue;
            seen.add(label.toLowerCase());
            out.push(label);
            if (out.length >= n) break;
          }
          return out;
        };
        const collectEntities = (n = 20) => {
          const corpus = [document.title, ...collectTexts('h1,h2,h3,h4', 20)].join(' ');
          const matches = corpus.match(/\b([A-Z0-9._-]{4,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/g) || [];
          const seen = new Set(), out = [];
          for (const m of matches) {
            if (seen.has(m.toLowerCase())) continue;
            seen.add(m.toLowerCase());
            out.push(m);
            if (out.length >= n) break;
          }
          return out;
        };
        return {
          url: location.href,
          title: document.title || '',
          route: location.pathname || '/',
          headings: collectTexts('h1,h2,h3', 20),
          actions: collectActions(40),
          entities: collectEntities(20),
          rawTextSummary: textOf(document.body).slice(0, 4000),
        };
      },
    });
    return result;
  } catch {
    return null;
  }
}

// ── Mode switching ──
const MODE_PANELS = { coach: 'coach-panel', inject: 'inject-panel', analyst: 'analyst-panel', settings: 'settings-panel' };
document.querySelectorAll('.mode-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    for (const [mode, id] of Object.entries(MODE_PANELS)) {
      document.getElementById(id).style.display = currentMode === mode ? 'flex' : 'none';
    }
    if (currentMode === 'inject') initInject();
  });
});

// ── Settings: show/hide the main tabs (persisted) ──
const TAB_VIS_KEY = 'acumenTabVisibility';
const TOGGLEABLE = ['coach', 'inject', 'analyst']; // 'settings' is always visible

function applyTabVisibility(vis) {
  TOGGLEABLE.forEach(m => {
    const btn = document.querySelector(`.mode-tab[data-mode="${m}"]`);
    if (btn) btn.style.display = vis[m] === false ? 'none' : '';
    const cb = document.querySelector(`input[data-tabvis="${m}"]`);
    if (cb) cb.checked = vis[m] !== false;
  });
  // If the active tab just got hidden, jump to the first visible one
  if (TOGGLEABLE.includes(currentMode) && vis[currentMode] === false) {
    const firstVisible = TOGGLEABLE.find(m => vis[m] !== false);
    if (firstVisible) document.querySelector(`.mode-tab[data-mode="${firstVisible}"]`)?.click();
  }
}

function loadTabVisibility() {
  Promise.resolve(chrome.storage?.local?.get(TAB_VIS_KEY))
    .then(data => applyTabVisibility((data && data[TAB_VIS_KEY]) || { coach: true, inject: true, analyst: true }))
    .catch(() => applyTabVisibility({ coach: true, inject: true, analyst: true }));
}

document.querySelectorAll('input[data-tabvis]').forEach(cb => {
  cb.addEventListener('change', () => {
    const vis = {};
    TOGGLEABLE.forEach(m => { vis[m] = document.querySelector(`input[data-tabvis="${m}"]`).checked; });
    // Guard: never hide the last visible tab
    if (!TOGGLEABLE.some(m => vis[m])) {
      cb.checked = true;
      return;
    }
    chrome.storage?.local?.set({ [TAB_VIS_KEY]: vis });
    applyTabVisibility(vis);
  });
});

loadTabVisibility();

// ── Coach tab switching ──
document.querySelectorAll('.coach-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.coach-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentCoachTab = btn.dataset.tab;
    renderCoachContent();
  });
});

// ── Product picker (manual override) ──
const productSelect = document.getElementById('product-select');

function populateProductPicker() {
  const products = window.PRODUCTS || {};
  // Sort alphabetically by display name for easy scanning
  const entries = Object.keys(products)
    .map(key => ({ key, name: products[key].name || key }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const { key, name } of entries) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = name;
    productSelect.appendChild(opt);
  }
}
populateProductPicker();

productSelect.addEventListener('change', () => {
  const key = productSelect.value;
  if (!key) {
    // Back to auto-detect — resume following the page
    pinnedProduct = null;
    currentProduct = null;
    autoDetect();
    return;
  }
  // Pin to the chosen product
  pinnedProduct = key;
  currentProduct = key;
  currentScreenIdx = 0;
  renderCoachHeader();
  renderCoachContent();
  document.getElementById('top-subtitle').textContent =
    `${window.PRODUCTS?.[key]?.name || key} · pinned`;
});

// ── Screen selector ──
document.getElementById('screen-select').addEventListener('change', e => {
  currentScreenIdx = parseInt(e.target.value, 10);
  renderCoachContent();
});

// ── Audience selector ──
document.getElementById('audience-select').addEventListener('change', e => {
  currentAudience = e.target.value;
  if (currentCoachTab === 'discovery') renderCoachContent();
});

// ── Auto-detect on load and on tab activation ──
async function autoDetect() {
  // Manual pin overrides page detection — don't follow the page while pinned
  if (pinnedProduct) return;

  const snapshot = await getPageSnapshot();
  if (!snapshot) return;
  const { isCentral, product, segment, centralPage } = detectCentral(snapshot);

  if (centralPage) {
    // Platform page (TAC / My Environment / Reports / Dashboards) — render its guide
    currentProduct = null;
    if (centralPage !== currentCentralPage) {
      currentCentralPage = centralPage;
      renderCentralGuide(centralPage);
    }
  } else if (product && product !== currentProduct) {
    currentCentralPage = null;
    currentProduct = product;
    currentScreenIdx = 0;
    renderCoachHeader();
    renderCoachContent();
  } else if (isCentral && !product) {
    // On Central but this section isn't mapped — name it so it can be added
    currentProduct = null;
    currentCentralPage = null;
    showUnmappedCentral(segment);
  }

  document.getElementById('top-subtitle').textContent =
    centralPage
      ? centralPageTitle(centralPage)
      : currentProduct && window.PRODUCTS?.[currentProduct]
        ? window.PRODUCTS[currentProduct].name
        : isCentral && segment
          ? `Central · ${segment} (unmapped)`
          : 'Navigate to a product page to begin';
}

chrome.tabs.onActivated.addListener(autoDetect);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') autoDetect();
});
autoDetect();

// ── Coach header ──
function renderCoachHeader() {
  const product = window.PRODUCTS?.[currentProduct];
  const header = document.getElementById('coach-header');
  const controls = document.getElementById('coach-controls');
  const tabs = document.getElementById('coach-tabs');

  if (!product) {
    header.style.display = 'none';
    controls.style.display = 'none';
    tabs.style.display = 'none';
    return;
  }

  header.style.display = 'block';
  controls.style.display = 'flex';
  tabs.style.display = 'flex';

  document.getElementById('coach-product-name').textContent = product.name;
  document.getElementById('coach-product-sub').textContent = product.subtitle || '';

  // Tags
  const tagRow = document.getElementById('coach-tags');
  tagRow.innerHTML = (product.tags || []).map(t => `<span class="tag">${t}</span>`).join('');

  // Banner
  const banner = document.getElementById('coach-banner');
  if (product.banner?.text) {
    banner.textContent = product.banner.text;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }

  // Screen selector
  const sel = document.getElementById('screen-select');
  sel.innerHTML = (product.screens || []).map((s, i) =>
    `<option value="${i}">${s.name}</option>`
  ).join('');
  sel.value = currentScreenIdx;
}

// Self-documenting empty state: on Central but the section isn't mapped yet.
// Names the raw slug so it can be added to SEGMENT_MAP.
function showUnmappedCentral(segment) {
  document.getElementById('coach-header').style.display = 'none';
  document.getElementById('coach-controls').style.display = 'none';
  document.getElementById('coach-tabs').style.display = 'none';
  document.getElementById('coach-content').innerHTML =
    `<div class="coach-empty">` +
    `<strong>Sophos Central detected</strong>` +
    (segment
      ? `This section — <code style="color:#9be0f8">${segment}</code> — isn't mapped to the field guide yet. Navigate to a product area, or send this slug to add it.`
      : `No product section found in the URL. Open a product area to load coaching content.`) +
    `</div>`;
}

// Render a platform-page guide (HTML blob from CENTRAL_CONTENT). These pages are
// informational — no audience / objections / compete — so hide the product chrome
// and render the guide directly.
function renderCentralGuide(pageId) {
  document.getElementById('coach-header').style.display = 'none';
  document.getElementById('coach-controls').style.display = 'none';
  document.getElementById('coach-tabs').style.display = 'none';
  const content = document.getElementById('coach-content');
  const html = (window.CENTRAL_CONTENT || {})[pageId];
  content.innerHTML = html
    ? `<div class="central-guide">${html}</div>`
    : `<div class="coach-empty">No guide content for <code>${pageId}</code> yet.</div>`;
}

// ── Coach content ──
function renderCoachContent() {
  const content = document.getElementById('coach-content');
  const product = window.PRODUCTS?.[currentProduct];

  if (!product) {
    content.innerHTML = `<div class="coach-empty"><strong>Navigate Sophos Central to begin</strong>Open any product page and the coach will surface talk tracks, discovery questions, objections, and competitive intel automatically.</div>`;
    return;
  }

  switch (currentCoachTab) {
    case 'talk':       content.innerHTML = ''; content.appendChild(renderTalk(product)); break;
    case 'discovery':  content.innerHTML = ''; content.appendChild(renderDiscovery(product)); break;
    case 'objections': content.innerHTML = ''; content.appendChild(renderObjections(product)); break;
    case 'compete':    content.innerHTML = ''; content.appendChild(renderCompete(product)); break;
  }
}

function renderTalk(product) {
  const screen = product.screens?.[currentScreenIdx];
  if (!screen) return htmlEl(`<div class="coach-empty">No screens defined for this product.</div>`);

  const frag = document.createDocumentFragment();

  // What this shows
  frag.appendChild(card('What this screen shows', `<p>${screen.what}</p>`));

  // Talk track
  const talkInner = `<div class="talk-quote">${screen.talk}</div>` +
    (screen.points?.length
      ? `<ul class="points-list">${screen.points.map(p => `<li>${p}</li>`).join('')}</ul>`
      : '');
  frag.appendChild(card('Talk track', talkInner));

  // On-screen action
  if (screen.action) {
    const a = document.createElement('div');
    a.className = 'action-block';
    a.innerHTML = `<div class="action-label">On screen</div>${screen.action}`;
    frag.appendChild(a);
  }

  return frag;
}

function renderDiscovery(product) {
  const questions = product.discoveryByAudience?.[currentAudience] || [];
  if (!questions.length) return htmlEl(`<div class="coach-empty">No discovery questions for this audience.</div>`);

  const inner = questions.map((q, i) =>
    `<div class="q-item"><span class="q-num">${i + 1}</span><span class="q-text">${q}</span></div>`
  ).join('');
  return card(currentAudience, inner);
}

function renderObjections(product) {
  if (!product.objections?.length) return htmlEl(`<div class="coach-empty">No objections defined.</div>`);
  const inner = product.objections.map(o =>
    `<div class="obj-item"><div class="obj-q">${o.q}</div><div class="obj-a">${o.a}</div></div>`
  ).join('');
  return card('Objection handlers', inner);
}

function renderCompete(product) {
  if (!product.competitors?.length) return htmlEl(`<div class="coach-empty">No competitive data defined.</div>`);
  const frag = document.createDocumentFragment();
  product.competitors.forEach(c => {
    const points = c.points.map(p => `<li>${p}</li>`).join('');
    frag.appendChild(card(c.name, `<ul class="comp-points">${points}</ul>`));
  });
  return frag;
}

// ── Analyst mode ──
function setStatus(text) {
  const el = document.getElementById('buttonStatus');
  if (el) el.textContent = text;
}

function renderList(id, items, empty) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  (items?.length ? items : [empty]).forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    el.appendChild(li);
  });
}

function renderChips(id, items, empty) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  (items?.length ? items : [empty]).forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item;
    el.appendChild(chip);
  });
}

function scoreEvent(event) {
  let score = 0;
  const sev = (event.severity || '').toLowerCase();
  const tactic = (event.tactic || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  if (sev === 'critical') score += 100;
  else if (sev === 'high') score += 80;
  else if (sev === 'medium') score += 50;
  else if (sev === 'low') score += 20;
  if (['impact', 'credential access', 'lateral movement', 'defense evasion'].includes(tactic)) score += 18;
  if (/ransom|crypto|malware|attack|detection|threat/.test(title)) score += 12;
  if (event.entity) score += 6;
  return score;
}

function extractEvents(snapshot) {
  const rows = [...document.querySelectorAll?.('[data-testid*="detect"],[data-testid*="alert"],[data-testid*="case"],tbody tr,[role="row"]') || []];
  // Events are extracted via injection — use rawTextSummary for heuristic extraction
  return [];
}

function renderEventCards(events) {
  const el = document.getElementById('eventCards');
  if (!el) return;
  el.innerHTML = '';
  if (!events?.length) {
    el.innerHTML = '<div class="event-card"><div class="event-card-copy">No events extracted yet.</div></div>';
    return;
  }
  events.slice(0, 6).forEach(event => {
    const sev = (event.severity || 'unknown').toLowerCase();
    const card = document.createElement('div');
    card.className = `event-card ${sev}`;
    card.innerHTML = `
      <div class="event-card-title">${event.title || 'Event'}</div>
      <div class="badge-row">
        <span class="badge severity-${sev}">${sev}</span>
        ${event.tactic ? `<span class="badge meta">MITRE: ${event.tactic}</span>` : ''}
        ${event.entity ? `<span class="badge meta">${event.entity}</span>` : ''}
      </div>
      <div class="event-next">${event.suggestedAction || ''}</div>
    `;
    el.appendChild(card);
  });
}

document.getElementById('analyzeBtn').addEventListener('click', async () => {
  setStatus('Analyzing...');
  const snapshot = await getPageSnapshot();
  if (!snapshot) { setStatus('Could not reach active tab.'); return; }

  lastAnalysisPayload = snapshot;
  const { isCentral, product, segment } = detectCentral(snapshot);

  const pageType = snapshot.route.includes('/alerts') ? 'alerts-list'
    : snapshot.route.includes('/cases') ? 'cases-list'
    : snapshot.route.includes('/endpoints') ? 'endpoint-view'
    : 'dashboard';

  document.getElementById('summaryHeadline').textContent = isCentral
    ? `Sophos Central — ${pageType}${product ? ` (${product})` : segment ? ` · ${segment} (unmapped)` : ''}`
    : `${snapshot.title || 'Unknown page'}`;

  document.getElementById('summaryCopy').textContent = isCentral
    ? 'Sophos Central detected. Switch to Coach tab for talk tracks and demo guidance.'
    : 'Non-Sophos page. Structural context captured.';

  document.getElementById('summaryMeta').textContent = `Route: ${snapshot.route}`;

  renderList('notableList', snapshot.headings.slice(0, 4).map(h => h), 'No headings detected.');
  renderList('actionList', snapshot.actions.slice(0, 5), 'No actions detected.');
  renderChips('entityChips', snapshot.entities.slice(0, 8), 'No entities captured.');
  renderEventCards([]);

  document.getElementById('rawOutput').textContent = JSON.stringify(snapshot, null, 2);
  setStatus('Analysis complete.');

  // Auto-switch coach if on Central
  if (isCentral && product && product !== currentProduct) {
    currentProduct = product;
    currentScreenIdx = 0;
    renderCoachHeader();
    renderCoachContent();
    document.getElementById('top-subtitle').textContent = window.PRODUCTS?.[product]?.name || product;
  }

  try {
    const res = await fetch('http://localhost:8787/analyze-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, question: 'What am I looking at and what should I do next?' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.analysis?.whatMatters) renderList('notableList', data.analysis.whatMatters, '');
      if (data?.analysis?.suggestedActions) renderList('actionList', data.analysis.suggestedActions, '');
    }
  } catch {
    document.getElementById('summaryMeta').textContent += ' · Backend unavailable';
  }
});

document.getElementById('toggleRawBtn').addEventListener('click', () => {
  const panel = document.getElementById('rawPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

// ── Chat ──
function appendChat(role, text) {
  const log = document.getElementById('chatLog');
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;
  msg.textContent = text;
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
}

async function sendChat(question) {
  if (!lastAnalysisPayload) { appendChat('assistant', 'Analyze the current page first.'); return; }
  appendChat('user', question);
  try {
    const res = await fetch('http://localhost:8787/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: lastAnalysisPayload, question }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    appendChat('assistant', data?.chat?.answer || 'No answer returned.');
  } catch (err) {
    appendChat('assistant', `Chat unavailable: ${err.message}`);
  }
}

document.getElementById('chatSendBtn').addEventListener('click', async () => {
  const input = document.getElementById('chatInput');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  await sendChat(q);
});

document.querySelectorAll('.quick-prompt').forEach(btn => {
  btn.addEventListener('click', () => sendChat(btn.dataset.prompt || ''));
});

document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('chatSendBtn').click();
  }
});

// ══════════════════════════════════════════════════════════════════
// INJECT MODE — ported from popup.js. Talks to the existing service
// worker via the same message protocol (LIST_SCENARIOS / GET_STATE /
// SET_STATE / IMPORT/EXPORT/DELETE_SCENARIO). The interceptor and
// service worker are unchanged; this is just the relocated cockpit.
// ══════════════════════════════════════════════════════════════════
let injectInited = false;
let injectScenarios = []; // { id, name, description, isCustom }

const injSel        = () => document.getElementById('scenario');
const injToggle     = () => document.getElementById('toggle');
const injCustomer   = () => document.getElementById('customerName');
const injEndpoints  = () => document.getElementById('endpointCount');
const injServers    = () => document.getElementById('serverCount');
const injBadge      = () => document.getElementById('showBadge');
const injDesc       = () => document.getElementById('scenarioDesc');
const injStatusDot  = () => document.getElementById('statusDot');
const injStatusText = () => document.getElementById('statusText');
const injIntercepted= () => document.getElementById('interceptedText');
const injDeleteBtn  = () => document.getElementById('deleteBtn');

function injToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

function injLoadScenarios() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'LIST_SCENARIOS' }, resp => {
      if (chrome.runtime.lastError) { resolve(); return; }
      injectScenarios = [...(resp?.builtIn || []), ...(resp?.custom || [])];
      const sel = injSel();
      sel.innerHTML = '';
      if (resp?.builtIn?.length) {
        const g = document.createElement('optgroup');
        g.label = 'Built-in Scenarios';
        for (const s of resp.builtIn) {
          const o = document.createElement('option');
          o.value = s.id; o.textContent = s.name; g.appendChild(o);
        }
        sel.appendChild(g);
      }
      if (resp?.custom?.length) {
        const g = document.createElement('optgroup');
        g.label = 'Custom Scenarios';
        for (const s of resp.custom) {
          const o = document.createElement('option');
          o.value = s.id; o.textContent = s.name; g.appendChild(o);
        }
        sel.appendChild(g);
      }
      resolve();
    });
  });
}

function injUpdateUI(state) {
  if (state?.enabled) {
    injStatusDot().className = 'status-dot active';
    injStatusText().textContent = 'Active';
  } else {
    injStatusDot().className = 'status-dot inactive';
    injStatusText().textContent = 'Inactive';
  }
  injIntercepted().textContent = state?.interceptedCount ? `${state.interceptedCount} intercepted` : '';
  injUpdateDesc();
  const selected = injectScenarios.find(s => s.id === injSel().value);
  injDeleteBtn().style.display = selected?.isCustom ? 'inline-flex' : 'none';
}

function injUpdateDesc() {
  const selected = injectScenarios.find(s => s.id === injSel().value);
  injDesc().textContent = selected?.description || '';
}

function injSaveState(extra = {}) {
  const state = {
    enabled: injToggle().checked,
    scenario: injSel().value,
    customerName: injCustomer().value,
    endpointCount: parseInt(injEndpoints().value) || 2500,
    serverCount: parseInt(injServers().value) || 186,
    showBadge: injBadge().checked,
    launchMode: 'direct',
    interceptedCount: 0,
    ...extra,
  };
  chrome.runtime.sendMessage({ type: 'SET_STATE', state }, () => injUpdateUI(state));
}

function injOpenCentral(preludeEnabled = false) {
  injSaveState({ launchMode: preludeEnabled ? 'prelude' : 'direct' });
  setTimeout(() => {
    if (preludeEnabled) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`prelude/stage.html?scenario=${encodeURIComponent(injSel().value)}&mode=prelude`) });
      return;
    }
    chrome.tabs.query({ url: 'https://central.sophos.com/*' }, tabs => {
      if (!tabs.length) chrome.tabs.create({ url: 'https://central.sophos.com/manage/dashboard' });
      else tabs.forEach(t => chrome.tabs.reload(t.id));
    });
  }, 200);
}

function injDebounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function initInject() {
  if (injectInited) return;
  injectInited = true;

  injLoadScenarios().then(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, state => {
      if (chrome.runtime.lastError || !state) return;
      injToggle().checked = !!state.enabled;
      injSel().value = state.scenario || 'ransomware';
      injCustomer().value = state.customerName || 'Contoso Healthcare';
      injEndpoints().value = state.endpointCount || 2500;
      injServers().value = state.serverCount || 186;
      injBadge().checked = state.showBadge !== false;
      injUpdateUI(state);
    });
  });

  // Wire controls
  injToggle().addEventListener('change', () => injSaveState());
  injBadge().addEventListener('change', () => injSaveState());
  injSel().addEventListener('change', () => {
    const selected = injectScenarios.find(s => s.id === injSel().value);
    if (selected?.isCustom) {
      chrome.runtime.sendMessage({ type: 'EXPORT_SCENARIO', id: injSel().value }, resp => {
        const c = resp?.scenario?.customer;
        if (c) {
          if (c.name) injCustomer().value = c.name;
          if (c.endpointCount) injEndpoints().value = c.endpointCount;
          if (c.serverCount) injServers().value = c.serverCount;
        }
        injSaveState();
      });
    } else {
      injSaveState();
    }
    injUpdateDesc();
  });
  injCustomer().addEventListener('input', injDebounce(() => injSaveState(), 500));
  injEndpoints().addEventListener('input', injDebounce(() => injSaveState(), 500));
  injServers().addEventListener('input', injDebounce(() => injSaveState(), 500));

  document.getElementById('launchPreludeBtn').addEventListener('click', () => injOpenCentral(true));
  document.getElementById('launchDirectBtn').addEventListener('click', () => injOpenCentral(false));
  document.getElementById('previewBtn').addEventListener('click', () => {
    injSaveState({ launchMode: 'preview' });
    chrome.tabs.create({ url: chrome.runtime.getURL(`prelude/stage.html?scenario=${encodeURIComponent(injSel().value)}&mode=preview`) });
  });

  // Import / export / delete
  document.getElementById('importBtn').addEventListener('click', () => {
    const area = document.getElementById('importArea');
    area.style.display = area.style.display === 'none' ? 'flex' : 'none';
    document.getElementById('importJson').value = '';
  });
  document.getElementById('cancelImport').addEventListener('click', () => {
    document.getElementById('importArea').style.display = 'none';
  });
  document.getElementById('confirmImport').addEventListener('click', () => {
    let scenario;
    try { scenario = JSON.parse(document.getElementById('importJson').value); }
    catch (e) { injToast('Invalid JSON: ' + e.message, 'error'); return; }
    injImport(scenario);
  });
  document.getElementById('fileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      let scenario;
      try { scenario = JSON.parse(ev.target.result); }
      catch (err) { injToast('Invalid JSON file: ' + err.message, 'error'); return; }
      if (!scenario.name) scenario.name = file.name.replace('.json', '');
      injImport(scenario);
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('exportBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_SCENARIO', id: injSel().value }, resp => {
      if (!resp?.scenario) { injToast('No scenario data to export', 'error'); return; }
      const blob = new Blob([JSON.stringify(resp.scenario, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${injSel().value}.json`; a.click();
      URL.revokeObjectURL(url);
      injToast('Exported: ' + (resp.scenario.name || injSel().value));
    });
  });
  injDeleteBtn().addEventListener('click', () => {
    const id = injSel().value;
    const selected = injectScenarios.find(s => s.id === id);
    if (!selected?.isCustom) return;
    if (!confirm(`Delete "${selected.name}"?`)) return;
    chrome.runtime.sendMessage({ type: 'DELETE_SCENARIO', id }, resp => {
      if (resp?.ok) { injToast(`Deleted: ${selected.name}`); injLoadScenarios().then(() => { injSel().value = 'ransomware'; injSaveState(); }); }
    });
  });

  // Live intercept count
  setInterval(() => {
    if (currentMode !== 'inject' || !chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, state => {
      if (chrome.runtime.lastError || !state) return;
      injIntercepted().textContent = state.interceptedCount ? `${state.interceptedCount} intercepted` : '';
    });
  }, 3000);
}

function injImport(scenario) {
  if (!scenario.id) scenario.id = 'custom-' + Date.now();
  if (!scenario.name) scenario.name = 'Custom Scenario';
  chrome.runtime.sendMessage({ type: 'IMPORT_SCENARIO', scenario }, async resp => {
    if (resp?.ok) {
      injToast(`Imported: ${scenario.name}`);
      document.getElementById('importArea').style.display = 'none';
      await injLoadScenarios();
      injSel().value = scenario.id;
      if (scenario.customer) {
        if (scenario.customer.name) injCustomer().value = scenario.customer.name;
        if (scenario.customer.endpointCount) injEndpoints().value = scenario.customer.endpointCount;
        if (scenario.customer.serverCount) injServers().value = scenario.customer.serverCount;
      }
      injSaveState();
    } else {
      injToast(resp?.error || 'Import failed', 'error');
    }
  });
}

// ── Helpers ──
function card(label, innerHtml) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-label">${label}</div>${innerHtml}`;
  return div;
}

function htmlEl(str) {
  const div = document.createElement('div');
  div.innerHTML = str;
  return div;
}
