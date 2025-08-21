import React, { useEffect, useState } from "react";
import { CloseCircleOutlined } from "@ant-design/icons";

export default function CompaniesHideList() {
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const list = (res?.hiddenCompanies || []).slice().sort((a, b) => a.localeCompare(b));
      setCompanies(list);
    });

    const onChange = (changes, area) => {
      if (area !== "local") return;
      if ("hiddenCompanies" in changes) {
        const list = (changes.hiddenCompanies.newValue || []).slice().sort((a, b) => a.localeCompare(b));
        setCompanies(list);
      }
    };
    chrome?.storage?.onChanged?.addListener(onChange);
    return () => chrome?.storage?.onChanged?.removeListener(onChange);
  }, []);

  const removeOne = (name) => {
    chrome?.storage?.local?.get(["hiddenCompanies"], (res) => {
      const list = res?.hiddenCompanies || [];
      const updated = list.filter((x) => x !== name);
      chrome?.storage?.local?.set({ hiddenCompanies: updated }, () => {
        // notify content to unhide immediately
        chrome?.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
          if (tabs?.[0]?.id) {
            chrome?.tabs?.sendMessage?.(tabs[0].id, {
              action: "UNHIDE_JOB_BY_COMPANY",
              companyName: name,
            });
          }
        });
      });
    });
  };

  return (
    <div className="space-y-2">
      <div className="font-semibold text-hidejobs-700">Hidden Companies</div>
      {companies.length === 0 ? (
        <div className="text-gray-500 text-sm">No companies are hidden yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {companies.map((c) => (
            <li key={c} className="flex items-center justify-between px-3 py-2">
              <span className="truncate">{c}</span>
              <button
                title="Unhide"
                onClick={() => removeOne(c)}
                className="text-gray-500 hover:text-red-600 transition-colors"
              >
                <CloseCircleOutlined />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
