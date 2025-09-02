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

import {
  ensureBadgeStyles,
  applyOverlaysFromLocalStorage,
  toggleHideShowReposted,
  isSupportedHost,
  REPOSTED_JOBS_KEY,
  REPOSTED_JOBS_DETAILS_KEY,
  HIDE_REPOSTED_STATE_KEY,
  FEATURE_BADGE_KEY,
} from "../components/RepostedJobs/repostedDom";

// ─────────────────────────────────────────────────────────────
// PREDICATES
// ─────────────────────────────────────────────────────────────

// Keep your original LinkedIn job-page logic as-is
function isLinkedInJobPage(href = location.href) {
  return (
    href.startsWith("https://www.linkedin.com/jobs/search") ||
    href.startsWith("https://www.linkedin.com/jobs/collections")
  );
}

// New: Indeed job-page allow-list (resilient; avoids non-job sub-sites)
function isIndeedJobPage(href = location.href) {
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (!host.includes("indeed.")) return false;

  // Explicitly exclude non-job areas
  const blockedPaths = [
    "/companies",
    "/career/salaries",
    "/about",
    "/help",
    "/legal",
    "/cmp",
    "/survey",
    "/career",
    "/viewjob", // single posting page (not the list)
    "/notifications",
    "/contributions",
    "/career-advice",
    "/career-services",
  ];
  if (blockedPaths.some((p) => path.startsWith(p))) return false;

  const blockedHosts = new Set([
    "employers.indeed.com",
    "profile.indeed.com",
    "myjobs.indeed.com",
    "dd.indeed.com",
    "secure.indeed.com",
    "smartapply.indeed.com",
    "messages.indeed.com",
  ]);
  if (blockedHosts.has(host)) return false;

  // Treat everything else on indeed.* as the job search/list pages
  return true;
}

// NEW: Glassdoor job-page allow-list
function isGlassdoorJobPage(href = location.href) {
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (!host.includes("glassdoor.")) return false;

  // Exclude employer center/help and obvious non-job sections
  const blockedHosts = new Set([
    "employercenter.glassdoor.com",
    "help.glassdoor.com",
  ]);
  if (blockedHosts.has(host)) return false;

  const blockedPaths = [
    "/overview",
    "/benefits",
    "/salary",
    "/salaries",
    "/reviews",
    "/interview",
    "/photos",
    "/faq",
    "/about",
    "/compare",
    "/comparisons",
    "/members", // signed-in misc pages
    "/profile",
  ];
  if (blockedPaths.some((p) => path.startsWith(p))) return false;

  // Treat everything else on glassdoor.* as job search/list pages
  // Typical job pages include /Job/, /Jobs/, /job-listing/, /Job/jobs.htm
  return true;
}

// Backwards-compat alias used below for panels (LinkedIn-only panels)
const isJobPage = isLinkedInJobPage;

