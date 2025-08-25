// src/components/HideJobsFilters.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Switch, Tooltip, Button, Empty, Space } from "antd";

import {
  CrownFilled,
  EyeInvisibleFilled,
  QuestionCircleFilled,
} from "@ant-design/icons";
import {
  applyOverlaysFromLocalStorage,
  toggleHideShowReposted,
  HIDE_REPOSTED_STATE_KEY,
  FEATURE_BADGE_KEY,
} from "./RepostedJobs/repostedDom";

import SubscribeButton from "./SubscribeButton";
import InteractiveTour from "./Tours/InteractiveTour";           // Dismissed-only tour
import AppliedLinkedinTour from "./Tours/AppliedLinkedinTour";   // Applied (LinkedIn)-only tour
import CompanyLinkedinTour from "./Tours/CompanyLinkedinTour";   // Companies tour (shared UX)

/* ─────────────────────────────────────────────────────────────
   IMPORTANT:
   - LinkedIn Companies feature uses storage key prefix: "companies"
   - Indeed Companies feature uses storage key prefix: "indeedCompanies"
   They both open the SAME Companies list view, but have SEPARATE toggles/keys.
   ───────────────────────────────────────────────────────────── */

const FILTER_KEYS = [
  "dismissed",
  "promoted",
  "viewed",
  "repostedGhost",
  "indeedSponsored",
  "glassdoorApplied",
  "indeedApplied",
  "applied",
  "filterByHours",
  "userText",
  "companies",        // Companies (LinkedIn)
  "indeedCompanies",  // Companies (Indeed)  ← NEW DISTINCT KEY
];

const DEFAULT_STATE = Object.fromEntries(FILTER_KEYS.map((k) => [k, false]));

const PREMIUM_KEYS = new Set([
  "repostedGhost",
  "indeedSponsored",
  "glassdoorApplied",
  "indeedApplied",
  "applied",
  "filterByHours",
  "userText",
  "companies",        // premium
  "indeedCompanies",  // premium
]);

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

