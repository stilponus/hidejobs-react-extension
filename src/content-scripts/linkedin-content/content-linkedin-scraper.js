(() => {
  // ===== Toggle debug logs here =====
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log("[LIScraper]", ...args);
  const error = (...args) => DEBUG && console.error("[LIScraper][ERROR]", ...args);

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
  };

  // === Utils ===
  const getEl = (selector) => document.querySelector(selector);
  const getText = (selector) => {
    const el = getEl(selector);
    return el ? el.innerText.trim() : null;
  };
  const normalizeSpace = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : s);

  // Parse ranges like "$80K/yr - $120K/yr", "$90,000 - $120,000", "€70k–€95k", etc.
  const parseSalaryRange = (text) => {
    if (!text) {
      log("No salary text present; skipping range parse.");
      return { comp_min_salary: null, comp_max_salary: null, comp_currency: null, comp_pay_period: null };
    }
    const t = text.replace(/\u2013|\u2014|–|—/g, "-"); // normalize dashes
    let currency = null;
    if (/[€]/.test(t)) currency = "EUR";
    else if (/[£]/.test(t)) currency = "GBP";
    else if (/[$]/.test(t)) currency = "USD";

    // Extract pay period
    let payPeriod = null;
    if (/\/yr\b|\/year\b|per\s+year/i.test(t)) payPeriod = "year";
    else if (/\/hr\b|\/hour\b|per\s+hour/i.test(t)) payPeriod = "hour";
    else if (/\/mth\b|\/month\b|per\s+month/i.test(t)) payPeriod = "month";
    else if (/\/wk\b|\/week\b|per\s+week/i.test(t)) payPeriod = "week";

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

  const getTopCard = () =>
    getEl(".job-details-jobs-unified-top-card__primary-description-container") ||
    getEl(".job-details-jobs-unified-top-card__tertiary-description-container") ||
    null;

  const getJobTitle = () => {
    const title =
      getText(".job-details-jobs-unified-top-card__job-title h1") ||
      getText("h1.t-24") ||
      getText('h1[data-test-job-title]');
    return normalizeSpace(title);
  };

  const getCompanyName = () => {
    const name =
      getText(".job-details-jobs-unified-top-card__company-name a") ||
      getText(".job-details-jobs-unified-top-card__company-name");
    return normalizeSpace(name);
  };

  const getLocation = () => {
    const root = getTopCard();
    if (!root) {
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
    return el ? el.innerHTML : null;
  };

  // --- LinkedIn ID extraction ---
  const getExternalJobId = () => {
    try {
      const u = new URL(window.location.href);
      const fromQuery = u.searchParams.get("currentJobId");
      if (fromQuery) return fromQuery;
      const m = u.pathname.match(/\/jobs\/view\/(\d+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  };

  // --- Canonical LinkedIn job URL (no trailing slash)
  const getCanonicalLinkedInUrl = () => {
    const id = getExternalJobId();
    return id ? `https://www.linkedin.com/jobs/view/${id}` : window.location.href.replace(/\/+$/, "");
  };

  // Easy Apply
  const hasEasyApply = () => {
    const btn = getEl("#jobs-apply-button-id");
    const present = !!(btn && /easy apply/i.test(btn.innerText || ""));
    log("Easy Apply detected:", present);
    return present;
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
    const job_posted_ago = getPostedAgo();
    const salaryText = getSalaryText();
    const { comp_min_salary, comp_max_salary, comp_currency, comp_pay_period } = parseSalaryRange(salaryText);
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
    add("comp_pay_period", comp_pay_period);
    add("job_description", job_description);
    add("externalJobId", externalJobId);
    add("job_url", getCanonicalLinkedInUrl()); // canonical, no trailing slash
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
    const ready = !!(getJobTitle() || getEl("#job-details"));
    if (DEBUG) log("Start check → ready:", ready, "runId:", runId, "current:", STATE.runId);

    if (runId !== STATE.runId) return false; // stale
    if (ready) {
      extractWithRetry(0, runId);
      return true;
    }

    if (STATE.readyObserver) STATE.readyObserver.disconnect();
    STATE.readyObserver = new MutationObserver(() => {
      if (runId !== STATE.runId) return;
      const ok = !!(getJobTitle() || getEl("#job-details"));
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

  // === Initial boot ===
  const boot = () => {
    setupUrlChangeDetection();
    sendLoading();
    STATE.lastUrl = window.location.href;
    STATE.runId += 1;
    startWhenReady(STATE.runId);
  };

  boot();
})();
