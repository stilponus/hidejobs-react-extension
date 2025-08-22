// src/components/HideJobsFilters.jsx   (your Filters panel)
import React, { useEffect, useMemo, useState } from "react";
import { Switch, Typography, Tooltip, Button } from "antd";
import {
  InfoCircleOutlined,
  CrownFilled,
  EyeInvisibleFilled,
} from "@ant-design/icons";
import {
  applyOverlaysFromLocalStorage,
  toggleHideShowReposted,
  HIDE_REPOSTED_STATE_KEY,
  FEATURE_BADGE_KEY,          // ✅ import the feature key
} from "./RepostedJobs/repostedDom";

const { Text } = Typography;

const FILTER_KEYS = [
  "dismissed",
  "promoted",
  "viewed",
  "repostedGhost",           // <- this switch should mirror FEATURE_BADGE_KEY
  "indeedSponsored",
  "glassdoorApplied",
  "indeedApplied",
  "applied",
  "filterByHours",
  "userText",
  "companies",
];

const DEFAULT_STATE = Object.fromEntries(FILTER_KEYS.map(k => [k, false]));

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

  useEffect(() => {
    if (!chromeApi) return;

    const visibilityKeys = FILTER_KEYS.map((k) => `${k}BadgeVisible`);

    chromeApi.storage.local.get(
      [
        ...visibilityKeys,
        "dismissedBadgeVisible",
        "badgesCompact",
        FEATURE_BADGE_KEY,                   // ✅ also load the feature key on init
      ],
      (res) => {
        const next = { ...DEFAULT_STATE };

        FILTER_KEYS.forEach((k) => {
          if (typeof res?.[`${k}BadgeVisible`] === "boolean") {
            next[k] = !!res[`${k}BadgeVisible`];
          }
        });

        // ✅ Make FEATURE_BADGE_KEY the source of truth for the switch
        // Default ON unless explicitly false
        next.repostedGhost = res?.[FEATURE_BADGE_KEY] !== false;

        setValues(next);
        setCompact(!!res?.badgesCompact);
      }
    );

    // Listen for storage changes (flags + compact + FEATURE_BADGE_KEY)
    const handleStorage = (changes, area) => {
      if (area !== "local") return;

      let touched = false;
      const delta = {};

      FILTER_KEYS.forEach((k) => {
        const key = `${k}BadgeVisible`;
        if (key in changes) {
          delta[k] = !!changes[key].newValue;
          touched = true;
        }
      });

      if ("badgesCompact" in changes) {
        setCompact(!!changes.badgesCompact.newValue);
      }

      // ✅ Keep in sync with changes coming from the Reposted panel
      if (FEATURE_BADGE_KEY in changes) {
        delta.repostedGhost = changes[FEATURE_BADGE_KEY]?.newValue !== false;
        touched = true;
      }

      if (touched) {
        setValues((prev) => ({ ...prev, ...delta }));
      }
    };

    chromeApi.storage.onChanged.addListener(handleStorage);
    return () => chromeApi.storage.onChanged.removeListener(handleStorage);
  }, [chromeApi]);

  const updateValue = (key, checked) => {
    setValues((prev) => ({ ...prev, [key]: checked }));

    if (chromeApi) {
      chromeApi.storage.local.set({ [`${key}BadgeVisible`]: checked });
      chromeApi.storage.local.set({ [`${key}Hidden`]: checked });

      if (key === "dismissed") {
        chromeApi.storage.local.set({ dismissedBadgeVisible: checked });
      }

      if (key === "repostedGhost") {
        // ✅ Persist the cross-panel feature toggle
        chromeApi.storage.local.set({ [FEATURE_BADGE_KEY]: checked });

        if (!checked) {
          // OFF -> clear badges, show rows, reset hide
          chromeApi.storage.local.set({ [HIDE_REPOSTED_STATE_KEY]: "false" });
          toggleHideShowReposted(false);
          clearRepostedBadgesFromDOM();
        } else {
          // ON -> re-apply badges
          applyOverlaysFromLocalStorage();
        }
      }
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

  const rows = [
    { key: "dismissed", label: "Dismissed" },
    { key: "promoted", label: "Promoted" },
    { key: "viewed", label: "Viewed" },
    { key: "repostedGhost", label: "Reposted Jobs", premium: true }, // ← this switch mirrors FEATURE_BADGE_KEY
    { key: "indeedSponsored", label: "Sponsored (Indeed)", premium: true },
    { key: "glassdoorApplied", label: "Applied (Glassdoor)", premium: true, help: true },
    { key: "indeedApplied", label: "Applied (Indeed)", premium: true, help: true },
    { key: "applied", label: "Applied (LinkedIn)", premium: true },
    { key: "filterByHours", label: "Filter by Hours", premium: true },
    { key: "userText", label: "Keywords", premium: true, help: true },
    { key: "companies", label: "Companies", premium: true },
  ];

  const goToCompaniesList = () => {
    chromeApi?.storage?.local?.set?.({ hidejobs_panel_view: "companies", hidejobs_panel_visible: true });
    try {
      const evt = new CustomEvent("hidejobs-panel-set-view", { detail: { view: "companies" } });
      window.dispatchEvent(evt);
    } catch { }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>
        <div className="flex items-center gap-2">
          <Text type="secondary" className="text-sm">Compact badges</Text>
          <Switch size="small" checked={!!compact} onChange={updateCompact} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200">
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;

          const rightControl =
            row.key === "companies" ? (
              <div className="flex items-center gap-2">
                <Tooltip title="Open Hidden Companies list">
                  <Button size="small" icon={<EyeInvisibleFilled />} onClick={goToCompaniesList}>
                    List
                  </Button>
                </Tooltip>
                <Switch
                  size="small"
                  checked={!!values[row.key]}
                  onChange={(checked) => updateValue(row.key, checked)}
                />
              </div>
            ) : (
              <Switch
                size="small"
                checked={!!values[row.key]}
                onChange={(checked) => updateValue(row.key, checked)}
              />
            );

          return (
            <div
              key={row.key}
              className={`flex items-center justify-between px-3 py-2 ${isLast ? "" : "border-b border-gray-100"}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {row.premium ? <CrownFilled className="text-[#b8860b]" /> : null}
                <Text className="truncate">{row.label}</Text>
                {row.help ? (
                  <Tooltip title="Info">
                    <InfoCircleOutlined className="text-gray-400" />
                  </Tooltip>
                ) : null}
              </div>
              {rightControl}
            </div>
          );
        })}
      </div>
    </div>
  );
}
