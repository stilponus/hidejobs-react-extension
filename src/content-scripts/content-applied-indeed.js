// ------------------------------
// Applied (Indeed) filter logic (counts + DOM). Badge is React component in shadow UI.
// Storage keys used (to work with FilterBadge + Filters panel):
//   indeedAppliedBadgeVisible -> boolean (show/hide badge UI)
//   indeedAppliedHidden       -> boolean (feature ON/OFF)
//   indeedAppliedHiddenCount  -> number  (count shown on badge)
// ------------------------------
(() => {
  console.log("[HideJobs] indeed applied logic loaded:", location.href);

  let hiddenCount = 0;
  let countedIds = new Set();
  let lastUrl = location.href;
  let isOn = false;

  // -------- Page-type detection (Indeed search/collections pages only) --------
  function isIndeedJobPage() {
    const host = location.hostname.toLowerCase();
    if (!host.includes("indeed.")) return false;

    const href = location.href;
    const path = location.pathname.toLowerCase();

    // Block obvious non-job surfaces
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

    const blockedPaths = [
      "/companies",
      "/career",
      "/career/",
      "/career-advice",
      "/career-services",
      "/cmp",
      "/about",
      "/help",
      "/legal",
      "/survey",
      "/contributions",
      "/notifications",
      "/viewjob", // individual job detail page; we only act on listing pages
    ];
    if (blockedPaths.some((p) => path.startsWith(p))) return false;

    // Allow common job list pages:
    //   https://www.indeed.{tld}/jobs
    //   Sometimes country TLDs vary; we rely on host.includes('indeed.')
    if (path.startsWith("/jobs")) return true;

    // Fallback: if main / with query like ?q=... treat as job page
    if (path === "/" && /[?&]q=/.test(href)) return true;

    return false;
  }

  // --------- Selectors / helpers (Indeed list DOM) ----------
  const getJobCards = () =>
    document.querySelectorAll('div[data-testid="slider_item"]');

  const getJobId = (card) => {
    // Primary id: data-jk on nested <a>, fallback: aria-label or innerText
    const a = card.querySelector('a[data-jk]');
    if (a) return a.getAttribute("data-jk");
    return card.getAttribute("data-jk") ||
           card.getAttribute("aria-label") ||
           card.innerText?.trim() ||
           null;
  };

  const getRowContainer = (card) => card.closest("li") || card;

  // one-time CSS for fully-hidden rows
  (() => {
    if (document.getElementById("hidejobs-indeed-applied-style")) return;
    const s = document.createElement("style");
    s.id = "hidejobs-indeed-applied-style";
    s.textContent = `
      .hidejobs-indeed-applied-hidden { display: none !important; }
    `;
    document.head.appendChild(s);
  })();

  // Smooth hide helper (nice collapse animation)
  function smoothHideRow(row) {
    if (row.classList.contains("hidejobs-indeed-applied-hidden")) return;
    const h = row.offsetHeight + "px";
    Object.assign(row.style, {
      overflow: "hidden",
      height: h,
      opacity: "1",
      transition:
        "height .5s cubic-bezier(.68,-.55,.27,1.55), opacity .3s ease",
    });
    requestAnimationFrame(() => {
      row.style.height = "0";
      row.style.opacity = "0";
    });
    const onEnd = (e) => {
      if (e.propertyName === "height") {
        row.classList.add("hidejobs-indeed-applied-hidden");
        row.removeAttribute("style");
        row.removeEventListener("transitionend", onEnd);
      }
    };
    row.addEventListener("transitionend", onEnd);
  }

  // Core hide: hide all cards that contain visible "Applied" label
  function hideApplied() {
    if (!isIndeedJobPage()) return;

    getJobCards().forEach((card) => {
      // Heuristic: Indeed renders the "Applied" state in the card text.
      if (
        getComputedStyle(card).display !== "none" &&
        card.innerText?.includes?.("Applied")
      ) {
        const row = getRowContainer(card);
        if (!row.classList.contains("hidejobs-indeed-applied-hidden")) {
          const id = getJobId(card) || card.innerText.trim();
          if (!countedIds.has(id)) {
            countedIds.add(id);
            hiddenCount++;
          }
          smoothHideRow(row);
        }
      }
    });

    isOn = true;
    chrome?.storage?.local?.set({
      indeedAppliedHiddenCount: hiddenCount,
    });

    // optional parity hooks
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  function showApplied() {
    const rows = document.querySelectorAll(".hidejobs-indeed-applied-hidden");
    rows.forEach((row) => row.classList.remove("hidejobs-indeed-applied-hidden"));

    hiddenCount = 0;
    countedIds.clear();
    isOn = false;

    chrome?.storage?.local?.set({
      indeedAppliedHiddenCount: 0,
    });

    // optional parity hooks
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  // Mutation observer: re-apply on new cards if ON
  const obs = new MutationObserver((muts) => {
    if (!isOn) return;
    let should = false;
    for (const m of muts) {
      m.addedNodes?.forEach((node) => {
        if (
          node?.nodeType === 1 &&
          (node.matches?.('div[data-testid="slider_item"]') ||
           node.querySelector?.('div[data-testid="slider_item"]'))
        ) {
          should = true;
        }
      });
    }
    if (should) hideApplied();
  });

  function attachObserver() {
    if (!isIndeedJobPage()) return;
    const root =
      document.getElementById("mosaic-provider-jobcards") || document.body;
    try {
      obs.observe(root, { childList: true, subtree: true });
    } catch {}
  }

  function detachObserver() {
    try {
      obs.disconnect();
    } catch {}
  }

  // Init from storage
  chrome?.storage?.local?.get(
    ["indeedAppliedHidden", "indeedAppliedHiddenCount"],
    (res) => {
      hiddenCount = Number(res?.indeedAppliedHiddenCount || 0);
      const startOn = !!res?.indeedAppliedHidden;

      if (isIndeedJobPage() && startOn) {
        isOn = true;
        hideApplied();
        attachObserver();
      } else {
        isOn = false;
      }
    }
  );

  // React to toggle changes from the React badge / Filters switch
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;

    if ("indeedAppliedHidden" in changes) {
      const next = !!changes.indeedAppliedHidden.newValue;
      if (next) {
        hideApplied();
        attachObserver();
      } else {
        detachObserver();
        showApplied();
      }
    }
  });

  // SPA URL watcher (Indeed often SPA-updates the list)
  setInterval(() => {
    const u = location.href;
    if (u === lastUrl) return;
    lastUrl = u;

    if (!isIndeedJobPage()) {
      // Leaving job page → clear local state and detach
      hiddenCount = 0;
      countedIds.clear();
      isOn = false;
      chrome?.storage?.local?.set({ indeedAppliedHiddenCount: 0 });
      detachObserver();
      return;
    }

    // Returning to job page → re-read toggle and apply if ON
    chrome?.storage?.local?.get(["indeedAppliedHidden"], (r) => {
      if (r?.indeedAppliedHidden) {
        isOn = true;
        hideApplied();
        attachObserver();
      } else {
        isOn = false;
        showApplied();
      }
    });
  }, 1000);
})();
