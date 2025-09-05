// src/components/ReviewPromptGate.jsx
import React, { useEffect, useState } from "react";
import { Modal } from "antd";
import { StarFilled } from "@ant-design/icons";
import Logo from "../assets/Logo.jsx";

/**
 * ReviewPromptGate
 * - Checks local storage for activationDate, counters, uid
 * - Shows a review modal on schedule
 * - Updates counters when shown
 *
 * Notes:
 * - We use <Modal /> (NOT Modal.confirm) so we get the standard header + X close.
 * - We still create modalContextHolder from Modal.useModal() and return it
 *   so AntD’s modal context/theme tokens are guaranteed in the shadow DOM.
 */
export default function ReviewPromptGate({ getContainer }) {
  const [open, setOpen] = useState(false);

  // Keep modal context holder so theme tokens apply (even if we don't call api.*)
  const [, modalContextHolder] = Modal.useModal();

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

        // Open the normal modal (with header + close X)
        setOpen(true);
      } catch {
        // silent fail
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const containerEl = typeof getContainer === "function" ? getContainer() : undefined;

  return (
    <>
      {/* Keep AntD modal context holder so theme/tokens apply in shadow DOM */}
      {modalContextHolder}

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => {
          setOpen(false);
          chrome.runtime.sendMessage({
            type: "open-tab",
            url: "https://chromewebstore.google.com/detail/hide-companies-promoted-a/lbpfijpapbbpdmniijjbbhgaagoiihkg/reviews",
          });
        }}
        okText="Leave a review"
        cancelText="Not now"
        centered
        width={420}
        // Make sure the modal mounts INSIDE your shadow root, so it picks up ConfigProvider theme
        getContainer={containerEl}
        // Standard header with X is shown by default (closable=true)
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Logo style={{ height: 32, width: "auto" }} />
            <span className="text-hidejobs-700" style={{ fontWeight: 600, fontSize: 18 }}>
              HideJobs
            </span>
          </div>
        }
        afterClose={() => setOpen(false)}
        maskClosable
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>
            Enjoying HideJobs?
          </div>

          {/* Stars use your utilities for size + color */}
          <div style={{ marginBottom: 12, lineHeight: 1 }}>
            {[...Array(5)].map((_, i) => (
              <StarFilled key={i} className="icon-18 text-amber-500" style={{ marginRight: 4 }} />
            ))}
          </div>

          <p style={{ marginBottom: 0 }}>
            Please, leave a quick review — it takes only a few seconds and helps others discover the extension.
          </p>
        </div>
      </Modal>
    </>
  );
}
