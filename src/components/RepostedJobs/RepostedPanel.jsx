// src/components/RepostedJobs/RepostedPanel.jsx
import React, { useEffect, useState } from "react";
import { Button, Progress, Alert, Tooltip } from "antd";
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
  const hostSupported = isSupportedHost();

  useEffect(() => {
    ensureBadgeStyles();

    // restore alert dismissed state
    (async () => {
      const dismissed = await loadAlertDismissed();
      setAlertDismissed(dismissed);
      // initial overlay application in case panel opened after content loaded
      await applyOverlaysFromLocalStorage();
      if (hideReposted) await toggleHideShowReposted(true);
      await updateCounts();
    })();

    // observe list mutations to re-apply overlays/counts
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
    return () => {
      if (mo) mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, hideReposted]);

  const onCloseAlert = async () => {
    setAlertDismissed(true);
    await saveAlertDismissed();
  };

  // Button label for Hide/Show
  const getToggleButtonText = () => {
    if (repostedCount === 0 && !firstScanDone) {
      return hideReposted ? "Show" : "Hide";
    }
    if (hideReposted) {
      return blockedByOtherFilters ? "Show" : `Show (${repostedCount} hidden on this page)`;
    } else {
      return blockedByOtherFilters ? "Hide" : `Hide ${repostedCount} reposted job${repostedCount === 1 ? "" : "s"}`;
    }
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
                  <li>
                    Click <strong>Scan for Reposted Jobs</strong>.
                  </li>
                  <li>
                    We open each visible card, match title/company, then detect{" "}
                    <em>"Reposted … ago"</em> in the details.
                  </li>
                  <li>
                    Use <strong>Hide</strong>/<strong>Show</strong> to toggle
                    reposted items in the list.
                  </li>
                  <li className="text-red-500">
                    <ExclamationCircleOutlined className="mr-1" />
                    <strong>Re-scan</strong> when you revisit the page to stay
                    up to date.
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

      {/* === BUTTON ROW (Scan + Cancel) → 75/25, 100% width, no overflow === */}
      <div className="flex w-full gap-2 min-w-0 mb-4">
        <div className="min-w-0 basis-0 grow-[2]">
            <Button
              block
              type="primary"
              size="large"
              icon={<RetweetOutlined />}
              loading={scanning}
              onClick={onScan}
              disabled={scanning || firstScanDone || !hostSupported}
            >
              {scanning
                ? "Scanning…"
                : firstScanDone
                  ? `Scan Completed (${foundThisScan > 0 ? foundThisScan + " found" : "none found"})`
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

      {/* === PROGRESS BAR === */}
      <Progress percent={Math.round(progress)} />

      {/* === HIDE/SHOW BUTTON → below progress, 100% width === */}
      {shouldShowToggleButton && (
        <div className="mt-4">
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

      {/* No jobs after scan */}
      {shouldShowNoJobsMessage && (
        <div className="text-center text-gray-500 italic">
          No reposted jobs detected
        </div>
      )}
    </div>
  );
}
