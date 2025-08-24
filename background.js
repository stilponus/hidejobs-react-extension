console.log("🧠 Background loaded");

// Kick a silent subscription refresh on background load
refreshSubscriptionStatusFromServer();

/* =========================================================================
   0) Helper: fetch and cache subscription status for current user
   ========================================================================= */
async function refreshSubscriptionStatusFromServer() {
  try {
    const { user } = await chrome.storage.local.get(["user"]);
    const uid = user?.uid;
    if (!uid) {
      await chrome.storage.local.set({ subscriptionStatus: "unknown", isSubscribed: false });
      return { status: "unknown", isSubscribed: false };
    }

    const resp = await fetch(`https://appgetsubscription-2j2kwatdfq-uc.a.run.app?uid=${encodeURIComponent(uid)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);

    const status = typeof data?.status === "string" ? data.status : "unknown";
    const isSubscribed = !!data?.isActive;

    await chrome.storage.local.set({ subscriptionStatus: status, isSubscribed });
    return { status, isSubscribed };
  } catch (err) {
    console.error("❌ refreshSubscriptionStatusFromServer failed:", err);
    await chrome.storage.local.set({ subscriptionStatus: "unknown", isSubscribed: false });
    return { status: "unknown", isSubscribed: false };
  }
}

/* =========================================================================
   1) Browser action: toggle panel in the active tab
   ========================================================================= */
chrome.action.onClicked.addListener((tab) => {
  console.log("🟡 Extension icon clicked, sending toggle-panel to tab:", tab?.id);
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("🟡 Error sending message:", chrome.runtime.lastError.message);
    } else {
      console.log("🟡 toggle-panel message acknowledged by tab");
    }
  });
});

/* =========================================================================
   2) External messages from https://app.hidejobs.com (uid-only auth)
   ========================================================================= */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log("📨 Incoming external message:", message);
  console.log("🔐 Sender origin:", sender?.origin);

  const isTypeOk = message?.type === "hidejobs-user-auth";
  const hasUid = !!message?.user?.uid;
  const isOriginOk = sender?.origin === "https://app.hidejobs.com";

  if (isTypeOk && hasUid && isOriginOk) {
    console.log("✅ Valid auth message received");
    console.log("👤 Storing user object:", message.user);

    // store user and respond AFTER it's saved
    chrome.storage.local.set({ user: message.user }, () => {
      if (chrome.runtime.lastError) {
        console.error("💥 chrome.storage.local.set error:", chrome.runtime.lastError.message);
        sendResponse({ success: false, reason: "storage_error", detail: chrome.runtime.lastError.message });
        return;
      }
      console.log("💾 User successfully saved to extension local storage");

      // Also refresh subscription status for this user
      refreshSubscriptionStatusFromServer().catch(() => { });

      sendResponse({ success: true, reason: "stored" });
    });

    // keep the response channel open for async callback above
    return true;
  }

  // Rejected — return explicit reason to the web app
  console.warn("🚫 Rejected message", { isTypeOk, hasUid, isOriginOk });
  if (!isTypeOk) console.warn("❌ Wrong message type:", message?.type);
  if (!hasUid) console.warn("❌ Missing user.uid. message.user:", message?.user);
  if (!isOriginOk) console.warn("❌ Origin mismatch:", sender?.origin);

  sendResponse({
    success: false,
    reason: !isTypeOk ? "wrong_type" : !hasUid ? "missing_uid" : !isOriginOk ? "bad_origin" : "unknown",
  });
});

/* =========================================================================
   3) Internal messages (open a new tab)
   ========================================================================= */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "open-tab" && message?.url) {
    chrome.tabs.create({ url: message.url });
  }
});

/* =========================================================================
   4) Internal messages (save tracked job via backend)
   ========================================================================= */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "save-tracked-job" && message?.payload) {
    fetch("https://appsavetrackedjob-2j2kwatdfq-uc.a.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = payload?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        sendResponse({ success: true, data: payload });
      })
      .catch((err) => {
        console.error("❌ Background fetch failed:", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      });

    return true;
  }
});

/* =========================================================================
   5) Relay: content-panel -> content-scripts (same tab)
   ========================================================================= */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "UNHIDE_JOB_BY_COMPANY") {
    if (sender?.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, message);
    }
    sendResponse?.({ ok: true });
    return true;
  }
});

/* =========================================================================
   6) Internal messages (fetch top hidden companies)
   ========================================================================= */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "get-top-hidden-companies") {
    fetch("https://appgettopfivehiddencompanies-2j2kwatdfq-uc.a.run.app", { method: "GET" })
      .then(async (res) => {
        const json = await res.json().catch(() => []);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        sendResponse({ success: true, data: json });
      })
      .catch((err) => {
        console.error("❌ get-top-hidden-companies failed:", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      });

    // keep the channel open for async sendResponse
    return true;
  }
});

/* =========================================================================
   7) Internal messages (get/refresh subscription)
   ========================================================================= */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "get-subscription-status") {
    (async () => {
      // First return cached quickly, then refresh if asked
      const cached = await chrome.storage.local.get(["subscriptionStatus", "isSubscribed"]);
      const out = {
        status: cached?.subscriptionStatus ?? "unknown",
        isSubscribed: !!cached?.isSubscribed,
      };

      if (message?.forceRefresh) {
        const fresh = await refreshSubscriptionStatusFromServer();
        sendResponse({ ok: true, ...fresh });
      } else {
        sendResponse({ ok: true, ...out });
      }
    })();
    return true; // keep channel open for async response
  }
});
