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

function findLinkedInDescription() {
  return document.querySelector("div.scaffold-layout__detail") || null;
}

function findTitleCompanyBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const attrTarget = root.querySelector('[data-tour="addtracker-title"]');
  if (attrTarget) return attrTarget;
  const possible = Array.from(root.querySelectorAll("p"));
  const title = possible.find((el) => el.className?.toString().includes("text-2xl"));
  return title ? title.parentElement : null;
}

function findCategoriesTable() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const table = root.querySelector('[data-tour="addtracker-categories"]');
  if (table) return table;
  return root.querySelector("table"); // fallback
}

function findStatusBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const attrTarget = root.querySelector('[data-tour="addtracker-status"]');
  if (attrTarget) return attrTarget;
  const labels = Array.from(root.querySelectorAll("label"));
  const statusLbl = labels.find((el) => (el.textContent || "").trim().toLowerCase() === "status");
  return statusLbl ? statusLbl.parentElement : null;
}

function findInterestBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  return root.querySelector('[data-tour="addtracker-interest"]');
}

function findNotesBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  return root.querySelector('[data-tour="addtracker-notes"]');
}

/** STEP 7 target: Save button */
function findSaveButtonBlock() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const byAttr = root.querySelector('[data-tour="addtracker-save"]');
  if (byAttr) return byAttr;

  const candidates = Array.from(root.querySelectorAll("button,[role='button']"));
  const match = candidates.find((el) => {
    const txt = (el.textContent || "").trim().toLowerCase();
    return txt === "save" || txt === "saved" || txt === "saving";
  });
  return match || null;
}

/** Helper to detect the "Open saved job" button once saved */
function findOpenSavedJobButton() {
  const root = getPanelShadowRoot();
  if (!root) return null;
  const candidates = Array.from(root.querySelectorAll("button,[role='button']"));
  return (
    candidates.find((el) => (el.textContent || "").trim().toLowerCase() === "open saved job") ||
    null
  );
}

/** STEP 8 target: area that includes title, categories and the "Open saved job" button */
function findSavedSummaryArea() {
  const root = getPanelShadowRoot();
  if (!root) return null;

  const title = root.querySelector('[data-tour="addtracker-title"]');
  const cats = root.querySelector('[data-tour="addtracker-categories"]');
  const openBtn = root.querySelector('[data-tour="addtracker-open-saved-job"]');

  if (title && cats && openBtn) {
    let node = title;
    while (node && node !== root) {
      if (node.contains(cats) && node.contains(openBtn)) return node;
      node = node.parentElement;
    }
    return root;
  }
  return null;
}

