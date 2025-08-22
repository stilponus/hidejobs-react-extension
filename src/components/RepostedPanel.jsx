import React, { useEffect, useRef, useState } from "react";
import { Button, Progress, Alert, Tooltip } from "antd";
import {
  RetweetOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

/* =========================================================================
   Complete Reposted Jobs functionality matching original implementation
   ======================================================================= */

/* ----------------------------- Keys & Flags ---------------------------- */
const REPOSTED_JOBS_KEY = "myRepostedJobs";
const HIDE_REPOSTED_STATE_KEY = "myHideRepostedActive";
const FEATURE_BADGE_KEY = "repostedGhtostBadgeVisible";
const ALERT_DISMISSED_KEY = "repostedPanelAlertDismissed";

/* ------------------------------- Settings ----------------------------- */
const SCROLL_MAX_ATTEMPTS = 20;
const SCROLL_WAIT_MS = 500;
const BATCH_SIZE = 5;
const MIN_DELAY_BETWEEN_CARDS_MS = 500;
const MAX_DELAY_BETWEEN_CARDS_MS = 800;
const MIN_DELAY_BETWEEN_BATCHES_MS = 300;
const MAX_DELAY_BETWEEN_BATCHES_MS = 900;
const WAIT_ACTIVE_POLL_INTERVAL = 200;
const WAIT_ACTIVE_MAX_ATTEMPTS = 5;

/* ------------------------------ Helpers ------------------------------- */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min, max) => delay(Math.random() * (max - min) + min);
const isSupportedHost = () => /linkedin\.com\/jobs\//i.test(String(location.href));

async function loadRepostedMap() {
  return new Promise((resolve) => {
    chrome?.storage?.local?.get(REPOSTED_JOBS_KEY, (d) => {
      try {
        resolve(d && d[REPOSTED_JOBS_KEY] ? JSON.parse(d[REPOSTED_JOBS_KEY]) : {});
      } catch {
        resolve({});
      }
    });
  });
}

async function saveRepostedMap(map) {
  await chrome?.storage?.local?.set({ [REPOSTED_JOBS_KEY]: JSON.stringify(map) });
}

async function loadAlertDismissed() {
  return new Promise((resolve) => {
    chrome?.storage?.local?.get(ALERT_DISMISSED_KEY, (d) => {
      resolve(d?.[ALERT_DISMISSED_KEY] === true);
    });
  });
}

async function saveAlertDismissed() {
  await chrome?.storage?.local?.set({ [ALERT_DISMISSED_KEY]: true });
}

async function initRepostedState() {
  const read = () =>
    new Promise((resolve) =>
      chrome?.storage?.local?.get([FEATURE_BADGE_KEY, HIDE_REPOSTED_STATE_KEY], (d) => {
        resolve({
          badgeVisible: d?.[FEATURE_BADGE_KEY] !== false, // Default to true
          hideReposted: d?.[HIDE_REPOSTED_STATE_KEY] === "true",
        });
      })
    );

  const s = await read();
  if (s.badgeVisible == null) {
    await chrome?.storage?.local?.set({ [FEATURE_BADGE_KEY]: true });
  }
  return s;
}

/* --------------------------- DOM helpers -------------------------- */
function smoothToggleJob(li, hide) {
  const isHidden = getComputedStyle(li).display === "none";
  if ((hide && isHidden) || (!hide && !isHidden)) return;
  li.style.display = hide ? "none" : "";
}

function isHiddenByOtherFilters(card) {
  const li = card.closest("li.scaffold-layout__list-item");
  return (
    card.dataset.hiddenBy === "dismissed" ||
    card.dataset.hiddenBy === "applied" ||
    card.dataset.hiddenBy === "promoted" ||
    card.dataset.hiddenBy === "viewed" ||
    card.dataset.hiddenBy === "keyword" ||
    card.dataset.hiddenBy === "company" ||
    li?.dataset.hiddenBy === "dismissed" ||
    li?.dataset.hiddenBy === "applied" ||
    li?.dataset.hiddenBy === "promoted" ||
    li?.dataset.hiddenBy === "viewed" ||
    li?.dataset.hiddenBy === "keyword" ||
    li?.dataset.hiddenBy === "company"
  );
}

