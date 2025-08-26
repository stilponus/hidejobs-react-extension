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

/** STEP 1 target: the Reposted On/Off toggle wrapper */
function findRepostedToggle() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  return root.querySelector('[data-tour="reposted-toggle"]');
}

/** STEP 1: AntD switch element inside wrapper */
function findRepostedSwitchEl() {
  const wrap = findRepostedToggle();
  if (!wrap) return null;
  return wrap.querySelector('[role="switch"]');
}

/** STEP 2 target: the Scan button */
function findRepostedScanButton() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  return root.querySelector('[data-tour="reposted-scan"]');
}

/** STEP 3 target: LinkedIn job list section */
function findJobListSection() {
  return document.querySelector("div.scaffold-layout__list");
}

/** Panel visibility helpers */
function setPanelVisible(visible, { instant = false } = {}) {
  try {
    const evt = new CustomEvent("hidejobs-panel-set-visible", {
      detail: { visible, instant },
    });
    window.dispatchEvent(evt);
  } catch {}
}

function raf(fn) {
  return requestAnimationFrame(fn);
}

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
  const switchObserverRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Reset to step 1 whenever tour opens
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // Always open panel on Reposted when tour starts
  useEffect(() => {
    if (!open || !chromeApi) return;
    showPanelInstant(chromeApi, "reposted");
  }, [open, chromeApi]);

  // Step 1 logic: force OFF on enter, auto advance if turned ON
  useEffect(() => {
    if (!open || step !== 1) return;

    // Reset OFF
    const resetOff = () => {
      const sw = findRepostedSwitchEl();
      if (!sw) return;
      const isOn = (sw.getAttribute("aria-checked") || "").toLowerCase() === "true";
      if (isOn) sw.click();
    };
    resetOff();
    const t = setTimeout(resetOff, 100);

    // Watch ON → advance to Step 2
    const sw = findRepostedSwitchEl();
    if (sw) {
      const mo = new MutationObserver(() => {
        const isOn = (sw.getAttribute("aria-checked") || "").toLowerCase() === "true";
        if (isOn) setStep(2);
      });
      mo.observe(sw, { attributes: true, attributeFilter: ["aria-checked"] });
      switchObserverRef.current = mo;
    } else {
      pollTimerRef.current = setInterval(() => {
        const s = findRepostedSwitchEl();
        if (s) {
          const isOn = (s.getAttribute("aria-checked") || "").toLowerCase() === "true";
          if (isOn) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setStep(2);
          }
        }
      }, 300);
    }

    return () => {
      clearTimeout(t);
      if (switchObserverRef.current) {
        switchObserverRef.current.disconnect();
        switchObserverRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [open, step]);

  // Measure target rect
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      let el = null;
      if (step === 1) el = findRepostedToggle();
      else if (step === 2) el = findRepostedScanButton();
      else if (step === 3) el = findJobListSection();
      if (!el) return setRect(null);
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

  // Buttons
  const handlePrev = () => {
    if (step === 2) setStep(1);
    else if (step === 3) showPanelInstant(chromeApi, "reposted").then(() => setStep(2));
  };

  const handleNext = () => {
    if (step === 1) {
      // On Next from Step 1: force ON, go to Step 2
      const sw = findRepostedSwitchEl();
      if (sw) {
        const isOn = (sw.getAttribute("aria-checked") || "").toLowerCase() === "true";
        if (!isOn) sw.click();
      }
      setStep(2);
    } else if (step === 2) {
      hidePanelInstant(chromeApi).then(() => setStep(3));
    } else if (step === 3) {
      onClose?.();
    }
  };

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 160;

  let boxTop, boxLeft;
  if (step === 1) {
    const preferRight = hole.x + hole.w + gap;
    const fitsRight = preferRight + boxW + 12 <= window.innerWidth;
    boxLeft = fitsRight ? preferRight : Math.max(12, hole.x - gap - boxW);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  } else if (step === 2) {
    const placeBelow =
      hole.y + hole.h + gap + estBoxH <= window.innerHeight || hole.y < estBoxH + gap;
    boxTop = placeBelow ? hole.y + hole.h + gap : Math.max(12, hole.y - estBoxH - gap);
    boxLeft = Math.max(12, Math.min(window.innerWidth - boxW - 12, hole.x));
  } else if (step === 3) {
    const preferRight = hole.x + hole.w + gap;
    const fitsRight = preferRight + boxW + 12 <= window.innerWidth;
    boxLeft = fitsRight ? preferRight : Math.max(12, hole.x - gap - boxW);
    boxTop = Math.max(12, Math.min(window.innerHeight - estBoxH - 12, hole.y));
  }

  const stepTitle = step === 1 ? "Step 1" : step === 2 ? "Step 2" : "Step 3";
  const stepText =
    step === 1
      ? "Turn ON the Reposted Jobs detector using this switch. Or click Next and I’ll turn it on for you."
      : step === 2
      ? "Click Scan for Reposted Jobs. It will detect reposted listings and prepare controls."
      : "Here’s your LinkedIn jobs list. Reposted items can be hidden for a cleaner view.";
  const stepCount = 3;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }}>
      <style>{`.ant-tooltip,.ant-popover{display:none !important;}`}</style>
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
          <div className="text-sm text-gray-600 leading-none">{step} / {stepCount}</div>
          <div className="flex items-end gap-2">
            {(step === 2 || step === 3) && <Button onClick={handlePrev}>Previous</Button>}
            {step === 3 ? (
              <Button type="primary" onClick={onClose}>Finish</Button>
            ) : (
              <Button type="primary" onClick={handleNext}>Next</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
