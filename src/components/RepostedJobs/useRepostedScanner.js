// src/components/RepostedJobs/useRepostedScanner.js
import { useEffect, useRef, useState } from "react";
import {
  ensureBadgeStyles,
  applyOverlaysFromLocalStorage,
  toggleHideShowReposted,
  isSupportedHost,
  isHiddenByOtherFilters,
  loadRepostedMap,
  saveRepostedMap,
  REPOSTED_JOBS_KEY,
  HIDE_REPOSTED_STATE_KEY,
  FEATURE_BADGE_KEY,
  overlayReposted,
} from "./repostedDom";

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

/* ======== tiny DOM helpers local to scanner (no export) ======== */
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

/* ============================== Hook =============================== */
export default function useRepostedScanner() {
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [firstScanDone, setFirstScanDone] = useState(false);
  const [hideReposted, setHideReposted] = useState(false);
  const [foundThisScan, setFoundThisScan] = useState(0);
  const [repostedCount, setRepostedCount] = useState(0);
  const [blockedByOtherFilters, setBlockedByOtherFilters] = useState(false);

  const abortRef = useRef({ aborted: false });
  const runIdRef = useRef(0); // guard against stale async updates

  // init hide/show state from storage
  useEffect(() => {
    (async () => {
      const read = () =>
        new Promise((resolve) =>
          chrome?.storage?.local?.get([FEATURE_BADGE_KEY, HIDE_REPOSTED_STATE_KEY], (d) => {
            resolve({
              badgeVisible: d?.[FEATURE_BADGE_KEY] !== false, // default true
              hideReposted: d?.[HIDE_REPOSTED_STATE_KEY] === "true",
            });
          })
        );

      const s = await read();
      if (s.badgeVisible == null) {
        await chrome?.storage?.local?.set({ [FEATURE_BADGE_KEY]: true });
      }
      setHideReposted(s.hideReposted);
      // refresh overlays according to stored state
      await applyOverlaysFromLocalStorage();
      if (s.hideReposted) await toggleHideShowReposted(true);
      await updateCounts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        // known → overlay & continue (live badge)
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

        if (
          (cardTitle && paneTitle && cardTitle !== paneTitle) ||
          (cardCompany && paneCompany && cardCompany !== paneCompany)
        ) {
          onProgress((processed / allCards.length) * 100);
          continue;
        }

        const paneIsReposted = isPaneReposted(pane);
        if (paneIsReposted) {
          map[id] = true;
          await saveRepostedMap(map);
          window.__repostedMapCache = map;

          // live badge now
          overlayReposted(li);

          // optional telemetry
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

    return { aborted, durationSec: secs, foundCount };
  }

  async function updateCounts() {
    const map = await loadRepostedMap();
    const seen = new Set();
    let visibleRepostedCount = 0;
    let hasBlockedJobs = false;

    document
      .querySelectorAll(
        ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
      )
      .forEach((card) => {
        const id =
          card.getAttribute("data-job-id") ||
          card.getAttribute("data-occludable-job-id") ||
          card
            .querySelector(".job-card-job-posting-card-wrapper[data-job-id]")
            ?.getAttribute("data-job-id");

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
  }

  async function onScan() {
    if (!isSupportedHost()) return;
    if (scanning || firstScanDone) return;

    const myRun = ++runIdRef.current; // unique id for this scan run
    abortRef.current.aborted = false; // clear previous cancel

    setScanning(true);
    setFoundThisScan(0);
    setProgress(0);

    const res = await scanForRepostedJobs({
      onProgress: (p) => {
        if (runIdRef.current !== myRun || abortRef.current.aborted) return;
        setProgress(p);
      },
      onFound: (c) => {
        if (runIdRef.current !== myRun || abortRef.current.aborted) return;
        setFoundThisScan(c);
      },
      shouldAbort: () => abortRef.current.aborted || runIdRef.current !== myRun,
    });

    // canceled or superseded -> ignore late completion
    if (runIdRef.current !== myRun) return;

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
  }

  function onAbort() {
    if (!scanning) return;
    abortRef.current.aborted = true; // signal to stop
    runIdRef.current += 1; // invalidate this run (ignore any late updates)

    // immediate UI reset
    setScanning(false);
    setFirstScanDone(false);
    setProgress(0);
    setFoundThisScan(0);
  }

  async function onToggle() {
    const next = !hideReposted;
    setHideReposted(next);
    await chrome.storage?.local?.set({ [HIDE_REPOSTED_STATE_KEY]: String(next) });
    await toggleHideShowReposted(next);
    await applyOverlaysFromLocalStorage();
    await updateCounts();
  }

  return {
    // state
    scanning,
    firstScanDone,
    progress,
    foundThisScan,
    hideReposted,
    repostedCount,
    blockedByOtherFilters,
    // handlers
    onScan,
    onAbort,
    onToggle,
    updateCounts,
  };
}