let stylesInjected = false;
function ensureBadgeStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .my-reposted-badge{
      position:absolute; top:50%; right:20px; transform:translateY(-50%);
      background:#333; color:#fff; padding:4px 8px; font-weight:600; border-radius:4px;
      z-index:9; box-shadow:0 2px 6px rgba(0,0,0,.2); user-select:none; display:inline-block
    }
  `;
  document.head.appendChild(s);
}

function overlayReposted(card) {
  const existing = card.querySelector(".my-reposted-badge");
  if (existing) {
    existing.style.display = "inline-block";
    return;
  }
  
  const id =
    card.getAttribute("data-job-id") ||
    card.getAttribute("data-occludable-job-id") ||
    card.querySelector(".job-card-job-posting-card-wrapper[data-job-id]")?.getAttribute("data-job-id");
  
  if (!id) return;

  const map = window.__repostedMapCache || {};
  if (!map[id]) return;

  card.style.position = "relative";
  if (isHiddenByOtherFilters(card)) return;

  const badge = document.createElement("div");
  badge.className = "my-reposted-badge";
  badge.textContent = "Reposted";
  card.appendChild(badge);
}

async function hideAllReposted() {
  const cards = document.querySelectorAll(
    ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
  );
  const map = window.__repostedMapCache || {};
  cards.forEach((card) => {
    const id =
      card.getAttribute("data-job-id") ||
      card.getAttribute("data-occludable-job-id") ||
      card.querySelector(".job-card-job-posting-card-wrapper[data-job-id]")?.getAttribute("data-job-id");
    const li = card.closest("li.scaffold-layout__list-item");
    if (id && map[id] && li) {
      smoothToggleJob(li, true);
      card.dataset.hiddenBy = "reposted";
    }
  });
}

async function showAllReposted() {
  const cards = document.querySelectorAll(
    ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
  );
  const map = window.__repostedMapCache || {};
  cards.forEach((card) => {
    const id =
      card.getAttribute("data-job-id") ||
      card.getAttribute("data-occludable-job-id") ||
      card.querySelector(".job-card-job-posting-card-wrapper[data-job-id]")?.getAttribute("data-job-id");
    const li = card.closest("li.scaffold-layout__list-item");
    if (!li) return;

    const hiddenBySelf = card.dataset.hiddenBy;
    const hiddenByParent = li?.dataset.hiddenBy;
    const blockedByOtherFilters =
      ["dismissed", "applied", "promoted", "viewed", "keyword", "company"].includes(hiddenBySelf) ||
      ["dismissed", "applied", "promoted", "viewed", "keyword", "company"].includes(hiddenByParent);

    if (id && map[id] && !blockedByOtherFilters) {
      smoothToggleJob(li, false);
    }
  });
}

async function toggleHideShowReposted(hide) {
  if (hide) return hideAllReposted();
  return showAllReposted();
}

async function applyOverlaysFromLocalStorage() {
  const map = await loadRepostedMap();
  window.__repostedMapCache = map;
  document
    .querySelectorAll(".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]")
    .forEach((card) => overlayReposted(card));
}

/* ----------------------------- Scan helpers --------------------------- */
function waitActive(li) {
  const wrapper =
    li.querySelector(".job-card-job-posting-card-wrapper") ||
    li.querySelector(".job-card-container--clickable") ||
    li;
  return new Promise((resolve) => {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const active =
        li.classList.contains("jobs-search-results-list__list-item--active") ||
        li.getAttribute("aria-current") === "page" ||
        wrapper.classList.contains("job-card-job-posting-card-wrapper--active") ||
        wrapper.getAttribute("aria-current") === "page";
      if (active || tries >= WAIT_ACTIVE_MAX_ATTEMPTS) {
        clearInterval(iv);
        resolve(active);
      }
    }, WAIT_ACTIVE_POLL_INTERVAL);
  });
}

async function scrollToEnd() {
  const sentinel = document.querySelector("[data-results-list-top-scroll-sentinel]");
  const container = sentinel ? sentinel.parentElement : document.scrollingElement;

  let oldCount = 0;
  let attempts = 0;
  const baseHeight = container.clientHeight || window.innerHeight;

  while (attempts < SCROLL_MAX_ATTEMPTS) {
    attempts++;
    const cur = document.querySelectorAll(
      "[data-occludable-job-id]," +
      "[data-job-id]," +
      ".job-card-job-posting-card-wrapper[data-job-id]," +
      ".job-card-container[data-job-id]"
    ).length;

    if (cur <= oldCount) break;
    oldCount = cur;

    const scrollAmount = baseHeight * (0.75 + Math.random() * 0.5);
    container.scrollBy({ top: scrollAmount, behavior: "smooth" });
    await randomDelay(SCROLL_WAIT_MS, SCROLL_WAIT_MS * 2);
  }
}

function isPaneReposted(paneEl) {
  const spans = Array.from(
    paneEl?.querySelectorAll(".job-details-jobs-unified-top-card__tertiary-description-container span") || []
  );
  return spans.some((span) => {
    const txt = span.innerText.trim().toLowerCase();
    return /^reposted\s+\d+\s+(minute|hour|day|week|month)s?\s+ago$/.test(txt);
  });
}

async function scanForRepostedJobs({ onProgress, onFound, shouldAbort }) {
  const t0 = performance.now();
  let aborted = false;
  let foundCount = 0;

  chrome?.runtime?.sendMessage?.({
    type: "trackEvent",
    eventName: "button_click",
    eventParams: { button_name: "Scan for Reposted Jobs" },
  });

  await scrollToEnd();

  const seenIds = new Set();
  const allCards = Array.from(
    document.querySelectorAll(
      "[data-occludable-job-id]," +
      "[data-job-id]," +
      ".job-card-job-posting-card-wrapper[data-job-id]," +
      ".job-card-container[data-job-id]"
    )
  ).filter((card) => {
    if (card.closest(".continuous-discovery-modules")) return false;
    const id =
      card.getAttribute("data-occludable-job-id") ||
      card.getAttribute("data-job-id") ||
      card
        .querySelector(".job-card-job-posting-card-wrapper[data-job-id]")
        ?.getAttribute("data-job-id");
    if (!id) return false;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  if (allCards.length === 0) {
    onProgress(100);
    return { aborted: false, durationSec: 0, foundCount: 0 };
  }

  const map = await loadRepostedMap();
  window.__repostedMapCache = map;

  let processed = 0;
  for (let i = 0; i < allCards.length; i += BATCH_SIZE) {
    if (shouldAbort()) {
      aborted = true;
      break;
    }
    const batch = allCards.slice(i, i + BATCH_SIZE);
    for (const li of batch) {
      if (shouldAbort()) {
        aborted = true;
        break;
      }
      processed++;

      const id =
        li.getAttribute("data-occludable-job-id") ||
        li.getAttribute("data-job-id") ||
        li
          .querySelector(".job-card-job-posting-card-wrapper[data-job-id]")
          ?.getAttribute("data-job-id");

      if (!id) {
        onProgress((processed / allCards.length) * 100);
        continue;
      }

      if (map[id]) {
        overlayReposted(li);
        onProgress((processed / allCards.length) * 100);
        continue;
      }

      const clickTarget =
        li.querySelector(".job-card-job-posting-card-wrapper__card-link") ||
        li.querySelector(".job-card-container__link") ||
        (li.matches(".job-card-container--clickable,.job-card-job-posting-card-wrapper")
          ? li
          : li.querySelector(".job-card-container--clickable,.job-card-job-posting-card-wrapper"));

      if (clickTarget) {
        clickTarget.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
        );
      }

      await waitActive(li);
      await delay(500);
      li.scrollIntoView({ behavior: "smooth", block: "start" });

      const pane = document.querySelector(".jobs-search__job-details--container");

      const cardTitle = li
        .querySelector(".job-card-job-posting-card-wrapper__title strong, .job-card-list__title--link strong")
        ?.textContent?.trim()
        ?.toLowerCase();
      const cardCompany = li
        .querySelector(
          ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], .artdeco-entity-lockup__subtitle div[dir='ltr']"
        )
        ?.innerText?.trim()
        ?.toLowerCase();

      const paneTitleEl = pane?.querySelector(
        ".job-details-jobs-unified-top-card__job-title h1, .job-details-jobs-unified-top-card__job-title a, .jobs-unified-top-card__job-title h1"
      );
      const paneCompanyEl = pane?.querySelector(
        ".job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a"
      );

      if (!paneTitleEl || !paneCompanyEl) {
        onProgress((processed / allCards.length) * 100);
        continue;
      }
      const paneTitle = paneTitleEl.textContent.trim().toLowerCase();
      const paneCompany = paneCompanyEl.textContent.trim().toLowerCase();

      if ((cardTitle && paneTitle && cardTitle !== paneTitle) || (cardCompany && paneCompany && cardCompany !== paneCompany)) {
        onProgress((processed / allCards.length) * 100);
        continue;
      }

      const paneIsReposted = isPaneReposted(pane);
      if (paneIsReposted) {
        map[id] = true;
        await saveRepostedMap(map);
        window.__repostedMapCache = map;
        overlayReposted(li);

        const jobTitle =
          li.querySelector(".job-card-job-posting-card-wrapper__title strong, .job-card-list__title--link strong")
            ?.textContent?.trim() || null;
        const companyName =
          li.querySelector(
            ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr'], .artdeco-entity-lockup__subtitle div[dir='ltr']"
          )?.innerText?.trim() || null;
        const location =
          li.querySelector(".artdeco-entity-lockup__caption div[dir='ltr'], .job-card-container__metadata-wrapper li span")
            ?.innerText?.trim() || null;
        const jobUrl = id ? `https://www.linkedin.com/jobs/view/${id}/` : null;

        window.dispatchEvent(
          new CustomEvent("repostedJobDetected", {
            detail: { jobId: id, timestamp: Date.now(), jobTitle, companyName, location, jobUrl },
          })
        );
        chrome?.runtime?.sendMessage?.({
          type: "logRepostedJobToFirebase",
          payload: { jobId: id, jobTitle, companyName, location, jobUrl },
        });

        foundCount += 1;
        onFound(foundCount);
      }

      onProgress((processed / allCards.length) * 100);
      await randomDelay(MIN_DELAY_BETWEEN_CARDS_MS, MAX_DELAY_BETWEEN_CARDS_MS);
    }
    await randomDelay(MIN_DELAY_BETWEEN_BATCHES_MS, MAX_DELAY_BETWEEN_BATCHES_MS);
    if (aborted) break;
  }

  const secs = (performance.now() - t0) / 1000;

  chrome?.runtime?.sendMessage?.({
    type: "trackEvent",
    eventName: "scan_complete",
    eventParams: { duration: secs, new_jobs_found: foundCount },
  });

  await chrome?.storage?.local?.set({ [HIDE_REPOSTED_STATE_KEY]: "false" });

  return { aborted: false, durationSec: secs, foundCount };
}

