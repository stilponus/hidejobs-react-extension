// src/components/HideJobsFilters.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Switch, Typography, Tooltip } from "antd";
import {
  InfoCircleOutlined,
  CrownFilled,
  EyeInvisibleFilled,
  ClockCircleFilled,
} from "@ant-design/icons";

const { Text } = Typography;

const STORAGE_KEY = "hj_filters_state";

const DEFAULT_STATE = {
  dismissed: false,
  promoted: false,
  viewed: false,
  repostedGhost: false,
  indeedSponsored: false,
  glassdoorApplied: false,
  indeedApplied: false,
  applied: false,          // now marked as premium in rows below
  filterByHours: false,
  userText: false,
  companies: false,
};

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

export default function HideJobsFilters() {
  const [values, setValues] = useState(DEFAULT_STATE);
  const chromeApi = useMemo(getChrome, []);

  useEffect(() => {
    if (!chromeApi) return;
    chromeApi.storage.local.get([STORAGE_KEY], (res) => {
      const saved = res?.[STORAGE_KEY] || {};
      setValues((prev) => ({ ...prev, ...saved }));
    });

    const handleStorage = (changes, areaName) => {
      if (areaName !== "local") return;
      if (STORAGE_KEY in changes) {
        const next = changes[STORAGE_KEY]?.newValue || {};
        setValues((prev) => ({ ...prev, ...next }));
      }
    };
    chromeApi.storage.onChanged.addListener(handleStorage);
    return () => chromeApi.storage.onChanged.removeListener(handleStorage);
  }, [chromeApi]);

  const updateValue = (key, checked) => {
    const next = { ...values, [key]: checked };
    setValues(next);

    if (chromeApi) {
      chromeApi.storage.local.set({ [STORAGE_KEY]: next });
    }

    try {
      const evt = new CustomEvent("hidejobs-filters-changed", { detail: next });
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
                {/* Crown BEFORE label (no tooltip) */}
                {row.premium ? <CrownFilled className="text-[#b8860b]" /> : null}

                {/* Label */}
                <Text className="truncate">{row.label}</Text>

                {/* Icons AFTER label (not crown) */}
                {row.icon ? <span className="text-hidejobs-700">{row.icon}</span> : null}

                {/* Help tooltip (kept) */}
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
