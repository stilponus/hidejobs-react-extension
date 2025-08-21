import React, { useEffect, useMemo, useState } from "react";
import { Switch, Typography, Tooltip } from "antd";
import { InfoCircleOutlined, CrownFilled } from "@ant-design/icons";

import CompaniesHideList from "./CompaniesHideList";

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
  } catch {}
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
      [...visibilityKeys, "dismissedBadgeVisible", "badgesCompact"],
      (res) => {
        const next = { ...DEFAULT_STATE };

        FILTER_KEYS.forEach((k) => {
          if (typeof res?.[`${k}BadgeVisible`] === "boolean") {
            next[k] = !!res[`${k}BadgeVisible`];
          }
        });

        // Back-compat: mirror legacy dismissed flag
        if (typeof res?.dismissedBadgeVisible === "boolean") {
          next.dismissed = !!res.dismissedBadgeVisible;
        }

        setValues(next);
        setCompact(!!res?.badgesCompact);
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

      if ("dismissedBadgeVisible" in changes) {
        delta.dismissed = !!changes.dismissedBadgeVisible.newValue;
        touched = true;
      }

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
    } catch {}
  };

  // Toggling compact mode
  const updateCompact = (checked) => {
    setCompact(checked);
    chromeApi?.storage?.local?.set?.({ badgesCompact: checked });
  };

  // Rows (unchanged)
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

  // Compute the first premium index once (for the section split)
  const firstPremiumIndex = rows.findIndex(r => r.premium === true);
  const hasPremium = firstPremiumIndex !== -1;

  return (
    <div className="space-y-4">

      <div className="">
        {/* Section: Free filters */}
        <div className="px-3 py-2 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          Free filters
        </div>

        {rows.map((row, idx) => {
          // Insert "Premium filters" header right before the first premium row
          if (hasPremium && idx === firstPremiumIndex) {
            return (
              <React.Fragment key={`section-premium`}>
                {/* Premium header */}
                <div className="px-3 py-2 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  Premium filters
                </div>

                {/* Then render the premium row itself */}
                <div
                  key={row.key}
                  className={`flex items-center justify-between px-3 py-2 ${
                    idx === rows.length - 1 ? "" : "border-b border-gray-100"
                  }`}
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

                  <Switch
                    size="small"
                    checked={!!values[row.key]}
                    onChange={(checked) => updateValue(row.key, checked)}
                  />
                </div>
              </React.Fragment>
            );
          }

          // Normal row render (free or premium after header already injected)
          return (
            <div
              key={row.key}
              className={`flex items-center justify-between px-3 py-2 ${
                idx === rows.length - 1 ? "" : "border-b border-gray-100"
              }`}
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

              <Switch
                size="small"
                checked={!!values[row.key]}
                onChange={(checked) => updateValue(row.key, checked)}
              />
            </div>
          );
        })}

        <CompaniesHideList />

        {/* Section: Settings */}
        <div className="px-3 py-2 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          Settings
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Text className="truncate">Compact</Text>
          </div>
          <Switch size="small" checked={!!compact} onChange={updateCompact} />
        </div>
      </div>
    </div>
  );
}