/* ========================== React Component ========================== */
export default function RepostedPanel() {
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [firstScanDone, setFirstScanDone] = useState(false);
  const [hideReposted, setHideReposted] = useState(false);
  const [foundThisScan, setFoundThisScan] = useState(0);
  const [hostSupported, setHostSupported] = useState(isSupportedHost());
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [repostedCount, setRepostedCount] = useState(0);
  const [blockedByOtherFilters, setBlockedByOtherFilters] = useState(false);
  const abortRef = useRef({ aborted: false });

  // Function to count reposted jobs and check for blocked filters
  const updateCounts = async () => {
    const map = await loadRepostedMap();
    const seen = new Set();
    let visibleRepostedCount = 0;
    let hasBlockedJobs = false;

    document.querySelectorAll(
      ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
    ).forEach(card => {
      const id = card.getAttribute("data-job-id") || 
                  card.getAttribute("data-occludable-job-id") ||
                  card.querySelector(".job-card-job-posting-card-wrapper[data-job-id]")?.getAttribute("data-job-id");
      
      if (!id || seen.has(id) || !map[id]) return;
      seen.add(id);

      if (isHiddenByOtherFilters(card)) {
        hasBlockedJobs = true;
      } else {
        visibleRepostedCount++;
      }
    });

    setRepostedCount(visibleRepostedCount);
    setBlockedByOtherFilters(hasBlockedJobs);
  };

  useEffect(() => {
    let mounted = true;
    ensureBadgeStyles();

    (async () => {
      const s = await initRepostedState();
      const dismissed = await loadAlertDismissed();
      if (!mounted) return;
      setHideReposted(s.hideReposted);
      setAlertDismissed(dismissed);
      await applyOverlaysFromLocalStorage();
      if (s.hideReposted) await toggleHideShowReposted(true);
      await updateCounts();
    })();

    const list = document.querySelector("div.scaffold-layout__list");
    let mo;
    if (list) {
      mo = new MutationObserver(() => {
        if (scanning) return;
        applyOverlaysFromLocalStorage();
        toggleHideShowReposted(hideReposted);
        updateCounts();
      });
      mo.observe(list, { childList: true, subtree: true });
    }

    return () => {
      mounted = false;
      if (mo) mo.disconnect();
    };
  }, [scanning, hideReposted]);

  const onScan = async () => {
    if (!hostSupported) return;
    if (scanning || firstScanDone) return;

    abortRef.current.aborted = false;
    setScanning(true);
    setFoundThisScan(0);
    setProgress(0);

    const res = await scanForRepostedJobs({
      onProgress: (p) => setProgress(p),
      onFound: (c) => setFoundThisScan(c),
      shouldAbort: () => abortRef.current.aborted,
    });

    setScanning(false);
    if (res.aborted) {
      setFirstScanDone(false);
      setProgress(0);
    } else {
      setFirstScanDone(true);
    }

    await applyOverlaysFromLocalStorage();
    if (hideReposted) await toggleHideShowReposted(true);
    await updateCounts();
  };

  const onAbort = () => {
    if (!scanning) return;
    abortRef.current.aborted = true;
  };

  const onToggle = async () => {
    const next = !hideReposted;
    setHideReposted(next);
    await chrome.storage?.local?.set({ [HIDE_REPOSTED_STATE_KEY]: String(next) });
    await toggleHideShowReposted(next);
    await applyOverlaysFromLocalStorage();
    await updateCounts();
  };

  const onCloseAlert = async () => {
    setAlertDismissed(true);
    await saveAlertDismissed();
  };

  // Generate button text based on state
  const getToggleButtonText = () => {
    if (repostedCount === 0 && !firstScanDone) {
      return hideReposted ? "Show" : "Hide";
    }
    
    if (hideReposted) {
      return blockedByOtherFilters 
        ? "Show" 
        : `Show (${repostedCount} hidden on this page)`;
    } else {
      return blockedByOtherFilters 
        ? "Hide" 
        : `Hide ${repostedCount} reposted job${repostedCount === 1 ? "" : "s"}`;
    }
  };

  const shouldShowToggleButton = repostedCount > 0 || (firstScanDone && blockedByOtherFilters);
  const shouldShowNoJobsMessage = firstScanDone && !scanning && repostedCount === 0 && !blockedByOtherFilters;
  const shouldShowBlockedMessage = blockedByOtherFilters && repostedCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RetweetOutlined />
        <h2 className="text-lg font-semibold text-hidejobs-700">Reposted jobs</h2>
      </div>

      {!hostSupported ? (
        <Alert
          type="warning"
          message="Open LinkedIn Jobs"
          description="This tool works on LinkedIn job search pages. Open a LinkedIn jobs list and run the scan."
          closable={!alertDismissed}
          onClose={onCloseAlert}
          style={{ display: alertDismissed ? 'none' : 'block' }}
        />
      ) : (
        !alertDismissed && (
          <Alert
            type="info"
            message="How it works"
            description={
              <div className="text-sm">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Click <strong>Scan for Reposted Jobs</strong>.</li>
                  <li>We open each visible card, match title/company, then detect <em>"Reposted … ago"</em> in the details.</li>
                  <li>Use <strong>Hide</strong>/<strong>Show</strong> to toggle reposted items in the list.</li>
                  <li className="text-red-500">
                    <ExclamationCircleOutlined className="mr-1" />
                    <strong>Re-scan</strong> when you revisit the page to stay up to date.
                  </li>
                </ul>
              </div>
            }
            closable
            onClose={onCloseAlert}
          />
        )
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Tooltip title="Scans LinkedIn job cards and marks 'Reposted' ones. Note: Scanning will mark all jobs as 'Viewed'">
            <Button
              type="primary"
              icon={<RetweetOutlined />}
              loading={scanning}
              onClick={onScan}
              disabled={scanning || firstScanDone || !hostSupported}
            >
              {scanning ? "Scanning…" : firstScanDone ? `Scan Completed (${foundThisScan > 0 ? foundThisScan + ' found' : 'none found'})` : "Scan for Reposted Jobs"}
            </Button>
          </Tooltip>

          <Tooltip title="Cancel the ongoing scan">
            <Button icon={<StopOutlined />} danger onClick={onAbort} disabled={!scanning}>
              Cancel
            </Button>
          </Tooltip>

          {shouldShowToggleButton && (
            <Tooltip title={hideReposted ? "Show reposted jobs" : "Hide reposted jobs"}>
              <Button
                icon={hideReposted ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={onToggle}
                disabled={scanning || !hostSupported}
                type={hideReposted ? "default" : "primary"}
                danger={!hideReposted}
              >
                {getToggleButtonText()}
              </Button>
            </Tooltip>
          )}
        </div>

        <Progress percent={Math.round(progress)} />

        {shouldShowNoJobsMessage && (
          <div className="text-center text-gray-500 italic">
            No reposted jobs detected
          </div>
        )}

        {shouldShowBlockedMessage && (
          <Alert
            type="warning"
            message="Some reposted jobs are hidden by other filters"
            description="Reposted jobs may be hidden by dismissed, applied, promoted, viewed, keyword, or company filters."
            showIcon
            icon={<ExclamationCircleOutlined />}
            className="text-sm"
          />
        )}
      </div>
    </div>
  );
}