(() => {
  // Simple, bulletproof Glassdoor job parser
  const DEBUG = true;
  const log = (...args) => DEBUG && console.log("[GDParser]", ...args);

  let currentUrl = window.location.href;
  let extractionTimer = null;
  let observer = null;

  // === Core extraction functions ===
  const getJobTitle = () => {
    const h1 = document.querySelector('h1[id^="jd-job-title-"]');
    return h1?.innerText?.trim() || null;
  };

  const getCompanyName = () => {
    const header = document.querySelector('[data-test="job-details-header"]');
    if (!header) return null;

    // Try company link first
    const companyLink = header.querySelector('a[href*="/Overview/Working-at-"] h4');
    if (companyLink) return companyLink.innerText.trim();

    // Try aria-live h4
    const ariaH4 = header.querySelector('h4[aria-live="polite"]');
    if (ariaH4) return ariaH4.innerText.trim();

    return null;
  };

  const getLocation = () => {
    const locationEl = document.querySelector('[data-test="location"]');
    return locationEl?.innerText?.trim() || null;
  };

  const getSalary = () => {
    const header = document.querySelector('[data-test="job-details-header"]');
    if (!header) return { text: null, min: null, max: null, currency: null };

    const salaryEl = header.querySelector('[data-test="detailSalary"], [id^="jd-salary-"]');
    const text = salaryEl?.innerText?.trim() || null;

    if (!text) return { text: null, min: null, max: null, currency: null };

    // Parse salary range
    let currency = null;
    if (text.includes('€')) currency = 'EUR';
    else if (text.includes('£')) currency = 'GBP';
    else if (text.includes('$')) currency = 'USD';

    // Extract numbers (handle K, M multipliers)
    const numbers = text.match(/[\d,]+\.?\d*[KkMm]?/g);
    if (!numbers) return { text, min: null, max: null, currency };

    const parseNum = (str) => {
      let num = parseFloat(str.replace(/,/g, ''));
      if (str.toLowerCase().includes('k')) num *= 1000;
      if (str.toLowerCase().includes('m')) num *= 1000000;
      return Math.round(num);
    };

    const values = numbers.map(parseNum).filter(n => !isNaN(n));
    const min = values.length > 0 ? Math.min(...values) : null;
    const max = values.length > 1 ? Math.max(...values) : null;

    return { text, min, max, currency };
  };

  const getJobDescription = () => {
    // Wait for description to load - try multiple selectors
    const selectors = [
      'section [data-brandviews*="joblisting-description"]',
      '[data-brandviews*="joblisting-description"]',
      'div[class^="JobDetails_jobDescription__"]',
      'div[class*="JobDetails_jobDescription__"]',
      '#job-details'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.innerHTML && el.innerHTML.length > 100) {
        return el.innerHTML;
      }
    }
    return null;
  };

  const getKeySkills = () => {
    const skillElements = document.querySelectorAll('[data-test^="verified-qualifications-list-"]');
    const skills = Array.from(skillElements)
      .map(el => el.textContent?.trim())
      .filter(skill => skill && skill.toLowerCase() !== 'edit');
    return [...new Set(skills)]; // remove duplicates
  };

  const getJobId = () => {
    // Try H1 ID first
    const h1 = document.querySelector('h1[id^="jd-job-title-"]');
    if (h1) {
      const match = h1.id.match(/jd-job-title-(\d+)/);
      if (match) return match[1];
    }

    // Try URL params
    const url = new URL(window.location.href);
    const fromParam = url.searchParams.get('jlid') ||
      url.searchParams.get('jobListingId') ||
      url.searchParams.get('jobListingIdStr');
    if (fromParam) return fromParam;

    // Try URL path
    const pathMatch = url.href.match(/(\d{8,})/);
    return pathMatch ? pathMatch[1] : null;
  };

  const getEmploymentType = () => {
    const header = document.querySelector('[data-test="job-details-header"]');
    if (!header) return null;

    const text = header.innerText.toLowerCase();
    if (text.includes('full-time') || text.includes('full time')) return 'Full-time';
    if (text.includes('part-time') || text.includes('part time')) return 'Part-time';
    if (text.includes('contract')) return 'Contract';
    if (text.includes('internship')) return 'Internship';
    return null;
  };

  const getWorkFormat = () => {
    const bodyText = document.body.innerText.toLowerCase();
    if (bodyText.includes('remote')) return 'Remote';
    if (bodyText.includes('hybrid')) return 'Hybrid';
    if (bodyText.includes('on-site') || bodyText.includes('onsite')) return 'On-site';
    return null;
  };

  // === Main extraction ===
  const extractJobData = () => {
    const jobTitle = getJobTitle();
    const companyName = getCompanyName();

    // Don't proceed if we don't have basic info
    if (!jobTitle || !companyName) {
      log('Missing basic job info, will retry...');
      return null;
    }

    const salary = getSalary();
    const description = getJobDescription();
    const skills = getKeySkills();

    // Build final payload
    const payload = {
      job_title: jobTitle,
      company_name: companyName,
      job_location: getLocation(),
      salary: salary.text,
      comp_min_salary: salary.min,
      comp_max_salary: salary.max,
      comp_currency: salary.currency,
      comp_pay_period: 'year',
      job_description: description,
      job_required_skills: skills,
      externalJobId: getJobId(),
      job_url: window.location.origin + window.location.pathname,
      platform: 'Glassdoor',
      employment_type: getEmploymentType(),
      work_format: getWorkFormat()
    };

    // Remove null/empty values
    Object.keys(payload).forEach(key => {
      if (payload[key] === null || payload[key] === '' ||
        (Array.isArray(payload[key]) && payload[key].length === 0)) {
        delete payload[key];
      }
    });

    log('Extracted payload:', payload);
    return payload;
  };

  // === Smart extraction with progressive loading ===
  const attemptExtraction = (attempt = 1) => {
    if (extractionTimer) {
      clearTimeout(extractionTimer);
      extractionTimer = null;
    }

    const payload = extractJobData();

    if (!payload) {
      // No basic info yet, retry quickly
      if (attempt <= 5) {
        log(`Attempt ${attempt}: No basic info, retrying in 200ms...`);
        extractionTimer = setTimeout(() => attemptExtraction(attempt + 1), 200);
      }
      return;
    }

    // We have basic info, but check if description/skills are still loading
    const hasDescription = payload.job_description && payload.job_description.length > 100;
    const hasSkills = payload.job_required_skills && payload.job_required_skills.length > 0;

    if (!hasDescription || !hasSkills) {
      if (attempt <= 8) {
        log(`Attempt ${attempt}: Missing description/skills, retrying in 500ms...`);
        extractionTimer = setTimeout(() => attemptExtraction(attempt + 1), 500);
        return;
      }
    }

    // Send final payload
    window.postMessage({ type: 'hidejobs-job-data', payload }, '*');
    log('Sent final payload');
  };

  // === URL monitoring ===
  const checkUrlChange = () => {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      log('URL changed:', currentUrl, '->', newUrl);
      currentUrl = newUrl;

      // Send loading state immediately
      window.postMessage({ type: 'hidejobs-job-loading' }, '*');

      // Clear any pending extraction
      if (extractionTimer) {
        clearTimeout(extractionTimer);
        extractionTimer = null;
      }

      // Start fresh extraction
      attemptExtraction(1);
    }
  };

  // === Setup ===
  const init = () => {
    log('Initializing simple Glassdoor parser...');

    // Hook history API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      setTimeout(checkUrlChange, 0);
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      setTimeout(checkUrlChange, 0);
      return result;
    };

    // Listen for navigation events
    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);

    // Watch for DOM changes that might indicate job switches
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      // Simple check: if job ID changed, it's a new job
      const newJobId = getJobId();
      if (newJobId && newJobId !== attemptExtraction.lastJobId) {
        log('Job ID changed, triggering re-extraction');
        attemptExtraction.lastJobId = newJobId;
        window.postMessage({ type: 'hidejobs-job-loading' }, '*');
        attemptExtraction(1);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id']
    });

    // Check URL changes periodically as fallback
    setInterval(checkUrlChange, 300);

    // Start initial extraction
    window.postMessage({ type: 'hidejobs-job-loading' }, '*');
    attemptExtraction(1);
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();