// background.js (MV3, type: "module")
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ======================= Thread Context Detection =============================

let lastContext = { threadId: null, accountIndex: 0 };

function parseGmailContext(url) {
  try {
    const u = new URL(url);
    // /mail/u/0/... => accountIndex 0
    const segs = u.pathname.split("/");
    const uIdx = segs.findIndex((s) => s === "u");
    const accountIndex =
      uIdx !== -1 && !Number.isNaN(Number(segs[uIdx + 1])) ? Number(segs[uIdx + 1]) : 0;

    // Thread id is in the hash - we use this to detect when user navigates to a different thread
    // but we'll extract the REAL thread ID from the DOM
    const last = u.hash.split("/").pop();
    const hasThread = last && last.length > 10 ? last : null;

    return { hasThread, accountIndex };
  } catch {
    return { hasThread: null, accountIndex: 0 };
  }
}

// Extract the real Gmail thread ID from the DOM
async function getThreadIdFromDOM(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Use [role="main"] to target the main content area and avoid sidebar/other threads
        const element = document.querySelector('[role="main"] [data-legacy-thread-id]');
        return element ? element.getAttribute('data-legacy-thread-id') : null;
      },
    });
    const threadId = results?.[0]?.result || null;
    console.log("Extracted thread ID from DOM:", threadId);
    return threadId;
  } catch (error) {
    console.error("Failed to extract thread ID from DOM:", error);
    return null;
  }
}

async function updateAndBroadcastContext(tabId, url) {
  const parsed = parseGmailContext(url);
  
  // Only try to get thread ID from DOM if the URL suggests we're in a thread view
  let threadId = null;
  if (parsed.hasThread) {
    threadId = await getThreadIdFromDOM(tabId);
  }
  
  const newContext = {
    threadId,
    accountIndex: parsed.accountIndex,
  };
  
  // Only broadcast if context actually changed
  if (
    lastContext.threadId !== newContext.threadId ||
    lastContext.accountIndex !== newContext.accountIndex
  ) {
    lastContext = newContext;
    chrome.runtime.sendMessage({ type: "THREAD_CHANGED", ...newContext }).catch(() => {});
  }
}

function broadcastContext(ctx) {
  lastContext = ctx;
  chrome.runtime.sendMessage({ type: "THREAD_CHANGED", ...ctx }).catch(() => {});
}

// Detect SPA history updates in Gmail
chrome.webNavigation.onHistoryStateUpdated.addListener(
  async ({ url, tabId }) => {
    if (url.includes("mail.google.com")) {
      await updateAndBroadcastContext(tabId, url);
    }
  },
  { url: [{ hostEquals: "mail.google.com" }] }
);

// Also catch hard URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.includes("mail.google.com")) {
    await updateAndBroadcastContext(tabId, changeInfo.url);
  }
});

// On tab activation broadcast current context
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.includes("mail.google.com")) {
      await updateAndBroadcastContext(tabId, tab.url);
    }
  } catch {}
});

// D) Side panel can request the latest context on mount
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_CONTEXT") {
    sendResponse(lastContext);
    return true;
  }
});

// ======================= Google OAuth =============================

