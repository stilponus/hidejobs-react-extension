import React from "react";
import { createRoot } from "react-dom/client";
import HideJobsPanelShell from "../components/HideJobsPanelShell";
import { StyleProvider } from "antd-style";
import { ConfigProvider } from "antd";
import tailwindCss from "../index.css?inline";

(function mountHideJobsPanelShadowUI() {
  console.log("🟡 content-script loaded");

  console.log("🟡 DEBUG: I am in the new SHADOW version at", new Date().toLocaleTimeString());

  // If already mounted, skip
  if (document.querySelector("hidejobs-panel-ui")) {
    console.log("🟡 already mounted, skipping");
    return;
  }

  // 1. Create custom element and inject after </body>
  const host = document.createElement("hidejobs-panel-ui");
  document.body.insertAdjacentElement("afterend", host);
  console.log("🟡 host element inserted after body");

  // 2. Attach Shadow DOM
  const shadowRoot = host.attachShadow({ mode: "open" });
  console.log("🟡 shadow root attached");

  // 3. Inject Tailwind styles into shadow root
  const style = document.createElement("style");
  style.textContent = `
  :host, :root {
    --tw-border-style: solid;
    --tw-font-weight: initial;
    --tw-shadow: 0 0 #0000;
    --tw-shadow-color: initial;
    --tw-shadow-alpha: 100%;
    --tw-inset-shadow: 0 0 #0000;
    --tw-inset-shadow-color: initial;
    --tw-inset-shadow-alpha: 100%;
    --tw-ring-color: initial;
    --tw-ring-shadow: 0 0 #0000;
    --tw-inset-ring-color: initial;
    --tw-inset-ring-shadow: 0 0 #0000;
    --tw-ring-inset: initial;
    --tw-ring-offset-width: 0px;
    --tw-ring-offset-color: #fff;
    --tw-ring-offset-shadow: 0 0 #0000;
  }
  ${
    tailwindCss.replace(/(\d*\.?\d+)rem/g, (_, rem) => {
      return `${parseFloat(rem) * 16}px`;
    })
  }
`;

  shadowRoot.appendChild(style);
  console.log("🟡 Tailwind CSS injected");

  // 4. Create a container div with proper positioning
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.zIndex = "9999";
  shadowRoot.appendChild(container);

  const root = createRoot(container);

  root.render(
    <StyleProvider container={shadowRoot}>
      <ConfigProvider
        getPopupContainer={() => container}
        theme={{
          token: {
            // NOTE: Update these to your HideJobs brand colors if needed
            colorPrimary: "#28507c",
            fontFamily: "Inter, sans-serif",
            zIndexPopupBase: 10000,
          },
          components: {
            Button: {
              colorPrimary: "#28507c",
              colorPrimaryHover: "#306399",
              colorPrimaryActive: "#233b57",
            },
            Form: {
              verticalLabelPadding: "0 0 4px",
              labelColor: "#6B7280",
            },
            Input: {
              colorBgContainer: "#ffffff",
              controlHeight: 36,
            },
            Spin: {
              colorPrimary: "#306399",
            },
            Select: {
              optionSelectedBg: "#cadbed",
              controlItemBgHover: "#e7eef7",
            },
            Dropdown: {
              colorBgElevated: "#ffffff",
              colorText: "#28507c",
              colorTextHover: "#e7eef7",
              controlItemBgHover: "#f5f5f5",
              borderRadiusLG: 8,
              fontSize: 14,
              zIndexPopup: 10000,
            },
          },
        }}
      >
        <HideJobsPanelShell />
      </ConfigProvider>
    </StyleProvider>
  );

  console.log("🟡 HideJobsPanelShell mounted in Shadow DOM after </body>");

  // Toggle panel when clicking extension icon
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "toggle-panel") {
      const event = new CustomEvent("toggle-hidejobs-panel");
      window.dispatchEvent(event);
      sendResponse({ received: true });
      return true; // ✅ Tells Chrome "I will respond asynchronously"
    }
  });
})();