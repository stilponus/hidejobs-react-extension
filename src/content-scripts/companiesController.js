// src/content/companiesController.js
// React-aware Companies Hiding controller (local only).
// Keys used in chrome.storage.local:
//  - companiesBadgeVisible: boolean
//  - companiesHidden: boolean
//  - companiesHiddenCount: number
//  - hiddenCompanies: string[]
//  - overlaidJobIds: string[]

import React from "react";
import { createRoot } from "react-dom/client";
import CompaniesFooterIcon from "./CompaniesFooterIcon";

(function CompaniesController() {
  /* ---------------- Config ---------------- */
  const JOB_URL_PREFIXES = [
    "https://www.linkedin.com/jobs/search",
    "https://www.linkedin.com/jobs/collections",
  ];
  const isJobPage = (href = location.href) =>
    JOB_URL_PREFIXES.some((p) => href.startsWith(p));

  /* ---------------- State ---------------- */
  let badgeVisible = false;       // companiesBadgeVisible
  let featureOn = false;          // companiesHidden
  let hiddenCount = 0;            // companiesHiddenCount
  const countedIds = new Set();   // for badge counting
  let jobListObserver = null;
  let lastHref = location.href;

  // Keep React roots to clean up on DOM removal
  const roots = new WeakMap(); // Element -> ReactRoot

  /* ---------------- Utils ---------------- */
  const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const cleanCompanyName = (raw) => {
    if (!raw) return null;
    let s = String(raw).trim();
    if (s.includes(" · ")) s = s.split(" · ")[0].trim();
    s = s.replace(/\(.*?\)/g, "").trim();
    return s || null;
  };

  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const jobCards = () => {
    const cards1 = qsa("li[data-occludable-job-id]");
    const cards2 = qsa("li[data-job-id]");
    const cards3 = qsa(".job-card-job-posting-card-wrapper[data-job-id]");
    const cards4 = qsa(".job-card-container[data-job-id]");
    let all = Array.from(new Set([...cards1, ...cards2, ...cards3, ...cards4]));
    // filter nested duplicates
    all = all.filter((card) => {
      const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
      const parentLi = card.closest("li[data-occludable-job-id], li[data-job-id]");
      if (parentLi && parentLi !== card) {
        const parentId = parentLi.getAttribute("data-occludable-job-id") || parentLi.getAttribute("data-job-id");
        if (parentId === id) return false;
      }
      return true;
    });
    return all;
  };

  const isLayout1 = (card) => !!card.getAttribute("data-occludable-job-id");

  /* ---------------- CSS once ---------------- */
  (function injectCSSOnce() {
    if (document.getElementById("hidejobs-style-companies")) return;
    const st = document.createElement("style");
    st.id = "hidejobs-style-companies";
    st.textContent = `
      .hidejobs-hidden-by-company { display: none !important; }
      .hidejobs-overlay {
        position: absolute; left: 0; width: 100%;
        background-color: rgba(128,128,128,0.5);
        backdrop-filter: blur(2px);
        display: flex; justify-content: center; align-items: center;
        z-index: 10;
        transition: background-color .3s ease, backdrop-filter .3s ease, opacity .3s ease;
        border-bottom: 1px solid #e8e8e8;
      }
      .hidejobs-overlay .hidejobs-close-button {
        position: absolute; top: 8px; right: 4px; cursor: pointer;
        width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
        transition: background-color .3s ease; border-radius: 50%;
        background-color: rgba(255,255,255,0.3);
      }
      .hidejobs-overlay .hidejobs-close-button:hover { background-color: rgba(255,255,255,0.5); }
      .hidejobs-message-button {
        background: #fff; padding: 12px 15px; border-radius: 50px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2); cursor: pointer; position: relative;
        white-space: nowrap; overflow: hidden; transition: width .3s ease, opacity .3s ease;
        margin: 0 55px; border: none; font: inherit;
      }
    `;
    document.head.appendChild(st);
  })();

  /* ---------------- Count sync ---------------- */
  const syncCount = () => chrome?.storage?.local?.set?.({ companiesHiddenCount: hiddenCount });

  /* ---------------- Footer icon (React) ---------------- */
  function ensureFooterIcon(card) {
    const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
    if (!id || id === "search") return;

    const footer = card.querySelector(
      ".job-card-container__footer-wrapper, .job-card-job-posting-card-wrapper__footer-items"
    );
    if (!footer) return;

    // Already injected?
    if (footer.querySelector(".hidejobs-footer-icon")) return;

    // LinkedIn uses <li> items in footer; be consistent
    const holder = document.createElement("li");
    holder.className = "job-card-container__footer-item";
    holder.style.position = "relative";

    // Insert after last item if present
    const last = footer.querySelector(
      "li.job-card-container__footer-item:last-of-type, li.job-card-job-posting-card-wrapper__footer-item:last-of-type"
    );
    if (last) last.insertAdjacentElement("afterend", holder);
    else footer.appendChild(holder);

    // Mount React icon
    const root = createRoot(holder);
    roots.set(holder, root);
    root.render(
      <CompaniesFooterIcon
        onClick={() => {
          showOverlay(card);
          chrome?.storage?.local?.get?.(["overlaidJobIds"], (res) => {
            const arr = Array.isArray(res?.overlaidJobIds) ? res.overlaidJobIds : [];
            if (!arr.includes(id)) {
              arr.push(id);
              chrome.storage.local.set({ overlaidJobIds: arr });
            }
          });
        }}
      />
    );
  }

  function removeFooterIcons() {
    const icons = document.querySelectorAll(".hidejobs-footer-icon");
    icons.forEach((span) => {
      const holder = span.closest("li.job-card-container__footer-item");
      if (holder) {
        const r = roots.get(holder);
        try { r?.unmount?.(); } catch {}
        holder.remove();
      }
    });
  }

  /* ---------------- Overlay ---------------- */
  function showOverlay(card) {
    const cardLi = card.closest(
      "li[data-occludable-job-id], li[data-job-id], .job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id]"
    );
    if (!cardLi) return;
    if (cardLi.querySelector(".hidejobs-overlay")) return;

    const jobId =
      cardLi.getAttribute("data-occludable-job-id") ||
      cardLi.getAttribute("data-job-id") ||
      "";

    const layout1 = isLayout1(card);
    const overlay = document.createElement("div");
    overlay.className = "hidejobs-overlay";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "10";
    overlay.style.opacity = "1";

    if (layout1) {
      const isFirst = cardLi === cardLi.parentElement?.firstElementChild;
      overlay.style.top = isFirst ? "-1px" : "1px";
      overlay.style.height = isFirst ? "calc(100% + 2px)" : "100%";
    } else {
      overlay.style.top = "0";
      overlay.style.height = "100%";
    }

    overlay.addEventListener("click", (e) => {
      if (!e.target.closest(".hidejobs-message-button") && !e.target.closest(".hidejobs-close-button")) {
        fadeRemoveOverlay(cardLi, jobId);
      }
    });

    const close = document.createElement("div");
    close.className = "hidejobs-close-button";
    close.innerHTML = `
      <svg role="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
           viewBox="0 0 16 16" style="fill:#fff"><path d="M3.7 3.7a1 1 0 011.4 0L8 6.6l2.9-2.9a1 1 0 011.4 1.4L9.4 8l2.9 2.9a1 1 0 01-1.4 1.4L8 9.4l-2.9 2.9a1 1 0 01-1.4-1.4L6.6 8 3.7 5.1a1 1 0 010-1.4z"/></svg>
    `;
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fadeRemoveOverlay(cardLi, jobId);
    });

    const btn = document.createElement("button");
    btn.className = "hidejobs-message-button";
    btn.textContent = "Hide Company";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!featureOn) {
        featureOn = true;
        chrome?.storage?.local?.set?.({ companiesHidden: true });
      }
      const nameNode = cardLi.querySelector(
        ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], .artdeco-entity-lockup__subtitle div[dir='ltr'], .artdeco-entity-lockup__subtitle span, .artdeco-entity-lockup__subtitle div"
      );
      const name = cleanCompanyName(nameNode?.textContent || "");
      if (!name) {
        fadeRemoveOverlay(cardLi, jobId);
        return;
      }

      chrome.storage.local.get(["hiddenCompanies"], (res) => {
        const arr = Array.isArray(res?.hiddenCompanies) ? res.hiddenCompanies : [];
        if (!arr.includes(name)) arr.push(name);
        chrome.storage.local.set({ hiddenCompanies: arr }, () => {
          cardLi.classList.add("hidejobs-hidden-by-company");
          applyHiddenJobs(); // rehide + recount
          fadeRemoveOverlay(cardLi, jobId, true);
        });
      });
    });

    overlay.appendChild(btn);
    overlay.appendChild(close);
    cardLi.style.position = "relative";
    cardLi.appendChild(overlay);
  }

  function fadeRemoveOverlay(cardLi, jobId, keepHidden = false) {
    const ov = cardLi.querySelector(".hidejobs-overlay");
    if (!ov) return;
    ov.style.transition = "opacity .3s ease";
    ov.style.opacity = "0";
    setTimeout(() => {
      ov.remove();
      chrome?.storage?.local?.get?.(["overlaidJobIds"], (res) => {
        let ids = Array.isArray(res?.overlaidJobIds) ? res.overlaidJobIds : [];
        ids = ids.filter((x) => x !== jobId);
        chrome.storage.local.set({ overlaidJobIds: ids });
      });
      if (!keepHidden) {
        // leave card visible if not actually hidden
      }
    }, 300);
  }

  /* ---------------- Hide/Restore ---------------- */
  function restoreHiddenJobs() {
    const cards = jobCards();
    cards.forEach((card) => {
      card.classList.remove("hidejobs-hidden-by-company");
      card.removeAttribute("data-hidden-by");
      const li = card.closest("li");
      li?.removeAttribute?.("data-hidden-by");
    });
    hiddenCount = 0;
    countedIds.clear();
    syncCount();
  }

  function applyHiddenJobs() {
    if (!featureOn) {
      // If feature is OFF, still update badge as OFF (count stays but badge shows "OFF" via FilterBadge)
      syncCount();
      return;
    }
    chrome.storage.local.get(["hiddenCompanies"], (res) => {
      const hiddenCompanies = Array.isArray(res?.hiddenCompanies) ? res.hiddenCompanies : [];
      const cards = jobCards();

      hiddenCount = 0;
      countedIds.clear();

      if (hiddenCompanies.length === 0) {
        syncCount();
        return;
      }

      cards.forEach((card) => {
        const nameNode = card.querySelector(
          ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], .artdeco-entity-lockup__subtitle div[dir='ltr'], .artdeco-entity-lockup__subtitle span, .artdeco-entity-lockup__subtitle div"
        );
        const nm = cleanCompanyName(nameNode?.textContent || "");
        if (nm && hiddenCompanies.includes(nm)) {
          card.classList.add("hidejobs-hidden-by-company");
          card.dataset.hiddenBy = "company";
          const parentLi = card.closest("li");
          if (parentLi) parentLi.dataset.hiddenBy = "company";
          const jid = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id") || "";
          if (jid && !countedIds.has(jid)) {
            countedIds.add(jid);
            hiddenCount++;
          }
        } else {
          card.classList.remove("hidejobs-hidden-by-company");
        }
      });

      syncCount();
    });
  }

  /* ---------------- Observe list ---------------- */
  function observeJobListContainer() {
    const container = document.querySelector(".scaffold-layout__list, .jobs-search-results-list");
    if (!container) {
      setTimeout(observeJobListContainer, 1000);
      return;
    }
    if (jobListObserver) return;

    jobListObserver = new MutationObserver(
      debounce(() => {
        if (!badgeVisible) return;
        // Always re-inject icons and re-apply hiding on list mutations
        jobCards().forEach(ensureFooterIcon);
        applyHiddenJobs();
        // Re-apply overlays saved in storage
        chrome.storage.local.get(["overlaidJobIds"], (res) => {
          const ids = Array.isArray(res?.overlaidJobIds) ? res.overlaidJobIds : [];
          jobCards().forEach((card) => {
            const id = card.getAttribute("data-occludable-job-id") || card.getAttribute("data-job-id");
            if (id && ids.includes(id) && !card.querySelector(".hidejobs-overlay")) {
              showOverlay(card);
            }
          });
        });
      }, 80)
    );

    jobListObserver.observe(container, { childList: true, subtree: true });

    // Initial pass
    jobCards().forEach(ensureFooterIcon);
    applyHiddenJobs();
  }

  /* ---------------- Storage listeners ---------------- */
  chrome?.storage?.local?.get?.(
    ["companiesBadgeVisible", "companiesHidden", "hiddenCompanies", "overlaidJobIds"],
    (res) => {
      badgeVisible = !!res?.companiesBadgeVisible;
      featureOn = !!res?.companiesHidden;

      if (badgeVisible) {
        observeJobListContainer();
      } else {
        // if not visible, remove icons
        removeFooterIcons();
      }

      // First count
      applyHiddenJobs();
    }
  );

  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    if ("companiesBadgeVisible" in changes) {
      badgeVisible = !!changes.companiesBadgeVisible.newValue;
      if (badgeVisible) {
        observeJobListContainer();
      } else {
        restoreHiddenJobs();
        removeFooterIcons();
        if (jobListObserver) {
          jobListObserver.disconnect();
          jobListObserver = null;
        }
      }
      // count stays but badge component handles "OFF" rendering
      syncCount();
    }

    if ("companiesHidden" in changes) {
      featureOn = !!changes.companiesHidden.newValue;
      applyHiddenJobs();
    }

    if ("hiddenCompanies" in changes) {
      applyHiddenJobs();
    }
  });

  /* ---------------- URL watcher (SPA) ---------------- */
  setInterval(() => {
    const href = location.href;
    if (href !== lastHref) {
      lastHref = href;
      if (!isJobPage(href)) {
        // Left Jobs area
        removeFooterIcons();
        if (jobListObserver) { jobListObserver.disconnect(); jobListObserver = null; }
        // Do not clear storage counts here; UI will show OFF if feature is off/hidden
      } else {
        if (badgeVisible) observeJobListContainer();
      }
    }
  }, 800);
})();
