// src/components/BadgesHost.jsx
import React, { useEffect, useMemo, useState } from "react";
import FilterBadge from "./FilterBadge";
import TotalBadge from "./TotalBadge";

function useCompactFlag() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    chrome?.storage?.local?.get(["badgesCompact"], (res) => {
      setCompact(!!res?.badgesCompact);
    });

    const onChange = (changes, area) => {
      if (area !== "local") return;
      if ("badgesCompact" in changes) {
        setCompact(!!changes.badgesCompact.newValue);
      }
    };
    chrome?.storage?.onChanged?.addListener(onChange);
    return () => chrome?.storage?.onChanged?.removeListener(onChange);
  }, []);

  return compact;
}

export default function BadgesHost() {
  const compact = useCompactFlag();

  const host =
    typeof location !== "undefined" ? location.hostname.toLowerCase() : "";
  const isLinkedIn = useMemo(() => host.includes("linkedin.com"), [host]);
  const isIndeed = useMemo(() => /(^|\.)indeed\./i.test(host), [host]);

  // RIGHT stack position → top differs per host
  const rightContainerStyle = {
    position: "fixed",
    top: isIndeed ? "80px" : "64px", // LinkedIn=64, Indeed=80
    right: compact ? "-19px" : "5px",
    zIndex: 9995,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
  };

  // LEFT single badge (Total) – unchanged
  const leftContainerStyle = {
    position: "fixed",
    top: "125px",
    left: compact ? "-19px" : "5px",
    zIndex: 9995,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  };

  // Build host-specific list
  let badges = [];
  if (isLinkedIn) {
    badges = [
      { key: "dismissed", label: "Dismissed", color: "dismissed" },
      { key: "promoted", label: "Promoted", color: "promoted" },
      { key: "viewed", label: "Viewed", color: "viewed" },
      { key: "applied", label: "Applied", color: "applied" },
      { key: "companies", label: "Companies", color: "companies" },
    ];
  } else if (isIndeed) {
    // Indeed badges: Applied + Sponsored + Companies (Indeed)
    badges = [
      { key: "indeedApplied", label: "Applied", color: "applied" },
      { key: "indeedSponsored", label: "Sponsored", color: "promoted" },
      { key: "indeedCompanies", label: "Companies", color: "companies" },
    ];
  }

  if (badges.length === 0) return null;

  return (
    <>
      <div style={leftContainerStyle}>
        <TotalBadge compact={compact} />
      </div>

      <div style={rightContainerStyle}>
        {badges.map((b) => (
          <FilterBadge
            key={b.key}
            storageKey={b.key}
            label={b.label}
            onColor={b.color}
            compact={compact}
          />
        ))}
      </div>
    </>
  );
}