// Detect which site the user is on
function detectSite() {
  const href = (typeof location !== "undefined" ? location.href : "") || "";
  const host = (typeof location !== "undefined" ? location.hostname : "") || "";

  const isLinkedIn =
    host.includes("linkedin.com") &&
    (/\/jobs\//.test(href) || href.includes("/jobs") || href.includes("/comm/"));
  const isIndeed = host.includes("indeed.");
  const isGlassdoor = host.includes("glassdoor.");

  if (isLinkedIn) return "linkedin";
  if (isIndeed) return "indeed";
  if (isGlassdoor) return "glassdoor";
  return "other";
}

// Removes reposted badges immediately and unhides any rows we hid
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

export default function HideJobsFilters() {
  const chromeApi = useMemo(getChrome, []);
  const [values, setValues] = useState(DEFAULT_STATE);
  const [compact, setCompact] = useState(false);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState("unknown");
  const prevIsSubscribedRef = useRef(false);

  // ✅ Separate states for separate tours
  const [dismissedTourOpen, setDismissedTourOpen] = useState(false);
  const [appliedTourOpen, setAppliedTourOpen] = useState(false);
  const [companiesTourOpen, setCompaniesTourOpen] = useState(false);
  const [companiesTourStep, setCompaniesTourStep] = useState(1);

  // ─────────────────────────────────────────────────────────────
  // Site-specific visibility
  // ─────────────────────────────────────────────────────────────
  const site = useMemo(detectSite, []);
  const visibleKeysForSite = useMemo(() => {
    if (site === "linkedin") {
      return new Set([
        "dismissed",
        "promoted",
        "viewed",
        "applied",         // Applied (LinkedIn)
        "companies",       // Companies (LinkedIn)
        "userText",        // Keywords
        "filterByHours",   // Filter by Hours
        "repostedGhost",   // Reposted Jobs
      ]);
    }
    if (site === "indeed") {
      return new Set([
        "indeedSponsored", // Sponsored (Indeed)
        "indeedApplied",   // Applied (Indeed)
        "indeedCompanies", // Companies (Indeed)  ← ONLY on Indeed pages
      ]);
    }
    if (site === "glassdoor") {
      return new Set([
        "glassdoorApplied", // Applied (Glassdoor)
      ]);
    }
    return new Set(); // other pages => show nothing but a message
  }, [site]);

  const broadcastFiltersChanged = (nextValues) => {
    try {
      const evt = new CustomEvent("hidejobs-filters-changed", { detail: nextValues });
      window.dispatchEvent(evt);
    } catch { }
  };

  const turnOffAllPremium = async () => {
    setValues((prev) => {
      const next = { ...prev };
      PREMIUM_KEYS.forEach((k) => (next[k] = false));
      return next;
    });

    if (chromeApi) {
      const toSet = {};
      PREMIUM_KEYS.forEach((k) => {
        toSet[`${k}BadgeVisible`] = false;
        toSet[`${k}Hidden`] = false;
      });
      toSet[FEATURE_BADGE_KEY] = false;
      toSet[HIDE_REPOSTED_STATE_KEY] = "false";
      await chromeApi.storage.local.set(toSet);

      try {
        toggleHideShowReposted(false);
        clearRepostedBadgesFromDOM();
      } catch { }
    }

    setValues((current) => {
      const snapshot = { ...current };
      PREMIUM_KEYS.forEach((k) => (snapshot[k] = false));
      broadcastFiltersChanged(snapshot);
      return current;
    });
  };

  useEffect(() => {
    if (!chromeApi) return;

    const visibilityKeys = FILTER_KEYS.map((k) => `${k}BadgeVisible`);
    const hiddenKeys = FILTER_KEYS.map((k) => `${k}Hidden`);

    chromeApi.storage.local.get(
      [
        ...visibilityKeys,
        ...hiddenKeys,
        "dismissedBadgeVisible",
        "badgesCompact",
        FEATURE_BADGE_KEY,
        "isSubscribed",
        "subscriptionStatus",
      ],
      async (res) => {
        const next = { ...DEFAULT_STATE };

        // UI switch reflects ONLY *BadgeVisible*
        FILTER_KEYS.forEach((k) => {
          const badgeVisible = !!res?.[`${k}BadgeVisible`];
          next[k] = badgeVisible;
        });

        // repostedGhost switch is controlled via FEATURE_BADGE_KEY
        next.repostedGhost = res?.[FEATURE_BADGE_KEY] !== false;

        setValues(next);
        setCompact(!!res?.badgesCompact);

        const wasSub = !!res?.isSubscribed;
        setIsSubscribed(wasSub);
        setSubscriptionStatus(res?.subscriptionStatus || "unknown");
        prevIsSubscribedRef.current = wasSub;

        if (!wasSub) {
          await turnOffAllPremium();
        }
      }
    );

    chrome.runtime?.sendMessage?.(
      { type: "get-subscription-status", forceRefresh: true },
      async (reply) => {
        if (reply?.ok) {
          const wasSub = prevIsSubscribedRef.current;
          const nowSub = !!reply.isSubscribed;

          setIsSubscribed(nowSub);
          setSubscriptionStatus(reply.status || "unknown");

          if (wasSub && !nowSub) {
            await turnOffAllPremium();
          }
          prevIsSubscribedRef.current = nowSub;
        }
      }
    );

    const handleStorage = async (changes, area) => {
      if (area !== "local") return;

      let touched = false;
      const delta = {};

      FILTER_KEYS.forEach((k) => {
        const badgeKey = `${k}BadgeVisible`;
        if (badgeKey in changes) {
          const newValue = !!changes[badgeKey].newValue;
          delta[k] = newValue;
          touched = true;
        }
      });

      if ("badgesCompact" in changes) {
        setCompact(!!changes.badgesCompact.newValue);
      }

      if (FEATURE_BADGE_KEY in changes) {
        delta.repostedGhost = changes[FEATURE_BADGE_KEY]?.newValue !== false;
        touched = true;
      }

      if (touched) {
        setValues((prev) => ({ ...prev, ...delta }));
      }

      let didUnsubscribeNow = false;

      if ("isSubscribed" in changes) {
        const nowSub = !!changes.isSubscribed.newValue;
        const wasSub = prevIsSubscribedRef.current;
        setIsSubscribed(nowSub);
        if (wasSub && !nowSub) didUnsubscribeNow = true;
        prevIsSubscribedRef.current = nowSub;
      }
      if ("subscriptionStatus" in changes) {
        setSubscriptionStatus(changes.subscriptionStatus.newValue || "unknown");
      }

      if (didUnsubscribeNow) {
        await turnOffAllPremium();
      }
    };

    chromeApi.storage.onChanged.addListener(handleStorage);
    return () => chromeApi.storage.onChanged.removeListener(handleStorage);
  }, [chromeApi]);

  useEffect(() => {
    const handleTourEvent = (event) => {
      if (event.detail) {
        setValues((prev) => ({ ...prev, ...event.detail }));
      }
    };
    window.addEventListener("hidejobs-filters-changed", handleTourEvent);
    return () => window.removeEventListener("hidejobs-filters-changed", handleTourEvent);
  }, []);

  const updateValue = (key, checked) => {
    if (PREMIUM_KEYS.has(key) && !isSubscribed) return;

    if (key === "companies" || key === "indeedCompanies") {
      setValues((prev) => ({ ...prev, companies: checked, indeedCompanies: checked }));
    } else {
      setValues((prev) => ({ ...prev, [key]: checked }));
    }

    if (chromeApi) {
      const updates = {
        [`${key}BadgeVisible`]: checked, // per-feature (distinct keys)
        [`${key}Hidden`]: checked,       // per-feature (distinct keys)
      };

      if (key === "dismissed") {
        updates["dismissedBadgeVisible"] = checked; // legacy mirror
      }

      if (key === "repostedGhost") {
        updates[FEATURE_BADGE_KEY] = checked;
        updates[HIDE_REPOSTED_STATE_KEY] = checked ? "true" : "false";
      }

      // 🔁 Hard-link LinkedIn + Indeed company toggles so they always move together
      if (key === "companies" || key === "indeedCompanies") {
        updates["companiesBadgeVisible"] = checked;
        updates["companiesHidden"] = checked;
        updates["indeedCompaniesBadgeVisible"] = checked;
        updates["indeedCompaniesHidden"] = checked;
      }

      chromeApi.storage.local.set(updates, () => {
        if (key === "repostedGhost") {
          if (checked) {
            try {
              applyOverlaysFromLocalStorage();
            } catch { }
          } else {
            try {
              toggleHideShowReposted(false);
              clearRepostedBadgesFromDOM();
            } catch { }
          }
        }
      });
    }

    try {
      const detail = { ...values, [key]: checked };
      if (key === "companies" || key === "indeedCompanies") {
        detail.companies = checked;
        detail.indeedCompanies = checked;
      }
      const evt = new CustomEvent("hidejobs-filters-changed", { detail });
      window.dispatchEvent(evt);
    } catch { }
  };

  const updateCompact = (checked) => {
    setCompact(checked);
    chromeApi?.storage?.local?.set?.({ badgesCompact: checked });
  };

  const goToCompaniesList = () => {
    // Shared list view for both LinkedIn + Indeed Companies features
    chromeApi?.storage?.local?.set?.({
      companies_came_from_filters: true,
      hidejobs_panel_view: "companies",
      hidejobs_panel_visible: true,
    });

    try {
      const evt = new CustomEvent("hidejobs-panel-set-view", {
        detail: { view: "companies" },
      });
      window.dispatchEvent(evt);
    } catch { }
  };

  // All possible rows (we will filter them per site below)
  const rows = [
    { key: "dismissed", label: "Dismissed" }, // header question mark opens its tour
    { key: "promoted", label: "Promoted" },
    { key: "viewed", label: "Viewed" },

    { key: "applied", label: "Applied (LinkedIn)", premium: true, tourKey: "applied" },
    { key: "companies", label: "Companies (LinkedIn)", premium: true, tourKey: "companies" },

    { key: "userText", label: "Keywords", premium: true },
    { key: "filterByHours", label: "Filter by Hours", premium: true },
    { key: "repostedGhost", label: "Reposted Jobs", premium: true },

    { key: "indeedSponsored", label: "Sponsored (Indeed)", premium: true },
    { key: "indeedApplied", label: "Applied (Indeed)", premium: true },

    // NEW: separate toggle for Indeed Companies (distinct storage key)
    { key: "indeedCompanies", label: "Companies (Indeed)", premium: true, tourKey: "companies" },

    { key: "glassdoorApplied", label: "Applied (Glassdoor)", premium: true },
  ];

  // Filter rows based on the current site
  const siteFilteredRows = rows.filter((r) => visibleKeysForSite.has(r.key));

  const freeRows = siteFilteredRows.filter((r) => !r.premium);
  const premiumRows = siteFilteredRows.filter((r) => r.premium);

  const renderRow = (row, isLast) => {
    const disabled = !!row.premium && !isSubscribed;

    // Show a "List" button for BOTH company rows:
    const isCompanyRow = row.key === "companies" || row.key === "indeedCompanies";

    const rightControl = isCompanyRow ? (
      <div className="flex items-center gap-2">
        <Tooltip title={disabled ? "Subscribe to enable" : "Open Hidden Companies list"}>
          <Button
            size="small"
            icon={<EyeInvisibleFilled />}
            onClick={disabled || (companiesTourOpen && companiesTourStep === 1) ? undefined : goToCompaniesList}
            disabled={disabled || (companiesTourOpen && companiesTourStep === 1)}
            style={(companiesTourOpen && companiesTourStep === 1) ? { cursor: "default" } : {}}
          >
            List
          </Button>
        </Tooltip>
        <Switch
          size="small"
          checked={!!values[row.key]}
          onChange={(checked) => updateValue(row.key, checked)}
          disabled={disabled || (companiesTourOpen && companiesTourStep === 3)}
        />
      </div>
    ) : (
      <Switch
        size="small"
        checked={!!values[row.key]}
        onChange={(checked) => updateValue(row.key, checked)}
        disabled={disabled}
      />
    );

    const openTourForRow = () => {
      if (row.tourKey === "applied") setAppliedTourOpen(true);
      if (row.tourKey === "companies") setCompaniesTourOpen(true);
    };

    return (
      <div
        key={row.key}
        data-filter-row={row.key}
        className={`flex items-center justify-between px-3 py-2 ${isLast ? "" : "border-b border-gray-100"}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {row.premium ? <CrownFilled className="text-[#b8860b]" /> : null}
          <span className={`truncate ${disabled ? "text-gray-400" : ""}`}>{row.label}</span>

          {/* Row-level “?” only where we have a per-row tour */}
          {row.tourKey ? (
            <Tooltip title="How it works">
              <Button
                type="text"
                size="small"
                icon={<QuestionCircleFilled className="text-gray-400" />}
                onClick={openTourForRow}
                disabled={row.premium && !isSubscribed}
              />
            </Tooltip>
          ) : null}
        </div>
        {rightControl}
      </div>
    );
  };

  // If the page is not LinkedIn/Indeed/Glassdoor job pages, show only the message
  if (visibleKeysForSite.size === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <Empty
            description={
              <span className="text-gray-600">
                Please navigate to a job page to start using filters.
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />

          <div className="mt-6">
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Button
                type="primary"
                size="large"
                block
                href="https://www.linkedin.com/jobs/search"
                target="_blank"
              >
                Go to LinkedIn Jobs
              </Button>
              <Button
                type="primary"
                size="large"
                block
                href="https://www.indeed.com/jobs"
                target="_blank"
              >
                Go to Indeed Jobs
              </Button>
              <Button
                type="primary"
                size="large"
                block
                href="https://glassdoor.com/Job"
                target="_blank"
              >
                Go to Glassdoor Jobs
              </Button>
            </Space>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with the question mark back at the title (LinkedIn's "Dismissed" tour lives here) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>
          {site === "linkedin" && (
            <Tooltip title="How it works">
              <Button
                type="text"
                size="small"
                icon={<QuestionCircleFilled className="text-gray-400" />}
                onClick={() => setDismissedTourOpen(true)}
              />
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Smaller badges</span>
          <Switch size="small" checked={!!compact} onChange={updateCompact} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200">
        {/* Free rows */}
        {freeRows.map((row, idx) =>
          renderRow(row, idx === freeRows.length - (premiumRows.length ? 0 : 1))
        )}

        {/* Premium rows */}
        {premiumRows.length > 0 && (
          <div className="relative">
            <div className={!isSubscribed ? "opacity-50 pointer-events-none" : ""}>
              {premiumRows.map((row, idx) => renderRow(row, idx === premiumRows.length - 1))}
            </div>
            {!isSubscribed && (
              <Tooltip
                title={<span style={{ color: "#333", fontWeight: 600 }}>Subscribe to unlock</span>}
                color="#feb700"
                placement="top"
              >
                <div className="absolute inset-0" />
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {!isSubscribed && <SubscribeButton />}

      {/* Overlays / tours */}
      <InteractiveTour open={dismissedTourOpen} onClose={() => setDismissedTourOpen(false)} />
      <AppliedLinkedinTour open={appliedTourOpen} onClose={() => setAppliedTourOpen(false)} />
      <CompanyLinkedinTour
        open={companiesTourOpen}
        onClose={() => setCompaniesTourOpen(false)}
        onStepChange={setCompaniesTourStep}
      />
    </div>
  );
}
