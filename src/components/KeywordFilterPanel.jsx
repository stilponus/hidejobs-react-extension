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
  return (
    <span
      style={{
        height: 20,
        minWidth: 20,                    // makes 1-digit exactly 20×20 circle
        padding: "0 4px",                // stretch for 2+ digits
        borderRadius: 25,
        fontSize: 14,
        lineHeight: "20px",
        background: "#f8fafd",
        color: "#00000099",
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        marginLeft: 4,
      }}
    >
      {count}
    </span>
  );
}

export default function KeywordFilterPanel({ visible }) {
  const [modal, modalContextHolder] = Modal.useModal();

  const chromeApi = useMemo(getChrome, []);
  const [keywords, setKeywords] = useState([]);
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Hidden jobs (by keywords) counter - synced with content script
  const [hiddenCount, setHiddenCount] = useState(0);

  // --- Drag state ---
  const wrapperRef = useRef(null);
  const [pos, setPos] = useState({ top: 325, left: 5 }); // default position
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Load initial keywords + saved position + count from content script
  useEffect(() => {
    if (!chromeApi) return;
    chromeApi.storage?.local?.get(
      ["filterKeywords", "keywordPanelPos", "keywordHiddenCount", "keywordPanelCollapsed"],
      (res) => {
        const keywords = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];
        setKeywords(keywords);

        // Only show count if there are actually keywords
        if (keywords.length === 0) {
          setHiddenCount(0);
        } else {
          const count = typeof res?.keywordHiddenCount === 'number' ? res.keywordHiddenCount : 0;
          setHiddenCount(count);
        }

        // Restore collapsed state
        setCollapsed(!!res?.keywordPanelCollapsed);

        // restore saved position
        const saved = res?.keywordPanelPos;
        if (saved && typeof saved.top === "number" && typeof saved.left === "number") {
          setPos(clampToViewport(saved, wrapperRef.current));
        }
      }
    );
  }, [chromeApi]);

  // Listen for count updates from content script
  useEffect(() => {
    if (!chromeApi?.storage?.onChanged) return;

    const handler = (changes, area) => {
      if (area !== "local") return;

      // Content script updated the count
      if ("keywordHiddenCount" in changes) {
        const newCount = changes.keywordHiddenCount.newValue;
        if (typeof newCount === 'number') {
          setHiddenCount(newCount);
        }
      }

      // Keywords changed - reset count if no keywords
      if ("filterKeywords" in changes) {
        const newKeywords = changes.filterKeywords.newValue || [];
        setKeywords(newKeywords);
        // Always reset count to 0 when keywords are cleared
        if (newKeywords.length === 0) {
          setHiddenCount(0);
        }
      }
    };

    chromeApi.storage.onChanged.addListener(handler);
    return () => chromeApi.storage.onChanged.removeListener(handler);
  }, [chromeApi]);

  // Helpers
  const persistKeywords = (next) => {
    setKeywords(next);
    chromeApi?.storage?.local?.set({ filterKeywords: next });
  };

  const addKeyword = () => {
    const rawInput = (input || "").trim();
    if (!rawInput) return;

    // Split by comma and clean up each keyword
    const newKeywords = rawInput
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0); // Remove empty strings

    if (newKeywords.length === 0) return;

    // Combine with existing keywords, remove duplicates, and sort
    const next = Array.from(new Set([...keywords, ...newKeywords]))
      .sort((a, b) => a.localeCompare(b));

    persistKeywords(next);
    setInput("");

    // Enable keyword filtering
    chromeApi?.storage?.local?.set({ userTextHidden: true });
  };

  const removeKeyword = (k) => {
    const next = keywords.filter((x) => x !== k);
    persistKeywords(next);

    // Keep filtering enabled even after removing a keyword
    chromeApi?.storage?.local?.set({ userTextHidden: true });
  };

  // --- Drag logic (drag anywhere except on inputs/buttons/close icons) ---
  const onMouseDown = (e) => {
    if (e.button !== 0) return; // left click only
    const target = e.target;

    // Ignore interactions on focusable controls (don't start drag, don't blur)
    if (target.closest("input, textarea, button, .ant-input, .ant-btn, .ant-tag-close-icon")) return;

    // ✅ Ensure any focused control (like the Input) loses focus so its outline disappears
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }

    const box = wrapperRef.current?.getBoundingClientRect();
    if (!box) return;

    setDragging(true);
    dragOffsetRef.current = { x: e.clientX - box.left, y: e.clientY - box.top };

    // ❌ Do NOT call e.preventDefault() here — it blocks blur.
  };

  const onMouseMove = (e) => {
    if (!dragging || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const width = el.offsetWidth || 290;
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

  const handleHeaderDoubleClick = (e) => {
    e.stopPropagation(); // Don't trigger drag
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    chromeApi?.storage?.local?.set({ keywordPanelCollapsed: newCollapsed });
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

  if (!visible) return null;

  // Wrapper is fixed + draggable; Card fills it.
  const wrapperStyle = {
    position: "fixed",
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    width: 290,
    zIndex: 9995,
    cursor: dragging ? "grabbing" : "grab",
    userSelect: dragging ? "none" : "auto",
  };

  const showConfirmClear = (e) => {
    e.stopPropagation(); // don't trigger drag
    modal.confirm({
      title: "Clear all keywords?",
      content: "This will remove all keywords from the list.",
      okText: "Clear",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      icon: null,
      onOk: () => {
        persistKeywords([]);
        chromeApi?.storage?.local?.set({ userTextHidden: true });
      },
    });
  };

  const hasKeywords = keywords.length > 0;

  return (
    <div ref={wrapperRef} style={wrapperStyle} onMouseDown={onMouseDown}>
      {modalContextHolder}
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
            borderRadius: collapsed ? 8 : "8px 8px 0 0", // ✅ full radius if collapsed
          },
          body: collapsed ? { display: "none", padding: 0 } : { padding: 12 },
        }}
        title={
          <div onDoubleClick={handleHeaderDoubleClick}>
            Hide Jobs by Keywords
          </div>
        }
        extra={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {hasKeywords ? (
              <Tooltip title="Clear all keywords">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ color: "white" }} />}
                  onClick={showConfirmClear}
                />
              </Tooltip>
            ) : null}
            <CountBadge count={hiddenCount} />
          </div>
        }
      >
        {!collapsed && (
          <>
            <Input
              allowClear
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPressEnter={addKeyword}
              placeholder="Type keywords and press Enter"
              prefix={<EyeInvisibleOutlined style={{ color: "#5f6163" }} />}
              style={{ marginBottom: 8 }}
              onMouseDown={(e) => e.stopPropagation()}
            />

            {keywords.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No keywords yet"
                style={{ margin: "12px 0" }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0,
                  maxHeight: 202,
                  overflowY: "auto",
                }}
              >
                {keywords.map((k) => (
                  <Tag
                    key={k}
                    closable
                    bordered={false}
                    color="#28507c"
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
          </>
        )}
      </Card>
    </div>
  );
}

/** Clamp a position to keep the panel at least 5px inside the viewport */
function clampToViewport(pos, el, widthFallback = 290, heightFallback = 10) {
  const margin = 5;
  const w = window.innerWidth;
  const h = window.innerHeight;

  const width = el?.offsetWidth || widthFallback;
  const height = el?.offsetHeight || heightFallback;

  const left = Math.max(margin, Math.min(w - width - margin, pos.left ?? 5));
  const top = Math.max(margin, Math.min(h - height - margin, pos.top ?? 325));

  return { top, left };
}
