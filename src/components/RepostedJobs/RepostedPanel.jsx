
import React, { useEffect, useState } from "react";
import { Button, Progress, Alert, Collapse, List, Tooltip, Modal } from "antd";
import {
  RetweetOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  CloseOutlined,
  PlusSquareOutlined
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
} from "./repostedDom";

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
    forceReset, // NEW: expose the reset function
  } = useRepostedScanner();

  const [alertDismissed, setAlertDismissed] = useState(false);
  const [details, setDetails] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false); // prevent multiple confirms
  const [modal, modalContextHolder] = Modal.useModal(); // render modal in this tree
  const [uiReset, setUiReset] = useState(false);

  const hostSupported = isSupportedHost();

  async function refreshListFromStorageAndBackfill() {
    let arr = await loadRepostedDetails();
    const deduped = dedupeRepostedDetails(arr);

    // Backfill missing fields from DOM if available
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

  useEffect(() => {
    ensureBadgeStyles();

    (async () => {
      const dismissed = await loadAlertDismissed();
      setAlertDismissed(dismissed);

      await applyOverlaysFromLocalStorage();
      if (hideReposted) await toggleHideShowReposted(true);
      await updateCounts();

      await refreshListFromStorageAndBackfill();
    })();

    // Re-badge on list mutations
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

    // Update list live from storage
    const onStorage = (changes, area) => {
      if (area !== "local") return;
      if (REPOSTED_JOBS_DETAILS_KEY in changes) {
        refreshListFromStorageAndBackfill();
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

  // Handle individual job deletion
  const handleDeleteJob = async (jobId, e) => {
    e?.stopPropagation?.(); // don't toggle Collapse

    try {
      // 1) Remove from details storage
      const currentDetails = await loadRepostedDetails();
      const updatedDetails = currentDetails.filter(item => item.id !== jobId);
      await saveRepostedDetails(updatedDetails);

      // 2) Remove from reposted map storage
      const currentMap = await chrome.storage.local.get([REPOSTED_JOBS_KEY]);
      const mapData = JSON.parse(currentMap[REPOSTED_JOBS_KEY] || "{}");
      delete mapData[jobId];
      await chrome.storage.local.set({
        [REPOSTED_JOBS_KEY]: JSON.stringify(mapData)
      });

      // 3) Update global cache
      if (window.__repostedMapCache) {
        delete window.__repostedMapCache[jobId];
      }

      // 4) Remove badge from DOM immediately
      const cardSelectors = [
        `[data-occludable-job-id="${jobId}"]`,
        `[data-job-id="${jobId}"]`,
        `.job-card-job-posting-card-wrapper[data-job-id="${jobId}"]`
      ];

      cardSelectors.forEach(selector => {
        const card = document.querySelector(selector);
        if (card) {
          // Remove the badge
          card.querySelectorAll(".my-reposted-badge").forEach(badge => badge.remove());

          // Unhide the row if it was hidden
          const li = card.closest("li.scaffold-layout__list-item");
          if (li) {
            if (card.dataset.hiddenBy === "reposted") delete card.dataset.hiddenBy;
            if (li.dataset.hiddenBy === "reposted") delete li.dataset.hiddenBy;
            li.style.display = "";
          }
        }
      });

      // 5) Update local state
      const newDetails = updatedDetails;
      setDetails(newDetails);

      // 6) Update counts
      await updateCounts();

      // 7) If this was the last job, treat it like "clear all"
      if (newDetails.length === 0) {
        await forceReset();
        setUiReset(true);

        // Also make sure hide state is off
        await chrome.storage.local.set({
          [HIDE_REPOSTED_STATE_KEY]: "false"
        });
        await toggleHideShowReposted(false);
      }

    } catch (error) {
      console.error('Error deleting individual job:', error);
    }
  };

  const handleHideCompany = async (companyName, e) => {
    e?.stopPropagation?.();
    if (!companyName) return;
    // TODO: add real “hide all by company” logic + persistence.
    console.log("Hide all from company:", companyName);
  };

  const shouldShowToggleButton =
    repostedCount > 0 || (firstScanDone && blockedByOtherFilters);

  // —— Clear all: storage + DOM + state + scan UI reset ——
  const handleClearAll = (e) => {
    e?.stopPropagation?.(); // don't toggle Collapse

    if (confirmOpen) return; // prevent multiple modals
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
          // 1) Clear storage and reset cached map completely
          await chrome.storage.local.set({
            [REPOSTED_JOBS_DETAILS_KEY]: [],
            [REPOSTED_JOBS_KEY]: JSON.stringify({}),
            [HIDE_REPOSTED_STATE_KEY]: "false",
          });

          // Clear all global caches completely
          window.__repostedMapCache = {};

          // 2) Make sure "hide" is off, and no future overlays will be added
          await toggleHideShowReposted(false);

          // 3) Remove any existing badges + unhide rows immediately
          removeBadgesAndUnhideNow();

          // 4) Re-run overlay pass with empty map (won't add anything)
          await applyOverlaysFromLocalStorage();

          // 5) Reset local list & counts
          setDetails([]);
          await updateCounts();

          // 6) CRITICAL: Force reset the scanner hook
          await forceReset(); // NEW: Use the exposed reset function

          // 7) Reset UI state to allow re-scanning
          setUiReset(true);

          setConfirmOpen(false);

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
        <div className="max-h-80 overflow-auto pr-1">
          <List
            size="small"
            dataSource={details}
            renderItem={(item) => (
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
                    <Tooltip title="Hide all from this Company">
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusSquareOutlined />}
                        onClick={(e) => handleHideCompany(item.companyName, e)}
                        className="ml-2 text-gray-400 hover:text-blue-600"
                      />
                    </Tooltip>
                    <Tooltip title="Remove this job">
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={(e) => handleDeleteJob(item.id, e)}
                        className="ml-2 text-gray-400 hover:text-red-500"
                      />
                    </Tooltip>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* mount point for useModal() so confirms render within the panel */}
      {modalContextHolder}

      <div className="flex items-center gap-2">
        <RetweetOutlined />
        <h2 className="text-lg font-semibold text-hidejobs-700">Reposted jobs</h2>
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
                  <li className="text-red-500">
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

      {/* Scan + Cancel row (75/25), no overflow */}
      <div className="flex w-full gap-2 min-w-0 mb-4">
        <div className="min-w-0 basis-0 grow-[2]">
          <Button
            block
            type="primary"
            size="large"
            loading={scanning}
            onClick={() => { setUiReset(false); onScan(); }}
            // 🔒 Disabled after a successful scan until you clear/reset or list changes
            disabled={scanning || (!uiReset && firstScanDone) || !hostSupported}
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
              disabled={!scanning}
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
            disabled={scanning || !hostSupported}
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