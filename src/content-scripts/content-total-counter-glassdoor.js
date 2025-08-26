// content-total-counter-glassdoor.js
(() => {
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log("[HideJobs][GD total]", ...a);

  function getSessionId(){
    try{
      if (typeof window.name==="string" && window.name.startsWith("HJ_TAB_")) return window.name;
      const id="HJ_TAB_"+Math.random().toString(36).slice(2,10);
      window.name=id; return id;
    }catch{ return "HJ_TAB_fallback"; }
  }
  const SESSION_ID = getSessionId();

  const TAB_KEY  = `hj_totalHiddenOnPage__glassdoor__tab_${SESSION_ID}`;
  const SITE_KEY = `hj_totalHiddenOnPage__glassdoor`;

  const TOGGLE_KEYS = [
    "glassdoorAppliedHidden","companiesHidden","userTextHidden","filterByHoursHidden"
  ];

  const isJobPage = () => location.pathname.toLowerCase().includes("/job");

  const candidateSelectors = [
    'li[data-test="jobListing"]','a[data-test="job-link"]','[data-test="job-card"]',
    ".JobsList_jobListItem__",".JobCard_jobCard","[data-job-id]","article","li[role='listitem']"
  ];
  const rootSelectors = [
    'li[data-test="jobListing"]',"[data-job-id]",".JobCard_jobCard",".JobsList_jobListItem__","article","li[role='listitem']"
  ];
  const containerSelectors = [
    '[data-test="jobCards"]','[data-test="jlGrid"]',".JobsList_jobsList","main","body"
  ];

  function firstExistingSelector(list){ for(const s of list){ const n=document.querySelector(s); if(n) return n; } return null; }
  function isHiddenDeep(el, stopAt){
    let n = el;
    while(n && n!==document && n!==stopAt){
      const cs=getComputedStyle(n);
      if (cs.display==="none" || cs.visibility==="hidden") return true;
      n=n.parentElement;
    }
    return false;
  }
  function collectCardRoots(){
    const nodes=document.querySelectorAll(candidateSelectors.join(","));
    const set=new Set();
    nodes.forEach(n=>{
      const root = n.closest(rootSelectors.join(", ")) || n;
      set.add(root);
    });
    return Array.from(set);
  }
  function getJobId(el){
    return el.getAttribute("data-job-id") ||
           el.closest("[data-job-id]")?.getAttribute("data-job-id") ||
           (() => {
              const a = el.querySelector('a[data-test="job-link"]') || el.closest('a[data-test="job-link"]');
              if (a && a.href){
                try{
                  const u = new URL(a.href);
                  const segs = u.pathname.split("/").filter(Boolean);
                  const last = segs[segs.length-1] || "";
                  return /\d+/.test(last) ? last : null;
                }catch{}
              }
              return null;
           })() || null;
  }

  let lastUrl = location.href;
  let obs = null;

  function recalc(){
    if (!isJobPage()){
      const zero={}; zero[TAB_KEY]=0; zero[SITE_KEY]=0; chrome?.storage?.local?.set(zero); return;
    }
    const container = firstExistingSelector(containerSelectors) || document.body;
    const cards = collectCardRoots();
    const seen = new Set();
    let hidden = 0;
    for (const el of cards){
      const id = getJobId(el) || el;
      if (seen.has(id)) continue; seen.add(id);
      if (isHiddenDeep(el, container)) hidden++;
    }
    const payload={}; payload[TAB_KEY]=hidden; payload[SITE_KEY]=hidden;
    chrome?.storage?.local?.set(payload);
    log("count", hidden);
  }

  function watchDOM(){
    if (obs) obs.disconnect();
    const container = firstExistingSelector(containerSelectors) || document.body;
    obs = new MutationObserver(()=>{
      if (watchDOM._t) clearTimeout(watchDOM._t);
      watchDOM._t = setTimeout(recalc, 80);
    });
    obs.observe(container,{childList:true, subtree:true, attributes:true, attributeFilter:["style","class"]});
  }

  chrome?.storage?.onChanged?.addListener((changes, area)=>{
    if (area!=="local") return;
    if (TOGGLE_KEYS.some(k=>k in changes)) recalc();
  });

  setInterval(()=>{
    if (location.href!==lastUrl){ lastUrl=location.href; recalc(); watchDOM(); }
  }, 1000);

  recalc(); watchDOM();
  setTimeout(recalc, 250);
  setTimeout(recalc, 1200);
})();
