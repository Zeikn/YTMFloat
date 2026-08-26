const YTM_URL_PATTERN = "https://music.youtube.com/*";
const YTM_TAB_ID_KEY = "ytmTabId";
const WS_URL = "ws://127.0.0.1:38214";
const HEARTBEAT_ALARM = "ytm-ws-heartbeat";

let ytmTabId = null;
let lastState = null;
let socket = null;
let reconnectTimer = null;

let bridgePort = null;

async function loadPersistedIds() {
  const stored = await chrome.storage.local.get([YTM_TAB_ID_KEY]);
  ytmTabId = stored[YTM_TAB_ID_KEY] ?? null;
}

async function getTab(tabId) {
  if (tabId == null) return null;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function ensureYtmTab() {
  await readyPromise;

  let tab = await getTab(ytmTabId);

  if (!tab) {
    const matches = await chrome.tabs.query({ url: YTM_URL_PATTERN });
    const existing = matches.find((t) => t.active) ?? matches.find((t) => !t.pinned) ?? matches[0];
    tab =
      existing ??
      (await chrome.tabs.create({
        url: "https://music.youtube.com/",
        active: false,
        pinned: true,
      }));
    ytmTabId = tab.id;
    await chrome.storage.local.set({ [YTM_TAB_ID_KEY]: ytmTabId });
  }

  if (tab.discarded) {
    await chrome.tabs.reload(ytmTabId);
  }

  chrome.tabs.update(ytmTabId, { autoDiscardable: false }).catch(() => {});

  return ytmTabId;
}

function connectWS() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.addEventListener("open", () => {
    if (lastState) {
      socket.send(JSON.stringify({ type: "state", state: lastState }));
    }
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message?.type !== "command") return;

    if (bridgePort) {
      try {
        bridgePort.postMessage({ type: "ytm-command", command: message.command, payload: message.payload });
      } catch {
        bridgePort = null;
      }
    } else {
      ensureYtmTab();
    }
  });

  socket.addEventListener("close", () => {
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    socket?.close();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWS();
  }, 3000);
}

function sendState(state) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "state", state }));
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === ytmTabId) {
    ytmTabId = null;
    await chrome.storage.local.remove(YTM_TAB_ID_KEY);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ytm-bridge") return;

  port.onMessage.addListener((message) => {
    if (message?.type === "ytm-state") {
      bridgePort = port;
      lastState = message.state;
      sendState(lastState);
    }
  });

  port.onDisconnect.addListener(() => {
    if (bridgePort === port) {
      bridgePort = null;
      lastState = null;
      sendState(null);
    }
  });
});

chrome.action.onClicked.addListener(() => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "command", command: "toggle-visibility" }));
  } else {
    connectWS();
  }
});

chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    connectWS();
  }
});

const readyPromise = loadPersistedIds();
connectWS();
