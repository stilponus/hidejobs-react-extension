// ------------------------------
// Hide “Dismissed” jobs on LinkedIn (React UI controlled)
// ------------------------------

// === Local state ===
let hiddenDismissedCount = 0;
let countedDismissedJobIds = new Set();
let lastUrlDismissed = window.location.href;
let isDismissedJobsHidden = false; // OFF by default
let dismissedBadgeVisible = true;  // Show badge when ON (you can hardcode true)

// === Create Shadow DOM host right AFTER </body> for the badge ===
const dismissedShadowHost = document.createElement("div");
dismissedShadowHost.id = "HideJobsDismissedBadge";
document.body.insertAdjacentElement("afterend", dismissedShadowHost);
const dismissedShadowRoot = dismissedShadowHost.attachShadow({ mode: "open" });

// === EN-only badge text ===
const BADGE_TEXT = "Dismissed";

// === Helpers ===
function isJobPage() {
  return (
    window.location.href.startsWith("https://www.linkedin.com/jobs/search") ||
    window.location.href.startsWith("https://www.linkedin.com/jobs/collections")
  );
}

function hideDismissedJobListings() {
  if (!isJobPage()) return;

  const jobs = document.querySelectorAll(
    ".job-card-list--is-dismissed, .job-card-job-posting-card-wrapper--dismissed"
  );

  jobs.forEach((job) => {
    if (job.style.display !== "none") {
      job.style.display = "none";
      job.dataset.hiddenBy = "dismissed";

      const parentLi = job.closest("li");
      if (parentLi) {
        parentLi.style.display = "none";
        parentLi.dataset.hiddenBy = "dismissed";
      }

      let jobId =
        job.getAttribute("data-job-id") || job.getAttribute("data-occludable-job-id");
      if (!jobId) jobId = job.innerText.trim();

      if (!countedDismissedJobIds.has(jobId)) {
        countedDismissedJobIds.add(jobId);
        hiddenDismissedCount++;
      }
    }
  });

  isDismissedJobsHidden = true;
  chrome.storage.local.set({ hiddenDismissedCount });
  showDismissedBadge(hiddenDismissedCount);

  if (window.hideJobsUI?.checkHideButtons) {
    window.hideJobsUI.checkHideButtons();
  }
}

function showDismissedJobListings() {
  if (!isDismissedJobsHidden) return;

  const jobs = document.querySelectorAll(
    ".job-card-list--is-dismissed, .job-card-job-posting-card-wrapper--dismissed"
  );

  jobs.forEach((job) => {
    job.style.display = "";
    const parentLi = job.closest("li");
    if (parentLi) parentLi.style.display = "";

    job.removeAttribute("data-hidden-by");
    if (parentLi) parentLi.removeAttribute("data-hidden-by");
  });

  hiddenDismissedCount = 0;
  countedDismissedJobIds.clear();
  isDismissedJobsHidden = false;
  chrome.storage.local.set({ hiddenDismissedCount: 0 });
  showDismissedBadge("OFF");

  window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
  if (window.hideJobsUI?.checkHideButtons) {
    window.hideJobsUI.checkHideButtons();
  }
}

// === Badge ===
function showDismissedBadge(count) {
  if (!isJobPage()) {
    hideDismissedBadge();
    return;
  }
  if (!dismissedBadgeVisible) {
    hideDismissedBadge();
    return;
  }

  let badge = dismissedShadowRoot.getElementById("dismissedBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "dismissedBadge";
    badge.style.position = "fixed";
    badge.style.top = "64px";
    badge.style.right = "5px";
    badge.style.color = "white";
    badge.style.fontFamily =
      '-apple-system, system-ui, BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Fira Sans",Ubuntu,Oxygen,"Oxygen Sans",Cantarell,"Droid Sans","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Lucida Grande",Helvetica,Arial,sans-serif';
    badge.style.padding = "4px 4px 4px 13px";
    badge.style.fontSize = "16px";
    badge.style.borderRadius = "25px";
    badge.style.zIndex = "22";
    badge.style.fontWeight = "600";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.cursor = "pointer";
    badge.style.userSelect = "none";
    badge.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
    badge.style.transition =
      "opacity 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55), transform 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55)";
    badge.onclick = toggleDismissedVisibility;
    dismissedShadowRoot.appendChild(badge);
  }

  badge.innerHTML = "";
  const labelNode = document.createTextNode(BADGE_TEXT);
  const countDiv = document.createElement("div");
  countDiv.innerText = count === "OFF" ? "OFF" : hiddenDismissedCount;
  countDiv.style.alignItems = "center";
  countDiv.style.backgroundColor = "#f8fafd";
  countDiv.style.borderRadius = "20px";
  countDiv.style.color = "#00000099";
  countDiv.style.display = "inline-flex";
  countDiv.style.fontSize = "14px";
  countDiv.style.height = "14px";
  countDiv.style.justifyContent = "center";
  countDiv.style.marginLeft = "5px";
  countDiv.style.minWidth = "14px";
  countDiv.style.padding = "5px";
  countDiv.style.fontFamily =
    '-apple-system, system-ui, BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Fira Sans",Ubuntu,Oxygen,"Oxygen Sans",Cantarell,"Droid Sans","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Lucida Grande",Helvetica,Arial,sans-serif';
  countDiv.style.userSelect = "none";

  badge.appendChild(labelNode);
  badge.appendChild(countDiv);

  badge.style.opacity = isDismissedJobsHidden ? "1" : "0.5";
  badge.style.backgroundColor = isDismissedJobsHidden ? "#01754f" : "#666666";
}

