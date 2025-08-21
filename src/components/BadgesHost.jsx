import React from "react";
import FilterBadge from "./FilterBadge";

/**
 * Fixed container (top-right) with a vertical stack of badges.
 * Add/remove entries in BADGES_CONFIG to control which badges render
 * and which per-badge color each uses when ON.
 *
 * Storage keys used per badge:
 *   "<key>BadgeVisible"
 *   "<key>Hidden"
 *   "<key>HiddenCount"
 */
const BADGES_CONFIG = [
  { key: "dismissed", label: "Dismissed", color: "dismissed" },
  { key: "promoted",  label: "Promoted",  color: "promoted" },
  { key: "viewed",    label: "Viewed",    color: "viewed" },
  { key: "applied",   label: "Applied",   color: "applied" },
  { key: "companies", label: "Companies", color: "companies" },
];

export default function BadgesHost() {
  // container pinned near your old dismissed position
  const containerStyle = {
    position: "fixed",
    top: "64px",
    right: "5px",
    zIndex: 9995,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end", // ✅ align badges to the right edge
    gap: 8,
  };

  return (
    <div style={containerStyle}>
      {BADGES_CONFIG.map((b) => (
        <FilterBadge
          key={b.key}
          storageKey={b.key}
          label={b.label}
          onColor={b.color}
        />
      ))}
    </div>
  );
}
