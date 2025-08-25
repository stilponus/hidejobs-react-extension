/************************************************************/
/*        HideJobs – Indeed "Sponsored" (IndeedSponsored)   */
/*  Integrates with React FilterBadge via storage keys:     */
/*    - indeedSponsoredBadgeVisible (boolean)               */
/*    - indeedSponsoredHidden (boolean)                     */
/*    - indeedSponsoredHiddenCount (number)                 */
/************************************************************/

(() => {
  console.log("[HideJobs] indeed sponsored logic loaded:", location.href);

  /* -------------------- STATE -------------------- */
  let isHidden = false;                 // mirrors indeedSponsoredHidden
  let hiddenCount = 0;                  // mirrors indeedSponsoredHiddenCount
  const countedIds = new Set();
  let listObserver = null;
  let lastUrl = location.href;

  /* -------------------- PAGE CHECK -------------------- */
  function isIndeedJobPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    if (!host.includes("indeed.")) return false;

    const blockedPaths = [
      "/companies","/career/salaries","/about","/help","/legal",
      "/cmp","/survey","/career","/viewjob","/notifications",
      "/contributions","/career-advice","/career-services"
    ];
    if (blockedPaths.some(p => path.startsWith(p))) return false;

    const blockedHosts = new Set([
      "employers.indeed.com","profile.indeed.com","myjobs.indeed.com",
      "dd.indeed.com","secure.indeed.com","smartapply.indeed.com",
      "messages.indeed.com"
    ]);
    if (blockedHosts.has(host)) return false;

    return true; // treat others as job list/search pages
  }

  /* -------------------- SELECTORS & HELPERS -------------------- */
  const getSponsoredCards = () => {
    // Primary selector per your previous script:
    const nodes = Array.from(document.querySelectorAll(".sponsoredJob"));
    // Fallbacks (defensive): try catching cards that contain a visible "Sponsored" label
    // without over-hiding non-sponsored content.
    // We keep it conservative to avoid false positives.
    return nodes;
  };

  const getJobId = (node) => node?.querySelector?.('a[data-jk]')?.getAttribute('data-jk') ?? null;
  const getRowContainer = (node) => node?.closest?.("li") || node;

  // one-time CSS for fully-hidden rows
  (() => {
    if (document.getElementById("hidejobs-indeed-sponsored-style")) return;
    const s = document.createElement("style");
    s.id = "hidejobs-indeed-sponsored-style";
    s.textContent = ".hidejobs-sponsored-hidden{display:none!important}";
    document.head.appendChild(s);
  })();

  function smoothHide(node) {
    const row = getRowContainer(node);
    if (!row || row.classList.contains("hidejobs-sponsored-hidden")) return;

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
        row.classList.add("hidejobs-sponsored-hidden");
        row.removeAttribute("style");
        row.removeEventListener("transitionend", te);
      }
    });
  }

  /* -------------------- CORE HIDE/SHOW -------------------- */
  function hideSponsored() {
    if (!isIndeedJobPage()) return;

    hiddenCount = 0;
    countedIds.clear();

    const cards = getSponsoredCards();
    cards.forEach((card) => {
      const row = getRowContainer(card);
      if (!row || row.classList.contains("hidejobs-sponsored-hidden")) return;

      const id = getJobId(card) || row.innerText.trim();
      if (!countedIds.has(id)) {
        countedIds.add(id);
        hiddenCount++;
      }
      smoothHide(card);
    });

    isHidden = true;
    writeCounts();
  }

  function showSponsored() {
    const cards = getSponsoredCards();
    cards.forEach((card) => {
      const row = getRowContainer(card);
      row?.classList?.remove("hidejobs-sponsored-hidden");
    });

    hiddenCount = 0;
    countedIds.clear();
    isHidden = false;
    writeCounts();
  }

  function hideNewSponsoredIfAny(muts) {
    if (!isHidden) return;
    let found = false;
    for (const m of muts) {
      m.addedNodes?.forEach((n) => {
        if (n?.nodeType !== 1) return;
        if (n.matches?.(".sponsoredJob") || n.querySelector?.(".sponsoredJob")) {
          found = true;
        }
      });
    }
    if (!found) return;

    const cards = getSponsoredCards();
    cards.forEach((card) => {
      const row = getRowContainer(card);
      if (!row || row.classList.contains("hidejobs-sponsored-hidden")) return;

      const id = getJobId(card) || row.innerText.trim();
      if (!countedIds.has(id)) {
        countedIds.add(id);
        hiddenCount++;
        writeCounts();
      }
      smoothHide(card);
    });
  }

  /* -------------------- STORAGE WRITES (FilterBadge API) -------------------- */
  function writeCounts() {
    chrome?.storage?.local?.set({
      indeedSponsoredHidden: isHidden,
      indeedSponsoredHiddenCount: hiddenCount,
    });
    // Optional parity if you rely on these elsewhere:
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  /* -------------------- OBSERVER -------------------- */
  function watchList() {
    if (listObserver) return;
    const root = document.getElementById("mosaic-provider-jobcards") || document.body;
    listObserver = new MutationObserver((m) => hideNewSponsoredIfAny(m));
    listObserver.observe(root, { childList: true, subtree: true });
  }

  function unwatchList() {
    if (!listObserver) return;
    listObserver.disconnect();
    listObserver = null;
  }

  /* -------------------- INIT -------------------- */
  function init() {
    chrome?.storage?.local?.get(
      ["indeedSponsoredHidden", "indeedSponsoredHiddenCount", "indeedSponsoredBadgeVisible"],
      (res) => {
        // default badge visible if never set
        if (typeof res?.indeedSponsoredBadgeVisible === "undefined") {
          chrome?.storage?.local?.set({ indeedSponsoredBadgeVisible: true });
        }

        isHidden = !!res?.indeedSponsoredHidden;
        hiddenCount = Number(res?.indeedSponsoredHiddenCount ?? 0);

        if (!isIndeedJobPage()) {
          unwatchList();
          showSponsored(); // ensure nothing stays hidden off-page
          chrome?.storage?.local?.set({ indeedSponsoredHiddenCount: 0 });
          return;
        }

        // Apply current state & start/stop observer
        if (isHidden) {
          hideSponsored();
          watchList();
        } else {
          showSponsored();
          unwatchList();
        }
      }
    );
  }

  /* -------------------- STORAGE LISTENER -------------------- */
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    // Toggle from React FilterBadge
    if ("indeedSponsoredHidden" in changes) {
      const on = !!changes.indeedSponsoredHidden.newValue;
      if (!isIndeedJobPage()) return;
      if (on) {
        hideSponsored();
        watchList();
      } else {
        showSponsored();
        unwatchList();
      }
    }

    // If someone hides the badge globally, we still keep functionality;
    // the React badge controls visibility separately from behavior.
    // (No DOM badge here—React handles UI.)
  });

  /* -------------------- URL POLLER (SPA) -------------------- */
  setInterval(() => {
    const u = location.href;
    if (u === lastUrl) return;
    lastUrl = u;

    if (isIndeedJobPage()) {
      init();
    } else {
      // Left Indeed job page: cleanup
      unwatchList();
      showSponsored();
    }
  }, 1000);

  /* -------------------- ENTRY -------------------- */
  window.addEventListener("load", init);
})();
