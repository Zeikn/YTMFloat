const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { WebSocketServer } = require("ws");

const WS_PORT = 38214;
const POSITION_FILE = path.join(app.getPath("userData"), "window-position.json");
const WINDOW_WIDTH = 336;
const WINDOW_HEIGHT = 186;
const QUEUE_EXPAND_HEIGHT = 180;
const COMPACT_WIDTH = 180;
const COMPACT_HEIGHT = 150;

let mainWindow = null;
let tray = null;
let extensionSocket = null;
let isQuitting = false;

function loadSavedPosition() {
  try {
    return JSON.parse(fs.readFileSync(POSITION_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function savePosition(bounds) {
  try {
    fs.writeFileSync(POSITION_FILE, JSON.stringify({ x: bounds.x, y: bounds.y }));
  } catch {}
}

function createWindow() {
  const saved = loadSavedPosition();
  const primary = screen.getPrimaryDisplay().workArea;
  const x = saved?.x ?? primary.x + primary.width - WINDOW_WIDTH - 24;
  const y = saved?.y ?? primary.y + primary.height - WINDOW_HEIGHT - 24;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => mainWindow.show());

  let moveTimer = null;
  mainWindow.on("moved", () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => savePosition(mainWindow.getBounds()), 300);
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function toggleVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "icons", "tray.png");
  tray = new Tray(iconPath);
  tray.setToolTip("YTM Float");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show/Hide", click: toggleVisibility },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", toggleVisibility);
}

function broadcastState(state) {
  mainWindow?.webContents.send("ytm-state", state);
}

function startWebSocketServer() {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: WS_PORT });
  console.log("[YTM Float] WS server listening on", WS_PORT);

  wss.on("connection", (ws) => {
    console.log("[YTM Float] extension connected");
    extensionSocket = ws;

    ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message?.type === "state") {
        broadcastState(message.state);
      } else if (message?.type === "command" && message.command === "toggle-visibility") {
        toggleVisibility();
      }
    });

    ws.on("close", () => {
      console.log("[YTM Float] extension disconnected");
      if (extensionSocket === ws) extensionSocket = null;
      broadcastState(null);
    });
  });
}

ipcMain.on("ytm-command", (_event, { command, payload }) => {
  if (extensionSocket && extensionSocket.readyState === extensionSocket.OPEN) {
    extensionSocket.send(JSON.stringify({ type: "command", command, payload }));
  }
});

ipcMain.on("hide-window", () => {
  mainWindow?.hide();
});

let queueExpandYDelta = 0;
let resizeAnimationTimer = null;

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function animateBounds(from, to, durationMs = 220) {
  if (resizeAnimationTimer) clearInterval(resizeAnimationTimer);

  const start = Date.now();
  resizeAnimationTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / durationMs);
    const eased = easeOutQuad(t);

    mainWindow?.setBounds({
      x: Math.round(from.x + (to.x - from.x) * eased),
      y: Math.round(from.y + (to.y - from.y) * eased),
      width: Math.round(from.width + (to.width - from.width) * eased),
      height: Math.round(from.height + (to.height - from.height) * eased),
    });

    if (t >= 1) {
      clearInterval(resizeAnimationTimer);
      resizeAnimationTimer = null;
    }
  }, 10);
}

ipcMain.on("resize-for-queue", (_event, isOpen) => {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();

  if (isOpen) {
    const workArea = screen.getDisplayMatching(bounds).workArea;
    const newHeight = bounds.height + QUEUE_EXPAND_HEIGHT;
    const spaceBelow = workArea.y + workArea.height - bounds.y;

    const desiredY = spaceBelow >= newHeight ? bounds.y : Math.max(workArea.y, bounds.y - QUEUE_EXPAND_HEIGHT);
    queueExpandYDelta = desiredY - bounds.y;

    animateBounds(bounds, { x: bounds.x, y: desiredY, width: bounds.width, height: newHeight });
  } else {
    const target = {
      x: bounds.x,
      y: bounds.y - queueExpandYDelta,
      width: bounds.width,
      height: bounds.height - QUEUE_EXPAND_HEIGHT,
    };
    queueExpandYDelta = 0;
    animateBounds(bounds, target);
  }
});

let baseBounds = null;

ipcMain.on("set-compact", (_event, isCompact) => {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();

  if (isCompact) {
    baseBounds = bounds;
    animateBounds(bounds, { x: bounds.x, y: bounds.y, width: COMPACT_WIDTH, height: COMPACT_HEIGHT });
  } else {
    const target = baseBounds ?? { x: bounds.x, y: bounds.y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT };
    baseBounds = null;
    animateBounds(bounds, target);
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startWebSocketServer();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