function hideDismissedBadge() {
  const badge = dismissedShadowRoot.getElementById("dismissedBadge");
  if (badge) badge.remove();
  hiddenDismissedCount = 0;
  countedDismissedJobIds.clear();
  chrome.storage.local.set({ hiddenDismissedCount: 0 });
}

// === Toggle via badge click (kept for parity) ===
function toggleDismissedVisibility() {
  if (isDismissedJobsHidden) {
    showDismissedJobListings();
    chrome.storage.local.set({ dismissedHidden: false });
    // sync UI toggle (React Filters) too:
    chrome.storage.local.get(["hj_filters_state"], (res) => {
      const next = { ...(res?.hj_filters_state || {}), dismissed: false };
      chrome.storage.local.set({ hj_filters_state: next });
    });
    dismissedObserver.disconnect();
  } else {
    hideDismissedJobListings();
    chrome.storage.local.set({ dismissedHidden: true });
    chrome.storage.local.get(["hj_filters_state"], (res) => {
      const next = { ...(res?.hj_filters_state || {}), dismissed: true };
      chrome.storage.local.set({ hj_filters_state: next });
    });
    dismissedObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// === React Filters sync (listen to UI state) ===
window.addEventListener("hidejobs-filters-changed", (e) => {
  const on = !!e?.detail?.dismissed;
  if (on) {
    hideDismissedJobListings();
    chrome.storage.local.set({ dismissedHidden: true });
    dismissedObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    showDismissedJobListings();
    chrome.storage.local.set({ dismissedHidden: false });
    dismissedObserver.disconnect();
  }
});

// === Init from storage ===
chrome.storage.local.get(
  ["dismissedHidden", "hiddenDismissedCount"],
  (result) => {
    hiddenDismissedCount = result.hiddenDismissedCount || 0;

    if (result.dismissedHidden) {
      isDismissedJobsHidden = true;
      hideDismissedJobListings();
      dismissedObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      isDismissedJobsHidden = false;
      showDismissedBadge("OFF");
    }
  }
);

// === For SPA URL changes (super simple) ===
const dismissedObserver = new MutationObserver((mutations) => {
  let newDismissedJobs = false;
  for (const m of mutations) {
    m.addedNodes?.forEach((node) => {
      if (
        node?.nodeType === 1 &&
        node.matches?.(
          ".job-card-list--is-dismissed, .job-card-job-posting-card-wrapper--dismissed"
        )
      ) {
        newDismissedJobs = true;
      }
    });
  }
  if (isDismissedJobsHidden && newDismissedJobs) hideDismissedJobListings();
});

// Poll URL changes like before
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrlDismissed) {
    lastUrlDismissed = currentUrl;
    if (!isJobPage()) {
      hideDismissedBadge();
      hiddenDismissedCount = 0;
      countedDismissedJobIds.clear();
      isDismissedJobsHidden = false;
      chrome.storage.local.set({ hiddenDismissedCount: 0 });
      dismissedObserver.disconnect();
    } else {
      // re-apply current stored state
      chrome.storage.local.get(["dismissedHidden"], (r) => {
        if (r.dismissedHidden) {
          isDismissedJobsHidden = true;
          hideDismissedJobListings();
          dismissedObserver.observe(document.body, { childList: true, subtree: true });
        } else {
          isDismissedJobsHidden = false;
          showDismissedJobListings();
        }
      });
    }
  }
}, 1000);
