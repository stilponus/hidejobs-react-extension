import React, { useEffect, useMemo, useState } from "react";
import { Button } from "antd";

/**
 * Ant Design BUTTON badge for any filter (count chip on the LEFT).
 *
 * Props:
 *  - storageKey: string (e.g., "dismissed", "promoted")
 *  - label: string ("Dismissed")
 *  - onColor: string (hex or friendly name; used when ON)
 *
 * chrome.storage.local keys used:
 *   "<storageKey>BadgeVisible" -> boolean (show/hide the button)
 *   "<storageKey>Hidden"       -> boolean (feature ON/OFF)
 *   "<storageKey>HiddenCount"  -> number  (count)
 *
 * Clicking the button toggles "<storageKey>Hidden".
 */

// ===== Shared color theme (mirrors your old badge) =====
const ENABLED_BG = "#01754f";     // old ON background
const DISABLED_BG = "#666666";    // old OFF background (same for all)
const CHIP_BG = "#f8fafd";        // pill behind count/OFF text
const CHIP_TEXT = "#00000099";    // pill text color
const LABEL_TEXT_ON = "#ffffff";  // white text on ON green
const LABEL_TEXT_OFF = "#ffffff"; // white text on OFF gray
const OFF_OPACITY = 0.7;          // like the old 0.5–0.7 dim feel

export default function FilterBadge({ storageKey, label, onColor }) {
  const [visible, setVisible] = useState(false);
  const [isOn, setIsOn] = useState(false);
  const [count, setCount] = useState(0);

  // Allow optional per-filter ON color; default to your global ENABLED_BG
  const resolvedOnColor = useMemo(() => {
    if (!onColor) return ENABLED_BG;
    const map = {
      dismissed: "#01754f",  // green
      promoted: "#28507c",   // blue
      viewed: "#d40048",     // red
      applied: "#e7a33e",    // orange
      companies: "#28507c",   // blue
    };
    return map[onColor] || onColor || ENABLED_BG;
  }, [onColor]);

  useEffect(() => {
    const keys = [
      `${storageKey}BadgeVisible`,
      `${storageKey}Hidden`,
      `${storageKey}HiddenCount`,
    ];

    chrome?.storage?.local?.get(keys, (res) => {
      setVisible(!!res?.[`${storageKey}BadgeVisible`]);
      setIsOn(!!res?.[`${storageKey}Hidden`]);
      setCount(Number(res?.[`${storageKey}HiddenCount`] || 0));
    });

    const onChange = (changes, area) => {
      if (area !== "local") return;

      if (`${storageKey}BadgeVisible` in changes) {
        setVisible(!!changes[`${storageKey}BadgeVisible`].newValue);
      }
      if (`${storageKey}Hidden` in changes) {
        setIsOn(!!changes[`${storageKey}Hidden`].newValue);
      }
      if (`${storageKey}HiddenCount` in changes) {
        setCount(Number(changes[`${storageKey}HiddenCount`].newValue || 0));
      }
    };

    chrome?.storage?.onChanged?.addListener(onChange);
    return () => chrome?.storage?.onChanged?.removeListener(onChange);
  }, [storageKey]);

  if (!visible) return null;

  const handleToggle = () => {
    chrome?.storage?.local?.set({ [`${storageKey}Hidden`]: !isOn });
  };

  // LEFT pill (count/OFF)
  const chipStyle = {
    height: 20,
    minWidth: 20,              // makes 1-digit exactly 20×20 circle
    padding: isOn ? "0 4px" : "0 6px", // lets it stretch for OFF / 2+ digits
    borderRadius: 20,          // circle/pill
    fontSize: 14,
    lineHeight: "20px",        // centers text vertically
    background: CHIP_BG,
    color: CHIP_TEXT,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // Button base styles (match your old look)
  const baseBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 600,
    padding: "0px 12px 0px 8px",
    height: 32,
    borderWidth: 1,
    borderStyle: "solid",
    // subtle shadow like old badge (optional)
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
  };

  const btnStyleOn = {
    background: resolvedOnColor,
    borderColor: resolvedOnColor,
    color: LABEL_TEXT_ON,
    opacity: 1,
  };

  const btnStyleOff = {
    background: DISABLED_BG,
    borderColor: DISABLED_BG,
    color: LABEL_TEXT_OFF,
    opacity: OFF_OPACITY,
  };

  return (
    <Button
      onClick={handleToggle}
      shape="round"
      size="middle"
      style={{
        ...(isOn ? btnStyleOn : btnStyleOff),
        ...baseBtnStyle,
      }}
    >
      {/* LEFT count/OFF pill (always light like the old chip) */}
      <span style={chipStyle}>{isOn ? count : "OFF"}</span>

      {/* Label */}
      <span style={{ fontSize: 16 }}>{label}</span>
    </Button>
  );
}
