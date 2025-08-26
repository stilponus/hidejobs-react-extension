// public/content-companies-glassdoor.js
/************************************************************
 * HideJobs – Glassdoor "Companies" helper (overlay + hide by company)
 *
 * ✅ IMPORTANT: The EYE ICON IS MANAGED BY THE TOGGLE (NOT THE BADGE).
 * This script only handles overlay UI and actual job card hiding/unhiding.
 *
 * Shared list / misc:
 *   - hiddenCompanies         : string[] (shared company list)
 *   - overlaidJobIds          : string[] (cards currently showing the overlay)
 *
 * We support BOTH old and new per-site keys so it works with either UI wiring:
 *   Badge visibility keys (either may be used by the UI):
 *     - glassdoorCompaniesBadgeVisible  (preferred for Glassdoor)
 *     - companiesBadgeVisible           (legacy/shared key)
 *
 *   Toggle keys (either may be used by the UI):
 *     - glassdoorCompaniesHidden        (preferred for Glassdoor)
 *     - companiesHidden                 (legacy/shared key)
 *
 *   Count keys (we update both so whichever the UI uses gets the value):
 *     - glassdoorCompaniesHiddenCount
 *     - companiesHiddenCount
 *
 * Page scope: Glassdoor job list pages only
 ************************************************************/

