// src/components/RepostedJobs/repostedDom.js

/* ============== Shared keys (exported) ============== */
export const REPOSTED_JOBS_KEY = "myRepostedJobs";                // JSON map: { [jobId]: true }
export const HIDE_REPOSTED_STATE_KEY = "myHideRepostedActive";
export const FEATURE_BADGE_KEY = "repostedGhtostBadgeVisible";    // left for parity (default ON)
export const ALERT_DISMISSED_KEY = "repostedPanelAlertDismissed";

/* ============== Host check ============== */
export function isSupportedHost() {
  return /linkedin\.com\/jobs\//i.test(String(location.href));
}

/* ============== Storage helpers (exported) ============== */
export async function loadRepostedMap() {
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

export async function saveRepostedMap(map) {
  await chrome?.storage?.local?.set({ [REPOSTED_JOBS_KEY]: JSON.stringify(map) });
}

export async function loadAlertDismissed() {
  return new Promise((resolve) => {
    chrome?.storage?.local?.get(ALERT_DISMISSED_KEY, (d) => {
      resolve(d?.[ALERT_DISMISSED_KEY] === true);
    });
  });
}

export async function saveAlertDismissed() {
  await chrome?.storage?.local?.set({ [ALERT_DISMISSED_KEY]: true });
}

/* ============== Small DOM helpers (internal) ============== */
function smoothToggleJob(li, hide) {
  const isHidden = getComputedStyle(li).display === "none";
  if ((hide && isHidden) || (!hide && !isHidden)) return;
  li.style.display = hide ? "none" : "";
}

export function isHiddenByOtherFilters(card) {
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

/* ============== Badge styles + overlay (exported) ============== */
let stylesInjected = false;
export function ensureBadgeStyles() {
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

export function overlayReposted(card) {
  const existing = card.querySelector(".my-reposted-badge");
  if (existing) {
    existing.style.display = "inline-block";
    return;
  }

  const id =
    card.getAttribute("data-job-id") ||
    card.getAttribute("data-occludable-job-id") ||
    card
      .querySelector(".job-card-job-posting-card-wrapper[data-job-id]")
      ?.getAttribute("data-job-id");

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

/* ============== Hide/Show (exported via a single toggle) ============== */
async function hideAllReposted() {
  const cards = document.querySelectorAll(
    ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
  );
  const map = window.__repostedMapCache || {};
  cards.forEach((card) => {
    const id =
      card.getAttribute("data-job-id") ||
      card.getAttribute("data-occludable-job-id") ||
      card
        .querySelector(".job-card-job-posting-card-wrapper[data-job-id]")
        ?.getAttribute("data-job-id");
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
      card
        .querySelector(".job-card-job-posting-card-wrapper[data-job-id]")
        ?.getAttribute("data-job-id");
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

export async function toggleHideShowReposted(hide) {
  if (hide) return hideAllReposted();
  return showAllReposted();
}

/* ============== Apply overlays from storage (exported) ============== */
export async function applyOverlaysFromLocalStorage() {
  const map = await loadRepostedMap();
  window.__repostedMapCache = map;
  document
    .querySelectorAll(
      ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
    )
    .forEach((card) => overlayReposted(card));
}