const EXT_REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`;

// --- Config ---
const OAUTH = {
  clientId: "958670873475-laumeefaj0f0mierca1tu0io8b23hov5.apps.googleusercontent.com", 
  redirectUri: EXT_REDIRECT_URI,                 
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
};


// Allow both Lioncrest and Prospeq Workspace users
const ALLOWED_DOMAINS = ["lioncrest.vc", "prospeq.co"];

// --- Small utils ---
function b64urlFromBytes(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function randB64Url(len = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return b64urlFromBytes(bytes);
}
async function sha256b64url(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return b64urlFromBytes(new Uint8Array(digest));
}

async function saveTokens(obj) {
  await chrome.storage.local.set({ gc_tokens: obj });
}
async function loadTokens() {
  const { gc_tokens } = await chrome.storage.local.get("gc_tokens");
  return gc_tokens || null;
}
async function clearTokens() {
  await chrome.storage.local.remove("gc_tokens");
}

// --- Core OAuth flow (Using Chrome Identity API) ---
async function startAuthInteractive() {
  try {
    console.log("=== OAuth Debug Info ===");
    console.log("Extension ID:", chrome.runtime.id);
    console.log("Using chrome.identity.getAuthToken() with manifest oauth2 config");
    console.log("========================");

    // Use Chrome's native OAuth API with the manifest oauth2 config
    const accessToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error("No token returned"));
        } else {
          resolve(token);
        }
      });
    });

    console.log("Access token received");
    console.log("Verifying domain...");

    // Verify domain via OpenID UserInfo
    const profile = await fetch(OAUTH.userinfo, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => r.json());

    const email = (profile?.email || "").toLowerCase();
    const hd = (profile?.hd || "").toLowerCase(); // present for Workspace accounts
    const domain = email.includes("@") ? email.split("@")[1] : "";

    console.log("User email:", email);
    console.log("User domain:", domain || hd);

    const allowed =
      (domain && ALLOWED_DOMAINS.includes(domain)) ||
      (hd && ALLOWED_DOMAINS.includes(hd));

    if (!allowed) {
      console.error("Domain not allowed:", domain || hd);
      // Revoke token
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: accessToken }, resolve);
      });
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
        { method: "POST" }
      ).catch(() => {});
      throw new Error(`Please sign in with an approved account (${ALLOWED_DOMAINS.join(' or ')}). Got: ${email}`);
    }

    // Save token (Chrome manages the token, we just cache the info)
    // Tokens from chrome.identity.getAuthToken() are typically valid for 1 hour
    await saveTokens({
      access_token: accessToken,
      refresh_token: null,
      expires_at: Date.now() + 3600 * 1000, // 1 hour
      email,
    });

    console.log("Authentication successful for:", email);
    return { email };
  } catch (error) {
    console.error("Authentication error:", error);
    throw error;
  }
}

async function refreshIfNeeded() {
  const tok = await loadTokens();
  if (!tok) return null;

  // Still valid?
  if (tok.expires_at && Date.now() < tok.expires_at) {
    console.log("Token still valid");
    return tok;
  }

  // Token expired - try to get a new one silently from Chrome
  console.log("Token expired, attempting silent refresh...");
  try {
    const accessToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error("Silent refresh failed"));
        } else {
          resolve(token);
        }
      });
    });

    // Update stored token
    await saveTokens({
      access_token: accessToken,
      refresh_token: null,
      expires_at: Date.now() + 3600 * 1000,
      email: tok.email,
    });

    console.log("Token refreshed successfully");
    return await loadTokens();
  } catch (error) {
    console.log("Silent refresh failed, user must re-authenticate");
    await clearTokens();
    return null;
  }
}

async function getAuthStatus() {
  const tok = await refreshIfNeeded();
  return tok ? { signedIn: true, email: tok.email } : { signedIn: false };
}

async function signOut() {
  const tok = await loadTokens();
  if (tok?.access_token) {
    try {
      // Remove cached token from Chrome
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: tok.access_token }, resolve);
      });
      // Revoke on Google's side
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(
          tok.access_token
        )}`,
        { method: "POST" }
      );
    } catch {}
  }
  await clearTokens();
  return { ok: true };
}

// --- Message API for UI surfaces ---
// (Coexists with your existing GET_CONTEXT listener above)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "AUTH_START": {
          const res = await startAuthInteractive();
          sendResponse({ success: true, ...res });
          return;
        }
        case "AUTH_STATUS": {
          const res = await getAuthStatus();
          sendResponse({ success: true, ...res });
          return;
        }
        case "GET_TOKEN": {
          const tok = await refreshIfNeeded();
          if (!tok) {
            sendResponse({ success: false, error: "not_authenticated" });
            return;
          }
          sendResponse({ success: true, accessToken: tok.access_token });
          return;
        }
        case "SIGN_OUT": {
          await signOut();
          sendResponse({ success: true });
          return;
        }
        default:
          // Unhandled message type (your other listener handles GET_CONTEXT)
          return;
      }
    } catch (e) {
      sendResponse({
        success: false,
        error: e?.message || "auth_error",
      });
    }
  })();

  // Keep the channel open for async responses
  return true;
});
