// src/components/KeywordFilterPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Input, Tag, Empty, Tooltip, Button, Modal } from "antd";
import { EyeInvisibleOutlined, DeleteOutlined } from "@ant-design/icons";

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

// Same chip style as your other badges (pill with a small count chip)
// ✅ Always renders, including when count === 0
function CountBadge({ count }) {
  const isOneDigit = count < 10;
  return (
    <span
      style={{
        backgroundColor: "#f8fafd",
        color: "#000",
        fontWeight: 600,
        fontSize: 12,
        lineHeight: "20px",
        textAlign: "center",
        minWidth: isOneDigit ? 20 : "auto",
        height: 20,
        padding: "0 6px",
        borderRadius: isOneDigit ? "50%" : 12,
        display: "inline-block",
        marginLeft: 4,
      }}
    >
      {count}
    </span>
  );
}

export default function KeywordFilterPanel({ visible }) {
  const chromeApi = useMemo(getChrome, []);
  const [keywords, setKeywords] = useState([]);
  const [input, setInput] = useState("");

  // Hidden jobs (by keywords) counter
  const [hiddenCount, setHiddenCount] = useState(0);

  // --- Drag state ---
  const wrapperRef = useRef(null);
  const [pos, setPos] = useState({ top: 325, left: 5 }); // default position
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Load initial keywords + saved position (if any) + last persisted count
  useEffect(() => {
    if (!chromeApi) return;
    chromeApi.storage?.local?.get(
      ["filterKeywords", "keywordPanelPos", "keywordHiddenCount"],
      (res) => {
        setKeywords(Array.isArray(res?.filterKeywords) ? res.filterKeywords : []);
        if (typeof res?.keywordHiddenCount === "number") {
          setHiddenCount(res.keywordHiddenCount); // show last known value immediately
        }
        const saved = res?.keywordPanelPos;
        if (saved && typeof saved.top === "number" && typeof saved.left === "number") {
          setPos((prev) => clampToViewport(saved, wrapperRef.current));
        }
      }
    );
  }, [chromeApi]);

  // === Hidden-by-keywords count ============================================
  const recalcHiddenByKeywords = () => {
    try {
      // We mark elements with data-hidden-by="keyword" (li or job nodes).
      // Prefer parent <li>, but count any element with that marker.
      const n =
        document.querySelectorAll('li[data-hidden-by="keyword"]').length ||
        document.querySelectorAll('[data-hidden-by="keyword"]').length;

      setHiddenCount(n);
      // persist so it stays across unmount/mount or quick nav blips
      chromeApi?.storage?.local?.set({ keywordHiddenCount: n });
    } catch {
      setHiddenCount(0);
      chromeApi?.storage?.local?.set({ keywordHiddenCount: 0 });
    }
  };

  // Recalc on DOM changes in the jobs list (SPA updates)
  useEffect(() => {
    const target =
      document.querySelector(".scaffold-layout__list, .jobs-search-results-list") || document.body;

    let debounceId = null;
    const obs = new MutationObserver(() => {
      clearTimeout(debounceId);
      debounceId = setTimeout(recalcHiddenByKeywords, 60);
    });

    if (target) {
      obs.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "data-hidden-by", "class"],
      });
    }
    // Initial calc
    recalcHiddenByKeywords();

    return () => {
      clearTimeout(debounceId);
      obs.disconnect();
    };
  }, []);

  // Also recalc when keywords list changes in storage (your content script will hide/show)
  useEffect(() => {
    if (!chromeApi?.storage?.onChanged) return;
    const handler = (changes, area) => {
      if (area !== "local") return;
      if ("filterKeywords" in changes || "userTextHidden" in changes) {
        setTimeout(recalcHiddenByKeywords, 0);
      }
    };
    chromeApi.storage.onChanged.addListener(handler);
    return () => chromeApi.storage.onChanged.removeListener(handler);
  }, [chromeApi]);

  // Recalc on URL changes (SPA route changes)
  useEffect(() => {
    let lastHref = window.location.href;
    const timer = setInterval(() => {
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        // let the page render, then recalc
        setTimeout(recalcHiddenByKeywords, 80);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);
  // ========================================================================

  // Helpers
  const persistKeywords = (next) => {
    setKeywords(next);
    chromeApi?.storage?.local?.set({ filterKeywords: next }, () =>
      setTimeout(recalcHiddenByKeywords, 0)
    );
  };

  const addKeyword = () => {
    const k = (input || "").trim();
    if (!k) return;
    const next = Array.from(new Set([...keywords, k])).sort((a, b) => a.localeCompare(b));
    persistKeywords(next);
    setInput("");
    chromeApi?.storage?.local?.set({ userTextHidden: true }, () =>
      setTimeout(recalcHiddenByKeywords, 0)
    );
  };

  const removeKeyword = (k) => {
    const next = keywords.filter((x) => x !== k);
    persistKeywords(next);
    chromeApi?.storage?.local?.set({ userTextHidden: true }, () =>
      setTimeout(recalcHiddenByKeywords, 0)
    );
  };

  // --- Drag logic (drag anywhere except on inputs/buttons/close icons) ---
  const onMouseDown = (e) => {
    if (e.button !== 0) return; // left click only

    const target = e.target;
    if (target.closest("input, textarea, button, .ant-input, .ant-btn, .ant-tag-close-icon")) {
      return;
    }

    const box = wrapperRef.current?.getBoundingClientRect();
    if (!box) return;

    setDragging(true);
    dragOffsetRef.current = {
      x: e.clientX - box.left,
      y: e.clientY - box.top,
    };
    e.preventDefault(); // prevent text selection
  };

  const onMouseMove = (e) => {
    if (!dragging || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const width = el.offsetWidth || 320;
    const height = el.offsetHeight || 10;

    const left = e.clientX - dragOffsetRef.current.x;
    const top = e.clientY - dragOffsetRef.current.y;

    const clamped = clampToViewport({ top, left }, el, width, height);
    setPos(clamped);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    setDragging(false);
    chromeApi?.storage?.local?.set({ keywordPanelPos: pos });
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

  // Keep inside viewport on resize
  useEffect(() => {
    const handleResize = () => setPos((p) => clampToViewport(p, wrapperRef.current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!visible) return null;

  // Wrapper is fixed + draggable; Card fills it.
  const wrapperStyle = {
    position: "fixed",
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    width: 320,
    zIndex: 9995,
    cursor: dragging ? "grabbing" : "grab",
    userSelect: dragging ? "none" : "auto",
  };

  const showConfirmClear = (e) => {
    e.stopPropagation(); // don't trigger drag
    Modal.confirm({
      title: "Clear all keywords?",
      content: "This will remove all keywords from the list.",
      okText: "Clear",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        persistKeywords([]);
        chromeApi?.storage?.local?.set({ userTextHidden: true }, () =>
          setTimeout(recalcHiddenByKeywords, 0)
        );
      },
    });
  };

  const hasKeywords = keywords.length > 0;

  return (
    <div ref={wrapperRef} style={wrapperStyle} onMouseDown={onMouseDown}>
      <Card
        size="small"
        style={{
          width: "100%",
          boxShadow: "0 4px 8px rgba(0,0,0,.12)",
          borderRadius: 8,
          cursor: "default",
        }}
        headStyle={{ fontWeight: 700, userSelect: "none" }}
        title="Hide Jobs by Keywords"
        extra={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {hasKeywords ? (
              <Tooltip title="Clear all keywords">
                <Button type="text" size="small" icon={<DeleteOutlined />} onClick={showConfirmClear} />
              </Tooltip>
            ) : null}
            {/* 🔢 Count of jobs hidden by keywords — persists and shows 0 */}
            <CountBadge count={hiddenCount} />
          </div>
        }
      >
        <Input
          allowClear
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={addKeyword}
          placeholder="Type keyword and press Enter"
          prefix={<EyeInvisibleOutlined style={{ color: "#5f6163" }} />}
          style={{ marginBottom: 8 }}
          onMouseDown={(e) => e.stopPropagation()} // prevent starting drag from input
        />

        {keywords.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No keywords yet"
            style={{ margin: "12px 0" }}
          />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {keywords.map((k) => (
              <Tag
                key={k}
                closable
                bordered={false}
                color="#28507c" // your blue
                onClose={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeKeyword(k);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {k.length > 32 ? k.slice(0, 32) + "…" : k}
              </Tag>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Clamp a position to keep the panel at least 5px inside the viewport */
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
