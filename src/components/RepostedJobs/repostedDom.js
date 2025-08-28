// src/components/RepostedJobs/repostedDom.js

export const REPOSTED_JOBS_KEY = "myRepostedJobs"; // map: { [jobId]: true }
export const REPOSTED_JOBS_DETAILS_KEY = "myRepostedJobsDetails"; // [{id, jobTitle, companyName, ...}]
export const HIDE_REPOSTED_STATE_KEY = "myHideRepostedActive";

// NOTE: keep this exact key in sync everywhere (Filters, inject, hooks)
export const FEATURE_BADGE_KEY = "repostedGhostBadgeVisible";
export const ALERT_DISMISSED_KEY = "repostedPanelAlertDismissed";

export function isSupportedHost() {
  return /linkedin\.com\/jobs\//i.test(String(location.href));
}

/* ------------------------------ Storage helpers ------------------------------ */

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

export async function loadRepostedDetails() {
  return new Promise((resolve) => {
    chrome?.storage?.local?.get(REPOSTED_JOBS_DETAILS_KEY, (d) => {
      try {
        const arr = d?.[REPOSTED_JOBS_DETAILS_KEY];
        resolve(Array.isArray(arr) ? arr : []);
      } catch {
        resolve([]);
      }
    });
  });
}

export async function saveRepostedDetails(arr) {
  await chrome?.storage?.local?.set({ [REPOSTED_JOBS_DETAILS_KEY]: arr });
}

/** Deduplicate by "id" (keep first occurrence). Returns the deduped array. */
export function dedupeRepostedDetails(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!item?.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/* -------------------------- Title / Company getters ------------------------- */

export function getCardTitle(card) {
  const cands = [
    ".job-card-job-posting-card-wrapper__title strong",
    ".job-card-list__title--link strong",
    ".job-card-container__link span[aria-hidden='true']",
    ".job-card-container__link",
    "a.job-card-list__title--link",
  ];
  for (const sel of cands) {
    const el = card.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t) return t;
  }
  return null;
}

export function getCardCompany(card) {
  const cands = [
    ".job-card-job-posting-card-wrapper__subtitle div[dir='ltr']",
    ".artdeco-entity-lockup__subtitle div[dir='ltr']",
    ".job-card-container__primary-description div[dir='ltr']",
    ".job-card-container__primary-description",
    ".artdeco-entity-lockup__subtitle",
    "a.job-card-container__company-name",
    ".job-card-container__company-name",
    "[data-test-reusables-job-card__company-name]",
  ];
  for (const sel of cands) {
    const el = card.querySelector(sel);
    const txt = el?.textContent?.trim();
    if (txt) return txt.replace(/\s+/g, " ");
  }
  return null;
}

/* --------------------------- Feature toggle helper -------------------------- */

// Cached flag so we don’t thrash storage on every DOM churn.
// Default = ON (historical behavior) unless explicitly set to false.
function getCachedFeatureEnabled() {
  if (typeof window !== "undefined" && ".__repostedFeatureOn" in window) {
    return !!window.__repostedFeatureOn;
  }
  return true;
}

function setCachedFeatureEnabled(val) {
  if (typeof window !== "undefined") {
    window.__repostedFeatureOn = !!val;
  }
}

/** Read the master toggle from storage (falls back to cached value). */
export async function isRepostedFeatureEnabled() {
  return new Promise((resolve) => {
    chrome?.storage?.local?.get([FEATURE_BADGE_KEY], (d) => {
      // explicitly false → disabled, anything else → enabled
      const enabled = d?.[FEATURE_BADGE_KEY] !== false;
      setCachedFeatureEnabled(enabled);
      resolve(enabled);
    });
  });
}

/* ------------------------------- Alert helpers ------------------------------ */

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

/* --------------------------------- Badging ---------------------------------- */

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
  // 🚫 Respect the master toggle at the DOM operation level too.
  if (!getCachedFeatureEnabled()) return;

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
  const badge = document.createElement("div");
  badge.className = "my-reposted-badge";
  badge.textContent = "Reposted";
  card.appendChild(badge);
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

export async function toggleHideShowReposted(hide) {
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
    if (!li || !id || !map[id]) return;
    li.style.display = hide ? "none" : "";
  });
}

/**
 * Apply badges from saved map to all visible cards.
 * NOW respects the master feature toggle and exits early when OFF.
 */
export async function applyOverlaysFromLocalStorage() {
  // ✅ Hard-stop if feature is OFF (check cache first, then storage to be safe)
  if (!getCachedFeatureEnabled()) {
    return;
  }
  // double-check storage in case cache is stale
  const enabled = await isRepostedFeatureEnabled();
  if (!enabled) return;

  const map = await loadRepostedMap();
  window.__repostedMapCache = map;

  document
    .querySelectorAll(
      ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
    )
    .forEach((card) => overlayReposted(card));
}

/* ------------------------------- Upsert detail ------------------------------ */

export async function upsertRepostedDetail(detail) {
  // detail: { id, jobTitle, companyName, location?, jobUrl?, detectedAt? }
  const existing = await loadRepostedDetails();
  const idx = existing.findIndex((x) => x.id === detail.id);
  const record = {
    id: detail.id,
    jobTitle: detail.jobTitle || null,
    companyName: detail.companyName || null,
    location: detail.location ?? null,
    jobUrl: detail.jobUrl ?? null,
    detectedAt: detail.detectedAt ?? Date.now(),
  };
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...record };
  } else {
    existing.unshift(record);
  }
  // hard bound
  if (existing.length > 1000) existing.length = 1000;

  // one last dedupe pass (safety)
  const deduped = dedupeRepostedDetails(existing);
  await saveRepostedDetails(deduped);
}
