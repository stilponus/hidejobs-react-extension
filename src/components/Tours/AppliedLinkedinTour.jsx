// src/components/Tours/AppliedLinkedinTour.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";

/** ✅ Keys your extension uses in chrome.storage.local */
const FILTER_KEYS = [
  "dismissed",
  "promoted",
  "viewed",
  "repostedGhost",
  "indeedSponsored",
  "glassdoorApplied",
  "indeedApplied",
  "applied",            // <- our main target for this tour
  "filterByHours",
  "userText",
  "companies",
];

/* ──────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────── */

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

/** Show/hide your panel (no toggle), optionally with no animation. */
function setPanelVisible(visible, { instant = false } = {}) {
  try {
    const evt = new CustomEvent("hidejobs-panel-set-visible", {
      detail: { visible, instant },
    });
    window.dispatchEvent(evt);
  } catch { }
}

/* ──────────────────────────────────────────────────────────
   STEP TARGET FINDERS (edit/selectors here if your DOM changes)
   ────────────────────────────────────────────────────────── */

/** NEW STEP 1 target: LinkedIn job detail panel (right side) - was old Step 4 */
function findJobDetailSection() {
  return document.querySelector("div.scaffold-layout__detail") || null;
}

/** NEW STEP 2 target: the "Applied" row (label + switch) inside the Filters panel - was old Step 1 */
function findAppliedRow() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  // Prefer explicit data attribute if your UI emits it:
  // <div data-filter-row="applied">...</div>
  const byAttr = root.querySelector('[data-filter-row="applied"]');
  if (byAttr) return byAttr;

  // Fallback: find by text, then climb up to a container that includes the switch
  const nodes = Array.from(root.querySelectorAll("span, div, p, h2, h3, label"));
  const labelNode = nodes.find(
    (el) => (el.textContent || "").trim().toLowerCase() === "applied"
  );
  if (!labelNode) return null;

  // Walk up to find an ancestor containing the AntD switch
  let node = labelNode;
  for (let i = 0; i < 6 && node; i++) {
    if (node.querySelector && node.querySelector(".ant-switch")) return node;
    node = node.parentElement;
  }
  return null;
}

/** NEW STEP 3 target: the "Applied" badge in your right stack / top controls - was old Step 2 */
function findAppliedBadge() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  // If your UI uses a data attribute:
  const byAttr = root.querySelector('[data-badge="applied"]');
  if (byAttr) return byAttr;

  // An accessible name (aria-label)
  const byAria = root.querySelector('[aria-label^="Applied"]');
  if (byAria) return byAria;

  // Fallback: any button-like element containing "Applied"
  const candidates = Array.from(root.querySelectorAll("button, [role='button']"));
  const byText = candidates.find((el) =>
    ((el.textContent || "").trim().toLowerCase()).includes("applied")
  );
  if (byText) return byText;

  return null;
}

/** NEW STEP 4 target: LinkedIn job list section (outer scroll/list container) - was old Step 3 */
function findJobListSection() {
  // On LinkedIn it's usually this:
  return document.querySelector("div.scaffold-layout__list") || null;
}

/* ──────────────────────────────────────────────────────────
   TOUR COMPONENT
   ────────────────────────────────────────────────────────── */

