(() => {
  // ===== Toggle debug logs here =====
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log("[LIScraper]", ...args);
  const warn = (...args) => DEBUG && console.warn("[LIScraper][WARN]", ...args);
  const error = (...args) => DEBUG && console.error("[LIScraper][ERROR]", ...args);

  // === Config ===
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // ms

  // === Utils ===
  const getEl = (selector) => document.querySelector(selector);
  const getText = (selector, labelForDebug) => {
    const el = getEl(selector);
    if (!el && DEBUG) warn(`Selector not found: ${labelForDebug || selector}`);
    return el ? el.innerText.trim() : null;
  };
  const normalizeSpace = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : s);

  // Parse ranges like "$80K/yr - $120K/yr", "$90,000 - $120,000", "€70k–€95k", etc.
  const parseSalaryRange = (text) => {
    if (!text) {
      log("No salary text present; skipping range parse.");
      return { comp_min_salary: null, comp_max_salary: null, comp_currency: null };
    }
    const t = text.replace(/\u2013|\u2014|–|—/g, "-"); // normalize dashes
    let currency = null;
    if (/[€]/.test(t)) currency = "EUR";
    else if (/[£]/.test(t)) currency = "GBP";
    else if (/[$]/.test(t)) currency = "USD";

    const toNumber = (chunk) => {
      if (!chunk) return null;
      const raw = chunk.replace(/[^0-9.kmKM]/g, "").toLowerCase();
      if (!raw) return null;
      if (raw.endsWith("k")) return Math.round(parseFloat(raw) * 1_000);
      if (raw.endsWith("m")) return Math.round(parseFloat(raw) * 1_000_000);
      return parseInt(raw.replace(/[^\d]/g, ""), 10) || null;
    };

    const parts = t.split(/\s*-\s*/);
    let min = null;
    let max = null;
    if (parts.length >= 2) {
      min = toNumber(parts[0]);
      max = toNumber(parts[1]);
    } else {
      min = toNumber(t);
    }
    if (min && max && min > max) [min, max] = [max, min];

    log("Parsed salary:", { input: text, min, max, currency });
    return { comp_min_salary: min, comp_max_salary: max, comp_currency: currency };
  };

  const getTopCard = () =>
    getEl(".job-details-jobs-unified-top-card__primary-description-container") ||
    getEl(".job-details-jobs-unified-top-card__tertiary-description-container") ||
    null;

  const getJobTitle = () => {
    const title =
      getText(".job-details-jobs-unified-top-card__job-title h1", "title.h1") ||
      getText("h1.t-24", "h1.t-24") ||
      getText('h1[data-test-job-title]', 'h1[data-test-job-title]');
    return normalizeSpace(title);
  };

  const getCompanyName = () => {
    const name =
      getText(".job-details-jobs-unified-top-card__company-name a", "company link") ||
      getText(".job-details-jobs-unified-top-card__company-name", "company name");
    return normalizeSpace(name);
  };

  const getLocation = () => {
    const root = getTopCard();
    if (!root) {
      warn("Top card container not found; cannot derive location.");
      return null;
    }
    const span = root.querySelector(".tvm__text.tvm__text--low-emphasis");
    return normalizeSpace(span?.innerText || null);
  };

  const getPostedAgo = () => {
    const root = getTopCard();
    if (!root) return null;
    const all = Array.from(root.querySelectorAll(".tvm__text"));
    const hit = all.find((n) => /\b(day|days|week|weeks|month|months|hour|hours)\s+ago\b/i.test(n.innerText));
    return normalizeSpace(hit?.innerText || null);
  };

  const findFitLevelText = (predicate, label) => {
    const bar = getEl(".job-details-fit-level-preferences");
    if (!bar) {
      log(`Fit-level bar not found while looking for ${label || "value"}`);
      return null;
    }
    const nodes = Array.from(bar.querySelectorAll("button, span, div"))
      .map((n) => n.innerText?.trim())
      .filter(Boolean);
    const found = nodes.find((txt) => predicate(txt));
    if (!found) log(`No match found in fit-level bar for ${label || "value"}`, nodes);
    return found || null;
  };

  const getWorkFormat = () => {
    const t = findFitLevelText((txt) => /\b(remote|hybrid|on-?site)\b/i.test(txt), "work format");
    if (!t) return null;
    if (/remote/i.test(t)) return "Remote";
    if (/hybrid/i.test(t)) return "Hybrid";
    if (/on-?\s?site/i.test(t)) return "On-site";
    return null;
  };

  const getEmploymentType = () => {
    const t = findFitLevelText(
      (txt) => /\b(full[-\s]?time|part[-\s]?time|contract|internship|temporary)\b/i.test(txt),
      "employment type"
    );
    if (!t) return null;
    if (/full[-\s]?time/i.test(t)) return "Full-time";
    if (/part[-\s]?time/i.test(t)) return "Part-time";
    if (/contract/i.test(t)) return "Contract";
    if (/internship/i.test(t)) return "Internship";
    if (/temporary/i.test(t)) return "Temporary";
    return null;
  };

  const getSalaryText = () =>
    normalizeSpace(
      findFitLevelText((t) => /[\$€£]\s?\d|k\/yr|k per year|per year|yr/i.test(t), "salary")
    );

  const getJobDescriptionHTML = () => {
    const el = getEl("#job-details");
    if (!el) warn("#job-details not found (job description)");
    return el ? el.innerHTML : null;
  };

  // --- LinkedIn ID extraction ---
  // Works on both:
  //   1) /jobs/view/4273773977/
  //   2) /jobs/collections/.../?currentJobId=4273773977
  const getExternalJobId = () => {
    const u = new URL(window.location.href);
    const fromQuery = u.searchParams.get("currentJobId");
    if (fromQuery) return fromQuery;
    const m = u.pathname.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  };

  // --- Canonical LinkedIn job URL (no trailing slash), e.g.:
  // https://www.linkedin.com/jobs/view/4273773977
  const getCanonicalLinkedInUrl = () => {
    const id = getExternalJobId();
    return id ? `https://www.linkedin.com/jobs/view/${id}` : window.location.href;
  };

  // Keep for completeness (we store canonical instead)
  const hasEasyApply = () => {
    const btn = getEl("#jobs-apply-button-id");
    const present = !!(btn && /easy apply/i.test(btn.innerText || ""));
    log("Easy Apply detected:", present);
    return present;
  };

  // === Build payload (skip null/empty) ===
  const buildPayload = () => {
    const payload = {};
    const add = (k, v) => {
      if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) payload[k] = v;
    };

    const job_title = getJobTitle();
    const company_name = getCompanyName();
    const job_location = getLocation();
    const job_posted_ago = getPostedAgo();
    const salaryText = getSalaryText();
    const { comp_min_salary, comp_max_salary, comp_currency } = parseSalaryRange(salaryText);
    const job_description = getJobDescriptionHTML();
    const externalJobId = getExternalJobId();
    const work_format = getWorkFormat();
    const employment_type = getEmploymentType();

    add("job_title", job_title);
    add("company_name", company_name);
    add("job_location", job_location);
    add("job_posted_ago", job_posted_ago);
    add("salary", salaryText);
    add("comp_min_salary", comp_min_salary);
    add("comp_max_salary", comp_max_salary);
    add("comp_currency", comp_currency);
    add("job_description", job_description);
    add("externalJobId", externalJobId);

    // 🔒 Always save LinkedIn URL in canonical form (no trailing slash)
    add("job_url", getCanonicalLinkedInUrl());

    add("platform", "LinkedIn");
    add("easy_apply", hasEasyApply());
    add("employment_type", employment_type);
    add("work_format", work_format);

    if (DEBUG) log("Built payload (pre-flight):", JSON.parse(JSON.stringify(payload)));
    return payload;
  };

  const hasMissingCriticalData = (p) => {
    const missing = [];
    if (!p.job_title) missing.push("job_title");
    if (!p.company_name) missing.push("company_name");
    if (missing.length && DEBUG) warn("Missing critical fields:", missing);
    return missing.length > 0;
  };

  const sendPayload = (payload) => {
    window.postMessage({ type: "hidejobs-job-data", payload }, "*");
    if (DEBUG) log("Posted payload to content-script:", payload);
  };

  const extractWithRetry = (attempt = 0) => {
    try {
      const payload = buildPayload();
      if (hasMissingCriticalData(payload) && attempt < MAX_RETRIES) {
        log(`Retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAY}ms…`);
        setTimeout(() => extractWithRetry(attempt + 1), RETRY_DELAY);
      } else {
        if (hasMissingCriticalData(payload)) warn("Giving up after retries; sending whatever we have.");
        sendPayload(payload);
      }
    } catch (e) {
      error("Unexpected error during extraction:", e);
      if (attempt < MAX_RETRIES) {
        setTimeout(() => extractWithRetry(attempt + 1), RETRY_DELAY);
      }
    }
  };

  // Start once the title or description appears (highly dynamic page)
  const startWhenReady = () => {
    const ready = !!(getJobTitle() || getEl("#job-details"));
    if (DEBUG) log("Start check → ready:", ready);
    if (ready) extractWithRetry();
    return ready;
  };

  if (!startWhenReady()) {
    const observer = new MutationObserver(() => {
      if (startWhenReady()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    if (DEBUG) log("MutationObserver attached (waiting for job content)...");
  }
})();
