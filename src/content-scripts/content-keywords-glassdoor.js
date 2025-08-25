// public/content-keywords-glassdoor.js
/************************************************************
 * HideJobs – Glassdoor "Keywords" helper (hide by keywords; no UI)
 *
 * Shares storage + panel state with LinkedIn/Indeed:
 *   - filterKeywords         : string[]  (keywords list)
 *   - userTextHidden         : boolean   (master ON/OFF for keyword hiding)
 *   - keywordHiddenCount     : number    (count of hidden jobs)
 *   - countedKeywordJobIds   : string[]  (ids we've already counted)
 *
 * Page scope: Glassdoor job list/search pages (excludes companies/overview/etc)
 ************************************************************/

(() => {
  console.log("[HideJobs] glassdoor keywords logic loaded:", location.href);

  /* ──────────────────────────────────────────────────────────
   * One-time CSS so our class actually hides cards
   * ────────────────────────────────────────────────────────── */
  function ensureHideStyleInjected() {
    if (document.getElementById("hidejobs-gd-keyword-style")) return;
    const style = document.createElement("style");
    style.id = "hidejobs-gd-keyword-style";
    style.textContent = `
      .hidejobs-gd-hidden-by-keywords {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  ensureHideStyleInjected();

  /* ──────────────────────────────────────────────────────────
   * Page detection – allow-list for Glassdoor job list pages
   * ────────────────────────────────────────────────────────── */
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
      "/blog", "/community", "/about", "/help", "/partners"
    ];
    if (blocked.some((p) => path.startsWith(p))) return false;

    // Typical job-search paths include /Job/ or /job-listing or /Job/jobs.htm
    return true;
  }

  /* ──────────────────────────────────────────────────────────
   * Small utilities
   * ────────────────────────────────────────────────────────── */
  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function matchesAnyKeyword(text, list) {
    const t = (text || "").toLowerCase();
    for (const k of list) {
      if (!k) continue;
      if (t.includes(String(k).toLowerCase())) return true;
    }
    return false;
  }

  function readKeywords(cb) {
    chrome?.storage?.local?.get(["filterKeywords"], (res) => {
      const list = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];
      cb(list);
    });
  }

  /* ──────────────────────────────────────────────────────────
   * Get job items (row + a stable-ish id)
   * Glassdoor commonly renders each result as:
   *  - <li data-test="jobListing" data-jobid="...">...</li>
   *  - Sometimes div[data-test="jobListing"] (SSR/AB variants)
   * We’ll normalize to a "card" element & derive an id.
   * ────────────────────────────────────────────────────────── */
  function getJobElements() {
    const nodeList = document.querySelectorAll(
      'li[data-test="jobListing"], div[data-test="jobListing"]'
    );
    const items = [];
    nodeList.forEach((card) => {
      // Prefer data-jobid if present
      let id =
        card.getAttribute("data-jobid") ||
        card.getAttribute("data-id") ||
        null;

      // Fallback: look for a link we can key on
      if (!id) {
        const a =
          card.querySelector('a[data-test="job-link"]') ||
          card.querySelector('a[href*="/job-listing"]') ||
          card.querySelector('a[href*="/partner/jobListing"]') ||
          card.querySelector("a[href]");
        if (a) {
          id = a.getAttribute("data-id") || a.getAttribute("data-jobid") || a.id || a.href || null;
        }
      }

      items.push({ card, id: id || card.innerText.slice(0, 160) });
    });
    return items;
  }

  /* ──────────────────────────────────────────────────────────
   * State
   * ────────────────────────────────────────────────────────── */
  let lastUrl = location.href;
  let obs = null;

  let isOn = false;                    // mirrors userTextHidden
  let keywords = [];                   // filterKeywords (array)
  let hiddenKeywordCount = 0;          // keywordHiddenCount (number)
  let countedKeywordJobIds = new Set();// countedKeywordJobIds (Set of strings)

  /* ──────────────────────────────────────────────────────────
   * Persistence helpers (count + ids)
   * ────────────────────────────────────────────────────────── */
  function persistCountState() {
    chrome?.storage?.local?.set?.({
      keywordHiddenCount: hiddenKeywordCount,
      countedKeywordJobIds: Array.from(countedKeywordJobIds),
    });
  }

  /* ──────────────────────────────────────────────────────────
   * Hiding / Restoring
   * ────────────────────────────────────────────────────────── */
  function hideKeywordJobListings() {
    if (!keywords.length) return;
    const items = getJobElements();

    for (const { card, id } of items) {
      // Skip already hidden cards to avoid recount
      if (card.classList.contains("hidejobs-gd-hidden-by-keywords")) continue;

      const text = (card.innerText || "").toLowerCase();
      if (!text) continue;

      if (matchesAnyKeyword(text, keywords)) {
        card.classList.add("hidejobs-gd-hidden-by-keywords");

        if (id && !countedKeywordJobIds.has(id)) {
          countedKeywordJobIds.add(id);
          hiddenKeywordCount++;
        }
      }
    }

    persistCountState();

    // Optional parity with your other overlays/UI hooks:
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  function restoreJobsByKeyword(keyword) {
    const items = getJobElements();
    const kw = String(keyword || "").toLowerCase();

    for (const { card, id } of items) {
      const text = (card.innerText || "").toLowerCase();
      if (text.includes(kw)) {
        card.classList.remove("hidejobs-gd-hidden-by-keywords");

        if (id && countedKeywordJobIds.has(id)) {
          countedKeywordJobIds.delete(id);
          hiddenKeywordCount = Math.max(0, hiddenKeywordCount - 1);
        }
      }
    }

    persistCountState();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  function restoreAllKeywordJobs() {
    const items = getJobElements();
    for (const { card } of items) {
      card.classList.remove("hidejobs-gd-hidden-by-keywords");
    }
    hiddenKeywordCount = 0;
    countedKeywordJobIds.clear();
    persistCountState();
  }

  /* ──────────────────────────────────────────────────────────
   * ON/OFF
   * ────────────────────────────────────────────────────────── */
  function hideNow() {
    isOn = true;
    readKeywords((list) => {
      keywords = list;
      if (keywords.length === 0) {
        // If turned ON but no keywords, ensure clean state
        restoreAllKeywordJobs();
        bindObserver();
        return;
      }
      hideKeywordJobListings();
      bindObserver();
    });
  }

  function showNow() {
    isOn = false;
    restoreAllKeywordJobs();
    unbindObserver();
  }

  /* ──────────────────────────────────────────────────────────
   * Observer
   * ────────────────────────────────────────────────────────── */
  const debouncedApply = debounce(() => {
    if (isOn && keywords.length > 0) hideKeywordJobListings();
  }, 60);

  function bindObserver() {
    // Try the job list root first; fall back to main/document
    const container =
      document.querySelector('[data-test="jlGrid"]') ||          // older GD
      document.querySelector('[data-test="job-feed"]') ||        // newer GD
      document.querySelector('[data-test="JobsList"]') ||        // variant
      document.querySelector('[role="main"]') ||
      document.body;

    if (!container) return;

    if (obs) obs.disconnect();
    obs = new MutationObserver(() => debouncedApply());
    obs.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  function unbindObserver() {
    if (obs) {
      obs.disconnect();
      obs = null;
    }
  }

  /* ──────────────────────────────────────────────────────────
   * Boot / URL watcher / Storage wiring
   * ────────────────────────────────────────────────────────── */
  function applyStoredUserTextState() {
    if (!isGlassdoorJobPage()) {
      unbindObserver();
      return;
    }

    chrome?.storage?.local?.get(
      ["userTextHidden", "filterKeywords", "keywordHiddenCount", "countedKeywordJobIds"],
      (res) => {
        isOn = !!res?.userTextHidden;
        keywords = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];

        // Restore count bookkeeping
        hiddenKeywordCount = typeof res?.keywordHiddenCount === "number" ? res.keywordHiddenCount : 0;
        countedKeywordJobIds = new Set(
          Array.isArray(res?.countedKeywordJobIds) ? res.countedKeywordJobIds : []
        );

        if (isOn && keywords.length > 0) {
          hideKeywordJobListings();
          bindObserver();
        } else {
          // If OFF or no keywords → ensure visible + clean counters
          restoreAllKeywordJobs();
          unbindObserver();
        }
      }
    );
  }

  // URL (SPA) watcher
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      applyStoredUserTextState();
    }
  }, 1000);

  // React to storage changes
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    // Master ON/OFF
    if ("userTextHidden" in changes) {
      const on = !!changes.userTextHidden.newValue;
      on ? hideNow() : showNow();
      return;
    }

    // Keywords changed → if ON, recompute
    if ("filterKeywords" in changes) {
      const newKeywords = Array.isArray(changes.filterKeywords.newValue)
        ? changes.filterKeywords.newValue
        : [];
      const oldKeywords = keywords;
      keywords = newKeywords;

      if (!isOn) return;

      if (newKeywords.length === 0) {
        // No keywords → show everything, reset counts
        restoreAllKeywordJobs();
        return;
      }

      // For removed keywords, restore their jobs
      const removed = oldKeywords.filter((k) => !newKeywords.includes(k));
      removed.forEach((kw) => restoreJobsByKeyword(kw));

      // Hide for current keywords
      hideKeywordJobListings();
    }
  });

  // Initial load
  applyStoredUserTextState();
})();
