console.log("🧠 Background loaded");

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
