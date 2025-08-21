// src/components/TotalBadge.jsx
import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "antd";
import { CloseOutlined } from "@ant-design/icons";

const ENABLED_BG = "#444444";
const CHIP_BG = "#f8fafd";
const CHIP_TEXT = "#00000099";
const LABEL_TEXT_ON = "#ffffff";

const TOGGLE_KEYS = [
  "dismissedHidden",
  "promotedHidden",
  "appliedHidden",
  "viewedHidden",
  "companiesHidden",
  "userTextHidden",
  "repostedGhostHidden",
  "indeedSponsoredHidden",
  "glassdoorAppliedHidden",
  "indeedAppliedHidden",
  "filterByHoursHidden",
];

const isJobPage = () =>
  location.href.startsWith("https://www.linkedin.com/jobs/search") ||
  location.href.startsWith("https://www.linkedin.com/jobs/collections");

export default function TotalBadge({ compact = false }) {
  const [total, setTotal] = useState(0);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastUrl = useRef(location.href);

  const recompute = (snap) => {
    const count = Number(snap?.totalHiddenOnPage || 0);
    setTotal(count);
    const anyOn = TOGGLE_KEYS.some((k) => !!snap?.[k]);
    setShow(isJobPage() && anyOn && count > 0);
  };

  useEffect(() => {
    chrome?.storage?.local?.get(["totalHiddenOnPage", ...TOGGLE_KEYS], recompute);
  }, []);

  useEffect(() => {
    const onChange = (changes, area) => {
      if (area !== "local") return;

      if ("totalHiddenOnPage" in changes) {
        const nv = Number(changes.totalHiddenOnPage.newValue || 0);
        setTotal(nv);
        chrome?.storage?.local?.get(TOGGLE_KEYS, (toggles) => {
          const anyOn = TOGGLE_KEYS.some((k) => !!toggles?.[k]);
          setShow(isJobPage() && anyOn && nv > 0);
        });
        return;
      }

      if (TOGGLE_KEYS.some((k) => k in changes)) {
        chrome?.storage?.local?.get(["totalHiddenOnPage", ...TOGGLE_KEYS], recompute);
      }
    };

    chrome?.storage?.onChanged?.addListener(onChange);
    return () => chrome?.storage?.onChanged?.removeListener(onChange);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (location.href !== lastUrl.current) {
        lastUrl.current = location.href;
        chrome?.storage?.local?.get(["totalHiddenOnPage", ...TOGGLE_KEYS], recompute);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!show || dismissed) return null;

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

  // COMPACT variant → no ❌ button
  if (compact) {
    const outerStyle = {
      height: 32,
      borderRadius: "0px 25px 25px 0px",
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

  // FULL variant → includes ❌
  const baseBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 25,
    gap: 6,
    fontWeight: 600,
    padding: "0px 12px 0px 8px",
    height: 32,
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
    background: ENABLED_BG,
    color: LABEL_TEXT_ON,
    border: "none",
    cursor: "default",
  };

  return (
    <div style={baseBtnStyle}>
      <span style={chipStyle}>{total}</span>
      <span style={{ fontSize: 16 }}>Hidden on Page</span>
      <CloseOutlined
        onClick={() => setDismissed(true)}
        style={{ color: "#fff", fontSize: 12, cursor: "pointer" }}
      />
    </div>
  );
}
