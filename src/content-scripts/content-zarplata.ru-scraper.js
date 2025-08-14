(() => {
  console.log("🧠 Zarplata.ru scraper script is running!");

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  const getText = (selector) => {
    if (!selector) return null;
    try {
      const el = document.querySelector(selector);
      return el ? el.innerText.trim() : null;
    } catch {
      return null;
    }
  };

  const parseSalary = (text) => {
    if (!text) return { comp_min_salary: null, comp_max_salary: null };
    let min = null;
    let max = null;
    const minMatch = text.match(/от\s+([\d\s]+)/i);
    const maxMatch = text.match(/до\s+([\d\s]+)/i);
    if (minMatch) min = parseInt(minMatch[1].replace(/\D/g, ""), 10);
    if (maxMatch) max = parseInt(maxMatch[1].replace(/\D/g, ""), 10);
    if (min && max && min > max) [min, max] = [max, min];
    return { comp_min_salary: min, comp_max_salary: max };
  };

  const buildPayload = () => {
    const payload = {};

    const add = (k, v) => {
      if (v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        payload[k] = v;
      }
    };

    add("job_title", getText('[data-qa="vacancy-title"] span'));
    const salaryText = getText('[data-qa="vacancy-salary"]');
    add("salary", salaryText);

    add("employment_type", getText('[data-qa="common-employment-text"]'));
    add("company_name", getText('[data-qa="vacancy-company__details"]'));
    add("job_description", getText('[data-qa="vacancy-description"]'));

    const externalJobId = window.location.pathname.split("/").pop() || null;
    add("externalJobId", externalJobId);

    const wfRaw = getText('[data-qa="work-formats-text"]');
    add(
      "work_format",
      wfRaw && wfRaw.includes("Формат работы:") ? wfRaw.replace("Формат работы:", "").trim() : null
    );

    const skills = Array.from(document.querySelectorAll('[data-qa="skills-element"]')).map((s) =>
      s.innerText.trim()
    );
    if (skills.length) add("job_required_skills", skills);

    const currencySpan = document.querySelector('[data-qa="vacancy-salary"] span');
    if (currencySpan) {
      const txt = currencySpan.innerText;
      if (txt.includes("₽")) add("comp_currency", "RUB");
      else if (txt.includes("$")) add("comp_currency", "USD");
      else if (txt.includes("€")) add("comp_currency", "EUR");
    }

    const { comp_min_salary, comp_max_salary } = parseSalary(salaryText);
    add("comp_min_salary", comp_min_salary);
    add("comp_max_salary", comp_max_salary);

    const ldEl = document.querySelector('script[type="application/ld+json"]');
    if (ldEl) {
      try {
        const ld = JSON.parse(ldEl.innerText);
        add("job_posted_at", ld.datePosted ? new Date(ld.datePosted).getTime() : null);
        add("job_location", ld.jobLocation?.address?.addressLocality || null);
      } catch {
        /* ignore */
      }
    }

    const url = new URL(window.location.href);
    add("job_url", `${url.origin}${url.pathname}`);
    add("platform", "Zarplata.ru");

    return payload;
  };

  const hasMissingCriticalData = (p) => !p.job_title || !p.company_name;

  const sendPayload = (payload) => {
    window.postMessage({ type: "stilpon-job-data", payload }, "*");
    console.log("🧠 Sent scraped job data to content-script:", payload);
  };

  const extractWithRetry = (attempt = 0) => {
    const payload = buildPayload();
    if (hasMissingCriticalData(payload) && attempt < MAX_RETRIES) {
      console.log(`🔄 Retry ${attempt + 1}/${MAX_RETRIES} – waiting for required data…`);
      setTimeout(() => extractWithRetry(attempt + 1), RETRY_DELAY);
    } else {
      sendPayload(payload);
    }
  };

  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-qa="vacancy-title"]')) {
      extractWithRetry();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
