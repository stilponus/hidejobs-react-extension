// src/components/Tours/DismissedJobsTour.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";

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

/** STEP 2 target: the Dismissed badge (right stack) */
function findDismissedBadge() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const byAttr = root.querySelector('[data-badge="dismissed"]');
  if (byAttr) return byAttr;

  const byAria = root.querySelector('[aria-label^="Dismissed"]');
  if (byAria) return byAria;

  const candidates = Array.from(root.querySelectorAll("button, [role='button']"));
  const byText = candidates.find((el) =>
    ((el.textContent || "").trim().toLowerCase()).includes("dismissed")
  );
  if (byText) return byText;

  return null;
}

/** STEP 3 target: LinkedIn job list section */
function findJobListSection() {
  return document.querySelector("div.scaffold-layout__list");
}

/** Tell the shell to set panel visibility explicitly (no toggle), optionally with no animation. */
function setPanelVisible(visible, { instant = false } = {}) {
  try {
    const evt = new CustomEvent("hidejobs-panel-set-visible", {
      detail: { visible, instant },
    });
    window.dispatchEvent(evt);
  } catch { }
}

/* ──────────────────────────────────────────────
   Extra helpers for instant open/close
   ────────────────────────────────────────────── */
function raf(fn) {
  return requestAnimationFrame(fn);
}

function showPanelInstant(chromeApi, view = "filters") {
  return new Promise((resolve) => {
    chromeApi?.storage?.local?.set?.(
      { hidejobs_panel_view: view, hidejobs_panel_visible: true, hidejobs_panel_anim: "instant" },
      () => {
        try {
          const evt = new CustomEvent("hidejobs-panel-set-view", { detail: { view } });
          window.dispatchEvent(evt);
        } catch { }
        raf(() => {
          setPanelVisible(true, { instant: true });
          raf(() => {
            setPanelVisible(true, { instant: true });
            resolve();
          });
        });
      }
    );
  });
}

function hidePanelInstant(chromeApi) {
  return new Promise((resolve) => {
    chromeApi?.storage?.local?.set?.(
      { hidejobs_panel_visible: false, hidejobs_panel_anim: "instant" },
      () => {
        raf(() => {
          setPanelVisible(false, { instant: true });
          raf(() => {
            setPanelVisible(false, { instant: true });
            resolve();
          });
        });
      }
    );
  });
}

