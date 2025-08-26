// public/content-keywords-indeed.js
/************************************************************
 * HideJobs – Indeed "Keywords" helper (hide by keywords; no UI)
 *
 * Works with the same storage + panel used on LinkedIn:
 *   - filterKeywords         : string[]  (keywords list)
 *   - userTextHidden         : boolean   (master ON/OFF for keyword hiding)
 *   - keywordHiddenCount     : number    (count of hidden jobs)
 *   - countedKeywordJobIds   : string[]  (ids we've already counted)
 *
 * Page scope: Indeed job list pages only (excludes employers/profile/etc)
 ************************************************************/

(() => {
  console.log("[HideJobs] indeed keywords logic loaded:", location.href);

  // Inject CSS once so the class we add actually hides the cards
  function ensureHideStyleInjected() {
    if (document.getElementById("hidejobs-keyword-style")) return;
    const style = document.createElement("style");
    style.id = "hidejobs-keyword-style";
    style.textContent = `
      .hidejobs-hidden-by-keywords { 
        display: none !important; 
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  ensureHideStyleInjected();

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
   * Utilities
   * ────────────────────────────────────────────────────────── */
  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
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

  function getJobElements() {
    // Indeed list items: <a data-jk> lives inside each result card.
    // We'll operate on the closest <li> if present, otherwise the slider item.
    const anchors = document.querySelectorAll('a[data-jk]');
    const items = [];
    anchors.forEach((a) => {
      const card = a.closest("li") || a.closest('div[data-testid="slider_item"]') || a;
      if (card) items.push({ anchor: a, card });
    });
    return items;
  }

  /* ──────────────────────────────────────────────────────────
   * State
   * ────────────────────────────────────────────────────────── */
  let lastUrl = location.href;
  let obs = null;

  let isOn = false;                // mirrors userTextHidden
  let keywords = [];               // filterKeywords (array)
  let hiddenKeywordCount = 0;      // keywordHiddenCount (number)
  let countedKeywordJobIds = new Set(); // countedKeywordJobIds (Set of strings)

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

    for (const { anchor, card } of items) {
      // Don't double-hide
      if (card.classList.contains("hidejobs-hidden-by-keywords")) continue;

      const text = (card.innerText || "").toLowerCase();
      if (!text) continue;

      if (matchesAnyKeyword(text, keywords)) {
        card.classList.add("hidejobs-hidden-by-keywords");

        const jobId = anchor.getAttribute("data-jk") || text.slice(0, 128);
        if (jobId && !countedKeywordJobIds.has(jobId)) {
          countedKeywordJobIds.add(jobId);
          hiddenKeywordCount++;
        }
      }
    }

    persistCountState();
  }

  function restoreJobsByKeyword(keyword) {
    const items = getJobElements();
    const kw = String(keyword || "").toLowerCase();

    for (const { anchor, card } of items) {
      const text = (card.innerText || "").toLowerCase();
      if (text.includes(kw)) {
        // Unhide visually
        card.classList.remove("hidejobs-hidden-by-keywords");

        // Adjust count if this job was previously counted
        const jobId = anchor.getAttribute("data-jk") || text.slice(0, 128);
        if (jobId && countedKeywordJobIds.has(jobId)) {
          countedKeywordJobIds.delete(jobId);
          hiddenKeywordCount = Math.max(0, hiddenKeywordCount - 1);
        }
      }
    }

    persistCountState();
  }

  function restoreAllKeywordJobs() {
    const items = getJobElements();

    for (const { card } of items) {
      card.classList.remove("hidejobs-hidden-by-keywords");
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
  }, 50);

  function bindObserver() {
    const container =
      document.querySelector("#mosaic-provider-jobcards") ||
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
    if (!isIndeedJobPage()) {
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
        countedKeywordJobIds = new Set(Array.isArray(res?.countedKeywordJobIds) ? res.countedKeywordJobIds : []);

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
