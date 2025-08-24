// src/components/HideJobsFilters.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Switch, Tooltip, Button } from "antd";
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
  "companies",
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
  "companies",
]);

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
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
        toSet[`${k}Hidden`] = false; // ensure hiding is off, too
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

    setValues((prev) => ({ ...prev, [key]: checked }));

    if (chromeApi) {
      const updates = {
        [`${key}BadgeVisible`]: checked,
        [`${key}Hidden`]: checked,
      };

      if (key === "dismissed") {
        updates["dismissedBadgeVisible"] = checked;
      }

      if (key === "repostedGhost") {
        updates[FEATURE_BADGE_KEY] = checked;
        updates[HIDE_REPOSTED_STATE_KEY] = checked ? "true" : "false";
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
      const evt = new CustomEvent("hidejobs-filters-changed", { detail });
      window.dispatchEvent(evt);
    } catch { }
  };

  const updateCompact = (checked) => {
    setCompact(checked);
    chromeApi?.storage?.local?.set?.({ badgesCompact: checked });
  };

  const goToCompaniesList = () => {
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

  const rows = [
    { key: "dismissed", label: "Dismissed", tourKey: "dismissed" },
    { key: "promoted", label: "Promoted" },
    { key: "viewed", label: "Viewed" },
    { key: "repostedGhost", label: "Reposted Jobs", premium: true },
    { key: "indeedSponsored", label: "Sponsored (Indeed)", premium: true },
    { key: "glassdoorApplied", label: "Applied (Glassdoor)", premium: true },
    { key: "indeedApplied", label: "Applied (Indeed)", premium: true },
    { key: "applied", label: "Applied (LinkedIn)", premium: true, tourKey: "applied" },
    { key: "filterByHours", label: "Filter by Hours", premium: true },
    { key: "userText", label: "Keywords", premium: true },
    { key: "companies", label: "Companies", premium: true },
  ];

  const freeRows = rows.filter((r) => !r.premium);
  const premiumRows = rows.filter((r) => r.premium);

  const renderRow = (row, isLast) => {
    const disabled = !!row.premium && !isSubscribed;

    const rightControl =
      row.key === "companies" ? (
        <div className="flex items-center gap-2">
          <Tooltip title={disabled ? "Subscribe to enable" : "Open Hidden Companies list"}>
            <Button
              size="small"
              icon={<EyeInvisibleFilled />}
              onClick={disabled ? undefined : goToCompaniesList}
              disabled={disabled}
            >
              List
            </Button>
          </Tooltip>
          <Switch
            size="small"
            checked={!!values[row.key]}
            onChange={(checked) => updateValue(row.key, checked)}
            disabled={disabled}
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
      if (row.tourKey === "dismissed") setDismissedTourOpen(true);
      else if (row.tourKey === "applied") setAppliedTourOpen(true);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Smaller badges</span>
          <Switch size="small" checked={!!compact} onChange={updateCompact} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200">
        {freeRows.map((row, idx) =>
          renderRow(row, idx === freeRows.length - (premiumRows.length ? 0 : 1))
        )}

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

      <InteractiveTour open={dismissedTourOpen} onClose={() => setDismissedTourOpen(false)} />
      <AppliedLinkedinTour open={appliedTourOpen} onClose={() => setAppliedTourOpen(false)} />
    </div>
  );
}
