// src/entry/inject-shadow-ui.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import HideJobsPanelShell from "../components/HideJobsPanelShell";
import BadgesHost from "../components/BadgesHost";
import KeywordFilterPanel from "../components/KeywordFilterPanel";
import { StyleProvider } from "antd-style";
import { ConfigProvider } from "antd";
import tailwindCss from "../index.css?inline";

function isJobPage(href = location.href) {
  return (
    href.startsWith("https://www.linkedin.com/jobs/search") ||
    href.startsWith("https://www.linkedin.com/jobs/collections")
  );
}

(function mountHideJobsPanelShadowUI() {
  console.log("🟡 content-script loaded");
  if (document.querySelector("hidejobs-panel-ui")) return;

  const host = document.createElement("hidejobs-panel-ui");
  document.body.insertAdjacentElement("afterend", host);
  const shadowRoot = host.attachShadow({ mode: "open" });

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
  ${tailwindCss.replace(/(\d*\.?\d+)rem/g, (_, rem) => `${parseFloat(rem) * 16}px`)}
`;
  shadowRoot.appendChild(style);

  const container = document.createElement("div");
  // This container holds the whole UI (panel + badges + keywords)
  // Set a BASE z-index; inner components can set their own (badges 9995, panel >9995)
  container.style.position = "relative";
  container.style.zIndex = "9990";
  shadowRoot.appendChild(container);

  const App = () => {
    const [showKeywords, setShowKeywords] = useState(false);
    const [href, setHref] = useState(location.href);

    // Read initial “Keywords” toggle from storage
    useEffect(() => {
      chrome?.storage?.local?.get(["userTextBadgeVisible", "userText"], (res) => {
        // Your switches use <key>BadgeVisible; keep supporting both keys
        const v = typeof res?.userTextBadgeVisible === "boolean"
          ? !!res.userTextBadgeVisible
          : !!res?.userText; // fallback if you ever used `userText`
        setShowKeywords(v);
      });

      const onChange = (changes, area) => {
        if (area !== "local") return;
        if ("userTextBadgeVisible" in changes) {
          setShowKeywords(!!changes.userTextBadgeVisible.newValue);
        } else if ("userText" in changes) {
          // back-compat fallback
          setShowKeywords(!!changes.userText.newValue);
        }
      };
      chrome?.storage?.onChanged?.addListener(onChange);
      return () => chrome?.storage?.onChanged?.removeListener(onChange);
    }, []);

    // Track SPA URL changes so we only show on job pages
    useEffect(() => {
      let last = location.href;
      const id = setInterval(() => {
        if (location.href !== last) {
          last = location.href;
          setHref(last);
        }
      }, 800);
      return () => clearInterval(id);
    }, []);

    const shouldShowKeywordPanel = isJobPage(href) && showKeywords;

    return (
      <StyleProvider container={shadowRoot}>
        <ConfigProvider
          getPopupContainer={() => container}
          theme={{
            token: {
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
              Dropdown: {
                colorBgElevated: "#ffffff",
                colorText: "#28507c",
                colorTextHover: "#e7eef7",
                controlItemBgHover: "#f5f5f5",
                borderRadiusLG: 8,
                fontSize: 14,
                zIndexPopup: 10000,
              },
              Tag: {
                borderRadiusSM: 20,
              },
            },
          }}
        >
          {/* Main side panel */}
          <HideJobsPanelShell />

          {/* Badge stack (top-right etc.) */}
          <BadgesHost />

          {/* ✅ Keywords panel lives in the SAME shadow root as badges, only on job pages when toggle is ON */}
          <KeywordFilterPanel visible={shouldShowKeywordPanel} />
        </ConfigProvider>
      </StyleProvider>
    );
  };

  const root = createRoot(container);
  root.render(<App />);

  // Toggle panel from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "toggle-panel") {
      const event = new CustomEvent("toggle-hidejobs-panel");
      window.dispatchEvent(event);
      sendResponse({ received: true });
      return true;
    }
  });
})();
