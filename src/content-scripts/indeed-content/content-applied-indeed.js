/************************************************************/
/*            HideJobs – Indeed "Applied" Hider             */
/*  Integrates with React FilterBadge via storage keys:     */
/*    - indeedAppliedBadgeVisible (boolean)                 */
/*    - indeedAppliedHidden (boolean)                       */
/*    - indeedAppliedHiddenCount (number)                   */
/*  (Also writes legacy keys for compatibility)             */
/************************************************************/

(() => {
  console.log("[HideJobs] indeed applied logic loaded:", location.href);

  /* -------------------- STATE -------------------- */
  let isHidden = false;                           // mirrors indeedAppliedHidden
  let hiddenCount = 0;                            // mirrors indeedAppliedHiddenCount
  const countedIds = new Set();
  let listObserver = null;
  let lastUrl = location.href;

  /* -------------------- PAGE CHECK -------------------- */
  function isIndeedJobPage() {
    if (!location.hostname.toLowerCase().includes("indeed.")) return false;

    const path = location.pathname.toLowerCase();
    const hostname = location.hostname.toLowerCase();

    const blockedPaths = [
      "/companies","/career/salaries","/about","/help","/legal",
      "/cmp","/survey","/career","/viewjob","/notifications",
      "/contributions","/career-advice","/career-services"
    ];
    if (blockedPaths.some(p => path.startsWith(p))) return false;

    const blockedHosts = [
      "employers.indeed.com","profile.indeed.com","myjobs.indeed.com",
      "dd.indeed.com","secure.indeed.com","smartapply.indeed.com",
      "messages.indeed.com"
    ];
    if (blockedHosts.includes(hostname)) return false;

    // Treat all other Indeed paths as job search pages (resilient)
    return true;
  }

  /* -------------------- SELECTORS & HELPERS -------------------- */
  const getJobCards = () => document.querySelectorAll('div[data-testid="slider_item"]');
  const getJobId = (card) => card.querySelector('a[data-jk]')?.getAttribute('data-jk') ?? null;
  const getRowContainer = (card) => card.closest('li') || card;

  // one-time CSS for fully-hidden rows
  (() => {
    if (document.getElementById('hidejobs-indeed-applied-style')) return;
    const s = document.createElement('style');
    s.id = 'hidejobs-indeed-applied-style';
    s.textContent = '.hidejobs-applied-hidden{display:none!important}';
    document.head.appendChild(s);
  })();

  function smoothHide(card) {
    const row = getRowContainer(card);
    if (!row || row.classList.contains('hidejobs-applied-hidden')) return;

    const h = row.offsetHeight + 'px';
    Object.assign(row.style, {
      overflow: 'hidden',
      height: h,
      opacity: '1',
      transition: 'height .4s ease, opacity .25s ease'
    });
    requestAnimationFrame(() => { row.style.height = '0'; row.style.opacity = '0'; });
    row.addEventListener('transitionend', function te(e) {
      if (e.propertyName === 'height') {
        row.classList.add('hidejobs-applied-hidden');
        row.removeAttribute('style');
        row.removeEventListener('transitionend', te);
      }
    });
  }

  /* -------------------- CORE HIDE/SHOW -------------------- */
  function hideApplied() {
    if (!isIndeedJobPage()) return;

    hiddenCount = 0;
    countedIds.clear();

    getJobCards().forEach(card => {
      // Rely on our inline “Mark as Applied” flag, if present,
      // OR any element marked as applied by previous runs.
      const markedBtn = card.querySelector('.indeed-applied-button');
      const isApplied =
        (markedBtn && markedBtn.classList.contains('indeed-applied-active')) ||
        card.classList.contains('hidejobs-applied-mark');

      if (isApplied) {
        const id = getJobId(card) || card.innerText.trim();
        if (!countedIds.has(id)) {
          countedIds.add(id);
          hiddenCount++;
        }
        smoothHide(card);
      }
    });

    isHidden = true;
    writeCounts();
  }

  function showApplied() {
    if (!isHidden) return;

    getJobCards().forEach(card => {
      const row = getRowContainer(card);
      row?.classList?.remove('hidejobs-applied-hidden');
    });

    hiddenCount = 0;
    countedIds.clear();
    isHidden = false;
    writeCounts();
  }

  function hideNewlyAppliedCard(card) {
    const id = getJobId(card) || card.innerText.trim();
    if (!countedIds.has(id)) {
      countedIds.add(id);
      hiddenCount++;
      writeCounts();
    }
    smoothHide(card);
  }

  /* -------------------- STORAGE WRITES (FilterBadge API) -------------------- */
  function writeCounts() {
    chrome?.storage?.local?.set({
      indeedAppliedHidden: isHidden,
      indeedAppliedHiddenCount: hiddenCount,
      // legacy name for backward-compat if you used it elsewhere:
      indeedHiddenAppliedCount: hiddenCount
    });
    window.hideJobsUtils?.applyOverlaysFromLocalStorage?.();
    if (window.hideJobsUI?.checkHideButtons) window.hideJobsUI.checkHideButtons();
  }

  /* -------------------- "Mark as Applied" button -------------------- */
  function injectMarkButton(card, appliedIds) {
    const jobId = getJobId(card);
    if (!jobId) return;
    if (card.querySelector('.indeed-applied-button')) return;

    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'indeed-applied-button';
    btn.textContent = 'Mark as Applied';
    Object.assign(btn.style, {
      padding: '4px 6px', border: 'none', borderRadius: '4px',
      background: '#e6f3ff', color: '#0a66c2', cursor: 'pointer',
      fontSize: '11px', lineHeight: '1', transition: 'all .3s',
      position: 'absolute', bottom: '15px', right: '15px',
      zIndex: '0', outline: 'none'
    });

    const mark = () => {
      btn.classList.add('indeed-applied-active');
      btn.style.background = '#e7a33e';
      btn.style.color = '#fff';
      btn.textContent = 'Applied';
      card.classList.add('hidejobs-applied-mark');
    };
    const unmark = () => {
      btn.classList.remove('indeed-applied-active');
      btn.style.background = '#e6f3ff';
      btn.style.color = '#0a66c2';
      btn.textContent = 'Mark as Applied';
      card.classList.remove('hidejobs-applied-mark');
    };

    if (appliedIds?.includes(jobId)) mark();

    btn.addEventListener('mouseenter', () => {
      const a = btn.classList.contains('indeed-applied-active');
      btn.style.background = a ? '#f8e3a1' : '#0a66c2';
      btn.style.color = a ? '#00000099' : '#fff';
    });
    btn.addEventListener('mouseleave', () => {
      const a = btn.classList.contains('indeed-applied-active');
      btn.style.background = a ? '#e7a33e' : '#e6f3ff';
      btn.style.color = a ? '#fff' : '#0a66c2';
    });

    btn.addEventListener('click', () => {
      const wasApplied = btn.classList.contains('indeed-applied-active');
      chrome?.storage?.local?.get(['indeedAppliedIds'], res => {
        let ids = res?.indeedAppliedIds || [];
        if (wasApplied) {
          ids = ids.filter(i => i !== jobId);
          unmark();
          const row = getRowContainer(card);
          row?.classList?.remove('hidejobs-applied-hidden');
          chrome?.storage?.local?.set({ indeedAppliedIds: ids });
          if (isHidden) hideApplied(); // recompute count/collapses quickly
        } else {
          if (!ids.includes(jobId)) ids.push(jobId);
          mark();
          chrome?.storage?.local?.set({ indeedAppliedIds: ids });
          if (isHidden) hideNewlyAppliedCard(card);
        }
      });
    });

    card.appendChild(btn);
  }

  function removeAllMarkButtons() {
    document.querySelectorAll('.indeed-applied-button').forEach(b => b.remove());
    document.querySelectorAll('.hidejobs-applied-mark').forEach(c => c.classList.remove('hidejobs-applied-mark'));
  }

  /* -------------------- OBSERVER -------------------- */
  function ensureButtons() {
    chrome?.storage?.local?.get(['indeedAppliedBadgeVisible', 'indeedAppliedIds'], res => {
      const visible = !!res?.indeedAppliedBadgeVisible;
      const ids = res?.indeedAppliedIds || [];
      if (!visible || !isIndeedJobPage()) return;
      getJobCards().forEach(card => injectMarkButton(card, ids));
    });
  }

  function watchList() {
    if (listObserver) return;
    const root = document.getElementById('mosaic-provider-jobcards') || document.body;
    listObserver = new MutationObserver(() => {
      clearTimeout(watchList._tid);
      watchList._tid = setTimeout(() => {
        ensureButtons();
        if (isHidden) hideApplied(); // keep hiding newcomers
      }, 50);
    });
    listObserver.observe(root, { childList: true, subtree: true });
    ensureButtons();
  }

  /* -------------------- INIT -------------------- */
  function init() {
    chrome?.storage?.local?.get(
      ['indeedAppliedHidden', 'indeedAppliedHiddenCount', 'indeedAppliedBadgeVisible', 'indeedAppliedIds'],
      (res) => {
        isHidden = !!res?.indeedAppliedHidden;
        hiddenCount = Number(res?.indeedAppliedHiddenCount ?? 0);

        if (!isIndeedJobPage()) {
          if (listObserver) { listObserver.disconnect(); listObserver = null; }
          removeAllMarkButtons();
          chrome?.storage?.local?.set({ indeedAppliedHiddenCount: 0 });
          return;
        }

        if (res?.indeedAppliedBadgeVisible) {
          watchList();
          isHidden ? hideApplied() : writeCounts(); // sync counters/visibility
        } else {
          if (listObserver) { listObserver.disconnect(); listObserver = null; }
          showApplied();
          removeAllMarkButtons();
        }
      }
    );
  }

  /* -------------------- STORAGE LISTENER -------------------- */
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;

    if ('indeedAppliedHidden' in changes) {
      const on = !!changes.indeedAppliedHidden.newValue;
      if (!isIndeedJobPage()) return;
      if (on) {
        hideApplied();
        watchList();
      } else {
        showApplied();
        if (listObserver) { listObserver.disconnect(); listObserver = null; }
      }
    }

    if ('indeedAppliedBadgeVisible' in changes) {
      const visible = !!changes.indeedAppliedBadgeVisible.newValue;
      if (!isIndeedJobPage()) return;
      if (visible) {
        watchList();
        isHidden ? hideApplied() : writeCounts();
      } else {
        if (listObserver) { listObserver.disconnect(); listObserver = null; }
        showApplied();
        removeAllMarkButtons();
      }
    }
  });

  /* -------------------- URL POLLER (SPA) -------------------- */
  setInterval(() => {
    const u = location.href;
    if (u === lastUrl) return;
    lastUrl = u;

    if (isIndeedJobPage()) {
      init();
    } else {
      if (listObserver) { listObserver.disconnect(); listObserver = null; }
      removeAllMarkButtons();
      showApplied();
    }
  }, 1000);

  /* -------------------- Ensure visible flag exists once -------------------- */
  chrome?.storage?.local?.get(['indeedAppliedBadgeVisible'], (r) => {
    if (typeof r?.indeedAppliedBadgeVisible === 'undefined') {
      chrome.storage.local.set({ indeedAppliedBadgeVisible: true });
    }
  });

  /* -------------------- ENTRY -------------------- */
  window.addEventListener('load', init);
})();
