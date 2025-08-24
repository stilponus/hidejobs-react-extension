import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";

const FILTER_KEYS = [
  "dismissed",
  "promoted",
  "viewed",
  "repostedGhost",
  "indeedSponsored",
  "glassdoorApplied",
  "indeedApplied",
  "applied",
  "filterByHours",
  "userText",
  "companies",
];

const FEATURE_BADGE_KEY = "reposted_feature_enabled";
const HIDE_REPOSTED_STATE_KEY = "reposted_hide_state";

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch {}
  return null;
}

function getPanelShadowRoot() {
  const host = document.querySelector("hidejobs-panel-ui");
  return host?.shadowRoot || null;
}

function findDismissedRow() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const attrTarget = root.querySelector('[data-filter-row="dismissed"]');
  if (attrTarget) return attrTarget;

  const nodes = Array.from(root.querySelectorAll("span, div, p, h2, h3"));
  const labelNode = nodes.find(
    (el) => (el.textContent || "").trim().toLowerCase() === "dismissed"
  );
  if (!labelNode) return null;

  let node = labelNode;
  for (let i = 0; i < 6 && node; i++) {
    if (node.querySelector && node.querySelector(".ant-switch")) return node;
    node = node.parentElement;
  }
  return null;
}

export default function InteractiveTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const rafRef = useRef();
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open || !chromeApi) return;

    const toSet = {};
    FILTER_KEYS.forEach((k) => {
      toSet[`${k}BadgeVisible`] = false;
      toSet[`${k}Hidden`] = false;
    });
    toSet[FEATURE_BADGE_KEY] = false;
    toSet[HIDE_REPOSTED_STATE_KEY] = "false";

    toSet["badgesCompact"] = false;

    chromeApi.storage.local.set(toSet, () => {
      try {
        const detail = Object.fromEntries(FILTER_KEYS.map((k) => [k, false]));
        window.dispatchEvent(
          new CustomEvent("hidejobs-filters-changed", { detail })
        );
      } catch {}
    });
  }, [open, chromeApi]);

  useEffect(() => {
    if (!open) return;

    const measure = () => {
      const el = findDismissedRow();
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };

    measure();

    const onScrollOrResize = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    const root = getPanelShadowRoot() || document.body;
    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, subtree: true });

    const id = setInterval(measure, 600);

    return () => {
      clearInterval(id);
      mo.disconnect();
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const PADDING = 8;

    const isInsideHole = (ev) => {
      if (!rect) return false;
      const x = ev.clientX;
      const y = ev.clientY;
      return (
        x >= rect.x - PADDING &&
        x <= rect.x + rect.w + PADDING &&
        y >= rect.y - PADDING &&
        y <= rect.y + rect.h + PADDING
      );
    };

    const isInsideBox = (ev) => {
      const el = boxRef.current;
      if (!el) return false;
      if (typeof ev.composedPath === "function") {
        const path = ev.composedPath();
        if (path && path.includes(el)) return true;
      }
      return el.contains(ev.target);
    };

    const guard = (ev) => {
      if (isInsideHole(ev) || isInsideBox(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };

    const onPointer = (ev) => guard(ev);
    const onWheel = (ev) => guard(ev);
    const onKey = (ev) => {
      if (ev.key === "Escape") return;
      const el = boxRef.current;
      if (el && el.contains(document.activeElement)) return;
      if (
        ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " ", "Spacebar"].includes(
          ev.key
        )
      ) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };

    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("pointerup", onPointer, true);
    window.addEventListener("click", onPointer, true);
    window.addEventListener("dblclick", onPointer, true);
    window.addEventListener("contextmenu", onPointer, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("pointerup", onPointer, true);
      window.removeEventListener("click", onPointer, true);
      window.removeEventListener("dblclick", onPointer, true);
      window.removeEventListener("contextmenu", onPointer, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, rect]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 150;
  const placeBelow =
    hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      {/* hide tooltips/popovers during tour */}
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>

      {/* mask with transparent hole */}
      <svg width="100%" height="100%" style={{ position: "fixed", inset: 0, display: "block" }}>
        <defs>
          <mask id="hj-tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={hole.x - 8}
              y={hole.y - 8}
              width={hole.w + 16}
              height={hole.h + 16}
              rx="10"
              ry="10"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.45)"
          mask="url(#hj-tour-mask)"
        />
      </svg>

      {/* instruction box */}
      <div
        ref={boxRef}
        style={{
          position: "fixed",
          top: placeBelow ? hole.y + hole.h + gap : Math.max(12, hole.y - estBoxH - gap),
          left: Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x)),
          width: boxW,
          background: "white",
          borderRadius: 10,
          padding: 12,
          boxShadow: "0 10px 20px rgba(0,0,0,0.15)",
          border: "1px solid rgba(0,0,0,0.06)",
          pointerEvents: "auto",
          zIndex: 10051,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">Step 1</div>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div className="mt-1 text-sm text-gray-700">here will be instructions</div>
      </div>
    </div>
  );
}
