(() => {
  // ===== Toggle debug logs here =====
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log("[GDScraper]", ...args);
  const error = (...args) => DEBUG && console.error("[GDScraper][ERROR]", ...args);

  // === Config ===
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // ms
  const URL_CHECK_INTERVAL = 300; // ms fallback for stealth changes

  // === Internal state for run / URL tracking ===
  const STATE = {
    lastUrl: window.location.href,
    runId: 0,               // increments on each new URL so old retries are ignored
    retryTimeout: null,     // current retry timer
    readyObserver: null,    // observer waiting for job content
    urlObserver: null,      // observer watching for URL changes via DOM updates
    urlInterval: null,      // interval fallback for URL checks
    // NEW: observe in-panel job switches on /Job/index.htm (no navigation)
    jobObserver: null,
    lastJobId: null,
  };

  // === Utils ===
  const getEl = (selector) => document.querySelector(selector);
  const getText = (selector) => {
    const el = getEl(selector);
    return el ? el.innerText.trim() : null;
  };
  const normalizeSpace = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : s);
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  // Parse ranges like "$130K - $140K", "$90,000 - $120,000", "€70k–€95k", etc.
  const parseSalaryRange = (text) => {
    if (!text) {
      log("No salary text present; skipping range parse.");
      return { comp_min_salary: null, comp_max_salary: null, comp_currency: null, comp_pay_period: "year" };
    }
    const t = text.replace(/\u2013|\u2014|–|—/g, "-"); // normalize dashes

    // Currency
    let currency = null;
    if (/[€]/.test(t)) currency = "EUR";
    else if (/[£]/.test(t)) currency = "GBP";
    else if (/[$]/.test(t)) currency = "USD";

    // Pay period (Glassdoor often omits; default "year")
    let payPeriod = null;
    if (/\/yr\b|\/year\b|per\s+year|annum/i.test(t)) payPeriod = "year";
    else if (/\/hr\b|\/hour\b|per\s+hour/i.test(t)) payPeriod = "hour";
    else if (/\/m(o|th)\b|\/month\b|per\s+month/i.test(t)) payPeriod = "month";
    else if (/\/wk\b|\/week\b|per\s+week/i.test(t)) payPeriod = "week";
    if (!payPeriod) payPeriod = "year"; // default to year

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

    log("Parsed salary:", { input: text, min, max, currency, payPeriod });
    return { comp_min_salary: min, comp_max_salary: max, comp_currency: currency, comp_pay_period: payPeriod };
  };

  // === Glassdoor-specific getters (STABLE selectors only) ===

  // Header root
  const getHeader = () => getEl('[data-test="job-details-header"]');

  // Job title (e.g., <h1 id="jd-job-title-1009844802917">Product Manager</h1>)
  const getJobTitleEl = () => document.querySelector('h1[id^="jd-job-title-"]');
  const getJobTitle = () => {
    const h1 = getJobTitleEl();
    return normalizeSpace(h1?.innerText || null);
  };

  // Company name:
  // Prefer the company H4 inside the employer profile link within the header, without relying on CSS classes.
  const getCompanyName = () => {
    const header = getHeader();
    if (!header) return null;

    // Approach 1: Company link to /Overview/Working-at-... contains a heading with the company name
    const companyLink = header.querySelector('a[href*="/Overview/Working-at-"]');
    const nameFromLink = normalizeSpace(companyLink?.querySelector("h4")?.innerText || null);
    if (nameFromLink) return nameFromLink;

    // Approach 2: Any H4 in the employer/name container that is aria-live polite
    const h4Aria = header.querySelector('h4[aria-live="polite"]');
    const nameFromAria = normalizeSpace(h4Aria?.innerText || null);
    if (nameFromAria) return nameFromAria;

    // Fallback: read the nearest H4 above the H1 title inside the header
    const title = getJobTitleEl();
    if (title) {
      let prev = title.previousElementSibling;
      while (prev) {
        if (prev.tagName?.toLowerCase() === "h4") {
          const txt = normalizeSpace(prev.innerText);
          if (txt) return txt;
        }
        prev = prev.previousElementSibling;
      }
    }
    return null;
  };

  // Location (e.g., <div data-test="location">Somerville, MA</div>)
  const getLocation = () => normalizeSpace(getText('[data-test="location"]'));

  // Salary text (e.g., <div data-test="detailSalary">...</div>), or id like jd-salary-XXXXXXXX
  const getSalaryText = () => {
    const byDataTest = getText('[data-test="detailSalary"]');
    if (byDataTest) return normalizeSpace(byDataTest);
    const byId = document.querySelector('[id^="jd-salary-"]');
    return normalizeSpace(byId?.innerText || null);
  };

  // Key skills from “Your qualifications for this job”
  // Elements include data-test="verified-qualifications-list-Agile" etc.
  const getKeySkills = () => {
    const nodes = document.querySelectorAll('[data-test^="verified-qualifications-list-"]');
    const skills = Array.from(nodes).map((n) => normalizeSpace(n.textContent || ""));
    return uniq(skills);
  };

  // Job description HTML
  // Prefer the description section with a stable brandviews marker, no brittle classnames.
  const getJobDescriptionHTML = () => {
    // 1) Prefer the stable brandviews container when present
    const moduleOrSection =
      document.querySelector('section [data-brandviews*="joblisting-description"]')?.parentElement ||
      document.querySelector('[data-brandviews*="joblisting-description"]');

    if (moduleOrSection) {
      const candidates = Array.from(moduleOrSection.querySelectorAll("div, article, section"));
      let best = null;
      let bestLen = 0;
      for (const el of candidates) {
        const len = (el.innerText || "").length;
        if (len > bestLen) {
          best = el;
          bestLen = len;
        }
      }
      if (best) return best.innerHTML;
      return moduleOrSection.innerHTML;
    }

    // 2) Your requested selector (hashed classes) — used as a fallback.
    // Use starts-with to tolerate the hash suffix (e.g., JobDetails_jobDescription__uW_fK).
    const byHashedPrefix =
      document.querySelector('div[class^="JobDetails_jobDescription__"]') ||
      document.querySelector('div[class*=" JobDetails_jobDescription__"]');
    if (byHashedPrefix) return byHashedPrefix.innerHTML;

    // 3) If Glassdoor exposes the "showHidden" variant, accept it too (also hashed).
    const byShowHidden =
      document.querySelector('div[class^="JobDetails_showHidden__"]') ||
      document.querySelector('div[class*=" JobDetails_showHidden__"]');
    if (byShowHidden) return byShowHidden.innerHTML;

    // 4) Legacy fallback some builds expose
    const byId = document.querySelector("#job-details");
    if (byId) return byId.innerHTML;

    return null;
  };

  // External Job ID
  // Priority 1: h1 id="jd-job-title-<ID>"
  // Priority 2: URL params (jlid, jobListingId, jobListingIdStr)
  // Priority 3: any 10+ digit cluster in URL path/search
  const getExternalJobId = () => {
    try {
      const fromH1 = getJobTitleEl()?.id?.match(/^jd-job-title-(\d+)/)?.[1];
      if (fromH1) return fromH1;

      const u = new URL(window.location.href);
      const fromParams =
        u.searchParams.get("jlid") ||
        u.searchParams.get("jobListingId") ||
        u.searchParams.get("jobListingIdStr");
      if (fromParams && /\d+/.test(fromParams)) return fromParams.match(/\d+/)[0];

      // As a last resort, scan the URL for a long digit sequence
      const m = u.href.match(/(\d{8,})/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };

  // Canonical URL (origin + pathname; strip query/hash; remove trailing slash)
  const getCanonicalGlassdoorUrl = () => {
    try {
      const u = new URL(window.location.href);
      const canonical = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
      return canonical;
    } catch {
      return window.location.href.replace(/[#?].*$/, "").replace(/\/+$/, "");
    }
  };

  // Best-effort; GD often omits these. Return null if not visible.
  const getEmploymentType = () => {
    // Look for common text nearby (robust text search without classes)
    const header = getHeader();
    if (!header) return null;
    const txt = header.innerText || "";
    if (/full[-\s]?time/i.test(txt)) return "Full-time";
    if (/part[-\s]?time/i.test(txt)) return "Part-time";
    if (/contract/i.test(txt)) return "Contract";
    if (/internship/i.test(txt)) return "Internship";
    if (/temporary/i.test(txt)) return "Temporary";
    return null;
  };

  const getWorkFormat = () => {
    const section = document.body; // broad text search across the page
    const txt = section?.innerText || "";
    if (/\bremote\b/i.test(txt)) return "Remote";
    if (/\bhybrid\b/i.test(txt)) return "Hybrid";
    if (/on-?\s?site/i.test(txt)) return "On-site";
    return null;
  };

  // === Messaging ===
  const sendLoading = () => {
    window.postMessage({ type: "hidejobs-job-loading" }, "*");
    if (DEBUG) log("Posted loading message to content-panel.");
  };

  const sendPayload = (payload) => {
    window.postMessage({ type: "hidejobs-job-data", payload }, "*");
    if (DEBUG) log("Posted payload to content-panel:", payload);
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
    const salaryText = getSalaryText();
    const { comp_min_salary, comp_max_salary, comp_currency, comp_pay_period } = parseSalaryRange(salaryText);
    const job_description = getJobDescriptionHTML();
    const externalJobId = getExternalJobId();
    const work_format = getWorkFormat();
    const employment_type = getEmploymentType();
    const job_required_skills = getKeySkills();

    add("job_title", job_title);
    add("company_name", company_name);
    add("job_location", job_location);
    add("salary", salaryText);
    add("comp_min_salary", comp_min_salary);
    add("comp_max_salary", comp_max_salary);
    add("comp_currency", comp_currency);
    add("comp_pay_period", comp_pay_period || "year");
    add("job_description", job_description);
    add("externalJobId", externalJobId);
    add("job_url", getCanonicalGlassdoorUrl());
    add("platform", "Glassdoor");
    add("employment_type", employment_type);
    add("work_format", work_format);
    add("job_required_skills", job_required_skills);

    // NEW: remember last job id so we can detect in-panel switches and avoid skeleton loops
    if (externalJobId) STATE.lastJobId = externalJobId;

    if (DEBUG) log("Built payload (pre-flight):", JSON.parse(JSON.stringify(payload)));
    return payload;
  };

  const hasMissingCriticalData = (p) => {
    const missing = [];
    if (!p.job_title) missing.push("job_title");
    if (!p.company_name) missing.push("company_name");
    return missing.length > 0;
  };

  // === Run control ===
  const clearCurrentRun = () => {
    if (STATE.retryTimeout) {
      clearTimeout(STATE.retryTimeout);
      STATE.retryTimeout = null;
    }
    if (STATE.readyObserver) {
      STATE.readyObserver.disconnect();
      STATE.readyObserver = null;
    }
  };

  const extractWithRetry = (attempt = 0, runId = STATE.runId) => {
    try {
      if (runId !== STATE.runId) return; // ignore stale

      const payload = buildPayload();
      if (hasMissingCriticalData(payload) && attempt < MAX_RETRIES) {
        log(`Retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAY}ms…`);
        STATE.retryTimeout = setTimeout(() => extractWithRetry(attempt + 1, runId), RETRY_DELAY);
      } else {
        sendPayload(payload);
      }
    } catch (e) {
      error("Unexpected error during extraction:", e);
      if (attempt < MAX_RETRIES && runId === STATE.runId) {
        STATE.retryTimeout = setTimeout(() => extractWithRetry(attempt + 1, runId), RETRY_DELAY);
      }
    }
  };

  // Start once the title or description appears
  const startWhenReady = (runId = STATE.runId) => {
    const ready = !!(getJobTitle() || getEl('section [data-brandviews*="joblisting-description"]') || getEl("#job-details"));
    if (DEBUG) log("Start check → ready:", ready, "runId:", runId, "current:", STATE.runId);

    if (runId !== STATE.runId) return false; // stale
    if (ready) {
      extractWithRetry(0, runId);
      return true;
    }

    if (STATE.readyObserver) STATE.readyObserver.disconnect();
    STATE.readyObserver = new MutationObserver(() => {
      if (runId !== STATE.runId) return;
      const ok = !!(getJobTitle() || getEl('section [data-brandviews*="joblisting-description"]') || getEl("#job-details"));
      if (DEBUG) log("Mutation tick → ready:", ok);
      if (ok) {
        STATE.readyObserver.disconnect();
        STATE.readyObserver = null;
        extractWithRetry(0, runId);
      }
    });
    STATE.readyObserver.observe(document.body, { childList: true, subtree: true });
    if (DEBUG) log("MutationObserver attached (waiting for job content)…");
    return false;
  };

  // === URL Change trigger (NO DEBOUNCE. IMMEDIATE.) ===
  const triggerRescrapeNow = (reason = "unknown", nextHref = null) => {
    const href = nextHref || window.location.href;
    if (href === STATE.lastUrl) return;

    log("URL changed → IMMEDIATE skeleton + rescrape. Reason:", reason, "old:", STATE.lastUrl, "new:", href);

    // 1) Show Skeleton immediately
    sendLoading();

    // 2) Lock to new URL and restart run
    STATE.lastUrl = href;
    clearCurrentRun();
    STATE.runId += 1;
    startWhenReady(STATE.runId);
  };

  // === URL Change Hooks ===
  const setupUrlChangeDetection = () => {
    // 1) Hook history.pushState / replaceState — send loading BEFORE calling native method
    try {
      const _pushState = history.pushState;
      const _replaceState = history.replaceState;

      history.pushState = function (state, title, url) {
        let nextHref = window.location.href;
        if (url != null) {
          try {
            nextHref = new URL(url, window.location.href).href;
          } catch (_) { }
        }
        triggerRescrapeNow("history.pushState(pre)", nextHref);
        const ret = _pushState.apply(this, arguments);
        triggerRescrapeNow("history.pushState(post)");
        return ret;
      };

      history.replaceState = function (state, title, url) {
        let nextHref = window.location.href;
        if (url != null) {
          try {
            nextHref = new URL(url, window.location.href).href;
          } catch (_) { }
        }
        triggerRescrapeNow("history.replaceState(pre)", nextHref);
        const ret = _replaceState.apply(this, arguments);
        triggerRescrapeNow("history.replaceState(post)");
        return ret;
      };

      log("Patched history.pushState/replaceState (pre + post).");
    } catch (e) {
      error("Failed to patch history API:", e);
    }

    // 2) popstate / hashchange — send loading immediately on event
    window.addEventListener("popstate", () => triggerRescrapeNow("popstate"));
    window.addEventListener("hashchange", () => triggerRescrapeNow("hashchange"));

    // 3) Observe DOM mutations that might change URL without history events (rare)
    if (STATE.urlObserver) STATE.urlObserver.disconnect();
    STATE.urlObserver = new MutationObserver(() => {
      const href = window.location.href;
      if (href !== STATE.lastUrl) triggerRescrapeNow("dom-mutation", href);
    });
    STATE.urlObserver.observe(document.documentElement, { childList: true, subtree: true });

    // 4) Interval fallback
    if (STATE.urlInterval) clearInterval(STATE.urlInterval);
    STATE.urlInterval = setInterval(() => {
      const href = window.location.href;
      if (href !== STATE.lastUrl) triggerRescrapeNow("interval", href);
    }, URL_CHECK_INTERVAL);

    log("URL change detection initialized (no debounce).");
  };

  // === Job panel observer (detect job changes inside /Job/index.htm) ===
  const setupJobPanelObserver = () => {
    try {
      if (STATE.jobObserver) STATE.jobObserver.disconnect();

      STATE.jobObserver = new MutationObserver(() => {
        // When user clicks a different job in the left list, Glassdoor swaps the panel
        const newId = getExternalJobId();
        if (newId && newId !== STATE.lastJobId) {
          log("Detected in-panel job change:", newId, "(was:", STATE.lastJobId, ")");
          // Show skeleton, then re-run the normal ready→extract flow
          sendLoading();
          clearCurrentRun();
          STATE.runId += 1;
          STATE.lastJobId = newId;
          startWhenReady(STATE.runId);
        }
      });

      // The job panel is injected anywhere under <body>, so watch the full subtree
      STATE.jobObserver.observe(document.body, { childList: true, subtree: true });
      if (DEBUG) log("Job panel observer attached.");
    } catch (e) {
      error("Failed to attach job panel observer:", e);
    }
  };

  // === Initial boot ===
  const boot = () => {
    setupUrlChangeDetection();
    setupJobPanelObserver(); // NEW: handle in-panel job switches on /Job/index.htm
    sendLoading();
    STATE.lastUrl = window.location.href;
    STATE.runId += 1;
    startWhenReady(STATE.runId);
  };

  boot();
})();
