// src/components/Tours/AppliedLinkedinTour.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";

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

/** Belt-and-suspenders helpers to remove animation race conditions */
function raf(fn) {
  return requestAnimationFrame(fn);
}

function openPanelInstant(chromeApi, view = "filters") {
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

function closePanelInstant(chromeApi) {
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
   STEP TARGET FINDERS
   ────────────────────────────────────────────────────────── */

function findJobDetailSection() {
  return document.querySelector("div.scaffold-layout__detail") || null;
}

function findAppliedRow() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const byAttr = root.querySelector('[data-filter-row="applied"]');
  if (byAttr) return byAttr;

  const nodes = Array.from(root.querySelectorAll("span, div, p, h2, h3, label"));
  const labelNode = nodes.find(
    (el) => (el.textContent || "").trim().toLowerCase() === "applied"
  );
  if (!labelNode) return null;

  let node = labelNode;
  for (let i = 0; i < 6 && node; i++) {
    if (node.querySelector && node.querySelector(".ant-switch")) return node;
    node = node.parentElement;
  }
  return null;
}

function findAppliedBadge() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const byAttr = root.querySelector('[data-badge="applied"]');
  if (byAttr) return byAttr;

  const byAria = root.querySelector('[aria-label^="Applied"]');
  if (byAria) return byAria;

  const candidates = Array.from(root.querySelectorAll("button, [role='button']"));
  const byText = candidates.find((el) =>
    ((el.textContent || "").trim().toLowerCase()).includes("applied")
  );
  if (byText) return byText;

  return null;
}

function findJobListSection() {
  return document.querySelector("div.scaffold-layout__list") || null;
}

/* ──────────────────────────────────────────────────────────
   TOUR COMPONENT
   ────────────────────────────────────────────────────────── */

export default function AppliedLinkedinTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1); // 1(detail)->2(filters row)->3(badge)->4(list)
  const rafRef = useRef();
  const boxRef = useRef(null);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  useEffect(() => {
    if (!open || !chromeApi) return;
    closePanelInstant(chromeApi);
  }, [open, chromeApi]);

  // ⛔️ Step 1: turn OFF "Keywords" and "Filter by Hours" instantly
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 1) return;

    const toSet = {
      // Keywords (shared across LI/Indeed/Glassdoor)
      userTextBadgeVisible: false,
      userText: false,

      // Filter by Hours (LinkedIn-only badge/panel)
      filterByHoursBadgeVisible: false,
      filterByHours: false,
    };

    chromeApi.storage.local.set(toSet, () => {
      // Broadcast to the panel so the UI mirrors flip OFF everywhere
      try {
        const detail = {
          userText: false,
          filterByHours: false,
        };
        window.dispatchEvent(new CustomEvent("hidejobs-filters-changed", { detail }));
      } catch { }
    });
  }, [open, step, chromeApi]);

  /* ✅ Step 2: only reset compact + applied toggle */
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 2) return;

    const toSet = {
      badgesCompact: false,
      appliedHidden: false,
      appliedBadgeVisible: false,
    };

    chromeApi.storage.local.set(toSet, () => {
      try {
        const detail = { applied: false };
        window.dispatchEvent(new CustomEvent("hidejobs-filters-changed", { detail }));
      } catch { }
    });
  }, [open, step, chromeApi]);

  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 2) return;
    openPanelInstant(chromeApi, "filters");
  }, [open, step, chromeApi]);

  useEffect(() => {
    if (!open || !chromeApi) return;

    const onChange = (changes, area) => {
      if (area !== "local") return;
      if (step === 2 && ("appliedHidden" in changes || "appliedBadgeVisible" in changes)) {
        const hv = "appliedHidden" in changes ? !!changes.appliedHidden.newValue : null;
        const bv = "appliedBadgeVisible" in changes ? !!changes.appliedBadgeVisible.newValue : null;
        const nowOn = hv === true || bv === true;
        if (nowOn) {
          closePanelInstant(chromeApi).then(() => setStep(3));
        }
      }
    };

    chromeApi.storage.onChanged.addListener(onChange);
    return () => chromeApi.storage.onChanged.removeListener(onChange);
  }, [open, step, chromeApi]);

  useEffect(() => {
    if (!open) return;

    const measure = () => {
      let el = null;
      if (step === 1) el = findJobDetailSection();
      else if (step === 2) el = findAppliedRow();
      else if (step === 3) el = findAppliedBadge();
      else if (step === 4) el = findJobListSection();

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

  const handlePrev = () => {
    if (step === 2) {
      closePanelInstant(chromeApi).then(() => setStep(1));
    } else if (step === 3) {
      openPanelInstant(chromeApi, "filters").then(() => setStep(2));
    } else if (step === 4) {
      setStep(3);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      chromeApi?.storage?.local?.set(
        {
          appliedHidden: true,
          appliedBadgeVisible: true,
          hidejobs_panel_visible: false,
        },
        () => {
          closePanelInstant(chromeApi).then(() => setStep(3));
        }
      );
    } else if (step === 3) {
      setStep(4);
    }
  };

  if (!open) return null;

  const stepTitle = step === 1 ? "Step 1" : step === 2 ? "Step 2" : step === 3 ? "Step 3" : "Step 4";
  const stepText =
    step === 1
      ? "Every time you apply, mark the job as Applied. If you apply on a company website, LinkedIn will show this prompt below when you return — click Yes to confirm. Jobs applied with Easy Apply are marked automatically."
      : step === 2
        ? "In order to start hiding applied jobs, turn ON the Applied filter. Try it here, or just click Next."
        : step === 3
          ? "Turning a filter ON hides applied jobs immediately. A badge appears here as a quick control, showing how many are hidden. Click it anytime to pause or resume hiding without removing the badge."
          : "Job cards marked as Applied will disappear from this list, letting you focus on opportunities that matter.";

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = step === 1 ? 260 : 170;

  let boxTop, boxLeft;
  if (step === 1) {
    boxLeft = Math.max(12, hole.x - gap - boxW);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else if (step === 4) {
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }} aria-hidden>
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>

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

        {step === 1 && (
          <div className="my-4">
            <div className="bg-[#e9f2ff] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="font-semibold text-sm leading-tight mb-1">Did you apply?</div>
                <div className="text-sm text-[#475467] leading-relaxed">
                  Let us know, and we'll help you track your application.
                </div>
              </div>
              <div className="flex items-center gap-6 whitespace-nowrap pt-0.5">
                <div className="font-semibold text-sm">Yes</div>
                <div className="font-semibold text-sm">No</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <div aria-live="polite" className="text-sm text-gray-600 leading-none">{step} / 4</div>
          <div className="flex items-end gap-2">
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
    </div>
  );
}
