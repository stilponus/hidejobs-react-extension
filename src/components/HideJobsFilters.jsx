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
import InteractiveTour from "./Tours/InteractiveTour";
import AppliedLinkedinTour from "./Tours/AppliedLinkedinTour";
import CompanyLinkedinTour from "./Tours/CompanyLinkedinTour";

/* ─────────────────────────────────────────────────────────────
   Companies toggles (3 distinct keys, linked together):
   - LinkedIn:   "companies"
   - Indeed:     "indeedCompanies"
   - Glassdoor:  "glassdoorCompanies"
   All open the SAME Companies list view and move together.
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

  // Companies (3 sites, linked together)
  "companies",           // LinkedIn
  "indeedCompanies",     // Indeed
  "glassdoorCompanies",  // Glassdoor

  // Keywords UI mirrors (shared back-end key)
  "indeedUserText",
  "glassdoorUserText",

  // Not in the main rows anymore, but still part of state/storage:
  // "totalOnPage" lives in Settings container now
  "totalOnPage",
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

  // Companies (all premium, linked)
  "companies",
  "indeedCompanies",
  "glassdoorCompanies",

  // Keywords mirrors
  "indeedUserText",
  "glassdoorUserText",
]);

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

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

// Clears reposted badges immediately
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

  const [dismissedTourOpen, setDismissedTourOpen] = useState(false);
  const [appliedTourOpen, setAppliedTourOpen] = useState(false);
  const [companiesTourOpen, setCompaniesTourOpen] = useState(false);
  const [companiesTourStep, setCompaniesTourStep] = useState(1);

  const site = useMemo(detectSite, []);
  const visibleKeysForSite = useMemo(() => {
    if (site === "linkedin") {
      return new Set([
        "dismissed",
        "promoted",
        "viewed",
        "applied",
        "companies",          // Companies (LinkedIn)
        "userText",
        "filterByHours",
        "repostedGhost",
        // "totalOnPage" now lives in Settings, so not here
      ]);
    }
    if (site === "indeed") {
      return new Set([
        "indeedSponsored",
        "indeedApplied",
        "indeedCompanies",    // Companies (Indeed)
        "indeedUserText",
        // "totalOnPage" now lives in Settings, so not here
      ]);
    }
    if (site === "glassdoor") {
      return new Set([
        "glassdoorApplied",
        "glassdoorCompanies", // Companies (Glassdoor)
        "glassdoorUserText",
        // "totalOnPage" now lives in Settings, so not here
      ]);
    }
    return new Set();
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

        // Shared Keywords toggle
        "userTextBadgeVisible",
        "userText",

        // NEW: master toggle for Total badge
        "totalOnPageBadgeVisible",
      ],
      async (res) => {
        const next = { ...DEFAULT_STATE };

        // Default from per-row *BadgeVisible*
        FILTER_KEYS.forEach((k) => {
          next[k] = !!res?.[`${k}BadgeVisible`];
        });

        // Coalesce shared Keywords (mirror to all three)
        const sharedKeywordOn =
          typeof res?.userTextBadgeVisible === "boolean"
            ? !!res.userTextBadgeVisible
            : !!res?.userText;
        next.userText = sharedKeywordOn;
        next.indeedUserText = sharedKeywordOn;
        next.glassdoorUserText = sharedKeywordOn;

        // Coalesce Companies across sites (OR of any of the 6 related keys)
        const companiesOn =
          !!res?.companiesBadgeVisible ||
          !!res?.companiesHidden ||
          !!res?.indeedCompaniesBadgeVisible ||
          !!res?.indeedCompaniesHidden ||
          !!res?.glassdoorCompaniesBadgeVisible ||
          !!res?.glassdoorCompaniesHidden;

        next.companies = companiesOn;
        next.indeedCompanies = companiesOn;
        next.glassdoorCompanies = companiesOn;

        // Reposted ghost follows the feature badge
        next.repostedGhost = res?.[FEATURE_BADGE_KEY] !== false;

        // NEW: default "Total on Page" to TRUE if never set
        if (typeof res?.totalOnPageBadgeVisible === "boolean") {
          next.totalOnPage = !!res.totalOnPageBadgeVisible;
        } else {
          next.totalOnPage = true; // sensible default
          chromeApi.storage.local.set({ totalOnPageBadgeVisible: true });
        }

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

      // Per-row BadgeVisible updates
      FILTER_KEYS.forEach((k) => {
        const badgeKey = `${k}BadgeVisible`;
        if (badgeKey in changes) {
          const newValue = !!changes[badgeKey].newValue;
          delta[k] = newValue;
          touched = true;
        }
      });

      // Shared Keywords mirror
      if ("userTextBadgeVisible" in changes) {
        const on = !!changes.userTextBadgeVisible.newValue;
        delta.userText = on;
        delta.indeedUserText = on;
        delta.glassdoorUserText = on;
        touched = true;
      }
      if ("userText" in changes) {
        const on = !!changes.userText.newValue;
        delta.userText = on;
        delta.indeedUserText = on;
        delta.glassdoorUserText = on;
        touched = true;
      }

      // Companies: if ANY of the 6 keys flips, mirror to all three rows
      const compKeys = [
        "companiesBadgeVisible",
        "companiesHidden",
        "indeedCompaniesBadgeVisible",
        "indeedCompaniesHidden",
        "glassdoorCompaniesBadgeVisible",
        "glassdoorCompaniesHidden",
      ];
      let companiesOnDelta = null;
      for (const k of compKeys) {
        if (k in changes) {
          companiesOnDelta = !!changes[k].newValue;
          break;
        }
      }
      if (companiesOnDelta !== null) {
        delta.companies = companiesOnDelta;
        delta.indeedCompanies = companiesOnDelta;
        delta.glassdoorCompanies = companiesOnDelta;
        touched = true;
      }

      // NEW: reflect master toggle for Total badge
      if ("totalOnPageBadgeVisible" in changes) {
        delta.totalOnPage = !!changes.totalOnPageBadgeVisible.newValue;
        touched = true;
      }

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

    // 🔁 Hard-link ALL THREE company toggles (LinkedIn, Indeed, Glassdoor)
    if (key === "companies" || key === "indeedCompanies" || key === "glassdoorCompanies") {
      setValues((prev) => ({
        ...prev,
        companies: checked,
        indeedCompanies: checked,
        glassdoorCompanies: checked,
      }));
    }
    // 🔁 Hard-link all keyword toggles (UI mirrors) to the shared key
    else if (key === "userText" || key === "indeedUserText" || key === "glassdoorUserText") {
      setValues((prev) => ({
        ...prev,
        userText: checked,
        indeedUserText: checked,
        glassdoorUserText: checked,
      }));
    } else {
      setValues((prev) => ({ ...prev, [key]: checked }));
    }

    if (chromeApi) {
      const updates = {
        [`${key}BadgeVisible`]: checked,
        [`${key}Hidden`]: checked,
      };

      if (key === "dismissed") {
        updates["dismissedBadgeVisible"] = checked; // legacy mirror
      }

      if (key === "repostedGhost") {
        updates[FEATURE_BADGE_KEY] = checked;
        updates[HIDE_REPOSTED_STATE_KEY] = checked ? "true" : "false";
      }

      // 🔁 Write ALL THREE Companies keys together
      if (key === "companies" || key === "indeedCompanies" || key === "glassdoorCompanies") {
        updates["companiesBadgeVisible"] = checked;
        updates["companiesHidden"] = checked;

        updates["indeedCompaniesBadgeVisible"] = checked;
        updates["indeedCompaniesHidden"] = checked;

        updates["glassdoorCompaniesBadgeVisible"] = checked;
        updates["glassdoorCompaniesHidden"] = checked;
      }

      // 🔁 Mirror all Keywords toggles to the shared keys
      if (key === "userText" || key === "indeedUserText" || key === "glassdoorUserText") {
        updates["userTextBadgeVisible"] = checked;
        updates["userTextHidden"] = checked;

        updates["indeedUserTextBadgeVisible"] = checked;  // UI-only mirrors (optional)
        updates["indeedUserTextHidden"] = checked;
        updates["glassdoorUserTextBadgeVisible"] = checked;
        updates["glassdoorUserTextHidden"] = checked;
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
      if (key === "companies" || key === "indeedCompanies" || key === "glassdoorCompanies") {
        detail.companies = checked;
        detail.indeedCompanies = checked;
        detail.glassdoorCompanies = checked;
      }
      if (key === "userText" || key === "indeedUserText" || key === "glassdoorUserText") {
        detail.userText = checked;
        detail.indeedUserText = checked;
        detail.glassdoorUserText = checked;
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
    // Shared list view
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

  // All possible rows (filtered per site below) — does NOT include totalOnPage now
  const rows = [
    { key: "dismissed", label: "Dismissed" },
    { key: "promoted", label: "Promoted" },
    { key: "viewed", label: "Viewed" },

    { key: "applied", label: "Applied (LinkedIn)", premium: true, tourKey: "applied" },

    // Companies rows (ALL premium, shared tour UX)
    { key: "companies", label: "Companies (LinkedIn)", premium: true, tourKey: "companies" },
    { key: "indeedCompanies", label: "Companies (Indeed)", premium: true },
    { key: "glassdoorCompanies", label: "Companies (Glassdoor)", premium: true },

    { key: "userText", label: "Keywords", premium: true },
    { key: "filterByHours", label: "Filter by Hours", premium: true },
    { key: "repostedGhost", label: "Reposted Jobs", premium: true },

    { key: "indeedSponsored", label: "Sponsored (Indeed)", premium: true },
    { key: "indeedApplied", label: "Applied (Indeed)", premium: true },

    // Keywords mirrors
    { key: "indeedUserText", label: "Keywords (Indeed)", premium: true },
    { key: "glassdoorUserText", label: "Keywords (Glassdoor)", premium: true },

    { key: "glassdoorApplied", label: "Applied (Glassdoor)", premium: true },
  ];

  const siteFilteredRows = rows.filter((r) => visibleKeysForSite.has(r.key));
  const freeRows = siteFilteredRows.filter((r) => !r.premium);
  const premiumRows = siteFilteredRows.filter((r) => r.premium);

  const renderRow = (row, isLast) => {
    const disabled = !!row.premium && !isSubscribed;

    // Show "List" for ALL Companies rows (LinkedIn+Indeed+Glassdoor)
    const isCompanyRow =
      row.key === "companies" ||
      row.key === "indeedCompanies" ||
      row.key === "glassdoorCompanies";

    const rightControl = isCompanyRow ? (
      <div className="flex items-center gap-2">
        <Tooltip title={disabled ? "Subscribe to enable" : "Open Hidden Companies list"}>
          <Button
            size="small"
            icon={<EyeInvisibleFilled />}
            // disable clicks on step 1 OR step 3
            onClick={disabled || (companiesTourOpen && (companiesTourStep === 1 || companiesTourStep === 3))
              ? undefined
              : goToCompaniesList}
            // fully disabled only on step 1
            disabled={disabled || (companiesTourOpen && companiesTourStep === 1)}
            // default cursor for step 1 and 3
            style={(companiesTourOpen && (companiesTourStep === 1 || companiesTourStep === 3))
              ? { cursor: "default" }
              : {}}
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

  if (visibleKeysForSite.size === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <Empty
            description={<span className="text-gray-600">Please navigate to a job page to start using filters.</span>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />

          <div className="mt-6">
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Button type="primary" size="large" block href="https://www.linkedin.com/jobs/search" target="_blank">
                Go to LinkedIn Jobs
              </Button>
              <Button type="primary" size="large" block href="https://www.indeed.com/jobs" target="_blank">
                Go to Indeed Jobs
              </Button>
              <Button type="primary" size="large" block href="https://glassdoor.com/Job" target="_blank">
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
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

        {/* compact switch moved to Settings */}
        <div className="flex items-center gap-2" />
      </div>

      {/* Main toggles container */}
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

      {/* NEW: Settings container */}
      <div className="rounded-lg border border-gray-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-hidejobs-700">Settings</span>
          </div>
        </div>

        {/* Smaller badges (compact) */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <span className="truncate">Smaller badges</span>
          <Switch size="small" checked={!!compact} onChange={updateCompact} />
        </div>

        {/* Total on Page */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="truncate">Total hidden on page</span>
          <Switch
            size="small"
            checked={!!values.totalOnPage}
            onChange={(checked) => updateValue("totalOnPage", checked)}
          />
        </div>
      </div>

      {!isSubscribed && <SubscribeButton />}

      {/* Tours */}
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
