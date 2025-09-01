// src/content-scripts/content-indeed-scraper.js
(() => {
  // ===== Toggle debug logs here =====
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log("[INDScraper]", ...args);
  const error = (...args) => DEBUG && console.error("[INDScraper][ERROR]", ...args);

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
    if (/\/yr\b|\/year\b|per\s+year|a\s+year/i.test(t)) payPeriod = "year";
    else if (/\/hr\b|\/hour\b|per\s+hour|an?\s+hour/i.test(t)) payPeriod = "hour";
    else if (/\/mth\b|\/month\b|per\s+month|a\s+month/i.test(t)) payPeriod = "month";
    else if (/\/wk\b|\/week\b|per\s+week|a\s+week/i.test(t)) payPeriod = "week";

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

  // ====== Stable element getters for INDEED ======
  // Title: <h2 data-testid="jobsearch-JobInfoHeader-title">...</h2>
  const getJobTitle = () => {
    let title =
      getText('[data-testid="jobsearch-JobInfoHeader-title"]') ||
      getText("#jobsearch-JobInfoHeader-title") ||
      null;

    if (title) {
      // Remove trailing " - job post" or similar variants
      title = title.replace(/\s*-\s*job post$/i, "");
    }

    return normalizeSpace(title);
  };

  // Company: [data-testid="inlineHeader-companyName"]
  const getCompanyName = () => {
    const el =
      document.querySelector('[data-testid="inlineHeader-companyName"]') ||
      document.querySelector('[data-company-name="true"]');
    const text = el?.innerText || null;
    return normalizeSpace(text);
  };

  // Location: [data-testid="inlineHeader-companyLocation"]
  const getLocation = () => {
    const el = document.querySelector('[data-testid="inlineHeader-companyLocation"]');
    // Sometimes Indeed nests <div> inside; innerText is fine.
    const text = el?.innerText || null;
    return normalizeSpace(text);
  };

  // Posted X ago: usually in metadata footer
  const getPostedAgo = () => {
    // The footer block often has "Just posted", "Posted 2 days ago", etc.
    const footer = getEl(".jobsearch-JobMetadataFooter") || getEl('[data-testid="jobsearch-JobMetadataFooter"]');
    const candidates = [];
    if (footer) {
      candidates.push(footer.innerText);
    }
    // If not in footer, try the whole document (fallback)
    candidates.push(document.body?.innerText || "");

    const all = candidates.join(" • ");
    const m = all.match(/\b(Just posted|Posted\s+\d+\+?\s+(?:day|days|hour|hours|week|weeks|month|months)\s+ago|Active\s+\d+\+?\s+(?:day|days|hour|hours|week|weeks|month|months)\s+ago)\b/i);
    return m ? normalizeSpace(m[0]) : null;
  };

  // Salary block: #salaryInfoAndJobType
  const getSalaryText = () => {
    const el = getEl("#salaryInfoAndJobType");
    // This block sometimes has nested spans; innerText keeps visible text
    const text = el?.innerText || null;
    return normalizeSpace(text);
  };

  // Job description HTML: #jobDescriptionText
  const getJobDescriptionHTML = () => {
    const el = getEl("#jobDescriptionText");
    return el ? el.innerHTML : null;
  };

  // Work format inference: check top area chips (Remote / Hybrid / On-site) or location/description text
  const getWorkFormat = () => {
    const hay = [
      (getEl('[data-testid="inlineHeader-companyLocation"]')?.innerText || ""),
      (getEl("#jobDetailsSection")?.innerText || ""),
      (getEl("#jobDescriptionText")?.innerText || "")
    ].join(" • ");

    if (/remote/i.test(hay)) return "Remote";
    if (/hybrid/i.test(hay)) return "Hybrid";
    if (/(on[-\s]?site|on\s?site)/i.test(hay)) return "On-site";
    return null;
  };

  // Employment type inference: check #jobDetailsSection (chips/labels)
  const getEmploymentType = () => {
    const text =
      (getEl("#jobDetailsSection")?.innerText || "") +
      " • " +
      (getEl("#salaryInfoAndJobType")?.innerText || "");
    if (/full[-\s]?time/i.test(text)) return "Full-time";
    if (/part[-\s]?time/i.test(text)) return "Part-time";
    if (/contract/i.test(text)) return "Contract";
    if (/internship/i.test(text)) return "Internship";
    if (/temporary/i.test(text)) return "Temporary";
    return null;
  };

  // job_required_skills from "Profile insights" → "Skills" chips
  const getJobRequiredSkills = () => {
    try {
      // Target the "Skills" role group
      let group = document.querySelector('div[role="group"][aria-label="Skills"]');
      if (!group) {
        // Fallback: find the nearest role="group" under an h3 that says "Skills"
        const skillsH3 = Array.from(document.querySelectorAll("h3")).find(h => /skills/i.test(h.innerText || ""));
        if (skillsH3) {
          const container = skillsH3.closest("div");
          group = container ? container.querySelector('div[role="group"]') : null;
        }
      }
      if (!group) return null;

      // Prefer robust attribute: button[data-testid$="-tile"]
      const tileButtons = Array.from(group.querySelectorAll('button[data-testid$="-tile"]'));

      let rawNames = [];

      if (tileButtons.length > 0) {
        rawNames = tileButtons
          .map((btn) => {
            const dt = btn.getAttribute("data-testid") || "";
            // data-testid format example: "Blockchain-tile" or "Product management-tile"
            if (/-tile$/i.test(dt)) return dt.replace(/-tile$/i, "");
            // Fallback: inner text span
            const span = btn.querySelector("span");
            return span ? span.innerText.trim() : "";
          })
          .filter(Boolean);
      } else {
        // Fallback: find text spans under the Skills list if no data-testid buttons are present
        rawNames = Array.from(
          group.querySelectorAll("ul li span, ul li button span")
        )
          .map((n) => (n.innerText || "").trim())
          .filter(Boolean);
      }

      // Normalize whitespace; dedupe case-insensitively while preserving original casing
      const seen = new Set();
      const skills = [];
      for (const name of rawNames) {
        const clean = name.replace(/\s+/g, " ").trim();
        const key = clean.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          skills.push(clean);
        }
      }

      return skills.length ? skills : null;
    } catch (e) {
      error("Failed to parse job_required_skills:", e);
      return null;
    }
  };

  // Easy Apply equivalent: Indeed shows "Apply now" (Indeed apply) vs "Apply on company site"
  const hasEasyApply = () => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const label = btns.map(b => (b.innerText || "").trim()).join(" • ");
    // Consider easy apply if "Apply now" present and NOT "on company site"
    const easy = /apply now/i.test(label) && !/apply on company site/i.test(label);
    log("Easy Apply (Indeed) detected:", easy);
    return easy;
  };

  // External job id (jk or vjk param)
  const getExternalJobId = () => {
    try {
      const u = new URL(window.location.href);
      const jk = u.searchParams.get("jk") || u.searchParams.get("vjk");
      if (jk) return jk;
      // Fallback: sometimes embedded; try data-jk on save/containers
      const dataJkEl = document.querySelector("[data-jk]");
      if (dataJkEl?.getAttribute("data-jk")) return dataJkEl.getAttribute("data-jk");
      return null;
    } catch {
      return null;
    }
  };

  // Canonical Indeed view URL for the current domain
  const getCanonicalIndeedUrl = () => {
    const id = getExternalJobId();
    if (!id) return window.location.href.replace(/\/+$/, "");
    // Keep current origin to respect regional TLDs (indeed.com, indeed.co.uk, indeed.fr, etc.)
    return `${window.location.origin.replace(/\/+$/, "")}/viewjob?jk=${encodeURIComponent(id)}`;
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
    const job_required_skills = getJobRequiredSkills();

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
    add("job_url", getCanonicalIndeedUrl()); // canonical per-region origin
    add("platform", "Indeed");
    add("easy_apply", hasEasyApply());
    add("employment_type", employment_type);
    add("work_format", work_format);
    add("job_required_skills", job_required_skills);

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

  // === Manual refresh handler ===
  const handleRefreshCommand = () => {
    log("Manual refresh command received");

    // 1) show skeleton right away
    sendLoading();

    // 2) cancel any pending work for the current run
    clearCurrentRun();

    // 3) bump the run so stale retries won’t fire
    STATE.runId += 1;

    // 4) start the new parse cycle
    startWhenReady(STATE.runId);
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
    const ready = !!(getJobTitle() || getEl("#jobDescriptionText"));
    if (DEBUG) log("Start check → ready:", ready, "runId:", runId, "current:", STATE.runId);

    if (runId !== STATE.runId) return false; // stale
    if (ready) {
      extractWithRetry(0, runId);
      return true;
    }

    if (STATE.readyObserver) STATE.readyObserver.disconnect();
    STATE.readyObserver = new MutationObserver(() => {
      if (runId !== STATE.runId) return;
      const ok = !!(getJobTitle() || getEl("#jobDescriptionText"));
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
    // Listen for refresh commands from panel (manual re-parse)
    window.addEventListener('message', (event) => {
      if (event?.data?.type === 'hidejobs-refresh-parsing') {
        handleRefreshCommand();
      }
    });

    setupUrlChangeDetection();
    sendLoading();
    STATE.lastUrl = window.location.href;
    STATE.runId += 1;
    startWhenReady(STATE.runId);
  };

  boot();
})();
