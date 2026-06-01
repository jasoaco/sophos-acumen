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
function detectCentral(snapshot) {
  const url = snapshot?.url || '';
  const route = snapshot?.route || '';
  const title = (snapshot?.title || '').toLowerCase();

  const isCentral = url.includes('central.sophos.com') || title.includes('sophos central');
  if (!isCentral) return { isCentral: false, product: null, segment: null };

  // Primary: pull the product slug from /manage/{segment}
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

  return { isCentral: true, product, segment };
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
document.querySelectorAll('.mode-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    document.getElementById('coach-panel').style.display = currentMode === 'coach' ? 'flex' : 'none';
    document.getElementById('analyst-panel').style.display = currentMode === 'analyst' ? 'flex' : 'none';
  });
});

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
  const { isCentral, product, segment } = detectCentral(snapshot);

  if (product && product !== currentProduct) {
    currentProduct = product;
    currentScreenIdx = 0;
    renderCoachHeader();
    renderCoachContent();
  } else if (isCentral && !product) {
    // On Central but this section isn't mapped — name it so it can be added
    currentProduct = null;
    showUnmappedCentral(segment);
  }

  document.getElementById('top-subtitle').textContent =
    currentProduct && window.PRODUCTS?.[currentProduct]
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