// Remove reposted badges & unhide rows (used when feature is OFF)
function clearRepostedBadgesFromDOM() {
  const cards = document.querySelectorAll(
    ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
  );
  cards.forEach((card) => {
    card.querySelectorAll(".my-reposted-badge").forEach((b) => b.remove());
    const li = card.closest("li.scaffold-layout__list-item");
    if (li) {
      if (card.dataset.hiddenBy === "reposted") delete card.dataset.hiddenBy;
      if (li.dataset.hiddenBy === "reposted") delete li.dataset.hiddenBy;
      li.style.display = "";
    }
  });
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
  
  /* ICON COLOR FIX */
  .anticon svg {
    fill: currentColor !important;
  }
  
  .text-hidejobs-700 {
  color: #28507c !important;
}

.text-hidejobs-700 svg {
  fill: currentColor !important;
  color: inherit !important;
}

.text-gray-400 {
  color: #9ca3af !important; /* Tailwind text-gray-400 */
}

.text-gray-400 svg {
  fill: currentColor !important;
  color: inherit !important;
}

.icon-18 {
  font-size: 18px !important;
}

.icon-18 svg {
  width: 18px !important;
  height: 18px !important;
}
  
  ${tailwindCss.replace(/(\d*\.?\d+)rem/g, (_, rem) => `${parseFloat(rem) * 16}px`)}
`;
  shadowRoot.appendChild(style);

  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.zIndex = "9990";
  shadowRoot.appendChild(container);

  const App = () => {
    const [showKeywords, setShowKeywords] = useState(false);
    const [showFilterByHours, setShowFilterByHours] = useState(false);
    const [href, setHref] = useState(location.href);

    useEffect(() => {
      chrome?.storage?.local?.get(
        [
          "userTextBadgeVisible",
          "userText",
          "filterByHoursBadgeVisible",
          "filterByHours",
        ],
        (res) => {
          const kw =
            typeof res?.userTextBadgeVisible === "boolean"
              ? !!res.userTextBadgeVisible
              : !!res?.userText;
          setShowKeywords(kw);

          const hrs =
            typeof res?.filterByHoursBadgeVisible === "boolean"
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

    // Track SPA URL changes
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

    // Keep hours panel LinkedIn-only (UNCHANGED)
    const shouldShowHoursPanel = isJobPage(href) && showFilterByHours; // LinkedIn only

    // ✅ Show the keyword panel on LinkedIn OR Indeed OR Glassdoor, using the same toggle/state
    const shouldShowKeywordPanel =
      (isLinkedInJobPage(href) || isIndeedJobPage(href) || isGlassdoorJobPage(href)) &&
      showKeywords;

    // Show badges on LinkedIn, Indeed, and Glassdoor
    const shouldShowBadges =
      isLinkedInJobPage(href) || isIndeedJobPage(href) || isGlassdoorJobPage(href);

    return (
      <StyleProvider container={shadowRoot}>
        <ConfigProvider
          getPopupContainer={() => container}
          theme={{
            token: {
              colorPrimary: "#28507c",
              colorSuccess: "#009966",
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
              Progress: {
                defaultColor: "#28507c",
              },
              Collapse: {
                contentPadding: "0px 0px",
              },
              Rate: {
              starColor: "#f59e0b", // Tailwind amber-500
            },
            },
          }}
        >
          {/* Main side panel */}
          <HideJobsPanelShell currentHref={href} />

          {/* Badge stack: LinkedIn OR Indeed (unchanged) */}
          {shouldShowBadges && <BadgesHost />}

          {/* Floating panels */}
          <KeywordFilterPanel visible={shouldShowKeywordPanel} />
          <FilterByHoursPanel visible={shouldShowHoursPanel} />
        </ConfigProvider>
      </StyleProvider>
    );
  };

  const root = createRoot(container);
  root.render(<App />);

  // --- Reposted badges bootstrap (runs even if Reposted panel isn't mounted) ---
  (async function bootRepostedBadgesOnce() {
    if (window.__hidejobs_bootstrappedBadges) return;
    window.__hidejobs_bootstrappedBadges = true;

    if (!isSupportedHost()) return;

    // Track master feature toggle in-memory to avoid re-reading storage on each mutation
    let featureOn = true;

    const getFeatureOn = (val) => val !== false; // default ON unless explicitly false

    await new Promise((resolve) => {
      chrome?.storage?.local?.get([FEATURE_BADGE_KEY], (res) => {
        featureOn = getFeatureOn(res?.[FEATURE_BADGE_KEY]);
        resolve();
      });
    });

    ensureBadgeStyles();

    if (featureOn) {
      await applyOverlaysFromLocalStorage();
      chrome?.storage?.local?.get([HIDE_REPOSTED_STATE_KEY], async (res) => {
        const hide = res?.[HIDE_REPOSTED_STATE_KEY] === "true";
        await toggleHideShowReposted(hide);
      });
    } else {
      // If feature is OFF, ensure everything is visibly cleared
      await toggleHideShowReposted(false);
      clearRepostedBadgesFromDOM();
    }

    const list = document.querySelector("div.scaffold-layout__list");
    if (list) {
      const mo = new MutationObserver(() => {
        if (!featureOn) return; // do nothing when feature is off
        applyOverlaysFromLocalStorage();
      });
      mo.observe(list, { childList: true, subtree: true });
      window.__hidejobs_badgeMO = mo;
    }

    chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local") return;

      // Master feature toggle handler
      if (FEATURE_BADGE_KEY in changes) {
        featureOn = getFeatureOn(changes[FEATURE_BADGE_KEY]?.newValue);
        if (!featureOn) {
          // Turn OFF → unhide, remove badges, force hide-state false
          chrome?.storage?.local?.set?.({ [HIDE_REPOSTED_STATE_KEY]: "false" });
          toggleHideShowReposted(false);
          clearRepostedBadgesFromDOM();
          return;
        }
        // Turn ON → reapply overlays; keep current hide/show state
        applyOverlaysFromLocalStorage();
        chrome?.storage?.local?.get([HIDE_REPOSTED_STATE_KEY], (res) => {
          const hideNow = res?.[HIDE_REPOSTED_STATE_KEY] === "true";
          toggleHideShowReposted(hideNow);
        });
      }

      // Rebadge only if feature is ON
      if (featureOn && (REPOSTED_JOBS_KEY in changes || REPOSTED_JOBS_DETAILS_KEY in changes)) {
        applyOverlaysFromLocalStorage();
      }

      // Respect hide/show switch
      if (featureOn && HIDE_REPOSTED_STATE_KEY in changes) {
        const hide = changes[HIDE_REPOSTED_STATE_KEY]?.newValue === "true";
        toggleHideShowReposted(hide);
      }
    });
  })();

  // Toggle main side panel from background
  chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.type === "toggle-panel") {
      const event = new CustomEvent("toggle-hidejobs-panel");
      window.dispatchEvent(event);
      sendResponse?.({ received: true });
      return true;
    }

    // 🔴 New: hard reset trigger from background
    if (message?.type === "HJ_FORCE_FEATURES_OFF") {
      console.log("🧹 Content script received HJ_FORCE_FEATURES_OFF");

      try { clearRepostedBadgesFromDOM(); } catch { }

      // TODO: extend here if you have functions that draw dismissed/promoted/viewed
      // e.g. remove all .my-dismissed-badge / .my-promoted-badge / .my-viewed-badge etc.
      document.querySelectorAll(".my-dismissed-badge, .my-promoted-badge, .my-viewed-badge")
        .forEach(el => el.remove());

      sendResponse?.({ received: true });
      return true;
    }
  });
})();
