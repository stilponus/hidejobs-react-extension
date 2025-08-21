import React, { useEffect, useMemo, useState } from "react";
import { Button, Tooltip } from "antd";

/**
 * Badge for any filter.
 *
 * Props:
 *  - storageKey: string (e.g., "dismissed", "promoted")
 *  - label: string ("Dismissed")
 *  - onColor: string (hex or friendly name; used when ON)
 *  - compact?: boolean (when true → short pill that expands to the LEFT)
 *
 * chrome.storage.local keys used:
 *   "<storageKey>BadgeVisible" -> boolean (show/hide the badge)
 *   "<storageKey>Hidden"       -> boolean (feature ON/OFF)
 *   "<storageKey>HiddenCount"  -> number  (count)
 *
 * Clicking the badge toggles "<storageKey>Hidden".
 */

// ===== Shared color theme (mirrors your old badge) =====
const ENABLED_BG = "#01754f";     // old ON background
const DISABLED_BG = "#666666";    // old OFF background (same for all)
const CHIP_BG = "#f8fafd";        // inner white chip behind count/OFF text
const CHIP_TEXT = "#00000099";    // chip text color
const LABEL_TEXT_ON = "#ffffff";  // white text on ON green
const LABEL_TEXT_OFF = "#ffffff"; // white text on OFF gray
const OFF_OPACITY = 0.7;          // dim feel when OFF

export default function FilterBadge({ storageKey, label, onColor, compact = false }) {
  const [visible, setVisible] = useState(false);
  const [isOn, setIsOn] = useState(false);
  const [count, setCount] = useState(0);

  // Allow optional per-filter ON color; default to global ENABLED_BG
  const resolvedOnColor = useMemo(() => {
    if (!onColor) return ENABLED_BG;
    const map = {
      dismissed: "#01754f",  // green
      promoted: "#28507c",   // blue
      viewed: "#d40048",     // red
      applied: "#e7a33e",    // orange
      companies: "#28507c",  // blue
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

  // INNER white chip (number or OFF). This grows when 2+ digits / "OFF".
  const chipStyle = {
    height: 20,
    minWidth: 20,                    // makes 1-digit exactly 20×20 circle
    padding: isOn ? "0 4px" : "0 6px", // stretch for OFF / 2+ digits
    borderRadius: 25,
    fontSize: 14,
    lineHeight: "20px",
    background: CHIP_BG,
    color: CHIP_TEXT,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
  };

  // ======= COMPACT VARIANT (short pill, expands to the LEFT) =======
  if (compact) {
    // Outer pill is right-aligned by the host (alignItems:flex-end).
    // Inside we right-justify the chip so when it widens, the pill grows LEFT.
    const outerStyle = {
      height: 32,
      borderRadius: "25px 0px 0px 25px",
      background: isOn ? resolvedOnColor : DISABLED_BG,
      opacity: isOn ? 1 : OFF_OPACITY,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "flex-end", // keep chip at the RIGHT inside the pill
      padding: "0px 25px 0px 8px", // little tail on the left, like your screenshot
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
      cursor: "pointer",
      userSelect: "none",
      // width is 'auto'; right edge stays pinned by parent's alignItems:flex-end
    };

    // For accessibility we provide a title (hover) since label is hidden.
    const title = `${label}: ${isOn ? `${count}` : "OFF"}`;

    return (
      <Tooltip title={label} placement="left">
        <div
          role="button"
          aria-label={title}
          onClick={handleToggle}
          style={outerStyle}
        >
          <span style={chipStyle}>{isOn ? count : "OFF"}</span>
        </div>
      </Tooltip>
    );
  }

  // ======= FULL (non-compact) VARIANT — your original button with label =======
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
      <span style={chipStyle}>{isOn ? count : "OFF"}</span>
      <span style={{ fontSize: 16 }}>{label}</span>
    </Button>
  );
}
