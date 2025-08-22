// src/components/RepostedJobs/RepostedPanel.jsx
import React, { useEffect, useState } from "react";
import { Button, Progress, Alert, Collapse, List, Tooltip, Modal, message, Switch, Typography } from "antd";
import {
  RetweetOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  CloseOutlined,
  PlusSquareOutlined,
  CheckSquareOutlined,
} from "@ant-design/icons";

import useRepostedScanner from "./useRepostedScanner";
import {
  ensureBadgeStyles,
  applyOverlaysFromLocalStorage,
  toggleHideShowReposted,
  isSupportedHost,
  loadAlertDismissed,
  saveAlertDismissed,
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

const { Text } = Typography;

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

  const [alertDismissed, setAlertDismissed] = useState(false);
  const [details, setDetails] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modal, modalContextHolder] = Modal.useModal();
  const [uiReset, setUiReset] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();

  // 🔹 Track hidden companies so we can show ✔ icon instead of the + button
  const [hiddenCompanies, setHiddenCompanies] = useState([]);

  // 🔹 Master feature toggle (synced with Filters panel via FEATURE_BADGE_KEY)
  const [featureOn, setFeatureOn] = useState(true);

  const hostSupported = isSupportedHost();

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

    if (changed) {
      await saveRepostedDetails(enriched);
    }
    setDetails(enriched);
  }

  /** Hard remove all badges + unhide any rows we hid, and stop any further re-badging */
  function removeBadgesAndUnhideNow() {
    const cards = document.querySelectorAll(
      ".job-card-container[data-job-id], .job-card-job-posting-card-wrapper[data-job-id], [data-occludable-job-id]"
    );
    cards.forEach((card) => {
      // remove badge
      card.querySelectorAll(".my-reposted-badge").forEach((b) => b.remove());
      // unhide rows if we hid them
      const li = card.closest("li.scaffold-layout__list-item");
      if (li) {
        if (card.dataset.hiddenBy === "reposted") delete card.dataset.hiddenBy;
        if (li.dataset.hiddenBy === "reposted") delete li.dataset.hiddenBy;
        li.style.display = "";
      }
    });
  }

  useEffect(() => {
    ensureBadgeStyles();

    (async () => {
      const dismissed = await loadAlertDismissed();
      setAlertDismissed(dismissed);

      // Load master toggle (default ON unless explicitly false)
      chrome?.storage?.local?.get([FEATURE_BADGE_KEY], (res) => {
        const enabled = res?.[FEATURE_BADGE_KEY] !== false;
        setFeatureOn(enabled);
      });

      // Load hidden companies so we can render ✔ state immediately
      chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
        const list = Array.isArray(res?.hiddenCompanies) ? res.hiddenCompanies : [];
        setHiddenCompanies(list);
      });

      // Apply badges only if feature enabled; helper will also guard
      await applyOverlaysFromLocalStorage();
      if (hideReposted) await toggleHideShowReposted(true);
      await updateCounts();

      await refreshListFromStorageAndBackfill();
    })();

    // Re-badge on list mutations (no-op if feature disabled due to guard)
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

    // Update list live from storage + react to master toggle cross-panel
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
          // If someone turned it off from Filters panel → clear locally too
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
    };
    chrome?.storage?.onChanged?.addListener(onStorage);

    return () => {
      if (mo) mo.disconnect();
      chrome?.storage?.onChanged?.removeListener(onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, hideReposted]);

  const onCloseAlert = async () => {
    setAlertDismissed(true);
    await saveAlertDismissed();
  };

  const getToggleButtonText = () => {
    if (repostedCount === 0 && !firstScanDone) {
      return hideReposted ? "Show" : "Hide";
    }
    if (hideReposted) {
      return blockedByOtherFilters ? "Show" : `Show (${repostedCount} hidden)`;
    }
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
      await chrome.storage.local.set({
        [REPOSTED_JOBS_KEY]: JSON.stringify(mapData)
      });

      if (window.__repostedMapCache) {
        delete window.__repostedMapCache[jobId];
      }

      const cardSelectors = [
        `[data-occludable-job-id="${jobId}"]`,
        `[data-job-id="${jobId}"]`,
        `.job-card-job-posting-card-wrapper[data-job-id="${jobId}"]`
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
      console.error('Error deleting individual job:', error);
    }
  };

  const handleHideCompany = async (companyName, e) => {
    e?.stopPropagation?.();
    const norm = (s) => (s || "").trim().toLowerCase();
    const name = (companyName || "").trim();
    if (!name) return;

    // Save to hiddenCompanies (avoid dupes, case-insensitive)
    await new Promise((resolve) => {
      chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
        const list = Array.isArray(res?.hiddenCompanies) ? res.hiddenCompanies : [];
        const exists = list.some((x) => norm(x) === norm(name));
        if (exists) { resolve(); return; }
        const updated = [...list, name];
        chrome?.storage?.local?.set({ hiddenCompanies: updated }, () => resolve());
      });
    });

    // Update local state immediately so UI flips to ✔
    setHiddenCompanies((prev) => {
      if (prev.some((x) => norm(x) === norm(name))) return prev;
      return [...prev, name];
    });

    // NOTE: Do NOT hide now — company filter controls actual hiding elsewhere.
    await updateCounts();
    messageApi.success(`"${name}" saved to hidden companies`);
  };

  const shouldShowToggleButton =
    repostedCount > 0 || blockedByOtherFilters;

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
          console.error('Error clearing reposted jobs:', error);
          setConfirmOpen(false);
        }
      },
      onCancel: () => setConfirmOpen(false),
    });
  };

  const collapseItems = [
    {
      key: "reposted-list",
      label: `Reposted jobs (${details.length})`,
      extra: (
        <Tooltip title="Clear all reposted jobs">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={handleClearAll}
          />
        </Tooltip>
      ),
      children: (
        <div className="max-h-80 overflow-auto">
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

  // Handler for master feature switch in this panel
  const onFeatureToggle = (checked) => {
    setFeatureOn(checked);
    if (!checked) {
      // Turning OFF → persist, clear badges, show all rows, reset hide state
      chrome?.storage?.local?.set({
        [FEATURE_BADGE_KEY]: false,
        [HIDE_REPOSTED_STATE_KEY]: "false",
      });
      toggleHideShowReposted(false);
      removeBadgesAndUnhideNow();
      messageApi.info("Reposted Jobs detection disabled.");
    } else {
      // Turning ON → persist, re-apply badges from saved map and keep hide/show state
      chrome?.storage?.local?.set({ [FEATURE_BADGE_KEY]: true });
      applyOverlaysFromLocalStorage();
      chrome?.storage?.local?.get([HIDE_REPOSTED_STATE_KEY], (res) => {
        const hideNow = res?.[HIDE_REPOSTED_STATE_KEY] === "true";
        toggleHideShowReposted(hideNow);
      });
      messageApi.success("Reposted Jobs detection enabled.");
    }
  };

  return (
    <div className="space-y-4">
      {modalContextHolder}
      {messageContextHolder}

      {/* Header row: title left, master feature toggle right */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-hidejobs-700">Reposted jobs</h2>
        </div>
        <div className="flex items-center gap-2">
          <Text type="secondary" className="text-sm">On/Off</Text>
          <Switch size="small" checked={!!featureOn} onChange={onFeatureToggle} />
        </div>
      </div>

      {!hostSupported ? (
        <Alert
          type="warning"
          message="Open LinkedIn Jobs"
          description="This tool works on LinkedIn job search pages. Open a LinkedIn jobs list and run the scan."
          showIcon={false}
          closable={!alertDismissed}
          onClose={onCloseAlert}
          style={{ display: alertDismissed ? "none" : "block" }}
        />
      ) : (
        !alertDismissed && (
          <Alert
            type="info"
            message="How it works"
            description={
              <div className="text-sm">
                <ul className="list-disc pl-5 space-y-1">
                  <li>Click <strong>Scan for Reposted Jobs</strong>.</li>
                  <li>We open each visible card, match title/company, then detect <em>"Reposted … ago"</em>.</li>
                  <li>Use <strong>Hide</strong>/<strong>Show</strong> to toggle reposted jobs in the list.</li>
                  <li className="text-hidejobs-red-500">
                    <ExclamationCircleOutlined className="mr-1" />
                    <strong>Re-scan</strong> when you revisit the page.
                  </li>
                </ul>
              </div>
            }
            showIcon={false}
            closable
            onClose={onCloseAlert}
          />
        )
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
            disabled={!featureOn || scanning || (!uiReset && firstScanDone) || !hostSupported}
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
              disabled={!featureOn || !scanning}
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
            disabled={!featureOn || scanning || !hostSupported}
            type={hideReposted ? "default" : "primary"}
            danger={!hideReposted}
          >
            {getToggleButtonText()}
          </Button>
        </div>
      )}

      {/* Collapsible list only when we actually have items */}
      {hostSupported && details.length > 0 && (
        <Collapse className="bg-white" items={collapseItems} />
      )}
    </div>
  );
}
