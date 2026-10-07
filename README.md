# 🎯 Tilt Breaker

> **Stop losing on autopilot.** A Manifest V3 Chrome extension that monitors your Lichess session in real time and intervenes before a losing streak turns into a disaster.

---

## The Problem

Chess tilt is real. After two or three consecutive losses, most players continue queuing out of frustration — and keep losing. Tilt Breaker sits silently in the background, counts your streak, and steps in when you need it most.

---

## Features

| Feature | Details |
|---|---|
| 🔴 **Real-time loss tracking** | Detects game results as they happen via DOM observation — no API polling |
| ⚠️ **Soft warning system** | Fires a gentle heads-up notification one loss before the tilt threshold |
| 🚫 **Tilt intervention popup** | Full-screen modal when consecutive losses hit the limit; offers a one-more-chance or a cooldown |
| ⏳ **Forced cooldown timer** | Configurable cooldown screen (5–60 min) that blocks play until the timer expires |
| 🔁 **Session reset on close** | Optional toggle: session counter resets every time you close the Lichess tab (reloads preserve data) |
| 🎨 **Fully configurable** | Set your own loss threshold, cooldown duration, and up to N custom motivational messages |
| 🔒 **Zero telemetry** | All data lives in `chrome.storage.local` / `chrome.storage.sync` — nothing ever leaves your browser |
| 🛡️ **Security hardened** | No `innerHTML` with dynamic data, strict message-passing allowlists, no `eval`, least-privilege permissions |

---

## Architecture

```
tilt-breaker-extension/
├── manifest.json        # MV3 manifest — permissions, host rules, icons
├── background.js        # Service worker: badge updates, tab close, alarms, message validation
├── content.js           # Injected into lichess.org — game detection, streak logic, DOM overlays
├── popup.html           # Extension popup UI (settings, stats, feedback link)
├── popup.js             # Popup logic — settings CRUD, stat display, event wiring
├── styles.css           # Styles for the in-page tilt popup, cooldown screen, notifications
└── icons/               # Extension icons (16 × 16, 48 × 48, 128 × 128)
```

### Data flow

```
lichess.org page load
       │
       ▼
  content.js (injected)
  ├─ loadSettings()  ←── chrome.storage.sync  (user preferences)
  ├─ loadData()      ←── chrome.storage.local (session counters)
  ├─ DOM MutationObserver + setInterval
  │   └─ detectGameResult() → processResult()
  │         ├─ soft warning notification   (at threshold - 1 losses)
  │         └─ tilt popup / cooldown       (at threshold losses)
  └─ sendMessage('updateBadge') ──► background.js → chrome.action badge
```

### MV3 compliance highlights

- **Service worker** (`background.js`) — no persistent background page, no `setInterval` abuse.
- **No inline scripts or `eval`** — popup uses `<script src="popup.js">` only; all handlers wired in JS.
- **Strict CSP** — passes Chrome Web Store automated review out of the box.
- **Minimal permissions** — `storage`, `tabs`, `alarms`. No `<all_urls>`, no `webRequest`.
- **Host permission** scoped to `https://lichess.org/*` only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension platform | Chrome Extensions **Manifest V3** |
| Background | Service Worker (`background.js`) |
| Content script | Vanilla JS (ES2020+) — no framework |
| Storage | `chrome.storage.local` (stats) · `chrome.storage.sync` (settings) |
| Styling | Plain CSS with CSS custom properties and `@keyframes` animations |
| Build | Zero-build — load unpacked directly |

---

## Getting Started

### Prerequisites

- Google Chrome (or any Chromium-based browser supporting MV3)
- Git

### Installation (developer mode)

```bash
# 1. Clone the repository
git clone https://github.com/Praava7/tilt-breaker-extension.git
cd tilt-breaker-extension
```

```
# 2. Open the Extensions page
chrome://extensions
```

3. Enable **Developer mode** (toggle, top-right corner).
4. Click **Load unpacked** and select the `tilt-breaker-extension` folder.
5. Navigate to [lichess.org](https://lichess.org) — the extension activates automatically.

### Configuration

Click the 🎯 icon in your Chrome toolbar to open the settings popup:

| Setting | Default | Description |
|---|---|---|
| Consecutive loss threshold | `3` | Number of losses before intervention |
| Enable gentle warnings | `ON` | Soft notification one loss before threshold |
| Enable cooldown | `ON` | Show a timed cooldown screen instead of force-closing |
| Cooldown duration | `10 min` | How long the cooldown lasts |
| Reset session on close | `OFF` | Clear stats each time the Lichess tab is closed |
| Custom messages | 4 defaults | Up to N motivational messages shown during intervention |

---

## How It Works

### Game detection

`content.js` runs a `MutationObserver` on the game board and a 3-second polling interval. When a game ends, it reads `document.body.innerText` for result indicators (Checkmate, resigned, time out, Draw) and cross-references the board orientation to determine win/loss/draw.

### Streak logic

```
win  → consecutiveLosses = 0 · currentStreak++
draw → currentStreak = 0
loss → consecutiveLosses++
         ├─ == threshold - 1  →  soft ⚠️ notification
         └─ >= threshold      →  tilt popup
                                  ├─ "One more game" → hasUsedContinue flag set
                                  │    next loss → tab closed via background.js
                                  └─ "Take a rest"  → cooldown screen OR force close
```

### Session reset on close

Uses `sessionStorage` (survives page reloads, cleared on tab close) to distinguish a reload from a fresh tab, so stats only reset when the tab is actually closed.

---

## Privacy

Tilt Breaker collects **nothing**. No analytics, no external requests, no account data. All session statistics and settings are stored locally in your browser via the Chrome storage APIs and never leave your device.

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-idea`
3. Commit your changes: `git commit -m 'feat: your feature'`
4. Push: `git push origin feature/your-idea`
5. Open a Pull Request.

Found a bug or have a suggestion? Use the **💬 Feedback & Bug Report** button inside the extension popup.

---

## License

[MIT](https://opensource.org/licenses/MIT) © Prakhar Srivastava
