// ------------------------------
// Promoted filter logic (counts + DOM). Badge is React component in shadow UI.
// ------------------------------
(() => {
  console.log("[HideJobs] promoted logic loaded:", location.href);

  let hiddenCount = 0;
  let countedIds = new Set();
  let lastUrl = location.href;
  let isOn = false;

  const isJobPage = () =>
    location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    location.href.startsWith("https://www.linkedin.com/jobs/collections");

  // Hide all "Promoted" jobs and update counters
  function hideJobs() {
    if (!isJobPage()) return;

    // We scan common job wrappers that carry the job id attributes, same as your old script
    const nodes = document.querySelectorAll("[data-job-id], [data-occludable-job-id]");

    nodes.forEach((job) => {
      // Simple English-only check, as requested
      if (job.style.display !== "none" && job.innerText.includes("Promoted")) {
        job.style.display = "none";
        job.dataset.hiddenBy = "promoted";

        const li = job.closest("li");
        if (li) {
          li.style.display = "none";
          li.dataset.hiddenBy = "promoted";
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
    // Keep both keys for compatibility with any older code reading either one
    chrome?.storage?.local?.set({
      promotedHiddenCount: hiddenCount,
      hiddenPromotedCount: hiddenCount,
    });

    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  // Show all previously hidden "Promoted" jobs and reset counters
  function showJobs() {
    if (!isOn) return;

    const nodes = document.querySelectorAll("[data-job-id], [data-occludable-job-id]");
    nodes.forEach((job) => {
      if (job.innerText.includes("Promoted")) {
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
      promotedHiddenCount: 0,
      hiddenPromotedCount: 0,
    });

    // parity with your dismissed script
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  // --- Init from storage (exactly like "dismissed") ---
  chrome?.storage?.local?.get(
    ["promotedHidden", "promotedHiddenCount", "hiddenPromotedCount"],
    (res) => {
      const count = Number(res?.promotedHiddenCount ?? res?.hiddenPromotedCount ?? 0);
      hiddenCount = count;

      if (res?.promotedHidden) {
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
    if ("promotedHidden" in changes) {
      const on = !!changes.promotedHidden.newValue;
      if (on) {
        hideJobs();
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        showJobs();
        obs.disconnect();
      }
    }
  });

  // --- Watch for new nodes that match "Promoted" and hide them if ON ---
  const obs = new MutationObserver((muts) => {
    let found = false;
    for (const m of muts) {
      m.addedNodes?.forEach((node) => {
        if (
          node?.nodeType === 1 &&
          node.matches?.("[data-job-id], [data-occludable-job-id]") &&
          node.innerText?.includes?.("Promoted")
        ) {
          found = true;
        }
      });
    }
    if (isOn && found) hideJobs();
  });

  // --- SPA URL polling, mirror of dismissed ---
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      if (!isJobPage()) {
        hiddenCount = 0;
        countedIds.clear();
        isOn = false;
        chrome?.storage?.local?.set({ promotedHiddenCount: 0, hiddenPromotedCount: 0 });
        obs.disconnect();
      } else {
        chrome?.storage?.local?.get(["promotedHidden"], (r) => {
          if (r?.promotedHidden) {
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
