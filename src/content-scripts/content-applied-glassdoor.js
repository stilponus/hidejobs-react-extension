/************************************************************/
/*            HideJobs – Glassdoor "Applied" Hider          */
/*  Integrates with FilterBadge via storage keys:           */
/*    - glassdoorAppliedBadgeVisible (boolean)              */
/*    - glassdoorAppliedHidden (boolean)                    */
/*    - glassdoorAppliedHiddenCount (number)                */
/*    - glassdoorAppliedIds (string[])                      */
/*  (Also writes a legacy alias: glassdoorHiddenAppliedCount)*/
/************************************************************/

(() => {
  console.log("[HideJobs] glassdoor applied logic loaded:", location.href);

  /* -------------------- STATE -------------------- */
  let isHidden = false;                  // mirrors glassdoorAppliedHidden
  let hiddenCount = 0;                   // mirrors glassdoorAppliedHiddenCount
  const countedIds = new Set();          // to avoid double counting
  let listObserver = null;
  let lastUrl = location.href;

  /* -------------------- PAGE CHECK -------------------- */
  function isGlassdoorJobPage(href = location.href) {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (!host.includes("glassdoor.")) return false;

    // Exclude obvious non-job sections
    const blocked = [
      "/overview", "/benefits", "/photos", "/reviews",
      "/faq", "/interview", "/salary", "/salaries",
      "/employers", "/employer", "/compare", "/insights",
      "/blog", "/community", "/about", "/help", "/partners", "/profile"
    ];
    if (blocked.some(p => path.startsWith(p))) return false;

    // Treat everything else on glassdoor.* as job search/list pages
    // Typical job-search paths include /Job/, /Jobs/, /job-listing/, etc.
    return true;
  }

  /* -------------------- SELECTORS & HELPERS -------------------- */
  // Primary result items on GD often render as <li data-test="jobListing" data-jobid="...">
  function getJobCards() {
    return document.querySelectorAll('li[data-test="jobListing"][data-jobid], div[data-test="jobListing"][data-jobid]');
  }
  function getJobId(card) {
    return card.getAttribute("data-jobid") || null;
  }
  function getRow(card) {
    // Keep simple: the card itself is a row on GD list
    return card;
  }

  // one-time CSS for fully-hidden rows + button styles
  (() => {
    if (document.getElementById("hidejobs-gd-applied-style")) return;
    const s = document.createElement("style");
    s.id = "hidejobs-gd-applied-style";
    s.textContent = `
      .hidejobs-gd-applied-hidden { display: none !important; }
      .glassdoor-applied-button {
        padding: 4px 6px !important; 
        border: none !important; 
        border-radius: 4px !important;
        background: #e6f3ff !important; 
        color: #28507c !important; 
        cursor: pointer !important;
        font-size: 11px !important; 
        line-height: 1 !important; 
        transition: all .3s !important;
        display: inline-block !important; 
        position: relative !important; 
        z-index: 999999 !important; 
        outline: none !important;
        margin: 10px 0 5px 0 !important;
        pointer-events: auto !important;
        user-select: none !important;
        font-family: inherit !important;
        font-weight: normal !important;
        text-decoration: none !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
      }
      .glassdoor-applied-button.glassdoor-applied-active {
        background: #e7a33e !important; 
        color: #fff !important;
      }
      .glassdoor-applied-button:hover {
        background: #28507c !important; 
        color: #fff !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
      }
      .glassdoor-applied-button.glassdoor-applied-active:hover {
        background: #f8e3a1 !important; 
        color: #00000099 !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
      }
    `;
    document.head.appendChild(s);
  })();

  function smoothHide(card) {
    const row = getRow(card);
    if (!row || row.classList.contains("hidejobs-gd-applied-hidden")) return;

    const h = row.offsetHeight + "px";
    Object.assign(row.style, {
      overflow: "hidden",
      height: h,
      opacity: "1",
      transition: "height .4s ease, opacity .25s ease",
    });
    requestAnimationFrame(() => {
      row.style.height = "0";
      row.style.opacity = "0";
    });
    row.addEventListener("transitionend", function te(e) {
      if (e.propertyName === "height") {
        row.classList.add("hidejobs-gd-applied-hidden");
        row.removeAttribute("style");
        row.removeEventListener("transitionend", te);
      }
    });
  }

  /* -------------------- STORAGE WRITES -------------------- */
  function writeCounts() {
    chrome?.storage?.local?.set({
      glassdoorAppliedHidden: isHidden,
      glassdoorAppliedHiddenCount: hiddenCount,
      // legacy alias for any old readers:
      glassdoorHiddenAppliedCount: hiddenCount,
    });
    // keep parity with other helpers if present
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  /* -------------------- CORE HIDE/SHOW -------------------- */
  function hideApplied() {
    if (!isGlassdoorJobPage()) return;

    hiddenCount = 0;
    countedIds.clear();

    getJobCards().forEach((card) => {
      const btn = card.querySelector(".glassdoor-applied-button");
      const isApplied =
        (btn && btn.classList.contains("glassdoor-applied-active")) ||
        card.classList.contains("hidejobs-applied-mark");

      if (isApplied) {
        const id = getJobId(card) || card.innerText.trim();
        if (!countedIds.has(id)) {
          countedIds.add(id);
          hiddenCount++;
        }
        smoothHide(card);
      }
    });

    isHidden = true;
    writeCounts();
  }

  function showApplied() {
    if (!isHidden) return;

    getJobCards().forEach((card) => {
      const row = getRow(card);
      row?.classList?.remove("hidejobs-gd-applied-hidden");
      // clear any inline styles if some remained (defensive)
      row?.removeAttribute?.("style");
    });

    hiddenCount = 0;
    countedIds.clear();
    isHidden = false;
    writeCounts();
  }

  function hideNewlyAppliedCard(card) {
    const id = getJobId(card) || card.innerText.trim();
    if (!countedIds.has(id)) {
      countedIds.add(id);
      hiddenCount++;
      writeCounts();
    }
    smoothHide(card);
  }

  /* -------------------- "Mark as Applied" button -------------------- */
  function injectMarkButton(card, appliedIds) {
    const jobId = getJobId(card);
    if (!jobId) return;
    if (card.querySelector(".glassdoor-applied-button")) return;

    const jobTitle = card.querySelector('[data-test="job-title"]');
    if (!jobTitle || !jobTitle.parentNode) return;

    const btn = document.createElement("button");
    btn.className = "glassdoor-applied-button";
    btn.textContent = "Mark as Applied";

    // Ensure button is clickable with explicit event handling
    btn.setAttribute("type", "button");
    btn.tabIndex = 0;

    const mark = () => {
      btn.classList.add("glassdoor-applied-active");
      btn.textContent = "Applied";
      card.classList.add("hidejobs-applied-mark");
    };
    const unmark = () => {
      btn.classList.remove("glassdoor-applied-active");
      btn.textContent = "Mark as Applied";
      card.classList.remove("hidejobs-applied-mark");
    };

    if (appliedIds?.includes(jobId)) mark();

    // Enhanced click handler with event capture
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const wasApplied = btn.classList.contains("glassdoor-applied-active");
      chrome?.storage?.local?.get(["glassdoorAppliedIds"], (res) => {
        let ids = res?.glassdoorAppliedIds || [];
        if (wasApplied) {
          ids = ids.filter((i) => i !== jobId);
          unmark();
          const row = getRow(card);
          row?.classList?.remove("hidejobs-gd-applied-hidden");
          chrome?.storage?.local?.set({ glassdoorAppliedIds: ids });
          if (isHidden) hideApplied(); // recompute quickly
        } else {
          if (!ids.includes(jobId)) ids.push(jobId);
          mark();
          chrome?.storage?.local?.set({ glassdoorAppliedIds: ids });
          if (isHidden) hideNewlyAppliedCard(card);
        }
      });
    };

    // Add multiple event listeners to ensure clicks are captured
    btn.addEventListener("click", handleClick, true);
    btn.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    btn.addEventListener("mouseup", (e) => e.stopPropagation(), true);

    // Keyboard support
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick(e);
      }
    });

    // Create a wrapper div to ensure proper positioning
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position: relative !important;
      z-index: 999999 !important;
      pointer-events: auto !important;
      margin: 5px 0 !important;
    `;
    wrapper.appendChild(btn);

    // insert before the title for consistent placement
    jobTitle.parentNode.insertBefore(wrapper, jobTitle);
  }

  function removeAllMarkButtons() {
    document
      .querySelectorAll(".glassdoor-applied-button")
      .forEach((b) => {
        const wrapper = b.parentNode;
        if (wrapper && wrapper !== document.body) {
          wrapper.remove();
        } else {
          b.remove();
        }
      });
    document
      .querySelectorAll(".hidejobs-applied-mark")
      .forEach((c) => c.classList.remove("hidejobs-applied-mark"));
  }

  /* -------------------- OBSERVER -------------------- */
  function ensureButtons() {
    chrome?.storage?.local?.get(
      ["glassdoorAppliedBadgeVisible", "glassdoorAppliedIds"],
      (res) => {
        const visible = !!res?.glassdoorAppliedBadgeVisible;
        const ids = res?.glassdoorAppliedIds || [];
        if (!visible || !isGlassdoorJobPage()) return;
        getJobCards().forEach((card) => injectMarkButton(card, ids));
      }
    );
  }

  function watchList() {
    if (listObserver) return;

    const root =
      document.querySelector('[data-test="job-feed"]') ||
      document.querySelector('[data-test="JobsList"]') ||
      document.querySelector('[aria-label="Jobs List"]') ||
      document.body; // fallback to body if AB variant differs

    listObserver = new MutationObserver(() => {
      clearTimeout(watchList._tid);
      watchList._tid = setTimeout(() => {
        ensureButtons();
        if (isHidden) hideApplied(); // keep hiding newcomers
      }, 60);
    });

    listObserver.observe(root, { childList: true, subtree: true });
    ensureButtons();
  }

  /* -------------------- INIT -------------------- */
  function init() {
    chrome?.storage?.local?.get(
      [
        "glassdoorAppliedHidden",
        "glassdoorAppliedHiddenCount",
        "glassdoorAppliedBadgeVisible",
        "glassdoorAppliedIds",
      ],
      (res) => {
        isHidden = !!res?.glassdoorAppliedHidden;
        hiddenCount = Number(res?.glassdoorAppliedHiddenCount ?? 0);

        if (!isGlassdoorJobPage()) {
          if (listObserver) {
            listObserver.disconnect();
            listObserver = null;
          }
          removeAllMarkButtons();
          chrome?.storage?.local?.set({ glassdoorAppliedHiddenCount: 0, glassdoorHiddenAppliedCount: 0 });
          return;
        }

        if (res?.glassdoorAppliedBadgeVisible) {
          watchList();
          isHidden ? hideApplied() : writeCounts(); // sync counters/visibility
        } else {
          if (listObserver) {
            listObserver.disconnect();
            listObserver = null;
          }
          showApplied();
          removeAllMarkButtons();
        }
      }
    );
  }

  /* -------------------- STORAGE LISTENER -------------------- */
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    // Main ON/OFF hiding switch
    if ("glassdoorAppliedHidden" in changes) {
      const on = !!changes.glassdoorAppliedHidden.newValue;
      if (!isGlassdoorJobPage()) return;
      if (on) {
        hideApplied();
        watchList();
      } else {
        showApplied();
        if (listObserver) {
          listObserver.disconnect();
          listObserver = null;
        }
      }
    }

    // Badge (feature) visibility toggle
    if ("glassdoorAppliedBadgeVisible" in changes) {
      const visible = !!changes.glassdoorAppliedBadgeVisible.newValue;
      if (!isGlassdoorJobPage()) return;

      if (visible) {
        watchList();
        isHidden ? hideApplied() : writeCounts();
      } else {
        if (listObserver) {
          listObserver.disconnect();
          listObserver = null;
        }
        showApplied();
        removeAllMarkButtons();
      }
    }
  });

  /* -------------------- URL POLLER (SPA) -------------------- */
  setInterval(() => {
    const u = location.href;
    if (u === lastUrl) return;
    lastUrl = u;

    if (isGlassdoorJobPage()) {
      init();
    } else {
      if (listObserver) {
        listObserver.disconnect();
        listObserver = null;
      }
      removeAllMarkButtons();
      showApplied();
    }
  }, 1000);

  /* -------------------- Ensure badge-visible flag exists once -------------------- */
  chrome?.storage?.local?.get(["glassdoorAppliedBadgeVisible"], (r) => {
    if (typeof r?.glassdoorAppliedBadgeVisible === "undefined") {
      chrome.storage.local.set({ glassdoorAppliedBadgeVisible: true });
    }
  });

  /* -------------------- ENTRY -------------------- */
  window.addEventListener("load", init);
})();