export default function DismissedJobsTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1);
  const rafRef = useRef();
  const boxRef = useRef(null);

  // Reset to step 1 whenever the tour opens
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // Always show the panel on Filters when the tour starts (instantly, no animation)
  useEffect(() => {
    if (!open || !chromeApi) return;
    showPanelInstant(chromeApi, "filters");
  }, [open, chromeApi]);

  // ✅ STEP 1: reset only the Dismissed toggle and compact once per entry into step 1
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 1) return;

    const toSet = {
      badgesCompact: false,
      dismissedHidden: false,
      dismissedBadgeVisible: false,
    };

    chromeApi.storage.local.set(toSet, () => {
      try {
        const detail = { dismissed: false, badgesCompact: false };
        window.dispatchEvent(new CustomEvent("hidejobs-filters-changed", { detail }));
      } catch { }
    });
  }, [open, step, chromeApi]);

  // If user turns Dismissed ON during Step 1 → go to Step 2 & close panel instantly
  useEffect(() => {
    if (!open || !chromeApi) return;

    const onChange = (changes, area) => {
      if (area !== "local") return;

      if (step === 1 && ("dismissedHidden" in changes || "dismissedBadgeVisible" in changes)) {
        const hv = "dismissedHidden" in changes ? !!changes.dismissedHidden.newValue : null;
        const bv =
          "dismissedBadgeVisible" in changes ? !!changes.dismissedBadgeVisible.newValue : null;
        const nowOn = hv === true || bv === true;
        if (nowOn) {
          setStep(2);
          hidePanelInstant(chromeApi);
        }
      }
    };

    chromeApi.storage.onChanged.addListener(onChange);
    return () => chromeApi.storage.onChanged.removeListener(onChange);
  }, [open, step, chromeApi]);

  // Measure the current step target
  useEffect(() => {
    if (!open) return;

    const measure = () => {
      let el = null;
      if (step === 1) el = findDismissedRow();
      else if (step === 2) el = findJobListSection();
      else if (step === 3) el = findDismissedBadge();

      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };

    measure();

    const onScrollResize = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);

    const root = getPanelShadowRoot() || document.body;
    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, subtree: true });

    const id = setInterval(measure, 600);

    return () => {
      clearInterval(id);
      mo.disconnect();
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [open, step]);

  // Block interactions outside the hole; allow instruction box; ESC closes
  useEffect(() => {
    if (!open) return;

    const PADDING = 8;

    const isInsideHole = (ev) => {
      if (!rect) return false;
      const { clientX: x, clientY: y } = ev;
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

  // Buttons
  const handlePrev = () => {
    if (step === 2) {
      // Back to Step 1: reopen panel instantly; Step-1 effect will reset dismissed + compact
      showPanelInstant(chromeApi, "filters").then(() => setStep(1));
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      chromeApi?.storage?.local?.set(
        {
          dismissedHidden: true,
          dismissedBadgeVisible: true,
          hidejobs_panel_visible: false,
        },
        () => {
          setStep(2);
          hidePanelInstant(chromeApi);
        }
      );
    } else if (step === 2) {
      setStep(3);
    }
  };

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 170;

  // Positioning for instruction box
  let boxTop, boxLeft;
  if (step === 2) {
    // Prefer RIGHT of the highlighted area
    const preferRight = hole.x + hole.w + gap;
    const fitsRight = preferRight + boxW + 12 <= window.innerWidth;
    boxLeft = fitsRight ? preferRight : Math.max(12, hole.x - gap - boxW);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else {
    const placeBelow =
      hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;
    boxTop = placeBelow ? hole.y + hole.h + gap : Math.max(12, hole.y - estBoxH - gap);
    boxLeft = Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x));
  }

  const stepTitle = step === 1 ? "Step 1" : step === 2 ? "Step 2" : "Step 3";

  const stepText =
    step === 1 ? (
      "Turn ON the Dismissed filter to immediately hide jobs you’ve marked as dismissed. Toggle it on now, or click Next to continue."
    ) : step === 2 ? (
      <div className="space-y-2">
        <div>
          Click the{" "}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              verticalAlign: "middle",
              lineHeight: 1,
            }}
          >
            <CloseOutlined style={{ fontSize: "16px", marginBottom: "2px"}} />
          </span>{" "}
          button in the top-right of a job card to dismiss it. LinkedIn then shows{" "}
          <span style={{ color: "#01754f", fontSize: "18px", fontWeight: 600 }}>
            “We won’t show you this job again.”
          </span>{" "}
            However, LinkedIn continues showing these dismissed jobs, cluttering your results.
        </div>

        <div>
          HideJobs fixes this: it waits a moment so you can restore the job, then
          hides it automatically when you move to the next card—keeping your results
          clean.
        </div>
      </div>
    ) : (
      "When the Dismissed filter is ON, a badge appears here showing how many jobs were hidden. You can use it to quickly toggle dismissed jobs on or off without losing your settings."
    );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }}
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

      {/* Instruction box */}
      <div
        ref={boxRef}
        style={{
          position: "fixed",
          top: boxTop,
          left: boxLeft,
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

        <div className="mt-3 flex items-end justify-between gap-2">
          <div aria-live="polite" className="text-sm text-gray-600 leading-none">
            {step} / 3
          </div>
          <div className="flex items-end gap-2">
            {step > 1 && <Button onClick={handlePrev}>Previous</Button>}
            {step < 3 ? (
              <Button type="primary" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button type="primary" onClick={onClose}>
                Finish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
