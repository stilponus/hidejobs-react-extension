// src/components/FilterByHoursPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Input, Button, Tooltip, message } from "antd";
import { ReloadOutlined, FieldTimeOutlined } from "@ant-design/icons";

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

function isLinkedInJobsPage() {
  const href = location?.href || "";
  return href.startsWith("https://www.linkedin.com/jobs/search") ||
    href.startsWith("https://www.linkedin.com/jobs/collections");
}

/** clamp panel into viewport like in KeywordFilterPanel */
function clampToViewport(pos, el, widthFallback = 320, heightFallback = 10) {
  const margin = 5;
  const w = window.innerWidth;
  const h = window.innerHeight;

  const width = el?.offsetWidth || widthFallback;
  const height = el?.offsetHeight || heightFallback;

  const left = Math.max(margin, Math.min(w - width - margin, pos.left ?? 5));
  const top = Math.max(margin, Math.min(h - height - margin, pos.top ?? 325));

  return { top, left };
}

/** URL helpers (add/remove f_TPR=r<seconds>) */
function applyHoursToUrl(hours) {
  const currentUrl = window.location.href;
  const seconds = Math.max(1, Math.floor(hours)) * 3600;
  const tprRegex = /([?&])f_TPR=r\d+/;
  let updated;
  if (tprRegex.test(currentUrl)) {
    updated = currentUrl.replace(tprRegex, `$1f_TPR=r${seconds}`);
  } else {
    const sep = currentUrl.includes("?") ? "&" : "?";
    updated = `${currentUrl}${sep}f_TPR=r${seconds}`;
  }
  window.location.assign(updated);
}

function resetHoursFilter() {
  const url = window.location.href;
  // remove param and possible trailing separators
  const cleaned = url
    .replace(/([?&])f_TPR=r\d+[^&]*/g, "")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
  window.location.assign(cleaned);
}

// ─────────────────────────────────────────────────────────────

export default function FilterByHoursPanel({ visible }) {
  const chromeApi = useMemo(getChrome, []);
  const wrapperRef = useRef(null);

  // draggable state (same pattern as KeywordFilterPanel)
  const [pos, setPos] = useState({ top: 325, left: 5 });
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const [collapsed, setCollapsed] = useState(false);
  const [hours, setHours] = useState("");

  // load saved pos + collapsed
  useEffect(() => {
    if (!chromeApi) return;
    chromeApi.storage?.local?.get(["filterByHoursPanelPos", "filterByHoursPanelCollapsed"], (res) => {
      const saved = res?.filterByHoursPanelPos;
      if (saved && typeof saved.top === "number" && typeof saved.left === "number") {
        setPos(clampToViewport(saved, wrapperRef.current));
      }
      setCollapsed(!!res?.filterByHoursPanelCollapsed);
    });
  }, [chromeApi]);

  // drag handlers (don’t start drag from inputs/buttons)
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest("input, textarea, button, .ant-input, .ant-btn")) return;

    // blur focused input so its outline clears when clicking the card
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }

    const box = wrapperRef.current?.getBoundingClientRect();
    if (!box) return;
    setDragging(true);
    dragOffsetRef.current = { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onMouseMove = (e) => {
    if (!dragging || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const width = el.offsetWidth || 320;
    const height = el.offsetHeight || 10;
    const next = clampToViewport(
      { left: e.clientX - dragOffsetRef.current.x, top: e.clientY - dragOffsetRef.current.y },
      el,
      width,
      height
    );
    setPos(next);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    setDragging(false);
    chromeApi?.storage?.local?.set({ filterByHoursPanelPos: pos });
  };

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      return () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHeaderDoubleClick = (e) => {
    e.stopPropagation();
    const next = !collapsed;
    setCollapsed(next);
    chromeApi?.storage?.local?.set({ filterByHoursPanelCollapsed: next });
  };

  if (!visible) return null;
  if (!isLinkedInJobsPage()) return null;

  const wrapperStyle = {
    position: "fixed",
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    width: 320,
    zIndex: 9995,
    cursor: dragging ? "grabbing" : "grab",
    userSelect: dragging ? "none" : "auto",
  };

  const onApply = () => {
    const n = parseInt(String(hours).trim(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      message.error("Enter a valid number of hours (e.g., 1, 2, 3).");
      return;
    }

    applyHoursToUrl(n);
  };

  const onReset = () => {
    resetHoursFilter();
  };

  return (
    <div ref={wrapperRef} style={wrapperStyle} onMouseDown={onMouseDown}>
      <Card
        size="small"
        style={{
          width: "100%",
          boxShadow: "0 4px 8px rgba(0,0,0,.12)",
          borderRadius: 8,
          cursor: "default",
          border: "none",
        }}
        styles={{
          header: {
            fontWeight: 700,
            userSelect: "none",
            fontSize: 16,
            backgroundColor: "#28507c",
            color: "white",
            borderBottom: "none",
            borderRadius: collapsed ? 8 : "8px 8px 0 0",
          },
          body: collapsed ? { display: "none", padding: 0 } : { padding: 12 },
        }}
        title={
          <div onDoubleClick={handleHeaderDoubleClick}>Filter by Hours</div>
        }
        extra={
          <Tooltip title="Reset filter">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined style={{ color: "white" }} />}
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            />
          </Tooltip>
        }
      >
        {!collapsed && (
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              allowClear
              value={hours}
              onChange={(e) => {
                // keep just digits, strip leading zeros
                const v = e.target.value.replace(/\D/g, "").replace(/^0+/, "");
                setHours(v);
              }}
              onPressEnter={onApply}
              placeholder="Hours"
              prefix={<FieldTimeOutlined style={{ color: "#5f6163" }} />}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <Button type="primary" onClick={onApply} onMouseDown={(e) => e.stopPropagation()}>
              Show Results
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
