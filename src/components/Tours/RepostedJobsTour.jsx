// src/components/Tours/RepostedJobsTour.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";

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

/** STEP 1 target: the Reposted On/Off toggle wrapper (right side of the header) */
function findRepostedToggle() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  return root.querySelector('[data-tour="reposted-toggle"]');
}

/** STEP 2 target: the "Scan for Reposted Jobs" primary button */
function findRepostedScanButton() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  return root.querySelector('[data-tour="reposted-scan"]');
}

/** Tell the shell to set panel visibility explicitly (no toggle), optionally with no animation. */
function setPanelVisible(visible, { instant = false } = {}) {
  try {
    const evt = new CustomEvent("hidejobs-panel-set-visible", {
      detail: { visible, instant },
    });
    window.dispatchEvent(evt);
  } catch {}
}

/* Small raf helper to avoid animation race conditions */
function raf(fn) {
  return requestAnimationFrame(fn);
}

/** Instantly show the panel on Reposted view (no animation) */
function showPanelInstant(chromeApi, view = "reposted") {
  return new Promise((resolve) => {
    chromeApi?.storage?.local?.set?.(
      { hidejobs_panel_view: view, hidejobs_panel_visible: true, hidejobs_panel_anim: "instant" },
      () => {
        try {
          const evt = new CustomEvent("hidejobs-panel-set-view", { detail: { view } });
          window.dispatchEvent(evt);
        } catch {}
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

/** Instantly hide the panel (no animation) */
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

export default function RepostedJobsTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1);
  const rafRef = useRef();
  const boxRef = useRef(null);

  // Reset to step 1 whenever the tour opens
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // Always show the panel on Reposted view when the tour starts (instantly, no animation)
  useEffect(() => {
    if (!open || !chromeApi) return;
    showPanelInstant(chromeApi, "reposted");
  }, [open, chromeApi]);

  // Measure the current step target
  useEffect(() => {
    if (!open) return;

    const measure = () => {
      let el = null;
      if (step === 1) el = findRepostedToggle();
      else if (step === 2) el = findRepostedScanButton();

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
    if (step === 2) setStep(1);
  };

  const handleNext = () => {
    if (step === 1) setStep(2);
  };

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 160;

  // Positioning for instruction box: prefer right for step 1; below otherwise
  let boxTop, boxLeft;
  if (step === 1) {
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

  const stepTitle = step === 1 ? "Step 1" : "Step 2";
  const stepText =
    step === 1
      ? "Master switch: turn the Reposted Jobs detector ON/OFF. When ON, you can scan and then hide/show detected reposted jobs."
      : "Click Scan for Reposted Jobs. We’ll open each visible job card, detect “Reposted … ago”, and prepare the Hide/Show control.";

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
          <mask id="hj-reposted-tour-mask">
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
          mask="url(#hj-reposted-tour-mask)"
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
          <div aria-live="polite" className="text-sm text-gray-600 leading-none">{step} / 2</div>
          <div className="flex items-end gap-2">
            {step > 1 && <Button onClick={handlePrev}>Previous</Button>}
            {step < 2 ? (
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
