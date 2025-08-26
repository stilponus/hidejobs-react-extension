// src/components/RepostedJobs/RepostedPanel.jsx
import React, { useEffect, useState, useRef } from "react";
import { Button, Progress, Collapse, List, Tooltip, Modal, message, Switch, Skeleton, Empty, Space } from "antd";
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  StopOutlined,
  DeleteOutlined,
  CloseOutlined,
  PlusSquareOutlined,
  CheckSquareOutlined,
  QuestionCircleFilled, // ⬅️ Added
} from "@ant-design/icons";

import SubscribeButton from "../SubscribeButton"; // ⬅️ reuse the shared Subscribe button

import useRepostedScanner from "./useRepostedScanner";
import {
  ensureBadgeStyles,
  applyOverlaysFromLocalStorage,
  toggleHideShowReposted,
  isSupportedHost,
  loadRepostedDetails,
  saveRepostedDetails,
  dedupeRepostedDetails,
  getCardTitle,
  getCardCompany,
  REPOSTED_JOBS_DETAILS_KEY,
  REPOSTED_JOBS_KEY,
  HIDE_REPOSTED_STATE_KEY,
  FEATURE_BADGE_KEY,
} from "./repostedDom";

// ⬅️ New: Tour component import
import RepostedJobsTour from "../Tours/RepostedJobsTour";

