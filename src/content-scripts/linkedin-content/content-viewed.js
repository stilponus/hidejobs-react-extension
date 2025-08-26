// ------------------------------
// Viewed filter logic (counts + DOM). Badge is React component in shadow UI.
// ------------------------------
(() => {
  console.log("[HideJobs] viewed logic loaded:", location.href);

  let hiddenCount = 0;
  let countedIds = new Set();
  let lastUrl = location.href;
  let isOn = false;

  const isJobPage = () =>
    location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    location.href.startsWith("https://www.linkedin.com/jobs/collections");

  // Hide all "Viewed" jobs and update counters
  function hideJobs() {
    if (!isJobPage()) return;

    const nodes = document.querySelectorAll("[data-job-id], [data-occludable-job-id]");

    nodes.forEach((job) => {
      // English-only, simple text check
      if (job.style.display !== "none" && job.innerText.includes("Viewed")) {
        job.style.display = "none";
        job.dataset.hiddenBy = "viewed";

        const li = job.closest("li");
        if (li) {
          li.style.display = "none";
          li.dataset.hiddenBy = "viewed";
        }

        // Count unique jobs by id (fallback to text)
        let id = job.getAttribute("data-job-id") || job.getAttribute("data-occludable-job-id");
        if (!id) id = job.innerText.trim();
        if (!countedIds.has(id)) {
          countedIds.add(id);
          hiddenCount++;
        }
      }
    });

    isOn = true;

    // Keep both keys for compatibility with any older code
    chrome?.storage?.local?.set({
      viewedHiddenCount: hiddenCount,
      hiddenViewedCount: hiddenCount,
    });

    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.(); // optional parity
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  // Show previously hidden "Viewed" jobs and reset counters
  function showJobs() {
    if (!isOn) return;

    const nodes = document.querySelectorAll("[data-job-id], [data-occludable-job-id]");
    nodes.forEach((job) => {
      if (job.innerText.includes("Viewed")) {
        job.style.display = "";
        const li = job.closest("li");
        if (li) li.style.display = "";
        job.removeAttribute("data-hidden-by");
        if (li) li.removeAttribute("data-hidden-by");
      }
    });

    hiddenCount = 0;
    countedIds.clear();
    isOn = false;

    chrome?.storage?.local?.set({
      viewedHiddenCount: 0,
      hiddenViewedCount: 0,
    });

    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.(); // optional parity
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  // --- Init from storage (same pattern as dismissed/promoted/applied) ---
  chrome?.storage?.local?.get(
    ["viewedHidden", "viewedHiddenCount", "hiddenViewedCount"],
    (res) => {
      const count = Number(res?.viewedHiddenCount ?? res?.hiddenViewedCount ?? 0);
      hiddenCount = count;

      if (res?.viewedHidden) {
        isOn = true;
        hideJobs();
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        isOn = false;
      }
    }
  );

  // --- React to storage toggles from the React badge ---
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if ("viewedHidden" in changes) {
      const on = !!changes.viewedHidden.newValue;
      if (on) {
        hideJobs();
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        showJobs();
        obs.disconnect();
      }
    }
  });

  // --- Watch for new nodes that match "Viewed" and hide them if ON ---
  const obs = new MutationObserver((muts) => {
    let found = false;
    for (const m of muts) {
      m.addedNodes?.forEach((node) => {
        if (
          node?.nodeType === 1 &&
          node.matches?.("[data-job-id], [data-occludable-job-id]") &&
          node.innerText?.includes?.("Viewed")
        ) {
          found = true;
        }
      });
    }
    if (isOn && found) hideJobs();
  });

  // --- SPA URL polling, same as others ---
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      if (!isJobPage()) {
        hiddenCount = 0;
        countedIds.clear();
        isOn = false;
        chrome?.storage?.local?.set({ viewedHiddenCount: 0, hiddenViewedCount: 0 });
        obs.disconnect();
      } else {
        chrome?.storage?.local?.get(["viewedHidden"], (r) => {
          if (r?.viewedHidden) {
            isOn = true;
            hideJobs();
            obs.observe(document.body, { childList: true, subtree: true });
          } else {
            isOn = false;
            showJobs();
          }
        });
      }
    }
  }, 1000);
})();
