// src/components/CompaniesHideList.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, message, Skeleton, Tooltip, Switch, Empty, Modal, Space } from "antd";
import {
  LeftOutlined,
  CloseOutlined,
  PlusOutlined,
  EyeInvisibleFilled,
  DeleteOutlined,
} from "@ant-design/icons";

import SubscribeButton from "./SubscribeButton";

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Detect current site (reused logic aligned with HideJobsFilters.jsx)
// ─────────────────────────────────────────────────────────────
function detectSite() {
  const href = (typeof location !== "undefined" ? location.href : "") || "";
  const host = (typeof location !== "undefined" ? location.hostname : "") || "";

  const isLinkedIn =
    host.includes("linkedin.com") &&
    (/\/jobs\//.test(href) || href.includes("/jobs") || href.includes("/comm/"));
  const isIndeed = host.includes("indeed.");
  const isGlassdoor = host.includes("glassdoor.");

  if (isLinkedIn) return "linkedin";
  if (isIndeed) return "indeed";
  if (isGlassdoor) return "glassdoor";
  return "other";
}

export default function CompaniesHideList() {
  const chromeApi = useMemo(getChrome, []);
  const [companies, setCompanies] = useState([]);
  const [newCompany, setNewCompany] = useState("");
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();

  // subscription
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  // companies feature toggle
  const [companiesFeatureOn, setCompaniesFeatureOn] = useState(false);

  // breadcrumb back button
  const [showBackToFilters, setShowBackToFilters] = useState(false);

  // cloud save/load spinners
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);

  const normalize = (s) => (s || "").trim().toLowerCase();
  const ciSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const normalizedHas = (list, name) =>
    list.some((x) => normalize(x) === normalize(name));

  const site = useMemo(detectSite, []);

  // hidden companies load
  useEffect(() => {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const list = (res?.hiddenCompanies || []).slice().sort(ciSort);
      setCompanies(list);
    });

    const onChange = (changes, area) => {
      if (area !== "local") return;
      if ("hiddenCompanies" in changes) {
        const list = (changes.hiddenCompanies.newValue || []).slice().sort(ciSort);
        setCompanies(list);
      }
    };
    chrome?.storage?.onChanged?.addListener(onChange);
    return () => chrome?.storage?.onChanged?.removeListener(onChange);
  }, []);

  // subscription state + feature toggle load
  useEffect(() => {
    if (!chromeApi) {
      setSubscriptionLoading(false);
      return;
    }

    chromeApi.storage.local.get(
      [
        "isSubscribed",
        "companiesBadgeVisible",
        "indeedCompaniesBadgeVisible",
        "glassdoorCompaniesBadgeVisible",
      ],
      (res) => {
        setIsSubscribed(!!res?.isSubscribed);

        const initialOn =
          !!res?.companiesBadgeVisible ||
          !!res?.indeedCompaniesBadgeVisible ||
          !!res?.glassdoorCompaniesBadgeVisible;

        setCompaniesFeatureOn(initialOn);

        chromeApi.storage.local.set({
          companiesBadgeVisible: initialOn,
          companiesHidden: initialOn,
          indeedCompaniesBadgeVisible: initialOn,
          indeedCompaniesHidden: initialOn,
          glassdoorCompaniesBadgeVisible: initialOn,
          glassdoorCompaniesHidden: initialOn,
        });

        setSubscriptionLoading(false);
      }
    );

    chrome.runtime?.sendMessage?.(
      { type: "get-subscription-status", forceRefresh: true },
      (reply) => {
        if (reply?.ok) setIsSubscribed(!!reply.isSubscribed);
      }
    );

    const onStore = (changes, area) => {
      if (area !== "local") return;
      if ("isSubscribed" in changes)
        setIsSubscribed(!!changes.isSubscribed.newValue);

      if (
        "companiesBadgeVisible" in changes ||
        "indeedCompaniesBadgeVisible" in changes ||
        "glassdoorCompaniesBadgeVisible" in changes
      ) {
        chromeApi.storage.local.get(
          [
            "companiesBadgeVisible",
            "indeedCompaniesBadgeVisible",
            "glassdoorCompaniesBadgeVisible",
          ],
          (r) => {
            const li = !!r?.companiesBadgeVisible;
            const ind = !!r?.indeedCompaniesBadgeVisible;
            const gd = !!r?.glassdoorCompaniesBadgeVisible;
            const next = li || ind || gd;
            setCompaniesFeatureOn(next);
            chromeApi.storage.local.set({
              companiesBadgeVisible: next,
              companiesHidden: next,
              indeedCompaniesBadgeVisible: next,
              indeedCompaniesHidden: next,
              glassdoorCompaniesBadgeVisible: next,
              glassdoorCompaniesHidden: next,
            });
          }
        );
      }
    };
    chromeApi.storage.onChanged.addListener(onStore);
    return () => chromeApi.storage.onChanged.removeListener(onStore);
  }, [chromeApi]);

  // breadcrumb flag
  useEffect(() => {
    chrome?.storage?.local?.get(["companies_came_from_filters"], (res) => {
      const came = !!res?.companies_came_from_filters;
      setShowBackToFilters(came);
      if (came) {
        chrome?.storage?.local?.set({ companies_came_from_filters: false });
      }
    });
  }, []);

  const removeOne = (name) => {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const list = res?.hiddenCompanies || [];
      const updated = list.filter((x) => normalize(x) !== normalize(name));

      chrome?.storage?.local?.set({ hiddenCompanies: updated }, () => {
        chrome?.runtime?.sendMessage?.({
          action: "UNHIDE_JOB_BY_COMPANY",
          companyName: name,
        });

        messageApi.success(`Removed "${name}" from hidden companies.`);
      });
    });
  };

  const addOne = (rawName) => {
    const raw = (rawName ?? newCompany).trim();
    if (!raw) {
      messageApi.warning("Please enter a company name.");
      return;
    }

    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const list = res?.hiddenCompanies || [];

      if (normalizedHas(list, raw)) {
        messageApi.warning(`"${raw}" is already in your hidden list.`);
        return;
      }

      const updated = [...list, raw].sort(ciSort);
      chrome?.storage?.local?.set({ hiddenCompanies: updated }, () => {
        setCompanies(updated);
        if (!rawName) setNewCompany("");
        messageApi.success(`Added "${raw}" to hidden list.`);
      });
    });
  };

  const goBackToFilters = () => {
    chrome?.storage?.local?.set({
      companies_came_from_filters: false,
      hidejobs_panel_view: "filters",
    });
    try {
      const evt = new CustomEvent("hidejobs-panel-set-view", {
        detail: { view: "filters" },
      });
      window.dispatchEvent(evt);
    } catch { }
  };

  const onCompaniesToggle = (checked) => {
    if (!isSubscribed) return;
    setCompaniesFeatureOn(checked);

    if (checked) {
      messageApi.success("Companies filter enabled");
    } else {
      messageApi.info("Companies filter disabled");
    }

    chrome?.storage?.local?.set({
      companiesBadgeVisible: checked,
      companiesHidden: checked,
      indeedCompaniesBadgeVisible: checked,
      indeedCompaniesHidden: checked,
      glassdoorCompaniesBadgeVisible: checked,
      glassdoorCompaniesHidden: checked,
    });

    try {
      const evt = new CustomEvent("hidejobs-filters-changed", {
        detail: {
          companies: checked,
          indeedCompanies: checked,
          glassdoorCompanies: checked,
        },
      });
      window.dispatchEvent(evt);
    } catch { }
  };

  const saveToCloud = async () => {
    try {
      setCloudSaving(true);
      const resp = await chrome.runtime.sendMessage({
        type: "cloud-save-hidden-companies",
        payload: { list: companies },
      });
      if (resp?.success) {
        messageApi.success(
          `Saved ${resp.data?.savedCount ?? companies.length} companies to your account.`
        );
      } else {
        throw new Error(resp?.error || "Save failed");
      }
    } catch (e) {
      messageApi.error(`Save failed: ${e?.message || String(e)}`);
    } finally {
      setCloudSaving(false);
    }
  };

  const loadFromCloud = async () => {
    try {
      setCloudLoading(true);
      const resp = await chrome.runtime.sendMessage({
        type: "cloud-load-hidden-companies",
      });
      if (resp?.success && Array.isArray(resp.data?.hideList)) {
        const loaded = resp.data.hideList.slice().sort(ciSort);
        await chrome.storage.local.set({ hiddenCompanies: loaded });
        setCompanies(loaded);
        messageApi.success(
          `Loaded ${loaded.length} companies from your account.`
        );
      } else {
        throw new Error(resp?.error || "Load failed");
      }
    } catch (e) {
      messageApi.error(`Load failed: ${e?.message || String(e)}`);
    } finally {
      setCloudLoading(false);
    }
  };

  const clearAllCompanies = () => {
    modal.confirm({
      icon: null,
      title: "Clear all hidden companies?",
      content:
        "This will remove your entire hidden companies list in the browser. To clear it completely from your account, click Save after removal.",
      okText: "Clear",
      cancelText: "Cancel",
      okButtonProps: { type: "primary", danger: true },
      onOk: async () => {
        try {
          await chrome.storage.local.set({ hiddenCompanies: [] });
          setCompanies([]);
          messageApi.success("All hidden companies cleared");
        } catch (err) {
          console.error("Error clearing companies:", err);
          messageApi.error("Failed to clear companies");
        }
      },
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Show empty state with 3 buttons when NOT on a supported job page
  // ─────────────────────────────────────────────────────────────
  if (site === "other") {
    return (
      <div className="space-y-4">
        {contextHolder}
        {modalContextHolder}

        {/* Title row (keep consistent with normal view) */}
        <div className="flex items-center justify-between -mt-1">
          <div className="flex items-center gap-2">
            {showBackToFilters && (
              <Tooltip title="Back to Filters">
                <Button
                  type="text"
                  icon={<LeftOutlined />}
                  onClick={goBackToFilters}
                  aria-label="Back to Filters"
                />
              </Tooltip>
            )}
            <h2 className="text-lg font-semibold text-hidejobs-700">
              Hidden Companies
            </h2>
          </div>
          <div className="flex items-center gap-3" />
        </div>

        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <Empty
            description={
              <span className="text-gray-600">
                Please navigate to a job page to manage hidden companies.
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
          <div className="mt-6">
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <Button
                type="primary"
                size="large"
                block
                href="https://www.linkedin.com/jobs/search"
                target="_blank"
              >
                Go to LinkedIn Jobs
              </Button>
              <Button
                type="primary"
                size="large"
                block
                href="https://www.indeed.com/jobs"
                target="_blank"
              >
                Go to Indeed Jobs
              </Button>
              <Button
                type="primary"
                size="large"
                block
                href="https://glassdoor.com/Job"
                target="_blank"
              >
                Go to Glassdoor Jobs
              </Button>
            </Space>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contextHolder}
      {modalContextHolder}

      {/* Title row */}
      <div className="flex items-center justify-between -mt-1">
        <div className="flex items-center gap-2">
          {showBackToFilters && (
            <Tooltip title="Back to Filters">
              <Button
                type="text"
                icon={<LeftOutlined />}
                onClick={goBackToFilters}
                aria-label="Back to Filters"
              />
            </Tooltip>
          )}
          <h2 className="text-lg font-semibold text-hidejobs-700">
            Hidden Companies
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm ${isSubscribed ? "text-gray-500" : "text-gray-400"}`}
            >
              On/Off
            </span>
            {isSubscribed ? (
              <Switch
                size="small"
                checked={!!companiesFeatureOn}
                onChange={onCompaniesToggle}
              />
            ) : (
              <Tooltip
                title={
                  <span style={{ color: "#333", fontWeight: 600 }}>
                    Subscribe to unlock
                  </span>
                }
                color="#feb700"
                placement="top"
              >
                <Switch size="small" checked={false} disabled />
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Subscription loading skeleton OR Subscribe button */}
      {subscriptionLoading ? (
        <div className="rounded-md border border-gray-200 p-3">
          <Skeleton active paragraph={{ rows: 2 }} />
        </div>
      ) : (
        !isSubscribed && <SubscribeButton />
      )}

      {/* ADD FORM */}
      <div className="flex items-center gap-2">
        <Input
          value={newCompany}
          onChange={(e) => setNewCompany(e.target.value)}
          onPressEnter={() => (isSubscribed ? addOne() : null)}
          placeholder="Add company (e.g., Amazon)"
          disabled={!isSubscribed}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => addOne()}
          disabled={!isSubscribed}
        >
          Add
        </Button>
      </div>

      {/* Cloud Load/Save buttons + Delete all */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Tooltip title="Save to your account">
            <Button
              type="primary"
              onClick={saveToCloud}
              loading={cloudSaving}
              disabled={cloudLoading}
            >
              Save
            </Button>
          </Tooltip>
          <Tooltip title="Load from your account">
            <Button
              onClick={loadFromCloud}
              loading={cloudLoading}
              disabled={cloudSaving}
            >
              Load
            </Button>
          </Tooltip>
        </div>
        {companies.length > 0 && (
          <Tooltip title="Clear all hidden companies">
            <Button
              type="text"
              icon={<DeleteOutlined />}
              onClick={clearAllCompanies}
            />
          </Tooltip>
        )}
      </div>

      {/* Companies list / Empty */}
      {companies.length > 0 ? (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {companies.map((c) => (
            <li
              key={c}
              className="flex items-center justify-between px-3 py-2"
            >
              <span className="truncate">{c}</span>
              <Button
                type="text"
                size="small"
                title="Unhide"
                aria-label={`Unhide ${c}`}
                icon={<CloseOutlined />}
                onClick={() => removeOne(c)}
                disabled={!isSubscribed}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-gray-200 px-4">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-gray-500">
                <div>No companies are hidden yet.</div>
                <div className="mt-1 text-xs">
                  Click{" "}
                  <EyeInvisibleFilled
                    style={{ color: "#28507c", fontSize: 14 }}
                  />{" "}
                  next to a company on job pages to hide it — or add one above.
                </div>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