export default function RepostedPanel() {
  const {
    scanning,
    firstScanDone,
    progress,
    foundThisScan,
    hideReposted,
    repostedCount,
    blockedByOtherFilters,
    onScan,
    onAbort,
    onToggle,
    updateCounts,
    forceReset,
  } = useRepostedScanner();

  const [details, setDetails] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [uiReset, setUiReset] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [hiddenCompanies, setHiddenCompanies] = useState([]);
  const [featureOn, setFeatureOn] = useState(true);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState("unknown"); // internal only
  const [subscriptionLoading, setSubscriptionLoading] = useState(true); // ⬅️ show skeleton while loading sub state
  const prevIsSubscribed = useRef(false);

  // ⬅️ New: Tour open/close state
  const [repostedTourOpen, setRepostedTourOpen] = useState(false);

  const hostSupported = isSupportedHost();

  // Check if we're on a LinkedIn jobs page
  const isLinkedInJobsPage = /\/\/(www\.)?linkedin\.com\/jobs\/(view|collections|search)\//i.test(window.location.href);

  // ---------------- Helpers ----------------
  function removeBadgesAndUnhideNow() {
    const cards = document.querySelectorAll(
      ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
    );
    cards.forEach((card) => {
      card.querySelectorAll(".my-reposted-badge").forEach((b) => b.remove());
      const li = card.closest("li.scaffold-layout__list-item");
      if (li) {
        if (card.dataset.hiddenBy === "reposted") delete card.dataset.hiddenBy;
        if (li.dataset.hiddenBy === "reposted") delete li.dataset.hiddenBy;
        li.style.display = "";
      }
    });
  }

  async function refreshListFromStorageAndBackfill() {
    let arr = await loadRepostedDetails();
    const deduped = dedupeRepostedDetails(arr);

    const enriched = deduped.map((item) => {
      if (item?.companyName && item?.jobTitle) return item;

      const card =
        document.querySelector(`[data-occludable-job-id="${item.id}"]`) ||
        document.querySelector(`[data-job-id="${item.id}"]`) ||
        Array.from(
          document.querySelectorAll(
            ".job-card-job-posting-card-wrapper[data-job-id]"
          )
        ).find((n) => n.getAttribute("data-job-id") === item.id);

      const patch = { ...item };
      if (!patch.jobTitle && card) patch.jobTitle = getCardTitle(card);
      if (!patch.companyName && card) patch.companyName = getCardCompany(card);
      return patch;
    });

    const changed =
      enriched.length !== arr.length ||
      enriched.some(
        (x, i) =>
          x.companyName !== arr[i]?.companyName ||
          x.jobTitle !== arr[i]?.jobTitle
      );

    if (changed) await saveRepostedDetails(enriched);
    setDetails(enriched);
  }

  // If we become unsubscribed, immediately turn the feature off and clean DOM
  const enforceOffWhenUnsubscribed = () => {
    if (!isSubscribed && featureOn) {
      setFeatureOn(false);
      chrome?.storage?.local?.set({
        [FEATURE_BADGE_KEY]: false,
        [HIDE_REPOSTED_STATE_KEY]: "false",
      });
      toggleHideShowReposted(false);
      removeBadgesAndUnhideNow();
    }
  };

  // ---------------- Effects ----------------
  useEffect(() => {
    ensureBadgeStyles();

    (async () => {
      // Load master toggle (default ON unless explicitly false)
      chrome?.storage?.local?.get([FEATURE_BADGE_KEY], (res) => {
        const enabled = res?.[FEATURE_BADGE_KEY] !== false;
        setFeatureOn(enabled);
      });

      // Load hidden companies
      chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
        const list = Array.isArray(res?.hiddenCompanies) ? res.hiddenCompanies : [];
        setHiddenCompanies(list);
      });

      // Load subscription (cached)
      chrome?.storage?.local?.get(["isSubscribed", "subscriptionStatus"], (res) => {
        const sub = !!res?.isSubscribed;
        setIsSubscribed(sub);
        setSubscriptionStatus(res?.subscriptionStatus || "unknown");
        prevIsSubscribed.current = sub;
        if (!sub) enforceOffWhenUnsubscribed();
        setSubscriptionLoading(false); // ⬅️ stop skeleton after initial cached read
      });

      await applyOverlaysFromLocalStorage();
      if (hideReposted) await toggleHideShowReposted(true);
      await updateCounts();
      await refreshListFromStorageAndBackfill();
    })();

    // Force a fresh subscription check whenever panel mounts (page reload)
    chrome.runtime?.sendMessage?.(
      { type: "get-subscription-status", forceRefresh: true },
      (reply) => {
        if (reply?.ok) {
          const nowSub = !!reply.isSubscribed;
          setIsSubscribed(nowSub);
          setSubscriptionStatus(reply.status || "unknown");
          const wasSub = prevIsSubscribed.current;
          prevIsSubscribed.current = nowSub;

          if (wasSub && !nowSub) enforceOffWhenUnsubscribed();
        }
      }
    );

    // Mutation observer for list changes
    const list = document.querySelector("div.scaffold-layout__list");
    let mo;
    if (list) {
      mo = new MutationObserver(() => {
        if (scanning) return;
        applyOverlaysFromLocalStorage();
        toggleHideShowReposted(hideReposted);
        updateCounts();
      });
      mo.observe(list, { childList: true, subtree: true });
    }

    // Storage listener (details, hiddenCompanies, feature toggle, subscription)
    const onStorage = (changes, area) => {
      if (area !== "local") return;

      if (REPOSTED_JOBS_DETAILS_KEY in changes) {
        refreshListFromStorageAndBackfill();
      }

      if ("hiddenCompanies" in changes) {
        const next = Array.isArray(changes.hiddenCompanies?.newValue)
          ? changes.hiddenCompanies.newValue
          : [];
        setHiddenCompanies(next);
      }

      if (FEATURE_BADGE_KEY in changes) {
        const enabled = changes[FEATURE_BADGE_KEY]?.newValue !== false;
        setFeatureOn(enabled);
        if (!enabled) {
          chrome?.storage?.local?.set({ [HIDE_REPOSTED_STATE_KEY]: "false" });
          toggleHideShowReposted(false);
          removeBadgesAndUnhideNow();
        } else {
          applyOverlaysFromLocalStorage();
          chrome?.storage?.local?.get([HIDE_REPOSTED_STATE_KEY], (res) => {
            const hideNow = res?.[HIDE_REPOSTED_STATE_KEY] === "true";
            toggleHideShowReposted(hideNow);
          });
        }
      }

      if ("isSubscribed" in changes) {
        const nowSub = !!changes.isSubscribed.newValue;
        setIsSubscribed(nowSub);
        const wasSub = prevIsSubscribed.current;
        prevIsSubscribed.current = nowSub;

        if (!nowSub) {
          enforceOffWhenUnsubscribed();
        }
      }
      if ("subscriptionStatus" in changes) {
        setSubscriptionStatus(changes.subscriptionStatus.newValue || "unknown");
      }
    };
    chrome?.storage?.onChanged?.addListener(onStorage);

    return () => {
      if (mo) mo.disconnect();
      chrome?.storage?.onChanged?.removeListener(onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, hideReposted]);

  // ---------------- UI helpers ----------------

  const getToggleButtonText = () => {
    if (repostedCount === 0 && !firstScanDone) return hideReposted ? "Show" : "Hide";
    if (hideReposted) return blockedByOtherFilters ? "Show" : `Show (${repostedCount} hidden)`;
    return blockedByOtherFilters
      ? "Hide"
      : `Hide ${repostedCount} reposted job${repostedCount === 1 ? "" : "s"}`;
  };

  const handleDeleteJob = async (jobId, e) => {
    e?.stopPropagation?.();
    try {
      const currentDetails = await loadRepostedDetails();
      const updatedDetails = currentDetails.filter(item => item.id !== jobId);
      await saveRepostedDetails(updatedDetails);

      const currentMap = await chrome.storage.local.get([REPOSTED_JOBS_KEY]);
      const mapData = JSON.parse(currentMap[REPOSTED_JOBS_KEY] || "{}");
      delete mapData[jobId];
      await chrome.storage.local.set({ [REPOSTED_JOBS_KEY]: JSON.stringify(mapData) });

      if (window.__repostedMapCache) delete window.__repostedMapCache[jobId];

      const cardSelectors = [
        `[data-occludable-job-id="${jobId}"]`,
        `[data-job-id="${jobId}"]`,
        `.job-card-job-posting-card-wrapper[data-job-id="${jobId}"]`,
      ];
      cardSelectors.forEach(selector => {
        const card = document.querySelector(selector);
        if (card) {
          card.querySelectorAll(".my-reposted-badge").forEach(badge => badge.remove());
          const li = card.closest("li.scaffold-layout__list-item");
          if (li) {
            if (card.dataset.hiddenBy === "reposted") delete card.dataset.hiddenBy;
            if (li.dataset.hiddenBy === "reposted") delete li.dataset.hiddenBy;
            li.style.display = "";
          }
        }
      });

      setDetails(updatedDetails);
      await updateCounts();

      if (updatedDetails.length === 0) {
        await forceReset();
        setUiReset(true);
        await chrome.storage.local.set({ [HIDE_REPOSTED_STATE_KEY]: "false" });
        await toggleHideShowReposted(false);
      }

      messageApi.success("Job removed from the list");
    } catch (error) {
      console.error("Error deleting individual job:", error);
    }
  };

  const handleHideCompany = async (companyName, e) => {
    e?.stopPropagation?.();
    const norm = (s) => (s || "").trim().toLowerCase();
    const name = (companyName || "").trim();
    if (!name) return;

    await new Promise((resolve) => {
      chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
        const list = Array.isArray(res?.hiddenCompanies) ? res.hiddenCompanies : [];
        const exists = list.some((x) => norm(x) === norm(name));
        if (exists) { resolve(); return; }
        const updated = [...list, name];
        chrome?.storage?.local?.set({ hiddenCompanies: updated }, () => resolve());
      });
    });

    setHiddenCompanies((prev) => {
      if (prev.some((x) => norm(x) === norm(name))) return prev;
      return [...prev, name];
    });

    await updateCounts();
    messageApi.success(`"${name}" saved to hidden companies`);
  };

  const shouldShowToggleButton = repostedCount > 0 || blockedByOtherFilters;

  const handleClearAll = (e) => {
    e?.stopPropagation?.();
    if (confirmOpen) return;
    setConfirmOpen(true);

    modal.confirm({
      icon: null,
      title: "Clear all reposted jobs?",
      content:
        "This will remove all detected reposted jobs. You can scan again anytime to find new ones.",
      okText: "Clear",
      cancelText: "Cancel",
      okButtonProps: { type: "primary", danger: true },
      getContainer: () =>
        document.querySelector("hidejobs-panel-ui").shadowRoot.querySelector("div"),
      zIndex: 10002,
      maskClosable: true,
      keyboard: true,
      onOk: async () => {
        try {
          await chrome.storage.local.set({
            [REPOSTED_JOBS_DETAILS_KEY]: [],
            [REPOSTED_JOBS_KEY]: JSON.stringify({}),
            [HIDE_REPOSTED_STATE_KEY]: "false",
          });

          window.__repostedMapCache = {};

          await toggleHideShowReposted(false);
          removeBadgesAndUnhideNow();
          await applyOverlaysFromLocalStorage();

          setDetails([]);
          await updateCounts();
          await forceReset();
          setUiReset(true);

          setConfirmOpen(false);
          messageApi.success("All reposted jobs cleared");
        } catch (error) {
          console.error("Error clearing reposted jobs:", error);
          setConfirmOpen(false);
        }
      },
      onCancel: () => setConfirmOpen(false),
    });
  };

  // ---------------- Collapse content ----------------
  const collapseItems = [
    {
      key: "reposted-list",
      label: `Reposted jobs (${details.length})`,
      extra: (
        <Tooltip title="Clear all reposted jobs">
          <Button type="text" size="small" icon={<DeleteOutlined />} onClick={handleClearAll} />
        </Tooltip>
      ),
      children: (
        <div className={`${isSubscribed ? "max-h-80" : "max-h-57"} overflow-auto`}>
          <List
            size="small"
            dataSource={details}
            renderItem={(item) => {
              const isHiddenCompany = hiddenCompanies.some(
                (c) => (c || "").toLowerCase() === (item.companyName || "").toLowerCase()
              );
              return (
                <List.Item>
                  <div className="w-full flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium leading-tight truncate">
                        {item.jobTitle || "Untitled role"}
                      </div>
                      <div className="text-gray-600 text-xs leading-tight truncate">
                        {item.companyName || "—"}
                      </div>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                      {isHiddenCompany ? (
                        <Tooltip title="Company saved to hidden list">
                          <Button
                            type="text"
                            size="small"
                            icon={<CheckSquareOutlined style={{ color: "#16a34a" }} />}
                            className="ml-2"
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Add this company to hidden list">
                          <Button
                            type="text"
                            size="small"
                            icon={<PlusSquareOutlined />}
                            onClick={(e) => handleHideCompany(item.companyName, e)}
                            className="ml-2 text-gray-400 hover:text-blue-600"
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="Remove this job">
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseOutlined />}
                          onClick={(e) => handleDeleteJob(item.id, e)}
                          className="ml-2 text-gray-400 hover:text-hidejobs-red-500"
                        />
                      </Tooltip>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        </div>
      ),
    },
  ];

  // ---------------- Feature toggle handler (updated with abort functionality) ----------------
  const onFeatureToggle = (checked) => {
    // If turning off while scanning, abort the scan first
    if (!checked && scanning) {
      onAbort();
    }

    setFeatureOn(checked);
    if (!checked) {
      chrome?.storage?.local?.set({
        [FEATURE_BADGE_KEY]: false,
        [HIDE_REPOSTED_STATE_KEY]: "false",
      });
      toggleHideShowReposted(false);
      removeBadgesAndUnhideNow();

      // 👇 only show message if tour is not open
      if (!repostedTourOpen) {
        messageApi.info("Reposted Jobs detection disabled.");
      }
    } else {
      chrome?.storage?.local?.set({ [FEATURE_BADGE_KEY]: true });
      applyOverlaysFromLocalStorage();
      chrome?.storage?.local?.get([HIDE_REPOSTED_STATE_KEY], (res) => {
        const hideNow = res?.[HIDE_REPOSTED_STATE_KEY] === "true";
        toggleHideShowReposted(hideNow);
      });

      // 👇 only show message if tour is not open
      if (!repostedTourOpen) {
        messageApi.success("Reposted Jobs detection enabled.");
      }
    }
  };

  // ---------------- Render empty state for non-LinkedIn pages ----------------
  if (!isLinkedInJobsPage) {
    return (
      <div className="space-y-4">
        {modalContextHolder}
        {messageContextHolder}

        {/* Header row: title left, master feature toggle right */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-hidejobs-700">Reposted jobs</h2>
          </div>
        </div>

        {/* Empty state for non-LinkedIn pages */}
        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <Empty
            description={<span className="text-gray-600">Please navigate to LinkedIn jobs page to start detecting reposted jobs.</span>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />

          <div className="mt-6">
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Button type="primary" size="large" block href="https://www.linkedin.com/jobs/search" target="_blank">
                Go to LinkedIn Jobs
              </Button>
            </Space>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Render main panel content for LinkedIn pages ----------------
  return (
    <div className="space-y-4">
      {modalContextHolder}
      {messageContextHolder}

      {/* Header row: title left, master feature toggle right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h2 className="text-lg font-semibold text-hidejobs-700">Reposted jobs</h2>
          {/* ⬅️ New: Tour trigger next to title */}
          <Tooltip title="How it works">
            <Button
              type="text"
              size="small"
              icon={<QuestionCircleFilled className="text-gray-400" />}
              onClick={() => {
                forceReset();
                setUiReset(true);
                setRepostedTourOpen(true);
              }}
            />
          </Tooltip>
        </div>

        {/* Wrap BOTH label + switch so the tooltip fires on either when unsubscribed */}
        <div className="flex items-center gap-2" data-tour="reposted-toggle">{/* ⬅️ tour target */}
          {isSubscribed ? (
            <>
              <span className="text-sm text-gray-500">On/Off</span>
              <Switch size="small" checked={!!featureOn} onChange={onFeatureToggle} />
            </>
          ) : (
            <Tooltip
              title={<span style={{ color: "#333", fontWeight: 600 }}>Subscribe to unlock</span>}
              color="#feb700"
              placement="top"
            >
              <div className="flex items-center gap-2 cursor-not-allowed">
                <span className="text-sm text-gray-400">On/Off</span>
                <Switch size="small" checked={false} disabled />
              </div>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Subscribe CTA area — show skeleton while subscription is loading */}
      {subscriptionLoading ? (
        <div className="rounded-md border border-gray-200 p-3">
          <Skeleton active paragraph={{ rows: 2 }} />
        </div>
      ) : (
        !isSubscribed && <SubscribeButton />
      )}

      {/* Scan + Cancel row */}
      <div className="flex w-full gap-2 min-w-0 mb-4">
        <div className="min-w-0 basis-0 grow-[2]">
          <Button
            block
            type="primary"
            size="large"
            loading={scanning}
            onClick={() => { setUiReset(false); onScan(); }}
            disabled={!isSubscribed || !featureOn || scanning || (!uiReset && firstScanDone) || !hostSupported}
            data-tour="reposted-scan" // ⬅️ tour target
          >
            {scanning
              ? "Scanning…"
              : uiReset
                ? "Scan for Reposted Jobs"
                : firstScanDone
                  ? `Scan Completed (${foundThisScan > 0 ? `${foundThisScan} found` : "none"})`
                  : "Scan for Reposted Jobs"}
          </Button>
        </div>
        <div className="min-w-0 basis-0 grow">
          <Tooltip title="Cancel the ongoing scan">
            <Button
              block
              icon={<StopOutlined />}
              size="large"
              danger
              onClick={onAbort}
              disabled={!isSubscribed || !featureOn || !scanning}
            >
              Cancel
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Progress */}
      <div className="my-4">
        <Progress percent={uiReset ? 0 : Math.round(progress)} />
      </div>

      {/* Hide/Show button */}
      {shouldShowToggleButton && (
        <div className="mb-4">
          <Button
            block
            size="large"
            icon={hideReposted ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            onClick={onToggle}
            disabled={!isSubscribed || !featureOn || scanning || !hostSupported}
            type={hideReposted ? "default" : "primary"}
            danger={!hideReposted}
          >
            {getToggleButtonText()}
          </Button>
        </div>
      )}

      {/* Collapsible list OR empty state */}
      {hostSupported && (
        details.length > 0 ? (
          <Collapse className="bg-white" items={collapseItems} />
        ) : (
          firstScanDone && !scanning && (
            <div className="rounded-lg border border-gray-200 p-6 text-center">
              <Empty
                description={<span className="text-gray-600">No reposted jobs were detected during the last scan.</span>}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          )
        )
      )}

      <RepostedJobsTour
        open={repostedTourOpen}
        onClose={() => setRepostedTourOpen(false)}
        scanning={scanning}
        scanCompleted={firstScanDone}
        onAbort={onAbort}
        progress={progress}  // ← Add this new prop
        foundThisScan={foundThisScan}  // ← Add this new prop
      />
    </div>
  );
}
