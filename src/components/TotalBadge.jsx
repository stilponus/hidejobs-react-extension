// src/components/TotalBadge.jsx
import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";

const ENABLED_BG = "#444444";
const CHIP_BG = "#f8fafd";
const CHIP_TEXT = "#00000099";
const LABEL_TEXT_ON = "#ffffff";

// Master visibility key (from Filters → Settings)
const VISIBILITY_KEY = "totalOnPageBadgeVisible";

// --- Session & site helpers (match content scripts) ---
function getSessionId() {
  try {
    if (typeof window.name === "string" && window.name.startsWith("HJ_TAB_")) return window.name;
    const id = "HJ_TAB_" + Math.random().toString(36).slice(2, 10);
    window.name = id;
    return id;
  } catch {
    return "HJ_TAB_fallback";
  }
}
function getSiteName() {
  const host = location.hostname.toLowerCase();
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("indeed.")) return "indeed";
  if (host.includes("glassdoor.")) return "glassdoor";
  return "other";
}
const SESSION_ID = getSessionId();
const SITE_NAME = getSiteName();

const TAB_KEY = `hj_totalHiddenOnPage__${SITE_NAME}__tab_${SESSION_ID}`;
const SITE_KEY = `hj_totalHiddenOnPage__${SITE_NAME}`;
const LEGACY_KEY = "totalHiddenOnPage"; // final fallback

// Should show on these pages only
const isJobPage = () => {
  const host = location.hostname.toLowerCase();
  const href = location.href.toLowerCase();
  if (host.includes("linkedin.com")) {
    return href.startsWith("https://www.linkedin.com/jobs/search") ||
      href.startsWith("https://www.linkedin.com/jobs/collections");
  }
  if (host.includes("indeed.")) return href.includes("/jobs");
  if (host.includes("glassdoor.")) return href.includes("/job");
  return false;
};

export default function TotalBadge({ compact = false }) {
  const [total, setTotal] = useState(0);
  const [show, setShow] = useState(false);
  const lastUrl = useRef(location.href);

  function pickTotal(snap) {
    if (typeof snap?.[TAB_KEY] === "number") return snap[TAB_KEY];
    if (typeof snap?.[SITE_KEY] === "number") return snap[SITE_KEY];
    if (typeof snap?.[LEGACY_KEY] === "number") return snap[LEGACY_KEY];
    return 0;
  }

  function recomputeFromSnap(snap) {
    const rawEnabled = snap?.[VISIBILITY_KEY];
    const enabled = typeof rawEnabled === "boolean" ? rawEnabled : true;
    const count = pickTotal(snap);
    setTotal(count);
    setShow(isJobPage() && enabled && count > 0);
  }

  useEffect(() => {
    chrome?.storage?.local?.get([TAB_KEY, SITE_KEY, LEGACY_KEY, VISIBILITY_KEY], (snap) => {
      if (typeof snap?.[VISIBILITY_KEY] !== "boolean") {
        chrome?.storage?.local?.set({ totalOnPageBadgeVisible: true });
      }
      recomputeFromSnap(snap);
    });
  }, []);

  useEffect(() => {
    const onChange = (changes, area) => {
      if (area !== "local") return;
      if (TAB_KEY in changes || SITE_KEY in changes || LEGACY_KEY in changes || VISIBILITY_KEY in changes) {
        chrome?.storage?.local?.get([TAB_KEY, SITE_KEY, LEGACY_KEY, VISIBILITY_KEY], recomputeFromSnap);
      }
    };
    chrome?.storage?.onChanged?.addListener(onChange);
    return () => chrome?.storage?.onChanged?.removeListener(onChange);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (location.href !== lastUrl.current) {
        lastUrl.current = location.href;
        chrome?.storage?.local?.get([TAB_KEY, SITE_KEY, LEGACY_KEY, VISIBILITY_KEY], recomputeFromSnap);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!show) return null;

  const chipStyle = {
    height: 20,
    minWidth: 20,
    padding: "0 6px",
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

  if (compact) {
    const outerStyle = {
      height: 32,
      borderRadius: "0px 8px 8px 0px",
      background: ENABLED_BG,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "0px 8px 0px 25px",
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
      cursor: "default",
      userSelect: "none",
      gap: 6,
    };
    return (
      <Tooltip title="Total hidden on page" placement="right">
        <div style={outerStyle}>
          <span style={chipStyle}>{total}</span>
        </div>
      </Tooltip>
    );
  }

  const baseBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 8,
    gap: 6,
    fontWeight: 600,
    padding: "0px 12px 0px 8px",
    height: 32,
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
    background: ENABLED_BG,
    color: LABEL_TEXT_ON,
    border: "none",
    cursor: "default",
    userSelect: "none",
  };

  return (
    <div style={baseBtnStyle}>
      <span style={chipStyle}>{total}</span>
      <span style={{ fontSize: 16 }}>Hidden on Page</span>
    </div>
  );
}
