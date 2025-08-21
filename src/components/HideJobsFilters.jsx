import React, { useEffect, useMemo, useState } from "react";
import { Switch, Typography, Tooltip } from "antd";
import {
  InfoCircleOutlined,
  CrownFilled,
  EyeInvisibleFilled,
  ClockCircleFilled,
} from "@ant-design/icons";

const { Text } = Typography;

// ---- Single source of truth: <key>BadgeVisible (and legacy dismissedBadgeVisible) ----
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

const DEFAULT_STATE = Object.fromEntries(FILTER_KEYS.map(k => [k, false]));

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

export default function HideJobsFilters() {
  const chromeApi = useMemo(getChrome, []);
  const [values, setValues] = useState(DEFAULT_STATE);

  // Initial load: read *only* per-flag <key>BadgeVisible (plus legacy dismissedBadgeVisible)
  useEffect(() => {
    if (!chromeApi) return;

    const visibilityKeys = FILTER_KEYS.map((k) => `${k}BadgeVisible`);

    chromeApi.storage.local.get(
      [...visibilityKeys, "dismissedBadgeVisible"], // legacy
      (res) => {
        const next = { ...DEFAULT_STATE };

        FILTER_KEYS.forEach((k) => {
          if (typeof res?.[`${k}BadgeVisible`] === "boolean") {
            next[k] = !!res[`${k}BadgeVisible`];
          }
        });

        // Back-compat: if present, mirror to dismissed switch
        if (typeof res?.dismissedBadgeVisible === "boolean") {
          next.dismissed = !!res.dismissedBadgeVisible;
        }

        setValues(next);
      }
    );

    // Listen for storage changes and update only the touched flags
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

      // legacy key support
      if ("dismissedBadgeVisible" in changes) {
        delta.dismissed = !!changes.dismissedBadgeVisible.newValue;
        touched = true;
      }

      if (touched) {
        setValues((prev) => ({ ...prev, ...delta }));
      }
    };

    chromeApi.storage.onChanged.addListener(handleStorage);
    return () => chromeApi.storage.onChanged.removeListener(handleStorage);
  }, [chromeApi]);

  // Toggling a switch: write only the single <key>BadgeVisible (and legacy for dismissed)
  const updateValue = (key, checked) => {
    setValues((prev) => ({ ...prev, [key]: checked }));

    if (chromeApi) {
      chromeApi.storage.local.set({ [`${key}BadgeVisible`]: checked });

      // legacy mirror for dismissed only
      if (key === "dismissed") {
        chromeApi.storage.local.set({ dismissedBadgeVisible: checked });
      }
    }

    // Notify content scripts (if anyone cares). We send only the new switch state snapshot.
    try {
      const detail = { ...values, [key]: checked };
      const evt = new CustomEvent("hidejobs-filters-changed", { detail });
      window.dispatchEvent(evt);
    } catch { }
  };

  const rows = [
    { key: "dismissed", label: "Dismissed" },
    { key: "promoted", label: "Promoted" },
    { key: "viewed", label: "Viewed" },
    { key: "repostedGhost", label: "Reposted / Ghost Jobs", premium: true, icon: <EyeInvisibleFilled /> },
    { key: "indeedSponsored", label: "Sponsored (Indeed)", premium: true },
    { key: "glassdoorApplied", label: "Applied (Glassdoor)", premium: true, help: true },
    { key: "indeedApplied", label: "Applied (Indeed)", premium: true, help: true },
    { key: "applied", label: "Applied (LinkedIn)", premium: true },
    { key: "filterByHours", label: "Filter by Hours", premium: true, icon: <ClockCircleFilled /> },
    { key: "userText", label: "Keywords", premium: true, help: true },
    { key: "companies", label: "Companies", premium: true, icon: <EyeInvisibleFilled /> },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>

      <div className="rounded-lg border border-gray-200">
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          return (
            <div
              key={row.key}
              className={`flex items-center justify-between px-3 py-2 ${isLast ? "" : "border-b border-gray-100"}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {row.premium ? <CrownFilled className="text-[#b8860b]" /> : null}
                <Text className="truncate">{row.label}</Text>
                {row.icon ? <span className="text-hidejobs-700">{row.icon}</span> : null}
                {row.help ? (
                  <Tooltip title="Info">
                    <InfoCircleOutlined className="text-gray-400" />
                  </Tooltip>
                ) : null}
              </div>

              <Switch
                size="small"
                checked={!!values[row.key]}
                onChange={(checked) => updateValue(row.key, checked)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
