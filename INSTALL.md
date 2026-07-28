# Installing Sophos Acumen

**Sophos Acumen** is an unpacked Chrome extension — there is no app store listing. You load it directly from a folder on your machine. This takes about 60 seconds.

---

## What You Need

- Google Chrome (or any Chromium browser: Edge, Brave, Arc)
- A Sophos Central login at [central.sophos.com](https://central.sophos.com)

No build step. No Node. No dependencies.

---

## Step 1 — Get the files

**Option A: Download the ZIP (recommended)**

1. On the [GitHub releases page](https://github.com/jasoaco/sophos-acumen/releases) (or from the repo root), download **`sophos-acumen.zip`**
2. Unzip it anywhere permanent on your machine — your Desktop, `~/Applications`, wherever. **Do not move or delete the folder after loading it** — Chrome reads the extension live from that folder.

**Option B: Clone the repo**

```bash
git clone https://github.com/jasoaco/sophos-acumen.git
```

---

## Step 2 — Load into Chrome

> **Why Developer mode?** Chrome requires this for any extension not installed from the Chrome Web Store. It's a one-time toggle that stays on permanently — you only do this once.

1. Open a new tab and go to: **`chrome://extensions`**
2. Turn on **Developer mode** — the toggle is in the top-right corner of that page
3. Click **Load unpacked**
4. Select the `sophos-acumen` folder (the one that contains `manifest.json`)
5. Sophos Acumen appears in your extension list

> **Tip:** Click the puzzle piece icon in the Chrome toolbar → find Sophos Acumen → click the pin icon to keep it visible.

---

## Step 3 — Use it

1. Go to **[https://central.sophos.com](https://central.sophos.com)** and sign in
2. Click the **Sophos Acumen** icon in your toolbar — the side panel opens
3. The panel has three tabs:

| Tab | What it does |
|-----|-------------|
| **Coach** | Auto-detects the product you're on and surfaces the talk track, discovery questions, objection handlers, and competitive intel |
| **Demo** | Pick a scenario, set the customer name and device counts, toggle injection on — the live Central UI renders your scenario's data |
| **Analyze** | Snapshots and interprets the current page |

---

## Updating

After downloading a new ZIP (or pulling new commits):

1. Unzip / pull into the same folder
2. Go to `chrome://extensions`
3. Click the **refresh** icon (↻) on the Sophos Acumen card
4. Hard-refresh any open Central tab: `Cmd + Shift + R` (Mac) / `Ctrl + Shift + R` (Windows)

---

## Troubleshooting

**The panel doesn't open**
→ Make sure Developer mode is on at `chrome://extensions`. Click the Acumen card's "Details" and confirm it's enabled.

**Coach shows "Navigate Sophos Central to begin"**
→ You're not on `central.sophos.com`. Navigate there first, then click the toolbar icon.

**Demo injection has no effect**
→ Toggle injection off and back on, then hard-refresh the Central tab (`Cmd/Ctrl + Shift + R`).

**Changes I made to the source aren't showing**
→ Close the side panel entirely (click the ✕), reload the extension at `chrome://extensions`, then reopen the panel. An open panel caches its own JS until it's fully destroyed and recreated.

---

## What the Demo Injection Does (and Doesn't Do)

The Demo tab injects fabricated data into **your browser session only**. It does not write to, alter, or communicate with Sophos Central servers. It does not affect your tenant, any customer's tenant, or anyone else's session. Toggle it off — or just close the tab — to return to the real data.

Always be transparent with your audience about what is live and what is staged.
