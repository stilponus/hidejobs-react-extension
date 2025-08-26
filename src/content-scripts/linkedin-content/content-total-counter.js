(() => {
  console.log("[HideJobs] total page counter loaded:", location.href);

  // Filters that, when toggled, should trigger a recount
  const TOGGLE_KEYS = [
    "dismissedHidden",
    "promotedHidden",
    "appliedHidden",
    "viewedHidden",
    "companiesHidden",
    "userTextHidden",
    "repostedGhostHidden",
    "indeedSponsoredHidden",
    "glassdoorAppliedHidden",
    "indeedAppliedHidden",
    "filterByHoursHidden",
  ];

  // ✅ Count ONLY the LI rows to avoid double-counting inner wrappers
  const CARD_SELECTORS = 'li[data-occludable-job-id], li[data-job-id]';

  const isJobPage = () =>
    location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    location.href.startsWith("https://www.linkedin.com/jobs/collections");

  let lastUrl = location.href;
  let obs = null;

  function recalc() {
    if (!isJobPage()) {
      chrome?.storage?.local?.set({ totalHiddenOnPage: 0 });
      return;
    }

    const rows = document.querySelectorAll(CARD_SELECTORS);
    let hiddenCount = 0;
    const seen = new Set(); // dedupe by jobId

    rows.forEach((li) => {
      const jobId =
        li.getAttribute("data-occludable-job-id") ||
        li.getAttribute("data-job-id") ||
        null;

      // Deduplicate jobs by ID (fallback to element ref if needed)
      const key = jobId || li;
      if (seen.has(key)) return;
      seen.add(key);

      // ✅ Only check LI visibility (not inner wrappers) to avoid double count
      const isHiddenByStyle = getComputedStyle(li).display === "none";

      // Optional legacy parity: treat reposted-masked IDs as hidden
      const isHiddenAsReposted =
        !!(window.hideJobsState?.hideReposted && jobId && window.hideJobsState.repostedMap?.[jobId]);

      if (isHiddenByStyle || isHiddenAsReposted) hiddenCount++;
    });

    chrome?.storage?.local?.set({ totalHiddenOnPage: hiddenCount });
  }

  function watchDOM() {
    // Prefer the jobs list container; fallback to body
    const container =
      document.querySelector(".scaffold-layout__list, .jobs-search-results-list") ||
      document.querySelector('[data-test-reusable-search__entity-result-list]') ||
      document.body;

    if (!container) return;

    if (obs) obs.disconnect();
    obs = new MutationObserver(() => recalc());
    obs.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  // Recount when any filter toggle changes
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (TOGGLE_KEYS.some((k) => k in changes)) recalc();
  });

  // SPA URL polling — rebind observers and recount on nav
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      recalc();
      watchDOM();
    }
  }, 1000);

  // Initial run
  recalc();
  watchDOM();
})();