(() => {
  console.log("[HideJobs] glassdoor companies logic loaded:", location.href);

  /* ──────────────────────────────────────────────────────────
   * Keys + helpers (support old & new keys)
   * ────────────────────────────────────────────────────────── */
  const KEYS = {
    badgeVisible: ["glassdoorCompaniesBadgeVisible", "companiesBadgeVisible"],
    hidden: ["glassdoorCompaniesHidden", "companiesHidden"],
    count: ["glassdoorCompaniesHiddenCount", "companiesHiddenCount"],
    companies: "hiddenCompanies",
    overlaid: "overlaidJobIds",
  };

  function getFirst(obj, keys, fallback = undefined) {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    }
    return fallback;
  }
  function getFirstBool(obj, keys, fallback = false) {
    const v = getFirst(obj, keys, undefined);
    return typeof v === "undefined" ? fallback : !!v;
  }
  function setAll(keys, value, cb) {
    const toSet = {};
    keys.forEach((k) => (toSet[k] = value));
    chrome?.storage?.local?.set(toSet, cb);
  }

  /* ──────────────────────────────────────────────────────────
   * Utilities
   * ────────────────────────────────────────────────────────── */
  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function cleanCompanyName(rawName) {
    if (!rawName) return null;
    let name = rawName.trim();
    if (name.includes(" · ")) name = name.split(" · ")[0].trim();
    name = name.replace(/\(.*?\)/g, "").trim();
    return name || null;
  }

  /* ──────────────────────────────────────────────────────────
   * Page detection – allow-list for Glassdoor job list pages
   * ────────────────────────────────────────────────────────── */
  function isGlassdoorJobPage(href = location.href) {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (!host.includes("glassdoor.")) return false;

    const blockedPaths = [
      "/employers",
      "/about",
      "/help",
      "/legal",
      "/community",
      "/profile",
      "/account",
      "/survey",
      "/career-advice",
      "/salaries",
      "/reviews",
      "/photos",
    ];
    if (blockedPaths.some((p) => path.startsWith(p))) return false;

    const blockedHosts = new Set([
      "employers.glassdoor.com",
      "help.glassdoor.com",
    ]);
    if (blockedHosts.has(host)) return false;

    return true;
  }

  /* ──────────────────────────────────────────────────────────
   * DOM helpers – find card/company elements
   * ────────────────────────────────────────────────────────── */
  function getJobCards() {
    return document.querySelectorAll('li[data-test="jobListing"][data-jobid]');
  }

  function getJobId(jobCardLi) {
    return jobCardLi.getAttribute('data-jobid');
  }

  function getCompanyNameElement(jobCardLi) {
    const employerContainer = jobCardLi.querySelector('[id^="job-employer-"]');
    if (!employerContainer) return null;
    return employerContainer.querySelector('span');
  }

  function getRatingElement(jobCardLi) {
    return jobCardLi.querySelector('[class*="rating-single-star"]');
  }

  /* ──────────────────────────────────────────────────────────
   * State + Observer
   * ────────────────────────────────────────────────────────── */
  let badgeVisible = false; // from either *CompaniesBadgeVisible key
  let isOn = false;         // from either *CompaniesHidden key
  let hiddenCount = 0;
  const countedIds = new Set();
  let jobListObserver = null;
  let lastUrl = location.href;

  /* ──────────────────────────────────────────────────────────
   * CSS (scoped, one-time)
   * ────────────────────────────────────────────────────────── */
  (function injectHideJobsCSS() {
    if (document.getElementById("hidejobs-glassdoor-companies-style")) return;
    const style = document.createElement("style");
    style.id = "hidejobs-glassdoor-companies-style";
    style.textContent = `
      .hidejobs-hidden-by-company { display: none !important; }

      .hidejobs-footer-icon { 
        position: relative; 
        display: inline-flex; 
        align-items: center; 
        cursor: pointer; 
        margin-left: 8px;
        z-index: 2;
        pointer-events: auto;
      }

      .hidejobs-overlay { transition: opacity .3s ease; }
    `;
    document.head.appendChild(style);
  })();

  /* ──────────────────────────────────────────────────────────
   * Icon + overlay injection (eye managed by toggle, not badge)
   * ────────────────────────────────────────────────────────── */
  function injectFooterIcon(jobCardLi) {
    const jobId = getJobId(jobCardLi);
    if (!jobId) return;

    if (jobCardLi.querySelector(".hidejobs-footer-icon")) return;

    const companyEl = getCompanyNameElement(jobCardLi);
    if (!companyEl) return;

    const footerIcon = document.createElement("span");
    footerIcon.className = "hidejobs-footer-icon";

    footerIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="18" height="18"
           fill="#28507c"
           class="bi bi-eye-slash-fill"
           viewBox="0 0 16 16"
           style="cursor:pointer;transition:fill .3s ease;">
        <path d="m10.79 12.912-1.614-1.615a3.5 3.5 
                 0 0 1-4.474-4.474l-2.06-2.06C.938 
                 6.278 0 8 0 8s3 5.5 8 
                 5.5a7 7 0 0 0 
                 2.79-.588M5.21 3.088A7 7 0 0 
                 1 8 2.5c5 0 8 5.5 8 
                 5.5s-.939 1.721-2.641 
                 3.238l-2.062-2.062a3.5 3.5 0 
                 0 0-4.474-4.474z"></path>
        <path d="M5.525 7.646a2.5 2.5 0 
                 0 0 2.829 2.829zm4.95.708-2.829-2.83a2.5 
                 2.5 0 0 1 2.829 2.829zm3.171 
                 6-12-12 .708-.708 12 12z"></path>
      </svg>
    `;

    const svgEl = footerIcon.querySelector("svg");
    footerIcon.addEventListener("mouseenter", () => (svgEl.style.fill = "#d40048"));
    footerIcon.addEventListener("mouseleave", () => (svgEl.style.fill = "#28507c"));

    footerIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      showOverlay(jobCardLi, jobId);
      chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
        const arr = res?.[KEYS.overlaid] || [];
        if (!arr.includes(jobId)) {
          arr.push(jobId);
          chrome.storage.local.set({ [KEYS.overlaid]: arr });
        }
      });
    });

    // Insert after rating or company name
    const ratingEl = getRatingElement(jobCardLi);
    const insertTarget = ratingEl || companyEl;
    insertTarget.insertAdjacentElement("afterend", footerIcon);
  }

  /* ──────────────────────────────────────────────────────────
   * Overlay on job card
   * ────────────────────────────────────────────────────────── */
  function showOverlay(jobCardLi, jobId) {
    if (jobCardLi.querySelector(".hidejobs-overlay")) return;

    jobCardLi.style.pointerEvents = "none";
    const anchorsInside = jobCardLi.querySelectorAll("a");
    anchorsInside.forEach((a) => (a.style.pointerEvents = "none"));

    const overlay = document.createElement("div");
    overlay.className = "hidejobs-overlay";
    Object.assign(overlay.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(128,128,128,0)",
      backdropFilter: "blur(0px)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "3",
      transition: "background-color .3s ease, backdrop-filter .3s ease, opacity .3s ease",
      borderBottom: "1px solid #e8e8e8",
      borderRadius: "8px",
      pointerEvents: "auto",
      opacity: "0",
    });

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      overlay.style.backgroundColor = "rgba(128,128,128,0.5)";
      overlay.style.backdropFilter = "blur(2px)";
    });

    overlay.addEventListener("mouseenter", () => {
      overlay.style.backgroundColor = "rgba(128,128,128,0.65)";
    });
    overlay.addEventListener("mouseleave", () => {
      overlay.style.backgroundColor = "rgba(128,128,128,0.5)";
    });

    overlay.addEventListener("click", (e) => {
      if (!e.target.closest(".hidejobs-message-button") && !e.target.closest(".hidejobs-close-button")) {
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.remove();
          jobCardLi.style.pointerEvents = "";
          anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
          chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
            let arr = res?.[KEYS.overlaid] || [];
            arr = arr.filter((id) => id !== jobId);
            chrome.storage.local.set({ [KEYS.overlaid]: arr });
          });
        }, 300);
      }
    });

    // Close button
    const closeButton = document.createElement("div");
    closeButton.className = "hidejobs-close-button";
    closeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
           fill="currentColor" class="bi bi-x" viewBox="0 0 16 16">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 
                 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 
                 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 
                 0 0 1-.708-.708L7.293 8 4.646 
                 5.354a.5.5 0 0 1 0-.708"/>
      </svg>
    `;
    Object.assign(closeButton.style, {
      position: "absolute",
      top: "7px",
      right: "8px",
      cursor: "pointer",
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background-color .3s ease",
      borderRadius: "50%",
      backgroundColor: "rgba(255,255,255,.3)",
    });
    closeButton.addEventListener("mouseenter", () => (closeButton.style.backgroundColor = "rgba(255,255,255,.5)"));
    closeButton.addEventListener("mouseleave", () => (closeButton.style.backgroundColor = "rgba(255,255,255,.3)"));
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        jobCardLi.style.pointerEvents = "";
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
        chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
          let arr = res?.[KEYS.overlaid] || [];
          arr = arr.filter((id) => id !== jobId);
          chrome.storage.local.set({ [KEYS.overlaid]: arr });
        });
      }, 300);
    });

    // "Hide Company" button
    const messageButton = document.createElement("button");
    messageButton.className = "hidejobs-message-button";
    Object.assign(messageButton.style, {
      backgroundColor: "#fff",
      padding: "12px 15px",
      borderRadius: "50px",
      boxShadow: "0 4px 8px rgba(0,0,0,.2)",
      cursor: "pointer",
      position: "relative",
      whiteSpace: "nowrap",
      overflow: "hidden",
      transition: "width .3s ease, opacity .3s ease",
      margin: "0 15px",
      border: "none",
      outline: "none",
    });

    messageButton.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      // Turn ON feature via toggle state (so the list starts hiding)
      if (!isOn) {
        isOn = true;
        setAll(KEYS.hidden, true);
      }

      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        jobCardLi.style.pointerEvents = "";
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));

        chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
          let arr = res?.[KEYS.overlaid] || [];
          arr = arr.filter((id) => id !== jobId);
          chrome.storage.local.set({ [KEYS.overlaid]: arr });
        });

        jobCardLi.classList.add("hidejobs-hidden-by-company");

        const compEl = getCompanyNameElement(jobCardLi);
        const cName = compEl ? cleanCompanyName(compEl.textContent) : null;
        if (cName) {
          chrome?.storage?.local?.get([KEYS.companies], (res) => {
            const hiddenCompanies = res?.[KEYS.companies] || [];
            if (!hiddenCompanies.includes(cName)) {
              hiddenCompanies.push(cName);
            }
            chrome.storage.local.set({ [KEYS.companies]: hiddenCompanies }, () => {
              hideJobsByCompany(); // recount + apply immediately
              chrome?.runtime?.sendMessage?.({ action: "addToHideList", companyName: cName });
            });
          });
        }
      }, 300);
    });

    // Button text widths (company vs hover label)
    const compEl = getCompanyNameElement(jobCardLi);
    const cName = compEl ? cleanCompanyName(compEl.textContent) : "this company";
    const hoverTextContent = "Hide Company";

    const tmp = document.createElement("span");
    Object.assign(tmp.style, { visibility: "hidden", position: "absolute", whiteSpace: "nowrap", fontSize: "14px" });
    tmp.textContent = cName;
    document.body.appendChild(tmp);
    const companyTextWidth = tmp.offsetWidth + 40;
    tmp.textContent = hoverTextContent;
    const hoverTextWidth = tmp.offsetWidth + 60;
    document.body.removeChild(tmp);

    messageButton.style.width = `${companyTextWidth}px`;

    const companyText = document.createElement("span");
    companyText.textContent = cName;
    Object.assign(companyText.style, {
      transition: "opacity .3s ease",
      opacity: "1",
      zIndex: "2",
      fontSize: "0.875rem",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "calc(100% - 30px)",
    });
    messageButton.appendChild(companyText);

    const curtain = document.createElement("div");
    Object.assign(curtain.style, {
      position: "absolute",
      top: "-5%",
      right: "-5%",
      width: "110%",
      height: "110%",
      backgroundColor: "#d40048",
      borderRadius: "50px",
      transform: "translateX(100%)",
      transition: "transform .3s ease",
    });
    messageButton.appendChild(curtain);

    const hoverText = document.createElement("span");
    hoverText.textContent = hoverTextContent;
    Object.assign(hoverText.style, {
      position: "absolute",
      color: "#fff",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      whiteSpace: "nowrap",
      opacity: "0",
      transition: "opacity .3s ease",
      zIndex: "3",
      fontWeight: "600",
      fontSize: "0.95rem",
    });
    messageButton.appendChild(hoverText);

    messageButton.addEventListener("mouseenter", () => {
      curtain.style.transform = "translateX(0)";
      companyText.style.opacity = "0";
      hoverText.style.opacity = "1";
      messageButton.style.width = `${hoverTextWidth}px`;
    });
    messageButton.addEventListener("mouseleave", () => {
      curtain.style.transform = "translateX(100%)";
      hoverText.style.opacity = "0";
      messageButton.style.width = `${companyTextWidth}px`;
      setTimeout(() => (companyText.style.opacity = "1"), 300);
    });

    overlay.appendChild(messageButton);
    overlay.appendChild(closeButton);

    jobCardLi.style.position = "relative";
    jobCardLi.appendChild(overlay);
  }

  /* ──────────────────────────────────────────────────────────
   * Apply / restore hidden-by-company state + counting
   * ────────────────────────────────────────────────────────── */
  function writeCount() {
    setAll(KEYS.count, hiddenCount);
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  function hideJobsByCompany() {
    if (!isOn) {
      // If the toggle is OFF, keep everything visible.
      restoreHiddenJobs();
      hiddenCount = 0;
      countedIds.clear();
      writeCount();
      return;
    }

    chrome?.storage?.local?.get([KEYS.companies], (res) => {
      const hiddenCompanies = res?.[KEYS.companies] || [];

      const jobCards = getJobCards();
      hiddenCount = 0;
      countedIds.clear();

      jobCards.forEach((jobCardLi) => {
        const compEl = getCompanyNameElement(jobCardLi);
        const cName = compEl ? cleanCompanyName(compEl.textContent) : "";

        if (hiddenCompanies.includes(cName)) {
          jobCardLi.classList.add("hidejobs-hidden-by-company");

          const id = getJobId(jobCardLi) || "";
          if (id && !countedIds.has(id)) {
            countedIds.add(id);
            hiddenCount++;
          }
        } else {
          jobCardLi.classList.remove("hidejobs-hidden-by-company");
        }
      });

      writeCount();
    });
  }

  function restoreHiddenJobs() {
    const jobCards = getJobCards();
    jobCards.forEach((jobCardLi) => {
      jobCardLi.style.pointerEvents = "";
      jobCardLi.querySelectorAll("a").forEach((a) => (a.style.pointerEvents = ""));
      jobCardLi.classList.remove("hidejobs-hidden-by-company");
    });

    hiddenCount = 0;
    countedIds.clear();
    writeCount();
  }

  /* ──────────────────────────────────────────────────────────
   * Overlays management
   * ────────────────────────────────────────────────────────── */
  function removeAllOverlays() {
    chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
      const overlaidJobIds = res?.[KEYS.overlaid] || [];
      const jobCards = getJobCards();
      jobCards.forEach((jobCardLi) => {
        const jobId = getJobId(jobCardLi);
        if (!jobId || !overlaidJobIds.includes(jobId)) return;
        const overlay = jobCardLi.querySelector(".hidejobs-overlay");
        if (overlay) overlay.remove();
        jobCardLi.style.pointerEvents = "";
        const anchorsInside = jobCardLi.querySelectorAll("a");
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
      });
    });
  }

  function reapplyOverlays() {
    chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
      const overlaidJobIds = res?.[KEYS.overlaid] || [];
      const jobCards = getJobCards();
      jobCards.forEach((jobCardLi) => {
        const jobId = getJobId(jobCardLi);
        if (jobId && overlaidJobIds.includes(jobId)) {
          showOverlay(jobCardLi, jobId);
        }
      });
    });
  }

  function removeFooterIcons() {
    document.querySelectorAll(".hidejobs-footer-icon").forEach((el) => el.remove());
  }

  /* ──────────────────────────────────────────────────────────
   * Injection + Observation
   * ────────────────────────────────────────────────────────── */
  const ensureInjected = debounce(() => {
    if (!badgeVisible || !isGlassdoorJobPage()) return;

    // The EYE icon/overlay may be used regardless of ON/OFF; hiding only occurs when isOn=true.
    chrome?.storage?.local?.get([KEYS.overlaid], (res) => {
      const overlaidJobIds = res?.[KEYS.overlaid] || [];
      const jobCards = getJobCards();
      jobCards.forEach((jobCardLi) => {
        const jobId = getJobId(jobCardLi);
        if (!jobId) return;
        if (overlaidJobIds.includes(jobId)) {
          showOverlay(jobCardLi, jobId);
        }
        injectFooterIcon(jobCardLi);
      });
    });

    // Apply/clear hidden state according to toggle
    if (isOn) hideJobsByCompany();
    else restoreHiddenJobs();
  }, 100);

  function observeJobListContainer() {
    if (!badgeVisible) return;
    if (jobListObserver) return;
    const mainContainer = document.body;
    jobListObserver = new MutationObserver(() => ensureInjected());
    jobListObserver.observe(mainContainer, { childList: true, subtree: true });

    // initial pass
    ensureInjected();
  }

  function unobserveJobListContainer() {
    if (jobListObserver) {
      jobListObserver.disconnect();
      jobListObserver = null;
    }
  }

  /* ──────────────────────────────────────────────────────────
   * Storage wiring (handle either set of keys)
   * ────────────────────────────────────────────────────────── */
  function applyStoredState() {
    if (!isGlassdoorJobPage()) {
      restoreHiddenJobs();
      removeAllOverlays();
      removeFooterIcons();
      unobserveJobListContainer();
      return;
    }

    chrome?.storage?.local?.get(
      [...KEYS.badgeVisible, ...KEYS.hidden, ...KEYS.count],
      (res) => {
        // If BOTH badge keys are undefined, default to false (no badge)
        const badgeV = getFirst(res, KEYS.badgeVisible, undefined);
        badgeVisible = typeof badgeV === "undefined" ? false : !!badgeV;

        // Toggle ON/OFF
        isOn = getFirstBool(res, KEYS.hidden, false);

        // Count (we'll recompute anyway, but keep storage in sync)
        const countV = getFirst(res, KEYS.count, 0);
        hiddenCount = Number(countV || 0);

        if (badgeVisible) {
          observeJobListContainer();
          ensureInjected();
          reapplyOverlays();
        } else {
          restoreHiddenJobs();
          removeAllOverlays();
          removeFooterIcons();
          unobserveJobListContainer();
        }

        // keep both counts in sync
        writeCount();
      }
    );
  }

  // Initial read
  applyStoredState();

  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    let touched = false;

    // Badge visibility changes (either key)
    for (const k of KEYS.badgeVisible) {
      if (k in changes) {
        badgeVisible = !!changes[k].newValue;
        touched = true;
      }
    }

    // Toggle changes (either key)
    for (const k of KEYS.hidden) {
      if (k in changes) {
        isOn = !!changes[k].newValue;
        touched = true;
      }
    }

    // Shared companies list changed
    if (KEYS.companies in changes) {
      touched = true;
    }

    if (!touched) return;

    if (!isGlassdoorJobPage()) {
      restoreHiddenJobs();
      removeAllOverlays();
      removeFooterIcons();
      unobserveJobListContainer();
      return;
    }

    if (badgeVisible) {
      ensureInjected();
      observeJobListContainer();
      reapplyOverlays();
    } else {
      restoreHiddenJobs();
      removeAllOverlays();
      removeFooterIcons();
      unobserveJobListContainer();
    }
  });

  /* ──────────────────────────────────────────────────────────
   * Message handling for unhiding specific companies
   * ────────────────────────────────────────────────────────── */
  chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.action === "REMOVE_FROM_HIDELIST" || message?.action === "UNHIDE_JOB_BY_COMPANY") {
      // Immediately unhide jobs from this specific company
      const companyName = message.companyName;

      // Find and unhide jobs from this company right away
      const jobCards = getJobCards();
      jobCards.forEach((jobCardLi) => {
        const compEl = getCompanyNameElement(jobCardLi);
        const company = compEl ? cleanCompanyName(compEl.textContent) : "";
        if (company === companyName) {
          jobCardLi.classList.remove("hidejobs-hidden-by-company");
          jobCardLi.style.pointerEvents = "";
          const anchorsInside = jobCardLi.querySelectorAll("a");
          anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
        }
      });

      // Update storage (this will be handled by your React component, but ensure consistency)
      chrome?.storage?.local?.get([KEYS.companies], (res) => {
        const arr = (res?.[KEYS.companies] || []).filter((nm) => nm !== companyName);
        hiddenCount = 0;
        countedIds.clear();
        chrome?.storage?.local?.set({ [KEYS.companies]: arr }, () => {
          // Recount remaining hidden jobs
          hideJobsByCompany();
        });
      });

      sendResponse?.({ status: "success" });
      return true;
    }
  });

  /* ──────────────────────────────────────────────────────────
   * URL watcher (SPA)
   * ────────────────────────────────────────────────────────── */
  setInterval(() => {
    const u = location.href;
    if (u === lastUrl) return;
    lastUrl = u;
    applyStoredState();
  }, 1000);

  /* ──────────────────────────────────────────────────────────
   * Entry
   * ────────────────────────────────────────────────────────── */
  window.addEventListener("load", applyStoredState);
})();