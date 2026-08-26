# YTM Float

A compact, frameless, always-on-top floating player for YouTube Music. Drag it anywhere on your screen, control playback without switching tabs or windows, and control it straight from Opera GX's built-in sidebar YTM panel instead of needing a dedicated browser tab.

## Features

- Frameless, rounded, always-on-top widget — stays visible over any application, not just your browser
- Play/pause, next/previous, seek, volume, shuffle, and repeat
- Expandable "up next" queue with thumbnails, click to jump to any track
- Compact mode for a minimal thumbnail + transport-only view
- Works from a normal tab, a background tab, **or Opera GX's sidebar YTM panel**
- Remembers window position between launches
- Everything runs locally — no accounts, no cloud, no telemetry

## How it works

There's no official third-party API for YouTube Music, so this project is two parts working together:

1. **A browser extension** that's injected into `music.youtube.com` (wherever it's running, including Opera's sidebar panel) and reads/drives the real page — song metadata, the YouTube player API, and the queue panel's internal data.
2. **A small Electron desktop app** that renders the actual floating widget. This is necessary because browser extensions cannot create frameless or always-on-top windows — that's a hard platform restriction, not a missing feature. The two talk to each other over a local WebSocket (`127.0.0.1` only, nothing leaves your machine).

Both need to be running for the widget to work.

## Install

### 1. The browser extension

1. Download or clone this repository.
2. Open `opera://extensions` (or `chrome://extensions` in any Chromium browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the repository's root folder (the one containing `manifest.json`).
5. Keep Developer mode on — Chromium disables unpacked extensions if it's turned off.

### 2. The companion app

**Easiest — download the installer:**
Grab the latest `YTM Float Setup.exe` from [Releases](../../releases), run it, and launch YTM Float. No Node.js or command line needed.

**From source (for development):**
```
cd companion-app
npm install
npm start
```

To build your own installer:
```
cd companion-app
npm install
npm run dist
```
The installer will be in `companion-app/dist/`.

The companion app lives in your system tray — leave it running. Add a shortcut to it in your Windows Startup folder (`shell:startup`) if you want it to launch automatically.

## Usage

- Play music from any `music.youtube.com` tab, a pinned tab, or Opera GX's sidebar panel — the widget follows whichever one is currently reporting playback.
- Drag the widget anywhere by its body (no title bar needed).
- Click the dropdown arrow to expand the upcoming queue; click any track to jump to it.
- Click the compact-mode button to shrink the widget down to just the thumbnail and transport controls.
- Click the × to hide the widget to the tray; bring it back via the tray icon or the extension's toolbar icon.

## Project structure

```
manifest.json              Extension manifest
background.js              Service worker: tab lifecycle, WebSocket bridge
content/ytm-bridge.js       Reads/controls the YouTube Music page
content/ytm-main-world.js   Reads queue data the isolated content script can't see
companion-app/              Electron app rendering the floating widget
```

## Known limitations

- The extension alone shows nothing — the companion app must be running, since a browser extension cannot create a frameless/always-on-top window.
- Relies on scraping YouTube Music's DOM, its internal Polymer data model, and its internal player API. If Google changes any of these internals, something may break until selectors are updated — PRs welcome.
- You need to already be logged into YouTube Music in your browser profile; this project doesn't handle sign-in.

## Contributing

Issues and pull requests are welcome, especially fixes for YouTube Music DOM/selector changes.
