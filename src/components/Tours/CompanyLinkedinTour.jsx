// src/components/Tours/CompanyLinkedinTour.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { CloseOutlined, EyeInvisibleFilled } from "@ant-design/icons";

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

/** STEP 1 & 3 target: the "Companies" row (label + switch) inside Filters panel */
function findCompaniesRow() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const attrTarget = root.querySelector('[data-filter-row="companies"]');
  if (attrTarget) return attrTarget;

  const nodes = Array.from(root.querySelectorAll("span, div, p, h2, h3, label"));
  const labelNode = nodes.find(
    (el) => (el.textContent || "").trim().toLowerCase() === "companies"
  );
  if (!labelNode) return null;

  let node = labelNode;
  for (let i = 0; i < 6 && node; i++) {
    if (node.querySelector && node.querySelector(".ant-switch")) return node;
    node = node.parentElement;
  }
  return null;
}

/** STEP 2: LinkedIn job list section */
function findJobListSection() {
  return document.querySelector("div.scaffold-layout__list");
}

/** STEP 4: the Companies badge (right stack) */
function findCompaniesBadge() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const byAttr = root.querySelector('[data-badge="companies"]');
  if (byAttr) return byAttr;

  const byAria = root.querySelector('[aria-label^="Companies"]');
  if (byAria) return byAria;

  const candidates = Array.from(root.querySelectorAll("button, [role='button']"));
  const byText = candidates.find((el) =>
    ((el.textContent || "").trim().toLowerCase()).includes("companies")
  );
  if (byText) return byText;

  return null;
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

export default function CompanyLinkedinTour({ open, onClose, onStepChange }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1); // 1 -> row, 2 -> list, 3 -> row again, 4 -> badge
  const rafRef = useRef();
  const boxRef = useRef(null);

  // Reset to step 1 whenever the tour opens
  useEffect(() => {
    if (open) {
      setStep(1);
      onStepChange?.(1);
    }
  }, [open, onStepChange]);

  // Notify parent of step changes
  useEffect(() => {
    if (open) {
      onStepChange?.(step);
    }
  }, [step, open, onStepChange]);

  // Always show the panel on Filters when the tour starts
  useEffect(() => {
    if (!open || !chromeApi) return;

    openPanelInstant(chromeApi, "filters");
  }, [open, chromeApi]);

  // ✅ STEP 1 ONLY: reset Companies toggle when entering (skip step 3)
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 1) return; // Only reset on step 1, not step 3

    const toSet = {
      badgesCompact: false,
      companiesHidden: false,
      companiesBadgeVisible: false,
    };

    chromeApi.storage.local.set(toSet, () => {
      try {
        const detail = { companies: false, badgesCompact: false };
        window.dispatchEvent(new CustomEvent("hidejobs-filters-changed", { detail }));
      } catch { }
    });
  }, [open, step, chromeApi]);

  // Auto-progress logic when toggling ON during Step 1 or Step 3
  useEffect(() => {
    if (!open || !chromeApi) return;

    const onChange = (changes, area) => {
      if (area !== "local") return;

      if ((step === 1 || step === 3) && ("companiesHidden" in changes || "companiesBadgeVisible" in changes)) {
        const hv = "companiesHidden" in changes ? !!changes.companiesHidden.newValue : null;
        const bv =
          "companiesBadgeVisible" in changes ? !!changes.companiesBadgeVisible.newValue : null;
        const nowOn = hv === true || bv === true;
        if (nowOn) {
          if (step === 1) {
            setStep(2); // jump to job list
            closePanelInstant(chromeApi);
          } else if (step === 3) {
            setStep(4); // jump to badge
            closePanelInstant(chromeApi);
          }
        }
      }
    };

    chromeApi.storage.onChanged.addListener(onChange);
    return () => chromeApi.storage.onChanged.removeListener(onChange);
  }, [open, step, chromeApi]);

  // Show panel for step 3 (same as step 1)
  useEffect(() => {
    if (!open || !chromeApi) return;
    if (step !== 3) return;

    openPanelInstant(chromeApi, "filters");
  }, [open, step, chromeApi]);

  // Measure target
  useEffect(() => {
    if (!open) return;

    const measure = () => {
      let el = null;
      if (step === 1) el = findCompaniesRow();
      else if (step === 2) el = findJobListSection();
      else if (step === 3) el = findCompaniesRow();    // same as step 1
      else if (step === 4) el = findCompaniesBadge();

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

  // Block interactions outside the hole
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
      // Back to Step 1
      openPanelInstant(chromeApi, "filters").then(() => setStep(1));
    } else if (step === 3) {
      setStep(2);
      closePanelInstant(chromeApi);
    } else if (step === 4) {
      // Back to Step 3
      openPanelInstant(chromeApi, "filters").then(() => setStep(3));
    }
  };

  const handleNext = () => {
    if (step === 1) {
      chromeApi?.storage?.local?.set(
        {
          companiesHidden: true,
          companiesBadgeVisible: true,
          hidejobs_panel_visible: false,
        },
        () => {
          setStep(2); // go to job list
          closePanelInstant(chromeApi);
        }
      );
    } else if (step === 2) {
      setStep(3); // go to new step 3 (same as step 1)
    } else if (step === 3) {
      chromeApi?.storage?.local?.set(
        {
          companiesHidden: true,
          companiesBadgeVisible: true,
          hidejobs_panel_visible: false,
        },
        () => {
          setStep(4); // go to badge
          closePanelInstant(chromeApi);
        }
      );
    }
  };

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 170;

  // Position instruction box
  let boxTop, boxLeft;

  if (step === 2) {
    // Always place to the right for job list step
    const preferRight = hole.x + hole.w + gap;
    boxLeft = Math.min(preferRight, window.innerWidth - boxW - 12);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else if (step === 4) {
    // Always below for the badge
    boxTop = hole.y + hole.h + gap;
    boxLeft = Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x));
  } else {
    // Steps 1 and 3 use same positioning logic
    const placeBelow =
      hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;
    boxTop = placeBelow ? hole.y + hole.h + gap : Math.max(12, hole.y - estBoxH - gap);
    boxLeft = Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x));
  }

  const stepTitle = step === 1 ? "Step 1" : step === 2 ? "Step 2" : step === 3 ? "Step 3" : "Step 4";
  const stepText =
    step === 1 ? (
      "Turn ON the Companies filter here, or click Next to auto-enable it."
    ) : step === 2 ? (
      <span>
        Once the filter is ON you will see{" "}
        <EyeInvisibleFilled className="text-hidejobs-700 icon-18" /> in every job card here.
        If you click on it you can mark up the company to hide.
        And then by clicking the button <strong>Hide Company</strong> you can hide all the jobs from this company.
      </span>
    ) : step === 3 ? (
      "Using the List button here you can always access the list of hidden companies."
    ) : (
      "A quick badge appears here — use it to pause/resume hiding companies without changing your list."
    );

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }}
      aria-hidden
    >
      {/* Hide ant tooltips/popovers */}
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>

      {/* Mask */}
      <svg width="100%" height="100%" style={{ position: "fixed", inset: 0, display: "block" }}>
        <defs>
          <mask id="hj-tour-mask-companies">
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
          mask="url(#hj-tour-mask-companies)"
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


/////////////////////