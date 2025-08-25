// src/components/CompaniesHideList.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, message, Divider, Skeleton, Tooltip, Switch, Empty } from "antd";
import {
  LeftOutlined,
  CloseOutlined,
  PlusOutlined,
  EyeInvisibleFilled,
} from "@ant-design/icons";

import SubscribeButton from "./SubscribeButton";

const TOP_CACHE_KEY = "topHiddenCompaniesCache";
const TOP_CACHE_TS_KEY = "topHiddenCompaniesCacheAt";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function getChrome() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) return chrome;
  } catch { }
  return null;
}

export default function CompaniesHideList() {
  const chromeApi = useMemo(getChrome, []);
  const [companies, setCompanies] = useState([]);
  const [newCompany, setNewCompany] = useState("");
  const [topCompanies, setTopCompanies] = useState([]);
  const [loadingTop, setLoadingTop] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // subscription
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  // companies feature toggle
  const [companiesFeatureOn, setCompaniesFeatureOn] = useState(false);

  // breadcrumb back button
  const [showBackToFilters, setShowBackToFilters] = useState(false);

  const normalize = (s) => (s || "").trim().toLowerCase();
  const ciSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const normalizedHas = (list, name) => list.some((x) => normalize(x) === normalize(name));

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

    chromeApi.storage.local.get(["isSubscribed", "companiesBadgeVisible", "indeedCompaniesBadgeVisible"], (res) => {
      setIsSubscribed(!!res?.isSubscribed);
      // unify initial state across both LinkedIn + Indeed company toggles
      const initialOn = !!res?.companiesBadgeVisible || !!res?.indeedCompaniesBadgeVisible;
      setCompaniesFeatureOn(initialOn);
      // force-sync both keys to the unified value so everything starts consistent
      chromeApi.storage.local.set({
        companiesBadgeVisible: initialOn,
        companiesHidden: initialOn,
        indeedCompaniesBadgeVisible: initialOn,
        indeedCompaniesHidden: initialOn,
      });
      setSubscriptionLoading(false);
    });

    chrome.runtime?.sendMessage?.(
      { type: "get-subscription-status", forceRefresh: true },
      (reply) => {
        if (reply?.ok) setIsSubscribed(!!reply.isSubscribed);
      }
    );

    const onStore = (changes, area) => {
      if (area !== "local") return;
      if ("isSubscribed" in changes) setIsSubscribed(!!changes.isSubscribed.newValue);

      // keep master switch mirrored with EITHER toggle and immediately sync the counterpart
      if ("companiesBadgeVisible" in changes || "indeedCompaniesBadgeVisible" in changes) {
        chromeApi.storage.local.get(["companiesBadgeVisible", "indeedCompaniesBadgeVisible"], (r) => {
          const li = !!r?.companiesBadgeVisible;
          const ind = !!r?.indeedCompaniesBadgeVisible;
          const next = li || ind;
          setCompaniesFeatureOn(next);
          chromeApi.storage.local.set({
            companiesBadgeVisible: next,
            companiesHidden: next,
            indeedCompaniesBadgeVisible: next,
            indeedCompaniesHidden: next,
          });
        });
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

  // top 5 load
  useEffect(() => {
    let aborted = false;

    const useData = (arr) => {
      if (aborted) return;
      const sorted = (arr || [])
        .slice()
        .sort(
          (x, y) =>
            (Number(y.hiddenByUsersCount) || 0) - (Number(x.hiddenByUsersCount) || 0) ||
            (x.companyName || "").localeCompare(y.companyName || "", undefined, {
              sensitivity: "base",
            })
        )
        .map((item, idx) => ({ ...item, rank: idx + 1 }));
      setTopCompanies(sorted);
    };

    setLoadingTop(true);

    chrome?.storage?.local?.get([TOP_CACHE_KEY, TOP_CACHE_TS_KEY], (res) => {
      const cached = res?.[TOP_CACHE_KEY] || null;
      const cachedAt = Number(res?.[TOP_CACHE_TS_KEY] || 0);
      const fresh = cached && cachedAt && Date.now() - cachedAt < TTL_MS;

      if (fresh) {
        useData(cached);
        setLoadingTop(false);
      } else {
        chrome?.runtime?.sendMessage?.({ type: "get-top-hidden-companies" }, (resp) => {
          if (aborted) return;

          if (chrome.runtime?.lastError || !resp?.success || !Array.isArray(resp.data)) {
            setTopCompanies([]);
            setLoadingTop(false);
            return;
          }

          useData(resp.data);

          chrome?.storage?.local?.set({
            [TOP_CACHE_KEY]: resp.data,
            [TOP_CACHE_TS_KEY]: Date.now(),
          });

          setLoadingTop(false);
        });
      }
    });

    return () => {
      aborted = true;
    };
  }, []);

  const filteredTop = React.useMemo(
    () => topCompanies.filter((t) => !normalizedHas(companies, t.companyName)),
    [topCompanies, companies]
  );

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

        setTopCompanies((prev) =>
          prev.filter((item) => normalize(item.companyName) !== normalize(raw))
        );

        chrome?.storage?.local?.get([TOP_CACHE_KEY], (r) => {
          const cached = Array.isArray(r?.[TOP_CACHE_KEY]) ? r[TOP_CACHE_KEY] : [];
          const next = cached.filter(
            (item) => normalize(item.companyName) !== normalize(raw)
          );
          chrome?.storage?.local?.set({ [TOP_CACHE_KEY]: next });
        });
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
    chrome?.storage?.local?.set({
      companiesBadgeVisible: checked,
      companiesHidden: checked,
      // sync Indeed Companies too
      indeedCompaniesBadgeVisible: checked,
      indeedCompaniesHidden: checked,
    });

    try {
      const evt = new CustomEvent("hidejobs-filters-changed", {
        detail: { companies: checked, indeedCompanies: checked },
      });
      window.dispatchEvent(evt);
    } catch { }
  };

  return (
    <div className="space-y-3">
      {contextHolder}

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
              className={`text-sm ${isSubscribed ? "text-gray-500" : "text-gray-400"
                }`}
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

      {/* Subscription loading skeleton OR Subscribe button — NOW below the title */}
      {subscriptionLoading ? (
        <div className="rounded-md border border-gray-200 p-3">
          <Skeleton active paragraph={{ rows: 2 }} />
        </div>
      ) : (
        !isSubscribed && <SubscribeButton />
      )}

      {/* ADD FORM — moved BELOW subscribe */}
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

      <Divider plain>or</Divider>

      {/* Top 5 */}
      {(loadingTop || filteredTop.length > 0) && (
        <div className="mt-1">
          <div className="text-sm font-semibold text-hidejobs-700 mb-1">
            Top 5 Hidden Companies
          </div>
          {loadingTop ? (
            <div className="rounded-md border border-gray-200 p-3">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ) : (
            <ul className="rounded-md border border-gray-200 divide-y divide-gray-100">
              {filteredTop.map((item) => (
                <li
                  key={item.companyName}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 shrink-0 text-gray-400 text-xs">
                      #{item.rank}
                    </span>
                    <span className="truncate">
                      {item.companyName}{" "}
                      <span className="text-gray-400 text-xs">
                        ({item.hiddenByUsersCount})
                      </span>
                    </span>
                  </div>
                  <Button
                    size="small"
                    onClick={() => addOne(item.companyName)}
                    disabled={!isSubscribed}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
