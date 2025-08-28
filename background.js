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

/*

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

*/

/* =========================================================================
   6.1) Internal messages (cloud save/load hidden companies)
   ========================================================================= */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const CLOUD_URL = "https://appsaveandloadcompanieshidelist-2j2kwatdfq-uc.a.run.app";

  // Save list to cloud
  if (message?.type === "cloud-save-hidden-companies") {
    (async () => {
      try {
        const { user } = await chrome.storage.local.get(["user"]);
        const uid = user?.uid;
        if (!uid) return sendResponse({ success: false, error: "No UID in extension storage" });

        const list = Array.isArray(message?.payload?.list) ? message.payload.list : [];

        const res = await fetch(CLOUD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, hideList: list }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

        sendResponse({ success: true, data: json });
      } catch (err) {
        console.error("❌ cloud-save-hidden-companies failed:", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // keep channel open
  }

  // Load list from cloud
  if (message?.type === "cloud-load-hidden-companies") {
    (async () => {
      try {
        const { user } = await chrome.storage.local.get(["user"]);
        const uid = user?.uid;
        if (!uid) return sendResponse({ success: false, error: "No UID in extension storage" });

        const url = `${CLOUD_URL}?uid=${encodeURIComponent(uid)}`;
        const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

        sendResponse({ success: true, data: json });
      } catch (err) {
        console.error("❌ cloud-load-hidden-companies failed:", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // keep channel open
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


/* =========================================================================
   8) Robust feature reset when logged out (single source of truth)
   ========================================================================= */

/**
 * Reset ONLY filter toggles & badge visibility when logged out.
 * Does NOT clear user, subscription, or other keys.
 */
/**
 * Reset ONLY filter toggles & badge visibility when logged out.
 * Does NOT clear the `user` object (that's handled by whoever called this),
 * but it ensures all UI-visible switches are OFF and counters are zero.
 */
async function resetAllFeaturesForLoggedOutUser(reason = "unknown") {
  try {
    const updates = {
      // per-feature toggles OFF
      dismissedBadgeVisible: false, dismissedHidden: false,
      promotedBadgeVisible: false, promotedHidden: false,
      viewedBadgeVisible: false, viewedHidden: false,
      appliedBadgeVisible: false, appliedHidden: false,
      repostedGhostBadgeVisible: false, repostedGhostHidden: false,
      indeedSponsoredBadgeVisible: false, indeedSponsoredHidden: false,
      indeedAppliedBadgeVisible: false, indeedAppliedHidden: false,
      glassdoorAppliedBadgeVisible: false, glassdoorAppliedHidden: false,
      filterByHoursBadgeVisible: false, filterByHoursHidden: false,

      // keywords
      userTextBadgeVisible: false, userTextHidden: false, userText: "",
      indeedUserTextBadgeVisible: false, indeedUserTextHidden: false,
      glassdoorUserTextBadgeVisible: false, glassdoorUserTextHidden: false,

      // companies
      companiesBadgeVisible: false, companiesHidden: false,
      indeedCompaniesBadgeVisible: false, indeedCompaniesHidden: false,
      glassdoorCompaniesBadgeVisible: false, glassdoorCompaniesHidden: false,

      // totals + counters
      totalOnPageBadgeVisible: false,
      totalHiddenOnPage: 0,        // existing counter you already use
      totalOnPageHidden: false,        
      companiesHiddenCount: 0,
      keywordHiddenCount: 0,

      // UI prefs
      badgesCompact: false,

      // subscription cache (logged-out baseline)
      isSubscribed: false,
      subscriptionStatus: "unknown",

      // DO NOT set FEATURE_BADGE_KEY/HIDE_REPOSTED_STATE_KEY here unless using computed keys
      // [HIDE_REPOSTED_STATE_KEY]: "false",  // only if constants are imported and used as storage keys
      // [FEATURE_BADGE_KEY]: false,
    };

    await chrome.storage.local.set(updates);

    // remove known typo/junk keys so they stop polluting storage (optional but tidy)
    await chrome.storage.local.remove([
      "repostedGhotstBadgeVisible" // old misspelling
    ]);

    // 👉 Tell all tabs to clear visible badges NOW
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      chrome.tabs.sendMessage(t.id, { type: "HJ_FORCE_FEATURES_OFF", reason }, () => {
        void chrome.runtime.lastError; // swallow "no receiver" errors
      });
    }

    console.log("🧹 Filter toggles + badges reset to OFF. Reason:", reason);
  } catch (err) {
    console.error("💥 resetAllFeaturesForLoggedOutUser failed:", err);
  }
}


// Only reset when user is explicitly removed/falsy
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !("user" in changes)) return;
  const next = changes.user?.newValue;
  const hasUid = !!next?.uid;
  if (!hasUid) {
    await resetAllFeaturesForLoggedOutUser("storage_user_removed");
  }
});
