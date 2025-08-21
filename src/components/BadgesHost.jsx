import React, { useEffect, useState } from "react";
import FilterBadge from "./FilterBadge";
import TotalBadge from "./TotalBadge";

/**
 * Right stack: individual filter badges (Dismissed, Promoted, etc.)
 * Left badge: Total hidden on page (no toggle).
 */

const BADGES_CONFIG = [
  { key: "dismissed", label: "Dismissed", color: "dismissed" },
  { key: "promoted", label: "Promoted", color: "promoted" },
  { key: "viewed", label: "Viewed", color: "viewed" },
  { key: "applied", label: "Applied", color: "applied" },
  { key: "companies", label: "Companies", color: "companies" },
];

export default function BadgesHost() {
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

  // RIGHT stack (your existing badges)
  const rightContainerStyle = {
    position: "fixed",
    top: "64px",
    right: compact ? "-19px" : "5px",
    zIndex: 9995,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
  };

  // LEFT single badge (Total)
  const leftContainerStyle = {
    position: "fixed",
    top: "125px",      // change to "125px" if you want it lower like the old script
    left: compact ? "-19px" : "5px",
    zIndex: 9995,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  };

  return (
    <>
      {/* LEFT: total count badge */}
      <div style={leftContainerStyle}>
        <TotalBadge compact={compact} />
      </div>

      {/* RIGHT: your existing filter badges */}
      <div style={rightContainerStyle}>
        {BADGES_CONFIG.map((b) => (
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
