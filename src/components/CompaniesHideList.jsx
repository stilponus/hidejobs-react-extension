import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, message, Divider, Skeleton, Tooltip } from "antd";
import {
  ArrowLeftOutlined,
  ClearOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  EyeInvisibleFilled,
} from "@ant-design/icons";

const TOP_CACHE_KEY = "topHiddenCompaniesCache";
const TOP_CACHE_TS_KEY = "topHiddenCompaniesCacheAt";
// How long the cache is considered fresh (12 hours):
const TTL_MS = 12 * 60 * 60 * 1000;

export default function CompaniesHideList() {
  const [companies, setCompanies] = useState([]);
  const [newCompany, setNewCompany] = useState("");
  const [topCompanies, setTopCompanies] = useState([]);
  const [loadingTop, setLoadingTop] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const normalize = (s) => (s || "").trim().toLowerCase();
  const ciSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const normalizedHas = (list, name) => list.some((x) => normalize(x) === normalize(name));

  // Load user's hidden companies & react to changes
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

  // Load Top 5: use cache if fresh, else fetch via background and refresh cache
  useEffect(() => {
    let aborted = false;

    const useData = (arr) => {
      if (aborted) return;
      // ensure rank is present & stable from original sort (count desc, then name)
      const sorted = (arr || [])
        .slice()
        .sort(
          (x, y) =>
            (Number(y.hiddenByUsersCount) || 0) - (Number(x.hiddenByUsersCount) || 0) ||
            (x.companyName || "").localeCompare(y.companyName || "", undefined, { sensitivity: "base" })
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
        // ✅ Use cached
        useData(cached);
        setLoadingTop(false);
      } else {
        // 🔄 Refresh via background, then cache
        chrome?.runtime?.sendMessage?.({ type: "get-top-hidden-companies" }, (resp) => {
          if (aborted) return;

          if (chrome.runtime?.lastError || !resp?.success || !Array.isArray(resp.data)) {
            setTopCompanies([]);
            setLoadingTop(false);
            return;
          }

          // update state
          useData(resp.data);

          // refresh cache in storage
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

  // Hide Top 5 rows already present in user's list (but keep original rank numbers)
  const filteredTop = useMemo(
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
        // update local UI immediately
        setCompanies(updated);
        if (!rawName) setNewCompany("");
        messageApi.success(`Added "${raw}" to hidden list.`);

        // also remove from visible Top (if present) — DO NOT change ranks
        setTopCompanies((prev) =>
          prev.filter((item) => normalize(item.companyName) !== normalize(raw))
        );

        // (optional) You can also update the cached array in storage so other panels stay in sync:
        chrome?.storage?.local?.get([TOP_CACHE_KEY], (r) => {
          const cached = Array.isArray(r?.[TOP_CACHE_KEY]) ? r[TOP_CACHE_KEY] : [];
          const next = cached.filter((item) => normalize(item.companyName) !== normalize(raw));
          chrome?.storage?.local?.set({ [TOP_CACHE_KEY]: next });
        });
      });
    });
  };

  const goBackToFilters = () => {
    chrome?.storage?.local?.set({ hidejobs_panel_view: "filters" });
    try {
      const evt = new CustomEvent("hidejobs-panel-set-view", { detail: { view: "filters" } });
      window.dispatchEvent(evt);
    } catch { }
  };

  return (
    <div className="space-y-3">
      {contextHolder}

      {/* Title row with "Back to Filters" icon button on the right */}
      <div className="flex items-center justify-between -mt-1">
        <h2 className="text-lg font-semibold text-hidejobs-700">Hidden Companies</h2>
        <Tooltip title="See Filters">
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={goBackToFilters}
            aria-label="Back to Filters"
          />
        </Tooltip>
      </div>

      {/* Your hidden list */}
      {companies.length === 0 ? (
        <>
          <div className="text-gray-500 text-sm">No companies are hidden yet.</div>
          <div className="text-gray-500 text-sm flex items-center gap-1">
            Click <EyeInvisibleFilled style={{ color: "#28507c", fontSize: 18 }} /> next to a company to hide it.
          </div>
        </>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {companies.map((c) => (
            <li key={c} className="flex items-center justify-between px-3 py-2">
              <span className="truncate">{c}</span>
              <Button
                type="text"
                shape="circle"
                size="small"
                title="Unhide"
                aria-label={`Unhide ${c}`}
                icon={<CloseCircleOutlined />}
                onClick={() => removeOne(c)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Divider with "or" */}
      <Divider plain>or</Divider>

      {/* Add company control */}
      <div className="flex items-center gap-2">
        <Input
          value={newCompany}
          onChange={(e) => setNewCompany(e.target.value)}
          onPressEnter={() => addOne()}
          placeholder="Add company (e.g., Amazon)"
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => addOne()}>
          Add
        </Button>
      </div>

      {/* Top 5 Hidden Companies (cached) */}
      {(loadingTop || filteredTop.length > 0) && (
        <div className="mt-2">
          <div className="text-sm font-semibold text-hidejobs-700 mb-1">Top 5 Hidden Companies</div>
          {loadingTop ? (
            <div className="rounded-md border border-gray-200 p-3">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ) : (
            <ul className="rounded-md border border-gray-200 divide-y divide-gray-100">
              {filteredTop.map((item) => (
                <li key={item.companyName} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 shrink-0 text-gray-400 text-xs">#{item.rank}</span>
                    <span className="truncate">
                      {item.companyName}{" "}
                      <span className="text-gray-400 text-xs">({item.hiddenByUsersCount})</span>
                    </span>
                  </div>
                  <Button size="small" onClick={() => addOne(item.companyName)}>
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