export default function AppliedLinkedinTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1);  // 1->2->3->4
  const rafRef = useRef();
  const boxRef = useRef(null);

  /* Reset step each time the tour opens */
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  /* NEW STEP 1: Force panel CLOSED when tour starts */
  useEffect(() => {
    if (!open || !chromeApi) return;

    chromeApi.storage.local.set(
      { hidejobs_panel_visible: false },
      () => {
        setPanelVisible(false, { instant: true });
      }
    );
  }, [open, chromeApi]);

  /* NEW STEP 2: force ALL toggles OFF (including compact OFF) once when entering step 2 */
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 2) return;

    const toSet = { badgesCompact: false };
    FILTER_KEYS.forEach((k) => {
      toSet[`${k}Hidden`] = false;
      toSet[`${k}BadgeVisible`] = false;
    });

    chromeApi.storage.local.set(toSet, () => {
      try {
        const detail = Object.fromEntries(FILTER_KEYS.map((k) => [k, false]));
        window.dispatchEvent(new CustomEvent("hidejobs-filters-changed", { detail }));
      } catch { }
    });
  }, [open, step, chromeApi]);

  /* When entering step 2, open panel on filters view instantly */
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 2) return;

    // Set panel visible FIRST with instant: true
    setPanelVisible(true, { instant: true });
    
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
  }, [open, step, chromeApi]);

  /* If user turns Applied ON during Step 2 → go to Step 3 & close panel instantly */
  useEffect(() => {
    if (!open || !chromeApi) return;

    const onChange = (changes, area) => {
      if (area !== "local") return;
      if (step === 2 && ("appliedHidden" in changes || "appliedBadgeVisible" in changes)) {
        const hv = "appliedHidden" in changes ? !!changes.appliedHidden.newValue : null;
        const bv = "appliedBadgeVisible" in changes ? !!changes.appliedBadgeVisible.newValue : null;
        const nowOn = hv === true || bv === true;
        if (nowOn) {
          setStep(3);
          setPanelVisible(false, { instant: true });
          chromeApi.storage.local.set({ hidejobs_panel_visible: false });
        }
      }
    };

    chromeApi.storage.onChanged.addListener(onChange);
    return () => chromeApi.storage.onChanged.removeListener(onChange);
  }, [open, step, chromeApi]);

  /* Measure current target (re-run on DOM changes / resize / scroll) */
  useEffect(() => {
    if (!open) return;

    const measure = () => {
      let el = null;
      if (step === 1) el = findJobDetailSection();    // NEW: was old step 4
      else if (step === 2) el = findAppliedRow();     // NEW: was old step 1
      else if (step === 3) el = findAppliedBadge();   // NEW: was old step 2
      else if (step === 4) el = findJobListSection(); // NEW: was old step 3

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

  /* Block interactions outside the hole; allow instruction box; ESC closes */
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
        ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " ", "Spacebar"].includes(ev.key)
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

  /* Buttons logic */
  const handlePrev = () => {
    if (step === 2) {
      // Go back to Step 1: close panel
      setPanelVisible(false, { instant: true });
      chromeApi?.storage?.local?.set({ hidejobs_panel_visible: false }, () => setStep(1));
    } else if (step === 3) {
      // Go back to Step 2: reopen panel instantly; Step-2 effect re-forces all toggles OFF
      setPanelVisible(true, { instant: true });
      chromeApi?.storage?.local?.set({ hidejobs_panel_visible: true }, () => setStep(2));
      try {
        const evt = new CustomEvent("hidejobs-panel-set-view", { detail: { view: "filters" } });
        window.dispatchEvent(evt);
      } catch { }
    } else if (step === 4) {
      setStep(3);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      // Move to Step 2: open panel and show filters
      setStep(2);
    } else if (step === 2) {
      // Turn ON "Applied": hide jobs + show badge, then close panel + advance
      setPanelVisible(false, { instant: true });
      chromeApi?.storage?.local?.set(
        {
          appliedHidden: true,
          appliedBadgeVisible: true,
          hidejobs_panel_visible: false,
        },
        () => {
          setStep(3);
        }
      );
    } else if (step === 3) {
      setStep(4);
    }
  };

  if (!open) return null;

  /* ──────────────────────────────────────────────────────────
     INSTRUCTION TEXT (updated for new order)
     ────────────────────────────────────────────────────────── */

  const stepTitle = step === 1 ? "Step 1" : step === 2 ? "Step 2" : step === 3 ? "Step 3" : "Step 4";
  const stepText =
    step === 1
      ? "After applying on the company site and returning to LinkedIn, you'll see this prompt. Click Yes to mark the job as Applied. If you used Easy Apply on LinkedIn, it's marked automatically."
      : step === 2
        ? "Turn ON the Applied filter to hide jobs you've already applied to. You can also click Next."
        : step === 3
          ? "The Applied badge appears here. Click it anytime to pause or resume hiding without removing the badge."
          : "Applied jobs are now hidden from this list so you can focus on new opportunities.";

  /* ──────────────────────────────────────────────────────────
     Instruction box positioning
     ────────────────────────────────────────────────────────── */
  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = step === 1 ? 260 : 170; // Step 1 (old step 4) needs more height

  let boxTop, boxLeft;
  if (step === 1) {
    // Step 1 (job detail): Always position LEFT of the highlighted detail panel
    boxLeft = Math.max(12, hole.x - gap - boxW);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else if (step === 4) {
    // Step 4 (job list): Prefer RIGHT of the highlighted area
    const preferRight = hole.x + hole.w + gap;
    const fitsRight = preferRight + boxW + 12 <= window.innerWidth;
    boxLeft = fitsRight ? preferRight : Math.max(12, hole.x - gap - boxW);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else {
    // Steps 2 and 3: position below or above
    const placeBelow =
      hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;
    boxTop = placeBelow ? hole.y + hole.h + gap : Math.max(12, hole.y - estBoxH - gap);
    boxLeft = Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x));
  }

  /* ──────────────────────────────────────────────────────────
     Render
     ────────────────────────────────────────────────────────── */
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }} aria-hidden>
      {/* Hide ant tooltips/popovers during the tour */}
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>

      {/* Mask + transparent "hole" over the highlighted element */}
      <svg width="100%" height="100%" style={{ position: "fixed", inset: 0, display: "block" }}>
        <defs>
          <mask id="hj-tour-mask-applied">
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
          mask="url(#hj-tour-mask-applied)"
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

        {/* Step 1 (was old Step 4) — render your blue confirmation banner below instructions */}
        {step === 1 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                background: "#e9f2ff",
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <div style={{ flex: "1 1 auto" }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    lineHeight: 1.4,
                    margin: "0 0 6px 0",
                  }}
                >
                  Did you apply?
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#475467",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  Let us know, and we'll help you track your application.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "24px",
                  whiteSpace: "nowrap",
                  paddingTop: "2px",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "14px" }}>Yes</div>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>No</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          {step > 1 && <Button onClick={handlePrev}>Previous</Button>}
          {step < 4 ? (
            <Button type="primary" onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button type="primary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}