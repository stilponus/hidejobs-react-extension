// ------------------------------
// Dismissed filter logic (counts + DOM). Badge is React component in shadow UI.
// ------------------------------
(() => {
  console.log("[HideJobs] dismissed logic loaded:", location.href);

  let hiddenCount = 0;
  let countedIds = new Set();
  let lastUrl = location.href;
  let isOn = false;

  const isJobPage = () =>
    location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    location.href.startsWith("https://www.linkedin.com/jobs/collections");

  function hideJobs() {
    if (!isJobPage()) return;
    const nodes = document.querySelectorAll(
      ".job-card-list--is-dismissed, .job-card-job-posting-card-wrapper--dismissed"
    );
    nodes.forEach((job) => {
      if (job.style.display !== "none") {
        job.style.display = "none";
        job.dataset.hiddenBy = "dismissed";
        const li = job.closest("li");
        if (li) {
          li.style.display = "none";
          li.dataset.hiddenBy = "dismissed";
        }
        let id = job.getAttribute("data-job-id") || job.getAttribute("data-occludable-job-id");
        if (!id) id = job.innerText.trim();
        if (!countedIds.has(id)) {
          countedIds.add(id);
          hiddenCount++;
        }
      }
    });
    isOn = true;
    chrome?.storage?.local?.set({ dismissedHiddenCount: hiddenCount, hiddenDismissedCount: hiddenCount }); // keep both just in case
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  function showJobs() {
    if (!isOn) return;
    const nodes = document.querySelectorAll(
      ".job-card-list--is-dismissed, .job-card-job-posting-card-wrapper--dismissed"
    );
    nodes.forEach((job) => {
      job.style.display = "";
      const li = job.closest("li");
      if (li) li.style.display = "";
      job.removeAttribute("data-hidden-by");
      if (li) li.removeAttribute("data-hidden-by");
    });
    hiddenCount = 0;
    countedIds.clear();
    isOn = false;
    chrome?.storage?.local?.set({ dismissedHiddenCount: 0, hiddenDismissedCount: 0 });
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  // init from storage
  chrome?.storage?.local?.get(
    ["dismissedHidden", "dismissedHiddenCount", "hiddenDismissedCount"],
    (res) => {
      const count = Number(res?.dismissedHiddenCount ?? res?.hiddenDismissedCount ?? 0);
      hiddenCount = count;
      if (res?.dismissedHidden) {
        isOn = true;
        hideJobs();
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        isOn = false;
      }
    }
  );

  // react to storage toggles from the React badge
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if ("dismissedHidden" in changes) {
      const on = !!changes.dismissedHidden.newValue;
      if (on) {
        hideJobs();
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        showJobs();
        obs.disconnect();
      }
    }
  });

  // watch new nodes
  const obs = new MutationObserver((muts) => {
    let found = false;
    for (const m of muts) {
      m.addedNodes?.forEach((node) => {
        if (
          node?.nodeType === 1 &&
          node.matches?.(
            ".job-card-list--is-dismissed, .job-card-job-posting-card-wrapper--dismissed"
          )
        ) {
          found = true;
        }
      });
    }
    if (isOn && found) hideJobs();
  });

  // URL poll re-apply
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      if (!isJobPage()) {
        hiddenCount = 0;
        countedIds.clear();
        isOn = false;
        chrome?.storage?.local?.set({ dismissedHiddenCount: 0, hiddenDismissedCount: 0 });
        obs.disconnect();
      } else {
        chrome?.storage?.local?.get(["dismissedHidden"], (r) => {
          if (r?.dismissedHidden) {
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
