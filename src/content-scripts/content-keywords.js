// public/content-keywords.js
(() => {
  console.log("[HideJobs] keywords logic loaded:", location.href);

  const CARD_ROWS = 'li[data-occludable-job-id], li[data-job-id]';
  const TEXT_NODES = "[data-job-id], [data-occludable-job-id]";

  const isJobPage = () =>
    location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    location.href.startsWith("https://www.linkedin.com/jobs/collections");

  let lastUrl = location.href;
  let obs = null;
  let isOn = false;
  let keywords = [];
  let hiddenCount = 0;
  const seen = new Set();

  function readKeywords(cb) {
    chrome?.storage?.local?.get(["filterKeywords"], (res) => {
      const list = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];
      cb(list);
    });
  }

  function matchesAnyKeyword(text, list) {
    const t = (text || "").toLowerCase();
    for (const k of list) {
      if (!k) continue;
      if (t.includes(String(k).toLowerCase())) return true;
    }
    return false;
  }

  function recalc() {
    if (!isJobPage()) {
      chrome?.storage?.local?.set({ userTextHiddenCount: 0 });
      return;
    }

    const rows = document.querySelectorAll(CARD_ROWS);
    hiddenCount = 0;
    seen.clear();

    rows.forEach((li) => {
      // restore to base; other filters may hide as well
      // we DO NOT force-restore here to avoid fighting other filters
      const id = li.getAttribute("data-occludable-job-id") || li.getAttribute("data-job-id") || "";
      const key = id || li;
      if (seen.has(key)) return;
      seen.add(key);

      // find the inner node with text
      const inner = li.matches(TEXT_NODES) ? li : (li.querySelector(TEXT_NODES) || li);
      const text = inner?.innerText || li.innerText || "";

      const shouldHide = isOn && keywords.length > 0 && matchesAnyKeyword(text, keywords);
      if (shouldHide) {
        if (li.style.display !== "none") {
          li.style.display = "none";
          li.dataset.hiddenBy = "keyword";
        }
        hiddenCount++;
      } else {
        // Only clear our own marker if we previously hid it
        if (li.dataset.hiddenBy === "keyword") {
          li.style.display = "";
          delete li.dataset.hiddenBy;
        }
      }
    });

    chrome?.storage?.local?.set({ userTextHiddenCount: hiddenCount });
  }

  function hideNow() {
    isOn = true;
    readKeywords((list) => {
      keywords = list;
      recalc();
      bindObserver();
    });
  }

  function showNow() {
    isOn = false;
    const rows = document.querySelectorAll(CARD_ROWS);
    rows.forEach((li) => {
      if (li.dataset.hiddenBy === "keyword") {
        li.style.display = "";
        delete li.dataset.hiddenBy;
      }
    });
    hiddenCount = 0;
    chrome?.storage?.local?.set({ userTextHiddenCount: 0 });
    unbindObserver();
  }

  function bindObserver() {
    const container =
      document.querySelector(".scaffold-layout__list, .jobs-search-results-list") ||
      document.querySelector('[data-test-reusable-search__entity-result-list]') ||
      document.body;
    if (!container) return;

    if (obs) obs.disconnect();
    obs = new MutationObserver(() => recalc());
    obs.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
  }

  function unbindObserver() {
    if (obs) obs.disconnect();
    obs = null;
  }

  // Init from storage
  chrome?.storage?.local?.get(["userTextHidden", "filterKeywords"], (res) => {
    isOn = !!res?.userTextHidden;
    keywords = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];
    if (isOn) hideNow(); else showNow();
  });

  // React to storage changes
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    // Toggle on/off
    if ("userTextHidden" in changes) {
      const on = !!changes.userTextHidden.newValue;
      on ? hideNow() : showNow();
      return;
    }

    // Keywords changed → rerun if ON
    if ("filterKeywords" in changes) {
      keywords = Array.isArray(changes.filterKeywords.newValue) ? changes.filterKeywords.newValue : [];
      if (isOn) recalc();
    }
  });

  // SPA URL watcher
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      if (!isJobPage()) {
        showNow();
      } else {
        if (isOn) hideNow();
      }
    }
  }, 1000);
})();
