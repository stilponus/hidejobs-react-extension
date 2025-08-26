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
      "/companies", "/career/salaries", "/about", "/help", "/legal",
      "/cmp", "/survey", "/career", "/viewjob", "/notifications",
      "/contributions", "/career-advice", "/career-services"
    ];
    if (blockedPaths.some(p => path.startsWith(p))) return false;

    const blockedHosts = new Set([
      "employers.indeed.com", "profile.indeed.com", "myjobs.indeed.com",
      "dd.indeed.com", "secure.indeed.com", "smartapply.indeed.com",
      "messages.indeed.com"
    ]);
    if (blockedHosts.has(host)) return false;

    return true; // treat others as job list/search pages
  }

  /* -------------------- SELECTORS & HELPERS -------------------- */
  // Normalize to the card row element (either <li> or slider_item container)
  const toCard = (el) =>
    el?.closest?.("li") ||
    el?.closest?.('div[data-testid="slider_item"]') ||
    el;

  // Keep it strict: only elements marked by Indeed as maybeSponsoredJob
  const getSponsoredCards = () => {
    const hits = new Set();
    document.querySelectorAll(".maybeSponsoredJob").forEach((el) => {
      const card = toCard(el);
      if (card) hits.add(card);
    });
    return Array.from(hits);
  };

  const getJobId = (node) =>
    node?.querySelector?.('a[data-jk]')?.getAttribute('data-jk') ??
    node?.querySelector?.('a[id^="job_"], a[id^="sj_"]')?.id ??
    null;

  // one-time CSS for fully-hidden rows
  (() => {
    if (document.getElementById("hidejobs-indeed-sponsored-style")) return;
    const s = document.createElement("style");
    s.id = "hidejobs-indeed-sponsored-style";
    s.textContent = ".hidejobs-sponsored-hidden{display:none!important}";
    document.head.appendChild(s);
  })();

  function smoothHide(card) {
    const row = toCard(card);
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

  function unhideCard(card) {
    const row = toCard(card);
    row?.classList?.remove("hidejobs-sponsored-hidden");
    if (row) row.removeAttribute("style");
  }

  /* -------------------- CORE HIDE/SHOW -------------------- */
  function hideSponsored() {
    if (!isIndeedJobPage()) return;

    hiddenCount = 0;
    countedIds.clear();

    const cards = getSponsoredCards();
    cards.forEach((card) => {
      const id = getJobId(card) || card.innerText.trim();
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
    cards.forEach(unhideCard);

    hiddenCount = 0;
    countedIds.clear();
    isHidden = false;
    writeCounts();
  }

  function hideNewSponsoredIfAny(muts) {
    if (!isHidden) return;

    let shouldRecheck = false;
    for (const m of muts) {
      m.addedNodes?.forEach((n) => {
        if (n?.nodeType !== 1) return;
        if (n.matches?.(".maybeSponsoredJob") || n.querySelector?.(".maybeSponsoredJob")) {
          shouldRecheck = true;
        }
      });
    }
    if (!shouldRecheck) return;

    const cards = getSponsoredCards();
    cards.forEach((card) => {
      const id = getJobId(card) || card.innerText.trim();
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
    const root =
      document.getElementById("mosaic-provider-jobcards") ||
      document.querySelector('[role="main"]') ||
      document.body;

    listObserver = new MutationObserver((m) => hideNewSponsoredIfAny(m));
    listObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
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
