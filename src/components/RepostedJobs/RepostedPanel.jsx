// src/components/RepostedJobs/RepostedPanel.jsx
import React, { useEffect, useState } from "react";
import { Button, Progress, Alert, Collapse, List, Tooltip } from "antd";
import {
  RetweetOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
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
  } = useRepostedScanner();

  const [alertDismissed, setAlertDismissed] = useState(false);
  const [details, setDetails] = useState([]);
  const hostSupported = isSupportedHost();

  async function refreshListFromStorageAndBackfill() {
    // Load, dedupe, and backfill missing title/company from current DOM if possible
    let arr = await loadRepostedDetails();
    const deduped = dedupeRepostedDetails(arr);

    // Backfill missing fields (company/title) for old records
    const enriched = deduped.map((item) => {
      if (item?.companyName && item?.jobTitle) return item;

      // try to find a DOM card by id
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

    // Persist only if changed length or any missing got filled
    const changed =
      enriched.length !== arr.length ||
      enriched.some((x, i) => x.companyName !== arr[i]?.companyName || x.jobTitle !== arr[i]?.jobTitle);

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

    // Update overlays on DOM mutations
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

  const shouldShowToggleButton =
    repostedCount > 0 || (firstScanDone && blockedByOtherFilters);
  const shouldShowNoJobsMessage =
    firstScanDone && !scanning && repostedCount === 0 && !blockedByOtherFilters;

  return (
    <div className="space-y-4">
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
            onClick={onScan}
            disabled={scanning || firstScanDone || !hostSupported}
          >
            {scanning
              ? "Scanning…"
              : firstScanDone
                ? `Scan Completed (${foundThisScan > 0 ? foundThisScan + " found" : "none"})`
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
        <Progress percent={Math.round(progress)} />
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

      {/* Collapsible list: Title (line 1) + Company (line 2), no links */}
      {hostSupported && (
        <Collapse
          className="bg-white"
          items={[
            {
              key: "reposted-list",
              label: `Reposted jobs (${details.length})`,
              children: (
                <div className="max-h-80 overflow-auto pr-1">
                  {details.length === 0 ? (
                    <div className="text-gray-500 text-sm italic">
                      {firstScanDone
                        ? "No reposted jobs saved."
                        : "Run a scan to populate this list."}
                    </div>
                  ) : (
                    <List
                      size="small"
                      dataSource={details}
                      renderItem={(item) => (
                        <List.Item>
                          <div className="w-full">
                            <div className="font-medium leading-tight">
                              {item.jobTitle || "Untitled role"}
                            </div>
                            <div className="text-gray-600 text-xs leading-tight">
                              {item.companyName || "—"}
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {shouldShowNoJobsMessage && (
        <div className="text-center text-gray-500 italic">
          No reposted jobs detected
        </div>
      )}
    </div>
  );
}