export default function AddToTrackerTour({ open, onClose }) {
  const chromeApi = useMemo(getChrome, []);
  const [rect, setRect] = useState(null);
  const [step, setStep] = useState(1);
  const [savingStep7, setSavingStep7] = useState(false);
  const rafRef = useRef();
  const boxRef = useRef(null);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  useEffect(() => {
    if (!open || !chromeApi) return;
    hidePanelInstant(chromeApi);
  }, [open, chromeApi]);

  useEffect(() => {
    if (!open) return;

    const handler = (e) => {
      if (step === 4) {
        if (
          e.target.closest(".ant-select-item-option") ||
          e.target.closest(".ant-select-item") ||
          (e.target.className &&
            typeof e.target.className === "string" &&
            e.target.className.includes("ant-select-item"))
        ) {
          setTimeout(() => setStep(5), 300);
          return;
        }
      }

      if (step === 5) {
        if (
          e.target.closest(".ant-rate-star") ||
          e.target.closest('[data-tour="addtracker-interest"] .ant-rate")') ||
          (e.target.className &&
            typeof e.target.className === "string" &&
            e.target.className.includes("ant-rate"))
        ) {
          setTimeout(() => setStep(6), 300);
          return;
        }
      }
    };

    document.addEventListener("click", handler, true);
    const root = getPanelShadowRoot();
    if (root) root.addEventListener("click", handler, true);

    return () => {
      document.removeEventListener("click", handler, true);
      if (root) root.removeEventListener("click", handler, true);
    };
  }, [open, step]);

  // Step 7: watch save -> auto advance
  useEffect(() => {
    if (!open || step !== 7) return;

    let pollId = null;
    let mo = null;

    const checkSaved = () => {
      const openBtn = findOpenSavedJobButton();
      const saveBtn = findSaveButtonBlock();
      const isSaved =
        !!openBtn ||
        (saveBtn &&
          ((saveBtn.textContent || "").trim().toLowerCase() === "saved" ||
            saveBtn.hasAttribute("disabled")));
      if (isSaved) {
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        if (mo) {
          mo.disconnect();
          mo = null;
        }
        setSavingStep7(false);
        setTimeout(() => setStep(8), 150);
      }
    };

    const onClick = (e) => {
      const saveEl = findSaveButtonBlock();
      if (saveEl && (e.target === saveEl || saveEl.contains(e.target))) {
        setSavingStep7(true);
        if (!pollId) pollId = setInterval(checkSaved, 200);
        if (!mo) {
          const root = getPanelShadowRoot() || document.body;
          mo = new MutationObserver(checkSaved);
          mo.observe(root, { childList: true, subtree: true, characterData: true });
        }
      }
    };

    // also listen for tour-triggered save
    const onTourSave = () => {
      setSavingStep7(true);
      if (!pollId) pollId = setInterval(checkSaved, 200);
      if (!mo) {
        const root = getPanelShadowRoot() || document.body;
        mo = new MutationObserver(checkSaved);
        mo.observe(root, { childList: true, subtree: true, characterData: true });
      }
      const saveBtn = findSaveButtonBlock();
      if (saveBtn) saveBtn.click();
    };

    document.addEventListener("click", onClick, true);
    const rootEl = getPanelShadowRoot();
    if (rootEl) rootEl.addEventListener("click", onClick, true);
    window.addEventListener("hidejobs-tour-trigger-save", onTourSave);

    return () => {
      document.removeEventListener("click", onClick, true);
      if (rootEl) rootEl.removeEventListener("click", onClick, true);
      window.removeEventListener("hidejobs-tour-trigger-save", onTourSave);
      if (pollId) clearInterval(pollId);
      if (mo) mo.disconnect();
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      let el = null;
      if (step === 1) el = findLinkedInDescription();
      else if (step === 2) el = findTitleCompanyBlock();
      else if (step === 3) el = findCategoriesTable();
      else if (step === 4) el = findStatusBlock();
      else if (step === 5) el = findInterestBlock();
      else if (step === 6) el = findNotesBlock();
      else if (step === 7) el = findSaveButtonBlock();
      else if (step === 8) el = findSavedSummaryArea();

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
    if (step === 4) return;

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
      if (ev.target.closest(".ant-select-dropdown")) return;
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
  }, [open, rect, onClose, step]);

  const handlePrev = () => {
    if (step === 2) {
      hidePanelInstant(chromeApi).then(() => setStep(1));
    } else if (step > 2) {
      setStep(step - 1);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      showPanelInstant(chromeApi).then(() => setStep(2));
    } else if (step >= 2 && step <= 6) {
      setStep(step + 1);
    } else if (step === 7) {
      console.log("🟠 Tour NEXT pressed on step 7 → triggering save");
      setSavingStep7(true);
      window.dispatchEvent(new Event("hidejobs-tour-trigger-save"));
    }
  };

  if (!open) return null;

  const hole = rect || { x: -9999, y: -9999, w: 0, h: 0 };
  const gap = 12;
  const boxW = 328;
  const estBoxH = 170;

  let boxTop, boxLeft;
  if (step === 1 || step >= 4) {
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

  const stepTitle = `Step ${step}`;
  const stepText =
    step === 1
      ? "This is the job description on LinkedIn. Review it before saving to your tracker."
      : step === 2
        ? "Here you see the job title and company — the context for the job you're adding."
        : step === 3
          ? "These are the categories of information HideJobs captured from the job post."
          : step === 4
            ? "Pick a Status to track where you are in the process. Choosing one moves you ahead."
            : step === 5
              ? "Rate your interest in this job. Clicking stars or Next will advance."
              : step === 6
                ? "Add your notes about this job for future reference."
                : step === 7
                  ? "Finally, click Save to add this job to your tracker. We'll move on once it's saved."
                  : "Great! Your job is saved. Here's where to find the title, captured details, and the Open saved job button.";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none" }} aria-hidden>
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
          {(step > 1 && step !== 8) && <Button onClick={handlePrev}>Previous</Button>}
          {step < 8 ? (
            <Button
              type="primary"
              onClick={handleNext}
              disabled={step === 7 && savingStep7}
            >
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
