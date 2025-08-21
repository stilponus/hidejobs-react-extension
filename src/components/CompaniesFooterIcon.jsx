// src/content/CompaniesFooterIcon.jsx
import React from "react";
import { Tooltip } from "antd";
import { EyeInvisibleFilled } from "@ant-design/icons";

/**
 * CompaniesFooterIcon
 * - Renders an AntD tooltip + icon for "Mark to Hide".
 * - Works even when mounted inside LinkedIn DOM (not your shadow root).
 *
 * Props:
 *  - onClick: (e) => void
 */
export default function CompaniesFooterIcon({ onClick }) {
  return (
    <Tooltip
      title="Mark to Hide"
      // Keep the popup local so it doesn't try to portal to document.body
      getPopupContainer={(node) => node?.parentElement || document.body}
    >
      <span
        role="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.(e);
        }}
        onMouseEnter={(e) => {
          const icon = e.currentTarget.querySelector("svg");
          if (icon) icon.style.color = "#b10044";
        }}
        onMouseLeave={(e) => {
          const icon = e.currentTarget.querySelector("svg");
          if (icon) icon.style.color = "#0a66c2";
        }}
        className="hidejobs-footer-icon"
        style={{ display: "inline-flex", alignItems: "center", lineHeight: 0, cursor: "pointer" }}
      >
        <EyeInvisibleFilled style={{ fontSize: 18, color: "#0a66c2" }} />
      </span>
    </Tooltip>
  );
}
