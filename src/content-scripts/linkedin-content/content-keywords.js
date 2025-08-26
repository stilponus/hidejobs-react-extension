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
  let hiddenKeywordCount = 0;
  let countedKeywordJobIds = new Set();

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

  function getJobId(job) {
    return job.getAttribute('data-job-id') || 
           job.getAttribute('data-occludable-job-id') || 
           job.innerText.trim();
  }

  function updateKeywordCountDisplay() {
    chrome?.storage?.local?.set({ 
      keywordHiddenCount: hiddenKeywordCount,
      countedKeywordJobIds: Array.from(countedKeywordJobIds)
    });
  }

  function hideKeywordJobListings() {
    if (!keywords.length) return;

    const jobs = document.querySelectorAll(TEXT_NODES);

    jobs.forEach(job => {
      // Only process visible jobs to avoid double-counting
      if (job.style.display !== 'none') {
        const jobText = job.innerText.toLowerCase();
        if (matchesAnyKeyword(jobText, keywords)) {
          // Hide the job
          job.style.display = 'none';
          job.dataset.hiddenBy = "keyword";

          const parentLi = job.closest("li");
          if (parentLi) {
            parentLi.style.display = 'none';
            parentLi.dataset.hiddenBy = "keyword";
          }

          // Count it ONLY if we haven't counted it before
          const jobId = getJobId(job);
          if (jobId && !countedKeywordJobIds.has(jobId)) {
            countedKeywordJobIds.add(jobId);
            hiddenKeywordCount++;
            updateKeywordCountDisplay();
          }
        }
      }
    });

    // Apply other filters
    if (window.hideJobsUtils?.applyOverlaysFromLocalStorage) {
      window.hideJobsUtils.applyOverlaysFromLocalStorage();
    }
    
    if (window.hideJobsUI?.checkHideButtons) {
      window.hideJobsUI.checkHideButtons();
    }
  }

  function restoreJobsByKeyword(keyword) {
    const jobs = document.querySelectorAll(TEXT_NODES);
    jobs.forEach(job => {
      const jobText = job.innerText.toLowerCase();
      if (jobText.includes(keyword.toLowerCase())) {
        job.style.display = '';
        job.removeAttribute('data-hidden-by');
        
        const parentLi = job.closest("li");
        if (parentLi) {
          parentLi.style.display = '';
          parentLi.removeAttribute('data-hidden-by');
        }

        // Remove from count ONLY if we had counted it
        const jobId = getJobId(job);
        if (jobId && countedKeywordJobIds.has(jobId)) {
          countedKeywordJobIds.delete(jobId);
          hiddenKeywordCount = Math.max(0, hiddenKeywordCount - 1);
          updateKeywordCountDisplay();
        }
      }
    });

    if (window.hideJobsUI?.checkHideButtons) {
      window.hideJobsUI.checkHideButtons();
    }
  }

  function restoreAllKeywordJobs() {
    // Restore all jobs we've hidden
    countedKeywordJobIds.forEach(jobId => {
      let jobNode = document.querySelector(`[data-job-id="${jobId}"], [data-occludable-job-id="${jobId}"]`);
      if (!jobNode) {
        // Fallback: find by text content if ID-based search fails
        const jobs = document.querySelectorAll(TEXT_NODES);
        jobNode = Array.from(jobs).find(job => getJobId(job) === jobId);
      }
      
      if (jobNode && jobNode.dataset.hiddenBy === "keyword") {
        jobNode.style.display = '';
        jobNode.removeAttribute('data-hidden-by');
        
        const parentLi = jobNode.closest("li");
        if (parentLi && parentLi.dataset.hiddenBy === "keyword") {
          parentLi.style.display = '';
          parentLi.removeAttribute('data-hidden-by');
        }
      }
    });

    // Reset counts
    hiddenKeywordCount = 0;
    countedKeywordJobIds.clear();
    updateKeywordCountDisplay();
  }

  function hideNow() {
    isOn = true;
    readKeywords((list) => {
      keywords = list;
      hideKeywordJobListings();
      bindObserver();
    });
  }

  function showNow() {
    isOn = false;
    restoreAllKeywordJobs();
    unbindObserver();
  }

  function bindObserver() {
    const container =
      document.querySelector(".scaffold-layout__list, .jobs-search-results-list") ||
      document.querySelector('[data-test-reusable-search__entity-result-list]') ||
      document.body;
    if (!container) return;

    if (obs) obs.disconnect();
    obs = new MutationObserver(() => {
      // Debounce the calls
      clearTimeout(obs.debounceTimer);
      obs.debounceTimer = setTimeout(() => {
        if (isOn && keywords.length > 0) {
          hideKeywordJobListings();
        }
      }, 50);
    });
    obs.observe(container, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ["style", "class"] 
    });
  }

  function unbindObserver() {
    if (obs) {
      clearTimeout(obs.debounceTimer);
      obs.disconnect();
    }
    obs = null;
  }

  function applyStoredUserTextState() {
    // Handle pages that are not job pages
    if (!isJobPage()) {
      // Don't reset counts when navigating away from job pages
      chrome?.storage?.local?.set({ keywordHiddenCount: 0 });
      unbindObserver();
      return;
    }

    chrome?.storage?.local?.get(["userTextHidden", "filterKeywords", "keywordHiddenCount", "countedKeywordJobIds"], (res) => {
      isOn = !!res?.userTextHidden;
      keywords = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];
      
      // Restore persistent counts (don't reset on URL changes within job pages)
      if (typeof res?.keywordHiddenCount === 'number') {
        hiddenKeywordCount = res.keywordHiddenCount;
      }
      if (Array.isArray(res?.countedKeywordJobIds)) {
        countedKeywordJobIds = new Set(res.countedKeywordJobIds);
      }
      
      if (isOn && keywords.length > 0) {
        hideKeywordJobListings();
        bindObserver();
      } else {
        unbindObserver();
      }
    });
  }

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
      const newKeywords = Array.isArray(changes.filterKeywords.newValue) ? changes.filterKeywords.newValue : [];
      const oldKeywords = keywords;
      keywords = newKeywords;
      
      if (isOn) {
        // If all keywords were removed, restore all jobs and reset count
        if (newKeywords.length === 0) {
          restoreAllKeywordJobs();
        } else {
          // Find removed keywords and restore their jobs
          const removedKeywords = oldKeywords.filter(k => !newKeywords.includes(k));
          removedKeywords.forEach(keyword => restoreJobsByKeyword(keyword));
          
          // Hide jobs for current keywords
          hideKeywordJobListings();
        }
      }
    }
  });

  // SPA URL watcher - DON'T reset counts on job page navigation
  setInterval(() => {
    const u = location.href;
    if (u !== lastUrl) {
      lastUrl = u;
      applyStoredUserTextState();
    }
  }, 1000);

  // Initialize - reset count if no keywords exist
  chrome?.storage?.local?.get(["filterKeywords"], (res) => {
    const storedKeywords = Array.isArray(res?.filterKeywords) ? res.filterKeywords : [];
    if (storedKeywords.length === 0) {
      // No keywords = no hidden jobs = reset count
      hiddenKeywordCount = 0;
      countedKeywordJobIds.clear();
      chrome?.storage?.local?.set({ 
        keywordHiddenCount: 0,
        countedKeywordJobIds: []
      });
    }
    applyStoredUserTextState();
  });
})();