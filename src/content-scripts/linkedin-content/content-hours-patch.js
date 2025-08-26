(() => {
  const LOG = "[HoursPatch]";

  function overridePill(hours) {
    try {
      const pill = document.querySelector("#searchFilter_timePostedRange");
      if (!pill) return;
      const label = `Past ${hours} ${hours === 1 ? "hour" : "hours"}`;
      const textNode = Array.from(pill.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
      );
      if (textNode) textNode.textContent = ` ${label} `;
      pill.setAttribute("aria-label", `Date posted filter. ${label} filter is currently applied.`);
    } catch (e) { /* noop */ }
  }

  function syncFromUrl() {
    const m = location.href.match(/f_TPR=r(\d+)/);
    if (!m) return;
    const seconds = parseInt(m[1], 10);
    if (!Number.isFinite(seconds)) return;
    const hours = Math.max(1, Math.round(seconds / 3600));
    overridePill(hours);
  }

  // Observe DOM changes so we can re-apply when LinkedIn re-renders
  const mo = new MutationObserver(() => syncFromUrl());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Initial run + on history changes
  syncFromUrl();
  window.addEventListener("popstate", syncFromUrl);
  window.addEventListener("pushstate", syncFromUrl);
  window.addEventListener("replacestate", syncFromUrl);
})();
