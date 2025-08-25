// public/content-companies-indeed.js
/************************************************************
 * HideJobs – Indeed "Companies" helper (overlay + hide by company)
 * 
 * Storage keys used:
 *   - companiesBadgeVisible : boolean (controls injection on Indeed)
 *   - hiddenCompanies       : string[] (company names to hide)
 *   - overlaidJobIds        : string[] (cards currently showing the overlay)
 *
 * Page scope: Indeed job list pages only (excludes employers/profile/etc)
 ************************************************************/

(() => {
  console.log("[HideJobs] indeed companies logic loaded:", location.href);

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
   * Page detection – allow-list for Indeed job list pages
   * ────────────────────────────────────────────────────────── */
  function isIndeedJobPage(href = location.href) {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (!host.includes("indeed.")) return false;

    const blockedPaths = [
      "/companies",
      "/career/salaries",
      "/about",
      "/help",
      "/legal",
      "/cmp",
      "/survey",
      "/career",
      "/viewjob",
      "/notifications",
      "/contributions",
      "/career-advice",
      "/career-services",
    ];
    if (blockedPaths.some((p) => path.startsWith(p))) return false;

    const blockedHosts = new Set([
      "employers.indeed.com",
      "profile.indeed.com",
      "myjobs.indeed.com",
      "dd.indeed.com",
      "secure.indeed.com",
      "smartapply.indeed.com",
      "messages.indeed.com",
    ]);
    if (blockedHosts.has(host)) return false;

    return true;
  }

  /* ──────────────────────────────────────────────────────────
   * DOM helpers – find card/company elements
   * ────────────────────────────────────────────────────────── */
  function getJobCardFromAnchor(anchor) {
    const card = anchor.closest('div[data-testid="slider_item"]');
    return card || anchor;
  }

  function getJobCardListItem(card) {
    const li = card.closest("li");
    return li || card;
  }

  function getCompanyElement(jobCard) {
    return jobCard.querySelector('[data-testid="company-name"]');
  }

  function getStarRatingElement(jobCard) {
    let star = jobCard.querySelector('[data-testid="holistic-rating"]');
    if (!star) star = jobCard.querySelector('[role="img"][aria-label*="stars rating"]');
    return star;
  }

  /* ──────────────────────────────────────────────────────────
   * State + Observer
   * ────────────────────────────────────────────────────────── */
  let companiesBadgeVisible = false;
  let jobListObserver = null;
  let lastUrl = location.href;

  /* ──────────────────────────────────────────────────────────
   * CSS (scoped, one-time)
   * ────────────────────────────────────────────────────────── */
  (function injectHideJobsCSS() {
    if (document.getElementById("hidejobs-indeed-companies-style")) return;
    const style = document.createElement("style");
    style.id = "hidejobs-indeed-companies-style";
    style.textContent = `
      .hidejobs-hidden-by-company { display: none !important; }

      a.jcs-JobTitle:hover,
      .jcs-JobTitle:hover { text-decoration: none !important; }

      .hidejobs-footer-icon { position: relative; display: inline-flex; align-items: center; cursor: pointer; }

      /* tooltip variant when star rating exists */
      .hidejobs-hover-with-star { padding: 0px 7px !important; }
    `;
    document.head.appendChild(style);
  })();

  /* ──────────────────────────────────────────────────────────
   * Icon + overlay injection
   * ────────────────────────────────────────────────────────── */
  function injectFooterIcon(anchor) {
    const jobId = anchor.getAttribute("data-jk");
    if (!jobId) return;

    const jobCard = getJobCardFromAnchor(anchor);
    if (!jobCard) return;

    if (jobCard.querySelector(".hidejobs-footer-icon")) return;

    const starEl = getStarRatingElement(jobCard);
    const companyEl = getCompanyElement(jobCard);
    if (!companyEl) return;

    const insertTarget = starEl || companyEl;

    const footerIcon = document.createElement("li");
    footerIcon.className = "job-card-container__footer-item hidejobs-footer-icon";

    footerIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="18" height="18"
           fill="#0a66c2"
           class="bi bi-eye-slash-fill"
           viewBox="0 0 16 16"
           style="cursor:pointer;transition:fill .3s;position:absolute;left:10px;">
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

    // Tooltip
    const hoverMessage = document.createElement("div");
    hoverMessage.id = "hoverMessage";
    hoverMessage.textContent = "Mark to Hide";
    Object.assign(hoverMessage.style, {
      display: "none",
      color: "#ffffff",
      padding: "4px 7px",
      backgroundColor: "grey",
      borderRadius: "5px",
      position: "absolute",
      top: "-27px",
      left: "50%",
      transform: "translateX(-15%)",
      fontSize: "10px",
      zIndex: "999",
      transition: "opacity .3s ease",
      opacity: "0",
      whiteSpace: "nowrap",
    });

    const triangle = document.createElement("div");
    Object.assign(triangle.style, {
      position: "absolute",
      top: "100%",
      left: "30%",
      transform: "translateX(-50%)",
      borderWidth: "5px",
      borderStyle: "solid",
      borderColor: "grey transparent transparent transparent",
    });
    hoverMessage.appendChild(triangle);

    if (starEl) hoverMessage.classList.add("hidejobs-hover-with-star");

    let hoverTimeout;
    footerIcon.addEventListener("mouseenter", () => {
      hoverTimeout = setTimeout(() => {
        hoverMessage.style.display = "block";
        requestAnimationFrame(() => (hoverMessage.style.opacity = "1"));
      }, 700);
    });
    footerIcon.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimeout);
      hoverMessage.style.opacity = "0";
      setTimeout(() => (hoverMessage.style.display = "none"), 300);
    });

    footerIcon.appendChild(hoverMessage);

    const svgEl = footerIcon.querySelector("svg");
    footerIcon.addEventListener("mouseenter", () => (svgEl.style.fill = "#b10044"));
    footerIcon.addEventListener("mouseleave", () => (svgEl.style.fill = "#0a66c2"));

    footerIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      showOverlay(jobCard, jobId);
      chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
        const arr = res?.overlaidJobIds || [];
        if (!arr.includes(jobId)) {
          arr.push(jobId);
          chrome.storage.local.set({ overlaidJobIds: arr });
        }
      });
    });

    insertTarget.insertAdjacentElement("afterend", footerIcon);
  }

  /* ──────────────────────────────────────────────────────────
   * Overlay on job card
   * ────────────────────────────────────────────────────────── */
  function showOverlay(jobCard, jobId) {
    if (jobCard.querySelector(".hidejobs-overlay")) return;

    jobCard.style.pointerEvents = "none";
    const anchorsInside = jobCard.querySelectorAll("a");
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
      zIndex: "10",
      transition: "background-color .3s ease, backdrop-filter .3s ease",
      borderBottom: "1px solid #e8e8e8",
      pointerEvents: "auto",
    });

    overlay.addEventListener("mouseenter", () => {
      overlay.style.backgroundColor = "rgba(128,128,128,0.65)";
    });
    overlay.addEventListener("mouseleave", () => {
      overlay.style.backgroundColor = "rgba(128,128,128,0.5)";
    });

    setTimeout(() => {
      overlay.style.backgroundColor = "rgba(128,128,128,0.5)";
      overlay.style.backdropFilter = "blur(2px)";
    }, 10);

    overlay.addEventListener("click", (e) => {
      if (!e.target.closest(".hidejobs-message-button") && !e.target.closest(".hidejobs-close-button")) {
        overlay.style.transition = "opacity .3s ease";
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.remove();
          jobCard.style.pointerEvents = "";
          anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
          chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
            let arr = res?.overlaidJobIds || [];
            arr = arr.filter((id) => id !== jobId);
            chrome.storage.local.set({ overlaidJobIds: arr });
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
      overlay.style.transition = "opacity .3s ease";
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        jobCard.style.pointerEvents = "";
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
        chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
          let arr = res?.overlaidJobIds || [];
          arr = arr.filter((id) => id !== jobId);
          chrome.storage.local.set({ overlaidJobIds: arr });
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
    });

    messageButton.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        jobCard.style.pointerEvents = "";
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));

        chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
          let arr = res?.overlaidJobIds || [];
          arr = arr.filter((id) => id !== jobId);
          chrome.storage.local.set({ overlaidJobIds: arr });
        });

        const cardLi = getJobCardListItem(jobCard);
        cardLi.classList.add("hidejobs-hidden-by-company");

        const compEl = getCompanyElement(jobCard);
        const cName = compEl ? cleanCompanyName(compEl.textContent) : null;
        if (cName) {
          chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
            const hiddenCompanies = res?.hiddenCompanies || [];
            if (!hiddenCompanies.includes(cName)) {
              hiddenCompanies.push(cName);
              chrome.storage.local.set({ hiddenCompanies }, () => {
                hideJobsByCompany();
              });
            }
          });
          chrome?.runtime?.sendMessage?.({ action: "addToHideList", companyName: cName });
        }
      }, 300);
    });

    // Button text widths (company vs hover label)
    const compEl = getCompanyElement(jobCard);
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
      fontSize: ".875rem",
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
      backgroundColor: "#b10044",
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
      fontSize: "16px",
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

    jobCard.style.position = "relative";
    jobCard.appendChild(overlay);
  }

  /* ──────────────────────────────────────────────────────────
   * Apply / restore hidden-by-company state
   * ────────────────────────────────────────────────────────── */
  function hideJobsByCompany() {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const hiddenCompanies = res?.hiddenCompanies || [];
      const anchors = document.querySelectorAll('a[data-jk]');
      anchors.forEach((anchor) => {
        const card = getJobCardFromAnchor(anchor);
        const li = getJobCardListItem(card);
        const compEl = getCompanyElement(card);
        const cName = compEl ? cleanCompanyName(compEl.textContent) : "";
        if (hiddenCompanies.includes(cName)) {
          li.classList.add("hidejobs-hidden-by-company");
        } else {
          li.classList.remove("hidejobs-hidden-by-company");
        }
      });
    });
  }

  function restoreHiddenJobs() {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const hiddenCompanies = res?.hiddenCompanies || [];
      const anchors = document.querySelectorAll('a[data-jk]');
      anchors.forEach((anchor) => {
        const card = getJobCardFromAnchor(anchor);
        const li = getJobCardListItem(card);
        card.style.pointerEvents = "";
        const anchorsInside = card.querySelectorAll("a");
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
        const compEl = getCompanyElement(card);
        const cName = compEl ? cleanCompanyName(compEl.textContent) : "";
        if (hiddenCompanies.includes(cName)) {
          // remove hidden class (we're restoring)
          li.classList.remove("hidejobs-hidden-by-company");
        }
      });
    });
  }

  /* ──────────────────────────────────────────────────────────
   * Overlays management
   * ────────────────────────────────────────────────────────── */
  function removeAllOverlays() {
    chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
      const overlaidJobIds = res?.overlaidJobIds || [];
      const anchors = document.querySelectorAll('a[data-jk]');
      anchors.forEach((anchor) => {
        const jobId = anchor.getAttribute("data-jk");
        if (!jobId || !overlaidJobIds.includes(jobId)) return;
        const card = getJobCardFromAnchor(anchor);
        const overlay = card.querySelector(".hidejobs-overlay");
        if (overlay) overlay.remove();
        card.style.pointerEvents = "";
        const anchorsInside = card.querySelectorAll("a");
        anchorsInside.forEach((a) => (a.style.pointerEvents = ""));
      });
    });
  }

  function reapplyOverlays() {
    chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
      const overlaidJobIds = res?.overlaidJobIds || [];
      const anchors = document.querySelectorAll('a[data-jk]');
      anchors.forEach((anchor) => {
        const jobId = anchor.getAttribute("data-jk");
        if (jobId && overlaidJobIds.includes(jobId)) {
          const card = getJobCardFromAnchor(anchor);
          showOverlay(card, jobId);
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
    if (!companiesBadgeVisible || !isIndeedJobPage()) return;
    chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
      const overlaidJobIds = res?.overlaidJobIds || [];
      const anchors = document.querySelectorAll('a[data-jk]');
      anchors.forEach((anchor) => {
        const jobId = anchor.getAttribute("data-jk");
        if (!jobId) return;
        if (overlaidJobIds.includes(jobId)) {
          const card = getJobCardFromAnchor(anchor);
          showOverlay(card, jobId);
        }
        injectFooterIcon(anchor);
      });
    });
    hideJobsByCompany();
  }, 50);

  function observeJobListContainer() {
    if (!companiesBadgeVisible) return;
    if (jobListObserver) return;
    const mainContainer = document.getElementById("mosaic-provider-jobcards") || document.body;
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
   * Storage wiring
   * ────────────────────────────────────────────────────────── */
  chrome?.storage?.local?.get(["companiesBadgeVisible"], (res) => {
    companiesBadgeVisible = typeof res?.companiesBadgeVisible !== "undefined" ? !!res.companiesBadgeVisible : false;
    if (typeof res?.companiesBadgeVisible === "undefined") {
      chrome.storage.local.set({ companiesBadgeVisible });
    }

    if (companiesBadgeVisible && isIndeedJobPage()) {
      observeJobListContainer();
      hideJobsByCompany();
      reapplyOverlays();
    } else {
      restoreHiddenJobs();
      removeAllOverlays();
      removeFooterIcons();
      unobserveJobListContainer();
    }
  });

  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if ("companiesBadgeVisible" in changes) {
      companiesBadgeVisible = !!changes.companiesBadgeVisible.newValue;
      if (companiesBadgeVisible && isIndeedJobPage()) {
        observeJobListContainer();
        hideJobsByCompany();
        reapplyOverlays();
      } else {
        restoreHiddenJobs();
        removeAllOverlays();
        removeFooterIcons();
        unobserveJobListContainer();
      }
    }
  });

  /* ──────────────────────────────────────────────────────────
   * URL watcher (SPA)
   * ────────────────────────────────────────────────────────── */
  setInterval(() => {
    const u = location.href;
    if (u === lastUrl) return;
    lastUrl = u;

    if (isIndeedJobPage()) {
      if (companiesBadgeVisible) {
        observeJobListContainer();
        hideJobsByCompany();
        reapplyOverlays();
      }
    } else {
      restoreHiddenJobs();
      removeAllOverlays();
      removeFooterIcons();
      unobserveJobListContainer();
    }
  }, 1000);

  /* ──────────────────────────────────────────────────────────
   * Entry
   * ────────────────────────────────────────────────────────── */
  window.addEventListener("load", () => {
    if (!isIndeedJobPage()) return;
    if (companiesBadgeVisible) {
      hideJobsByCompany();
      reapplyOverlays();
      observeJobListContainer();
    } else {
      restoreHiddenJobs();
      removeAllOverlays();
    }
  });
})();
