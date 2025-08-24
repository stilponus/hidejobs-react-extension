// src/components/Tour/InteractiveTour.jsx
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

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

function getPanelShadowRoot() {
  const host = document.querySelector("hidejobs-panel-ui");
  return host?.shadowRoot || null;
}

/** STEP 1 target: the "Dismissed" row (label + switch) inside Filters panel */
function findDismissedRow() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  // Preferred hook if present
  const attrTarget = root.querySelector('[data-filter-row="dismissed"]');
  if (attrTarget) return attrTarget;

  // Fallback: find text "Dismissed", then climb to container with an Ant Switch
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

/** STEP 2 target: the Dismissed badge on the right stack (inside shadow root) */
function findDismissedBadge() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  // If you add this to FilterBadge root: data-badge="dismissed"
  const byAttr = root.querySelector('[data-badge="dismissed"]');
  if (byAttr) return byAttr;

  // Compact variant: aria-label starts with "Dismissed"
  const byAria = root.querySelector('[aria-label^="Dismissed"]');
  if (byAria) return byAria;

  // Non-compact: any button/role=button containing "Dismissed"
  const candidates = Array.from(root.querySelectorAll("button, [role='button']"));
  const byText = candidates.find((el) =>
    ((el.textContent || "").trim().toLowerCase()).includes("dismissed")
  );
  if (byText) return byText;

  return null;
}

export default function InteractiveTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1);
  const rafRef = useRef();
  const boxRef = useRef(null);

  // Only allow advancing after our reset completes
  const resetDoneRef = useRef(false);
  // Prevent double close if multiple storage events arrive
  const closedPanelRef = useRef(false);

  // Reset to step 1 whenever the tour opens
  useEffect(() => {
    if (open) {
      setStep(1);
      closedPanelRef.current = false;
    }
  }, [open]);

  // Ensure the panel is open on the Filters view when the tour starts
  useEffect(() => {
    if (!open || !chromeApi) return;
    chromeApi.storage.local.set(
      { hidejobs_panel_view: "filters", hidejobs_panel_visible: true },
      () => {
        try {
          const evt = new CustomEvent("hidejobs-panel-set-view", {
            detail: { view: "filters" },
          });
          window.dispatchEvent(evt);
        } catch { }
      }
    );
  }, [open, chromeApi]);

  // On open: turn OFF all toggles + compact (and mark reset done when complete)
  useEffect(() => {
    if (!open || !chromeApi) return;

    resetDoneRef.current = false;

    const toSet = {};
    FILTER_KEYS.forEach((k) => {
      toSet[`${k}BadgeVisible`] = false;
      toSet[`${k}Hidden`] = false; // includes dismissedHidden = false
    });
    toSet["badgesCompact"] = false;

    chromeApi.storage.local.set(toSet, () => {
      // broadcast so Filters UI updates immediately
      try {
        const detail = Object.fromEntries(FILTER_KEYS.map((k) => [k, false]));
        window.dispatchEvent(new CustomEvent("hidejobs-filters-changed", { detail }));
      } catch { }
      // Arm progression now that reset completed
      resetDoneRef.current = true;
    });
  }, [open, chromeApi]);

  // Advance Step 1 -> Step 2 ONLY when user flips dismissedHidden to true DURING this tour.
  // Also close the panel *right here* (not in a separate effect) to avoid races.
  useEffect(() => {
    if (!open || !chromeApi) return;

    const onChange = (changes, area) => {
      if (area !== "local") return;
      if (!resetDoneRef.current) return;

      if ("dismissedHidden" in changes) {
        const { oldValue, newValue } = changes.dismissedHidden;
        const was = !!oldValue;
        const now = !!newValue;

        // Only act on a real false -> true transition (user action after reset)
        if (!was && now) {
          setStep(2);

          // Close the panel only because the user turned it on *during* the tour
          if (!closedPanelRef.current) {
            closedPanelRef.current = true;
            chromeApi.storage.local.get(["hidejobs_panel_visible"], (res) => {
              if (res?.hidejobs_panel_visible) {
                try {
                  const evt = new CustomEvent("toggle-hidejobs-panel");
                  window.dispatchEvent(evt);
                } catch { }
                chromeApi.storage.local.set({ hidejobs_panel_visible: false });
              }
            });
          }
        }
      }
    };

    chromeApi.storage.onChanged.addListener(onChange);
    return () => chromeApi.storage.onChanged.removeListener(onChange);
  }, [open, chromeApi]);

  // Measure target (depends on current step)
  useEffect(() => {
    if (!open) return;

    const measure = () => {
      const el = step === 1 ? findDismissedRow() : findDismissedBadge();
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect(); // viewport coords
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
  }, [open, step]);

  // Block interactions outside the hole; allow instruction box; ESC closes
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

    const onEsc = (e) => e.key === "Escape" && onClose?.();

    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("pointerup", onPointer, true);
    window.addEventListener("click", onPointer, true);
    window.addEventListener("dblclick", onPointer, true);
    window.addEventListener("contextmenu", onPointer, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onEsc);

    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("pointerup", onPointer, true);
      window.removeEventListener("click", onPointer, true);
      window.removeEventListener("dblclick", onPointer, true);
      window.removeEventListener("contextmenu", onPointer, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, rect, onClose]);

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 150;
  const placeBelow =
    hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;

  const stepTitle = step === 1 ? "Step 1" : "Step 2";
  const stepText =
    step === 1
      ? "To start working with filter, switch ON the toggle next to the filter you want to use"
      : "Placeholder text for now";

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
      {/* Hide ant tooltips/popovers during the tour */}
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>

      {/* Mask with transparent hole */}
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

      {/* Instruction box (clickable) */}
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
          <div className="text-sm font-semibold text-gray-800">{stepTitle}</div>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div className="mt-1 text-sm text-gray-700">{stepText}</div>
      </div>
    </div>
  );
}
