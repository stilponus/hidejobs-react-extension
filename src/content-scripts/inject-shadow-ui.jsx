// src/entry/inject-shadow-ui.jsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import HideJobsPanelShell from "../components/HideJobsPanelShell";
import BadgesHost from "../components/BadgesHost";
import KeywordFilterPanel from "../components/KeywordFilterPanel";
import FilterByHoursPanel from "../components/FilterByHoursPanel.jsx";
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
  // This container holds the whole UI (panel + badges + floating panels)
  container.style.position = "relative";
  container.style.zIndex = "9990";
  shadowRoot.appendChild(container);

  const App = () => {
    const [showKeywords, setShowKeywords] = useState(false);
    const [showFilterByHours, setShowFilterByHours] = useState(false);
    const [href, setHref] = useState(location.href);

    // Read initial toggles from storage (Keywords + Filter by Hours) and subscribe to changes
    useEffect(() => {
      chrome?.storage?.local?.get(
        [
          "userTextBadgeVisible", "userText",                    // keywords (current + legacy)
          "filterByHoursBadgeVisible", "filterByHours"           // hours (current + legacy)
        ],
        (res) => {
          const kw = typeof res?.userTextBadgeVisible === "boolean"
            ? !!res.userTextBadgeVisible
            : !!res?.userText;
          setShowKeywords(kw);

          const hrs = typeof res?.filterByHoursBadgeVisible === "boolean"
            ? !!res.filterByHoursBadgeVisible
            : !!res?.filterByHours;
          setShowFilterByHours(hrs);
        }
      );

      const onChange = (changes, area) => {
        if (area !== "local") return;

        if ("userTextBadgeVisible" in changes) {
          setShowKeywords(!!changes.userTextBadgeVisible.newValue);
        } else if ("userText" in changes) {
          setShowKeywords(!!changes.userText.newValue);
        }

        if ("filterByHoursBadgeVisible" in changes) {
          setShowFilterByHours(!!changes.filterByHoursBadgeVisible.newValue);
        } else if ("filterByHours" in changes) {
          setShowFilterByHours(!!changes.filterByHours.newValue);
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
    const shouldShowHoursPanel = isJobPage(href) && showFilterByHours;

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
                colorError: "#d40048",
                colorErrorHover: "#b3003b",
                colorErrorActive: "#990032",
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

          {/* Badge stack (only on job pages) */}
          {isJobPage(href) && <BadgesHost />}

          {/* Floating panels (same shadow root as badges) */}
          <KeywordFilterPanel visible={shouldShowKeywordPanel} />
          <FilterByHoursPanel visible={shouldShowHoursPanel} />
        </ConfigProvider>
      </StyleProvider>
    );
  };

  const root = createRoot(container);
  root.render(<App />);

  // Toggle main side panel from background
  chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type === "toggle-panel") {
      const event = new CustomEvent("toggle-hidejobs-panel");
      window.dispatchEvent(event);
      sendResponse?.({ received: true });
      return true;
    }
  });
})();
