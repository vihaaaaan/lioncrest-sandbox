// background.js (MV3, type: "module")
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

let lastContext = { threadId: null, accountIndex: 0 };

function parseGmailContext(url) {
  try {
    const u = new URL(url);
    // /mail/u/0/... => accountIndex 0
    const segs = u.pathname.split("/");
    const uIdx = segs.findIndex((s) => s === "u");
    const accountIndex =
      uIdx !== -1 && !Number.isNaN(Number(segs[uIdx + 1])) ? Number(segs[uIdx + 1]) : 0;

    // Thread id is final token in hash (#inbox/.../<THREAD_ID>)
    const last = u.hash.split("/").pop();
    const threadId = last && last.length > 10 ? last : null;

    return { threadId, accountIndex };
  } catch {
    return { threadId: null, accountIndex: 0 };
  }
}

function broadcastContext(ctx) {
  lastContext = ctx;
  chrome.runtime.sendMessage({ type: "THREAD_CHANGED", ...ctx }).catch(() => {});
  console.log("[bg] THREAD_CHANGED", ctx);
}

// Detect SPA history updates in Gmail
chrome.webNavigation.onHistoryStateUpdated.addListener(
  ({ url }) => {
    if (url.includes("mail.google.com")) broadcastContext(parseGmailContext(url));
  },
  { url: [{ hostEquals: "mail.google.com" }] }
);

// Also catch hard URL changes
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.includes("mail.google.com")) {
    broadcastContext(parseGmailContext(changeInfo.url));
  }
});

// On tab activation broadcast current context
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    broadcastContext(parseGmailContext(tab.url));
    
  } catch {}
});

// D) Side panel can request the latest context on mount
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CONTEXT") {
    sendResponse(lastContext);
    return true;
  }
});
