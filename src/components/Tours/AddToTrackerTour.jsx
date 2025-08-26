import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";

/* ──────────────────────────────────────────────────────────
   Utilities — similar (but NOT identical) to Applied tour
   No view switching here; we ONLY control visibility.
   ────────────────────────────────────────────────────────── */

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

/** Show/hide your panel (no toggle), optionally with no animation. */
function setPanelVisible(visible, { instant = false } = {}) {
  try {
    const evt = new CustomEvent("hidejobs-panel-set-visible", {
      detail: { visible, instant },
    });
    window.dispatchEvent(evt);
  } catch {}
}

/** Small raf helper to avoid animation race conditions */
function raf(fn) {
  return requestAnimationFrame(fn);
}

/** Instantly show the panel WITHOUT changing view */
function showPanelInstant(chromeApi) {
  return new Promise((resolve) => {
    chromeApi?.storage?.local?.set?.(
      { hidejobs_panel_visible: true, hidejobs_panel_anim: "instant" },
      () => {
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

/** Instantly hide the panel WITHOUT changing view */
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

/* ──────────────────────────────────────────────────────────
   Step target finders
   ────────────────────────────────────────────────────────── */

/** STEP 1 target: LinkedIn job description pane (outside our panel) */
function findLinkedInDescription() {
  return document.querySelector("div.scaffold-layout__detail") || null;
}

/** STEP 2 target: Title & Company block inside the panel content */
function findTitleCompanyBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const attrTarget = root.querySelector('[data-tour="addtracker-title"]');
  if (attrTarget) return attrTarget;
  const possible = Array.from(root.querySelectorAll("p"));
  const title = possible.find((el) => el.className?.toString().includes("text-2xl"));
  return title ? title.parentElement : null;
}

/** STEP 3 target: Categories table */
function findCategoriesTable() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const table = root.querySelector('[data-tour="addtracker-categories"]');
  if (table) return table;
  return root.querySelector("table"); // fallback
}

/** STEP 4 target: Status field block */
function findStatusBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const attrTarget = root.querySelector('[data-tour="addtracker-status"]');
  if (attrTarget) return attrTarget;
  const labels = Array.from(root.querySelectorAll("label"));
  const statusLbl = labels.find((el) => (el.textContent || "").trim().toLowerCase() === "status");
  return statusLbl ? statusLbl.parentElement : null;
}

export default function AddToTrackerTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1);
  const rafRef = useRef();
  const boxRef = useRef(null);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  useEffect(() => {
    if (!open || !chromeApi) return;
    hidePanelInstant(chromeApi);
  }, [open, chromeApi]);

  // Measure current step target
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      let el = null;
      if (step === 1) el = findLinkedInDescription();
      else if (step === 2) el = findTitleCompanyBlock();
      else if (step === 3) el = findCategoriesTable();
      else if (step === 4) el = findStatusBlock();
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

  // Block interactions
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

  const handlePrev = () => {
    if (step === 2) {
      hidePanelInstant(chromeApi).then(() => setStep(1));
    } else if (step === 3) {
      setStep(2);
    } else if (step === 4) {
      setStep(3);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      showPanelInstant(chromeApi).then(() => setStep(2));
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 170;

  // Positioning
  let boxTop, boxLeft;
  if (step === 1) {
    const preferLeft = hole.x - gap - boxW;
    const fitsLeft = preferLeft >= 12;
    boxLeft = fitsLeft ? preferLeft : Math.min(window.innerWidth - boxW - 12, hole.x + hole.w + gap);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else if (step === 4) {
    // Force box to the LEFT for Status step
    const preferLeft = hole.x - gap - boxW;
    const fitsLeft = preferLeft >= 12;
    boxLeft = fitsLeft ? preferLeft : 12;
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else {
    const placeBelow =
      hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;
    boxTop = placeBelow ? hole.y + hole.h + gap : Math.max(12, hole.y - estBoxH - gap);
    boxLeft = Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x));
  }

  const stepTitle =
    step === 1 ? "Step 1" : step === 2 ? "Step 2" : step === 3 ? "Step 3" : "Step 4";
  const stepText =
    step === 1
      ? "This is the job description on LinkedIn. Review it before saving to your tracker."
      : step === 2
      ? "Here you see the job title and company — the context for the job you’re adding."
      : step === 3
      ? "These are the categories of information HideJobs captured from the job post."
      : "Pick a Status to track where you are in the process. You can change it anytime.";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }}
      aria-hidden
    >
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>
      <svg width="100%" height="100%" style={{ position: "fixed", inset: 0, display: "block" }}>
        <defs>
          <mask id="hj-addtracker-mask">
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
          mask="url(#hj-addtracker-mask)"
        />
      </svg>
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
        <div className="mt-3 flex items-center justify-end gap-2">
          {step > 1 && <Button onClick={handlePrev}>Previous</Button>}
          {step < 4 ? (
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
  );
}
