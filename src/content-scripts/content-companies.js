// ------------------------------
// Companies filter logic (counts + DOM). Badge is React component in shadow UI.
// ------------------------------
(() => {
  console.log("[HideJobs] companies logic loaded:", location.href);

  // ===== helpers =====
  const isJobPage = () =>
    location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    location.href.startsWith("https://www.linkedin.com/jobs/collections");

  function debounce(func, delay) {
    let t;
    return function () {
      clearTimeout(t);
      const ctx = this, args = arguments;
      t = setTimeout(() => func.apply(ctx, args), delay);
    };
  }

  function cleanCompanyName(raw) {
    if (!raw) return null;
    let name = String(raw).trim();
    if (name.includes(" · ")) name = name.split(" · ")[0].trim();
    name = name.replace(/\(.*?\)/g, "").trim();
    return name || null;
  }

  // ===== state =====
  let hiddenCount = 0;                 // companiesHiddenCount
  let countedIds = new Set();          // prevent double-count
  let lastUrl = location.href;

  let badgeVisible = false;            // companiesBadgeVisible
  let isOn = false;                    // companiesHidden
  let jobListObserver = null;

  // overlay bookkeeping
  let slowLoadRetryCount = 0;
  const slowLoadMaxRetries = 10;
  let slowLoadInterval = null;

  // ===== CSS for hidden cards (class) =====
  function injectHideJobsCSS() {
    if (document.getElementById("hidejobs-style-companies")) return;
    const style = document.createElement("style");
    style.id = "hidejobs-style-companies";
    style.textContent = `
      .hidejobs-hidden-by-company { display: none !important; }
      .hidejobs-overlay { transition: opacity .3s ease; }
    `;
    document.head.appendChild(style);
  }

  // ===== LAYOUT DETECTION =====
  function isLayout1(card) {
    return !!card.getAttribute("data-occludable-job-id");
  }

  // ===== FOOTER ICON =====
  function injectFooterIcon(jobCard) {
    const jobId =
      jobCard.getAttribute("data-occludable-job-id") ||
      jobCard.getAttribute("data-job-id");
    if (!jobId) return;

    const layout1 = isLayout1(jobCard);

    const footer = jobCard.querySelector(
      ".job-card-container__footer-wrapper, .job-card-job-posting-card-wrapper__footer-items"
    );
    if (!footer) return;

    if (footer.querySelector(".hidejobs-footer-icon")) return;

    const leftPosition = layout1 ? "10px" : "0px";

    const li = document.createElement("li");
    li.className = "job-card-container__footer-item hidejobs-footer-icon";
    li.style.position = "relative";
    li.style.display = "inline-flex";
    li.style.alignItems = "center";
    li.style.cursor = "pointer";

    li.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
           fill="#0a66c2" class="bi bi-eye-slash-fill" viewBox="0 0 16 16"
           style="cursor:pointer; transition: fill .3s ease; position:absolute; left:${leftPosition}">
        <path d="m10.79 12.912-1.614-1.615 a3.5 3.5 0 0 1-4.474-4.474 l-2.06-2.06 C.938 6.278 0 8 0 8 s3 5.5 8 5.5 a7 7 0 0 0 2.79-.588 M5.21 3.088 A7 7 0 0 1 8 2.5 c5 0 8 5.5 8 5.5 s-.939 1.721 -2.641 3.238 l-2.062-2.062 a3.5 3.5 0 0 0 -4.474-4.474z"/>
        <path d="M5.525 7.646 a2.5 2.5 0 0 0 2.829 2.829 zm4.95.708-2.829-2.83 a2.5 2.5 0 0 1 2.829 2.829 zm3.171 6-12-12 .708-.708 12 12z"/>
      </svg>
    `;

    // hover tooltip
    const hover = document.createElement("div");
    hover.id = "hoverMessage";
    hover.textContent = "Mark to Hide";
    hover.style.display = "none";
    hover.style.color = "#ffffff";
    hover.style.padding = "4px 7px";
    hover.style.backgroundColor = "grey";
    hover.style.borderRadius = "5px";
    hover.style.position = "absolute";
    hover.style.top = "-27px";
    hover.style.left = "50%";
    hover.style.transform = "translateX(-15%)";
    hover.style.fontSize = "10px";
    hover.style.zIndex = "999";
    hover.style.transition = "opacity .3s ease";
    hover.style.opacity = "0";
    hover.style.whiteSpace = "nowrap";

    const triangle = document.createElement("div");
    triangle.style.position = "absolute";
    triangle.style.top = "100%";
    triangle.style.left = "30%";
    triangle.style.transform = "translateX(-50%)";
    triangle.style.borderWidth = "5px";
    triangle.style.borderStyle = "solid";
    triangle.style.borderColor = "grey transparent transparent transparent";
    hover.appendChild(triangle);

    let t;
    li.addEventListener("mouseenter", () => {
      li.querySelector("svg").style.fill = "#b10044";
      t = setTimeout(() => {
        hover.style.display = "block";
        setTimeout(() => (hover.style.opacity = "1"), 10);
      }, 700);
    });
    li.addEventListener("mouseleave", () => {
      li.querySelector("svg").style.fill = "#0a66c2";
      clearTimeout(t);
      hover.style.opacity = "0";
      setTimeout(() => (hover.style.display = "none"), 300);
    });

    li.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      showOverlay(jobCard);
      chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
        const arr = res?.overlaidJobIds || [];
        if (!arr.includes(jobId)) arr.push(jobId);
        chrome?.storage?.local?.set({ overlaidJobIds: arr });
      });
    });

    li.appendChild(hover);

    const last = footer.querySelector(
      "li.job-card-container__footer-item:last-of-type, li.job-card-job-posting-card-wrapper__footer-item:last-of-type"
    );
    if (last) last.insertAdjacentElement("afterend", li);
    else footer.appendChild(li);
  }

  function removeFooterIcons() {
    document.querySelectorAll(".hidejobs-footer-icon").forEach((x) => x.remove());
  }

  // ===== OVERLAY =====
  function showOverlay(jobCard) {
    const jobCardLi = jobCard.closest(
      "li[data-occludable-job-id], li[data-job-id], .job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id]"
    );
    if (!jobCardLi) return;
    if (jobCardLi.querySelector(".hidejobs-overlay")) return;

    const jobId =
      jobCardLi.getAttribute("data-occludable-job-id") ||
      jobCardLi.getAttribute("data-job-id") ||
      "";

    const layout1 = isLayout1(jobCard);

    const overlay = document.createElement("div");
    overlay.className = "hidejobs-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.backgroundColor = "rgba(128,128,128,0)";
    overlay.style.backdropFilter = "blur(0px)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "10";
    overlay.style.borderBottom = "1px solid #e8e8e8";
    overlay.style.transition = "background-color 0.3s ease, backdrop-filter 0.3s ease, opacity 0.3s ease";
    overlay.style.opacity = "0";

    if (layout1) {
      if (jobCardLi === jobCardLi.parentElement.firstElementChild) {
        overlay.style.top = "-1px";
        overlay.style.height = "calc(100% + 2px)";
      } else {
        overlay.style.top = "1px";
        overlay.style.height = "100%";
      }
    } else {
      overlay.style.top = "0";
      overlay.style.height = "100%";
    }

    overlay.addEventListener("mouseenter", () => {
      overlay.style.backgroundColor = "rgba(128, 128, 128, 0.65)";
    });
    overlay.addEventListener("mouseleave", () => {
      overlay.style.backgroundColor = "rgba(128, 128, 128, 0.5)";
    });

    // Smooth fade-in animation
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      overlay.style.backgroundColor = "rgba(128, 128, 128, 0.5)";
      overlay.style.backdropFilter = "blur(2px)";
    });

    overlay.addEventListener("click", (ev) => {
      if (!ev.target.closest(".hidejobs-message-button") && !ev.target.closest(".hidejobs-close-button")) {
        overlay.style.opacity = "0";
        setTimeout(() => {
          overlay.remove();
          chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
            const arr = res?.overlaidJobIds || [];
            chrome?.storage?.local?.set({ overlaidJobIds: arr.filter((id) => id !== jobId) });
          });
        }, 300);
      }
    });

    // close button
    const closeButton = document.createElement("div");
    closeButton.className = "hidejobs-close-button";
    closeButton.innerHTML = `
      <svg role="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
           viewBox="0 0 16 16" data-supported-dps="16x16" style="fill: white;">
        <use href="#close-small" width="16" height="16"></use>
      </svg>
    `;
    closeButton.style.position = "absolute";
    if (layout1) {
      if (jobCardLi === jobCardLi.parentElement.firstElementChild) {
        closeButton.style.top = "9px";
      } else {
        closeButton.style.top = "7px";
      }
      closeButton.style.right = "8px";
    } else {
      closeButton.style.top = "8px";
      closeButton.style.right = "4px";
    }
    closeButton.style.cursor = "pointer";
    closeButton.style.width = "32px";
    closeButton.style.height = "32px";
    closeButton.style.display = "flex";
    closeButton.style.alignItems = "center";
    closeButton.style.justifyContent = "center";
    closeButton.style.borderRadius = "50%";
    closeButton.style.backgroundColor = "rgba(255,255,255,0.3)";
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.backgroundColor = "rgba(255,255,255,0.5)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.backgroundColor = "rgba(255,255,255,0.3)";
    });
    closeButton.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
          const arr = res?.overlaidJobIds || [];
          chrome?.storage?.local?.set({ overlaidJobIds: arr.filter((id) => id !== jobId) });
        });
      }, 300);
    });

    // big "Hide Company" button
    const btn = document.createElement("button");
    btn.className = "hidejobs-message-button";
    btn.style.backgroundColor = "#fff";
    btn.style.padding = "12px 15px";
    btn.style.borderRadius = "50px";
    btn.style.boxShadow = "0px 4px 8px rgba(0,0,0,0.2)";
    btn.style.cursor = "pointer";
    btn.style.position = "relative";
    btn.style.whiteSpace = "nowrap";
    btn.style.overflow = "hidden";
    btn.style.transition = "width 0.3s ease, opacity 0.3s ease";
    btn.style.margin = "0px 55px";

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();

      // If feature is OFF, turn it ON
      if (!isOn) {
        isOn = true;
        chrome?.storage?.local?.set({ companiesHidden: true });
        applyHidden();
      }

      try {
        const companyEl = jobCardLi.querySelector(
          ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle span, " +
          ".artdeco-entity-lockup__subtitle div"
        );

        const companyName = cleanCompanyName(companyEl?.textContent);
        if (!companyName) return;

        const overlayRef = jobCardLi.querySelector(".hidejobs-overlay");
        if (overlayRef) {
          overlayRef.style.opacity = "0";
          setTimeout(() => {
            overlayRef.remove();
            chrome?.storage?.local?.get(["overlaidJobIds"], (res2) => {
              const arr = res2?.overlaidJobIds || [];
              chrome?.storage?.local?.set({ overlaidJobIds: arr.filter((id) => id !== jobId) });
            });

            jobCardLi.classList.add("hidejobs-hidden-by-company");
            chrome?.storage?.local?.get(["hiddenCompanies"], (r2) => {
              const hiddenCompanies = r2?.hiddenCompanies || [];
              if (!hiddenCompanies.includes(companyName)) {
                hiddenCompanies.push(companyName);
                chrome?.storage?.local?.set({ hiddenCompanies }, () => {
                  hideByCompany();
                  chrome?.runtime?.sendMessage?.({ action: "addToHideList", companyName });
                });
              }
            });
          }, 300);
        } else {
          jobCardLi.classList.add("hidejobs-hidden-by-company");
          chrome?.storage?.local?.get(["hiddenCompanies"], (r2) => {
            const hiddenCompanies = r2?.hiddenCompanies || [];
            if (!hiddenCompanies.includes(companyName)) {
              hiddenCompanies.push(companyName);
              chrome?.storage?.local?.set({ hiddenCompanies }, () => {
                hideByCompany();
                chrome?.runtime?.sendMessage?.({ action: "addToHideList", companyName });
              });
            }
          });
        }
      } catch (e) {
        // noop
      }
    });

    // measure text widths for button animation
    const companyEl = jobCardLi.querySelector(
      ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], " +
      ".artdeco-entity-lockup__subtitle div[dir='ltr'], " +
      ".artdeco-entity-lockup__subtitle span, " +
      ".artdeco-entity-lockup__subtitle div"
    );
    const cname = cleanCompanyName(companyEl?.textContent) || "this company";
    const htext = "Hide Company";

    const temp = document.createElement("span");
    temp.style.visibility = "hidden";
    temp.style.position = "absolute";
    temp.style.whiteSpace = "nowrap";
    temp.style.fontSize = "14px";
    temp.textContent = cname;
    document.body.appendChild(temp);
    const w1 = temp.offsetWidth + 40;
    temp.textContent = htext;
    const w2 = temp.offsetWidth + 60;
    document.body.removeChild(temp);

    btn.style.width = `${w1}px`;

    const companyText = document.createElement("span");
    companyText.textContent = cname;
    companyText.style.transition = "opacity .3s ease";
    companyText.style.opacity = "1";
    companyText.style.zIndex = "2";
    companyText.style.fontSize = "1.4rem";
    companyText.style.whiteSpace = "nowrap";
    companyText.style.overflow = "hidden";
    companyText.style.textOverflow = "ellipsis";
    companyText.style.maxWidth = "calc(100% - 30px)";
    btn.appendChild(companyText);

    const curtain = document.createElement("div");
    curtain.style.position = "absolute";
    curtain.style.top = "-5%";
    curtain.style.right = "-5%";
    curtain.style.width = "110%";
    curtain.style.height = "110%";
    curtain.style.backgroundColor = "#b10044";
    curtain.style.borderRadius = "50px";
    curtain.style.transform = "translateX(100%)";
    curtain.style.transition = "transform .3s ease";
    btn.appendChild(curtain);

    const hoverText = document.createElement("span");
    hoverText.textContent = htext;
    hoverText.style.position = "absolute";
    hoverText.style.color = "#fff";
    hoverText.style.top = "50%";
    hoverText.style.left = "50%";
    hoverText.style.transform = "translate(-50%, -50%)";
    hoverText.style.whiteSpace = "nowrap";
    hoverText.style.opacity = "0";
    hoverText.style.transition = "opacity .3s ease";
    hoverText.style.zIndex = "3";
    hoverText.style.fontWeight = "600";
    hoverText.style.fontSize = "1.6rem";
    btn.appendChild(hoverText);

    btn.addEventListener("mouseenter", () => {
      curtain.style.transform = "translateX(0)";
      companyText.style.opacity = "0";
      hoverText.style.opacity = "1";
      btn.style.width = `${w2}px`;
    });
    btn.addEventListener("mouseleave", () => {
      curtain.style.transform = "translateX(100%)";
      hoverText.style.opacity = "0";
      btn.style.width = `${w1}px`;
      setTimeout(() => (companyText.style.opacity = "1"), 300);
    });

    overlay.appendChild(btn);
    overlay.appendChild(closeButton);
    jobCardLi.style.position = "relative";
    jobCardLi.appendChild(overlay);
  }

  function removeAllOverlays() {
    document.querySelectorAll(".hidejobs-overlay").forEach((x) => x.remove());
  }

  function injectCustomContainer() {
    if (!badgeVisible) return;

    chrome?.storage?.local?.get(["overlaidJobIds"], (result) => {
      const overlaid = result?.overlaidJobIds || [];

      const cards1 = document.querySelectorAll("li[data-occludable-job-id]");
      const cards2 = document.querySelectorAll("li[data-job-id]");
      const cards3 = document.querySelectorAll(".job-card-job-posting-card-wrapper[data-job-id]");
      const cards4 = document.querySelectorAll(".job-card-container[data-job-id]");
      let all = [...cards1, ...cards2, ...cards3, ...cards4];
      all = Array.from(new Set(all));

      // skip nested duplicates for layout1
      all = all.filter((card) => {
        const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
        const parent = card.closest("li[data-occludable-job-id], li[data-job-id]");
        if (parent && parent !== card) {
          const pid = parent.getAttribute("data-occludable-job-id") || parent.getAttribute("data-job-id");
          if (pid === id) return false;
        }
        return true;
      });

      all.forEach((card) => {
        const rawId = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
        if (rawId === "search") return; // skip discovery placeholders
        if (overlaid.includes(rawId)) showOverlay(card);
        injectFooterIcon(card);
      });
    });
  }

  // ===== HIDE / RESTORE by company =====
  function updateCountStorage() {
    chrome?.storage?.local?.set({
      companiesHiddenCount: hiddenCount,
    });
  }

  function hideByCompany() {
    if (!isOn) return;

    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const hiddenCompanies = res?.hiddenCompanies || [];

      const cards1 = document.querySelectorAll("li[data-occludable-job-id]");
      const cards2 = document.querySelectorAll("li[data-job-id]");
      const cards3 = document.querySelectorAll(".job-card-job-posting-card-wrapper[data-job-id]");
      const cards4 = document.querySelectorAll(".job-card-container[data-job-id]");
      let all = [...cards1, ...cards2, ...cards3, ...cards4];
      all = Array.from(new Set(all));

      hiddenCount = 0;
      countedIds.clear();

      all.forEach((card) => {
        const el = card.querySelector(
          ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle span, " +
          ".artdeco-entity-lockup__subtitle div"
        );
        const company = cleanCompanyName(el?.textContent) || "";
        if (hiddenCompanies.includes(company)) {
          card.classList.add("hidejobs-hidden-by-company");
          card.dataset.hiddenBy = "company";
          const li = card.closest("li");
          if (li) li.dataset.hiddenBy = "company";

          const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id") || "";
          if (id && !countedIds.has(id)) {
            countedIds.add(id);
            hiddenCount++;
          }
        } else {
          card.classList.remove("hidejobs-hidden-by-company");
        }
      });

      updateCountStorage();

      if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
    });
  }

  function restoreHidden() {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const hiddenCompanies = res?.hiddenCompanies || [];

      const cards1 = document.querySelectorAll("li[data-occludable-job-id]");
      const cards2 = document.querySelectorAll("li[data-job-id]");
      const cards3 = document.querySelectorAll(".job-card-job-posting-card-wrapper[data-job-id]");
      const cards4 = document.querySelectorAll(".job-card-container[data-job-id]");
      let all = [...cards1, ...cards2, ...cards3, ...cards4];
      all = Array.from(new Set(all));

      all.forEach((card) => {
        const el = card.querySelector(
          ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle span, " +
          ".artdeco-entity-lockup__subtitle div"
        );
        const company = cleanCompanyName(el?.textContent);
        if (company && hiddenCompanies.includes(company)) {
          card.classList.remove("hidejobs-hidden-by-company");
          card.removeAttribute("data-hidden-by");
          const li = card.closest("li");
          if (li) li.removeAttribute("data-hidden-by");
        }
      });

      hiddenCount = 0;
      countedIds.clear();
      updateCountStorage();

      if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
    });
  }

  function applyHidden() {
    if (!isOn) return;

    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const hiddenCompanies = res?.hiddenCompanies || [];
      if (!Array.isArray(hiddenCompanies) || hiddenCompanies.length === 0) {
        hiddenCount = 0;
        countedIds.clear();
        updateCountStorage();
        return;
      }

      hideByCompany();
    });
  }

  function observeJobListContainer() {
    if (!badgeVisible) return;
    const container = document.querySelector(".scaffold-layout__list, .jobs-search-results-list");
    if (container) {
      if (jobListObserver) return;
      jobListObserver = new MutationObserver(
        debounce(() => {
          if (!badgeVisible) return;
          hideByCompany();
          injectCustomContainer();
          window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
        }, 50)
      );
      jobListObserver.observe(container, { childList: true, subtree: true });
      injectCustomContainer();
      hideByCompany();
      window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    } else {
      setTimeout(observeJobListContainer, 1000);
    }
  }

  function reapplyOverlays() {
    chrome?.storage?.local?.get(["overlaidJobIds"], (res) => {
      const overlaid = res?.overlaidJobIds || [];
      const cards1 = document.querySelectorAll("li[data-occludable-job-id]");
      const cards2 = document.querySelectorAll("li[data-job-id]");
      const cards3 = document.querySelectorAll(".job-card-job-posting-card-wrapper[data-job-id]");
      const cards4 = document.querySelectorAll(".job-card-container[data-job-id]");
      let all = [...cards1, ...cards2, ...cards3, ...cards4];
      all = Array.from(new Set(all));

      all.forEach((card) => {
        const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
        if (id && overlaid.includes(id)) showOverlay(card);
      });
    });
  }

  function startSlowLoadInterval() {
    if (slowLoadInterval) return;
    slowLoadRetryCount = 0;
    slowLoadInterval = setInterval(() => {
      if (!badgeVisible) { clearInterval(slowLoadInterval); slowLoadInterval = null; return; }
      slowLoadRetryCount++;
      injectCustomContainer();
      if (slowLoadRetryCount >= slowLoadMaxRetries) {
        clearInterval(slowLoadInterval);
        slowLoadInterval = null;
      }
    }, 2000);
  }

  // ===== RESET FUNCTIONALITY =====
  function resetCompanyFeatures() {
    restoreHidden();
    removeAllOverlays();
    removeFooterIcons();
    chrome?.storage?.local?.remove(["hiddenCompanies", "overlaidJobIds", "companiesBadgeVisible", "companiesHidden"]);
    badgeVisible = false;
    isOn = false;
    hiddenCount = 0;
    countedIds.clear();
    
    if (jobListObserver) {
      jobListObserver.disconnect();
      jobListObserver = null;
    }
    
    if (slowLoadInterval) {
      clearInterval(slowLoadInterval);
      slowLoadInterval = null;
    }
  }

  // ===== MESSAGES =====
  chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.action === "REMOVE_FROM_HIDELIST" || message?.action === "UNHIDE_JOB_BY_COMPANY") {
      // Immediately unhide jobs from this specific company
      const companyName = message.companyName;
      
      // Find and unhide jobs from this company right away
      const cards1 = document.querySelectorAll("li[data-occludable-job-id]");
      const cards2 = document.querySelectorAll("li[data-job-id]");
      const cards3 = document.querySelectorAll(".job-card-job-posting-card-wrapper[data-job-id]");
      const cards4 = document.querySelectorAll(".job-card-container[data-job-id]");
      let all = [...cards1, ...cards2, ...cards3, ...cards4];
      all = Array.from(new Set(all));

      all.forEach((card) => {
        const el = card.querySelector(
          ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle div[dir='ltr'], " +
          ".artdeco-entity-lockup__subtitle span, " +
          ".artdeco-entity-lockup__subtitle div"
        );
        const company = cleanCompanyName(el?.textContent);
        if (company === companyName) {
          card.classList.remove("hidejobs-hidden-by-company");
          card.removeAttribute("data-hidden-by");
          const li = card.closest("li");
          if (li) li.removeAttribute("data-hidden-by");
        }
      });

      // Update storage (this will be handled by your React component, but ensure consistency)
      chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
        const arr = (res?.hiddenCompanies || []).filter((nm) => nm !== companyName);
        hiddenCount = 0;
        countedIds.clear();
        chrome?.storage?.local?.set({ hiddenCompanies: arr }, () => {
          // Recount remaining hidden jobs
          hideByCompany();
        });
      });

      sendResponse?.({ status: "success" });
      return true;
    }

    if (message?.type === 'RESET_PREMIUM_FEATURES') {
      resetCompanyFeatures();
      sendResponse({ status: 'Company features reset' });
      return true;
    }
  });

  // ===== INIT =====
  injectHideJobsCSS();

  chrome?.storage?.local?.get(
    ["companiesBadgeVisible", "companiesHidden", "companiesHiddenCount"],
    (res) => {
      // default badge visibility to TRUE if undefined
      if (typeof res?.companiesBadgeVisible === "undefined") {
        chrome?.storage?.local?.set({ companiesBadgeVisible: true });
        badgeVisible = true;
      } else {
        badgeVisible = !!res.companiesBadgeVisible;
      }

      isOn = !!res?.companiesHidden;
      hiddenCount = Number(res?.companiesHiddenCount || 0);

      if (badgeVisible) {
        injectCustomContainer();
        observeJobListContainer();
        startSlowLoadInterval();
      } else {
        removeFooterIcons();
      }

      if (isOn) {
        applyHidden();
        reapplyOverlays();
      } else {
        restoreHidden();
        removeAllOverlays();
      }

      updateCountStorage();
    }
  );

  // ===== React to storage toggles from React badge / visibility switches =====
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    if ("companiesBadgeVisible" in changes) {
      badgeVisible = !!changes.companiesBadgeVisible.newValue;
      if (badgeVisible) {
        injectCustomContainer();
        observeJobListContainer();
        applyHidden();
        reapplyOverlays();
        startSlowLoadInterval();
      } else {
        restoreHidden();
        removeAllOverlays();
        removeFooterIcons();
        if (jobListObserver) { jobListObserver.disconnect(); jobListObserver = null; }
        if (slowLoadInterval) { clearInterval(slowLoadInterval); slowLoadInterval = null; }
      }
      updateCountStorage();
    }

    if ("companiesHidden" in changes) {
      isOn = !!changes.companiesHidden.newValue;
      if (isOn) {
        applyHidden();
        if (badgeVisible) {
          injectCustomContainer();
          observeJobListContainer();
        }
      } else {
        restoreHidden();
      }
      updateCountStorage();
    }
  });

  // ===== SPA URL polling =====
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;

      if (!isJobPage()) {
        // left Jobs → reset counters
        hiddenCount = 0;
        countedIds.clear();
        updateCountStorage();
      } else {
        // back on Jobs → re-apply if ON
        chrome?.storage?.local?.get(["companiesHidden"], (r) => {
          if (r?.companiesHidden) {
            isOn = true;
            applyHidden();
          } else {
            isOn = false;
            restoreHidden();
          }
        });
      }
    }
  }, 1000);
})();