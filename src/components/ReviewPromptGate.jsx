// src/components/ReviewPromptGate.jsx
import React, { useEffect } from "react";
import { Modal } from "antd";
import Logo from "../assets/Logo.jsx";

/**
 * ReviewPromptGate
 * - Checks local storage for activationDate, counters, uid
 * - Shows a review modal on schedule
 * - Updates counters when shown
 */
export default function ReviewPromptGate() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { user, activationDate, reviewLastShown, reviewPromptCount } =
          await chrome.storage.local.get([
            "user",
            "activationDate",
            "reviewLastShown",
            "reviewPromptCount",
          ]);

        const uid = user?.uid;
        if (!uid) return; // signed-in users only
        if (!activationDate) return; // must have baseline

        const count = Number(reviewPromptCount || 0);
        if (count >= 4) return; // stop forever after 4 prompts

        const firstIntervalMs = 21 * 24 * 60 * 60 * 1000;
        const laterIntervalMs = 14 * 24 * 60 * 60 * 1000;
        const intervalMs = count === 0 ? firstIntervalMs : laterIntervalMs;

        const nowMs = Date.now();
        const activationMs = Date.parse(activationDate);
        const lastShownMs = Number(reviewLastShown || 0);

        const eligible =
          Number.isFinite(activationMs) &&
          nowMs - activationMs >= intervalMs &&
          nowMs - lastShownMs >= intervalMs;

        if (!eligible || cancelled) return;

        // Update counters before showing
        await chrome.storage.local.set({
          reviewLastShown: nowMs,
          reviewPromptCount: count + 1,
        });

        // Show Ant Design modal
        Modal.confirm({
          title: null, // we'll render our own header with logo + name
          icon: null,
          content: (
            <div style={{ textAlign: "center" }}>
              {/* Header with logo + brand */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                <Logo style={{ height: 28, width: "auto" }} />
                <span style={{ fontWeight: 600, fontSize: 18 }}>HideJobs</span>
              </div>

              <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
                Enjoying HideJobs?
              </div>

              <div style={{ marginBottom: 12, fontSize: 20, lineHeight: 1 }}>
                {"★ ★ ★ ★ ★"}
              </div>

              <p style={{ marginBottom: 0 }}>
                If HideJobs helps clean up your job feed, could you leave a quick review on the Chrome Web Store?
                It takes ~10 seconds and really helps others find the extension.
              </p>
            </div>
          ),
          okText: "Leave a review",
          cancelText: "Not now",
          okButtonProps: { type: "primary" },
          centered: true,
          width: 420,
          onOk: () => {
            chrome.runtime.sendMessage({
              type: "open-tab",
              url: "https://chromewebstore.google.com/detail/hide-companies-promoted-a/lbpfijpapbbpdmniijjbbhgaagoiihkg/reviews",
            });
          },
          onCancel: () => {
            // no tracking, just close
          },
        });
      } catch (err) {
        // Fail silently
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null; // renders nothing, just runs effect
}
