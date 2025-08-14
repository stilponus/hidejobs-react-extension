console.log("🧠 Background loaded");

// ✅ Move this OUTSIDE — runs when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log("🟡 Extension icon clicked, sending toggle-panel to tab:", tab.id);
  chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("🟡 Error sending message:", chrome.runtime.lastError.message);
    } else {
      console.log("🟡 toggle-panel message acknowledged by tab");
    }
  });
});

// ✅ Handle external messages for user authentication
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log("📨 Incoming external message:", message);
  console.log("🔐 Sender origin:", sender?.origin);

  if (
    message?.type === "stilpon-user-auth" &&
    message?.user?.id &&
    sender?.origin === "https://app.stilpon.ru"
  ) {
    console.log("✅ Valid auth message received");
    console.log("👤 Storing user object:", message.user);
    chrome.storage.local.set({ user: message.user }, () => {
      console.log("💾 User successfully saved to extension local storage");
    });
    sendResponse({ success: true });
  } else {
    console.warn("🚫 Rejected message");
    if (message?.type !== "stilpon-user-auth") {
      console.warn("❌ Wrong message type:", message?.type);
    }
    if (!message?.user?.id) {
      console.warn("❌ Missing user.id:", message?.user);
    }
    if (sender?.origin !== "https://app.stilpon.ru") {
      console.warn("❌ Origin mismatch:", sender?.origin);
    }
    sendResponse({ success: false });
  }
});

// ✅ Listen for internal extension messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "open-tab" && message.url) {
    chrome.tabs.create({ url: message.url });
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "save-tracked-job") {
    fetch("https://functions.yandexcloud.net/d4evluk2gak5k33m28e8", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then((res) => res.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((err) => {
        console.error("❌ Background fetch failed:", err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // IMPORTANT: keep response channel open
  }
});
