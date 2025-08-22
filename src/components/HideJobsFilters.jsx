import React, { useEffect, useMemo, useState } from "react";
import { Switch, Typography, Tooltip, Button } from "antd";
import {
  InfoCircleOutlined,
  CrownFilled,
  EyeInvisibleFilled,
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
  const [compact, setCompact] = useState(false); // Compact badges

  // Initial load: read per-flag visibility + legacy dismissed key
  useEffect(() => {
    if (!chromeApi) return;

    const visibilityKeys = FILTER_KEYS.map((k) => `${k}BadgeVisible`);

    chromeApi.storage.local.get(
      [...visibilityKeys, "dismissedBadgeVisible", "badgesCompact"], // include compact
      (res) => {
        const next = { ...DEFAULT_STATE };

        FILTER_KEYS.forEach((k) => {
          if (typeof res?.[`${k}BadgeVisible`] === "boolean") {
            next[k] = !!res[`${k}BadgeVisible`];
          }
        });

        setValues(next);
        setCompact(!!res?.badgesCompact); // set compact from storage
      }
    );

    // Listen for storage changes (flags + compact)
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

      if (touched) {
        setValues((prev) => ({ ...prev, ...delta }));
      }
    };

    chromeApi.storage.onChanged.addListener(handleStorage);
    return () => chromeApi.storage.onChanged.removeListener(handleStorage);
  }, [chromeApi]);

  // Toggling a filter switch
  const updateValue = (key, checked) => {
    setValues((prev) => ({ ...prev, [key]: checked }));

    if (chromeApi) {
      // Control badge visibility
      chromeApi.storage.local.set({ [`${key}BadgeVisible`]: checked });

      // Also control actual filter state (so jobs are hidden/restored)
      chromeApi.storage.local.set({ [`${key}Hidden`]: checked });

      if (key === "dismissed") {
        chromeApi.storage.local.set({ dismissedBadgeVisible: checked });
      }
    }

    try {
      const detail = { ...values, [key]: checked };
      const evt = new CustomEvent("hidejobs-filters-changed", { detail });
      window.dispatchEvent(evt);
    } catch { }
  };

  // Compact toggle
  const updateCompact = (checked) => {
    setCompact(checked);
    chromeApi?.storage?.local?.set?.({ badgesCompact: checked });
  };

  const rows = [
    { key: "dismissed", label: "Dismissed" },
    { key: "promoted", label: "Promoted" },
    { key: "viewed", label: "Viewed" },
    { key: "repostedGhost", label: "Reposted / Ghost Jobs", premium: true },
    { key: "indeedSponsored", label: "Sponsored (Indeed)", premium: true },
    { key: "glassdoorApplied", label: "Applied (Glassdoor)", premium: true, help: true },
    { key: "indeedApplied", label: "Applied (Indeed)", premium: true, help: true },
    { key: "applied", label: "Applied (LinkedIn)", premium: true },
    { key: "filterByHours", label: "Filter by Hours", premium: true },
    { key: "userText", label: "Keywords", premium: true, help: true },
    { key: "companies", label: "Companies", premium: true },
  ];

  const goToCompaniesList = () => {
    // Make sure panel switches view and stays open
    chromeApi?.storage?.local?.set?.({ hidejobs_panel_view: "companies", hidejobs_panel_visible: true });
    try {
      const evt = new CustomEvent("hidejobs-panel-set-view", { detail: { view: "companies" } });
      window.dispatchEvent(evt);
    } catch { }
  };

  return (
    <div className="space-y-4">
      {/* Header: title on the left, "Compact" + switch on the right */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-hidejobs-700">Filters</h2>
        <div className="flex items-center gap-2">
          <Text type="secondary" className="text-sm">Compact</Text>
          <Switch
            size="small"
            checked={!!compact}
            onChange={updateCompact}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200">
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;

          const rightControl =
            row.key === "companies" ? (
              <div className="flex items-center gap-2">
                {/* Button to open Hidden Companies panel */}
                <Tooltip title="Open Hidden Companies list">
                  <Button
                    size="small"
                    icon={<EyeInvisibleFilled />}
                    onClick={goToCompaniesList}
                  >
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
