import React, { useState } from "react";
import { Button, message } from "antd";
import { PlusOutlined, CheckOutlined } from "@ant-design/icons";

const HideJobsPanelSave = ({ data, status, rating, notes, jobStatuses, isJobSaved, setIsJobSaved, setTrackedJobId }) => {
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    console.log("🔵 Save button clicked");
    console.log("🔍 jobContent (full):", data);
    console.log("🔍 jobStatus:", status);
    console.log("🔍 rating:", rating);
    console.log("🔍 notes:", notes);
    console.log("🔍 Current URL:", window.location.href);
    console.log("🔍 Clean URL:", window.location.origin + window.location.pathname);

    if (!data || Object.keys(data).length === 0) {
      message.error("No job data available to save");
      console.warn("⛔ jobContent is missing or empty:", data);
      return;
    }

    chrome.storage.local.get("user", async (result) => {
      const user = result.user;
      console.log("🟡 user from chrome.storage.local:", user);

      if (!user?.uid) {
        message.error("User not found in chrome.storage.local");
        return;
      }

      const payload = {
        user_id: user.uid,
        tracked_job: {
          job_title: data.job_title || "",
          company_name: data.company_name || "",
          job_rating: rating || 0,
          job_url: data.job_url || "",
          job_location: data.job_location || "",
          job_description: data.job_description || "",
          comp_currency: data.comp_currency || "",
          comp_min_salary: data.comp_min_salary || "",
          comp_max_salary: data.comp_max_salary || "",
          job_status: jobStatuses.find((s) => s.key === status)?.label || "",
          job_posted_at: data.job_posted_at || "",
          platform: data.platform || "",
          job_added_at: new Date().toISOString(),
          work_format: data.work_format || "",
          employment_type: data.employment_type || "",
          job_notes: notes || "",
          job_required_skills: Array.isArray(data.job_required_skills)
            ? JSON.stringify(data.job_required_skills)
            : data.job_required_skills || "",
        },
      };

      console.log("📦 PAYLOAD SENT TO BACKEND:", payload);

      try {
        setLoading(true);

        chrome.runtime.sendMessage(
          {
            type: "save-tracked-job",
            payload,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("❌ Background error:", chrome.runtime.lastError.message);
              message.error("Error while saving");
              setLoading(false);
              return;
            }

            if (response?.success) {
              console.log("✅ Saved job:", response.data);
              message.success("Job saved");

              // Detect custom job correctly
              const cleanUrl = window.location.origin + window.location.pathname;
              const isCustomJob = !data.externalJobId || data.externalJobId === cleanUrl;

              let storageKey, storageData;

              if (isCustomJob) {
                // Custom job: use clean URL and save title/company
                storageKey = cleanUrl;
                storageData = {
                  saved: true,
                  tracked_job_id: response.data.tracked_job_id,
                  job_title: data.job_title || "",
                  company_name: data.company_name || ""
                };
                console.log("🟢 SAVING CUSTOM JOB:", storageKey, storageData);
              } else {
                // Scraped job: use externalJobId and save minimal data
                storageKey = data.externalJobId;
                storageData = {
                  saved: true,
                  tracked_job_id: response.data.tracked_job_id
                };
                console.log("🔵 SAVING SCRAPED JOB:", storageKey, storageData);
              }

              if (response.data.tracked_job_id) {
                chrome.storage.local.get(["saved_jobs"], (storageResult) => {
                  const savedJobs = storageResult.saved_jobs || {};
                  savedJobs[storageKey] = storageData;

                  chrome.storage.local.set({ saved_jobs: savedJobs }, () => {
                    console.log("✅ Job saved in local storage:", storageData);
                    setIsJobSaved(true);
                    setTrackedJobId(response.data.tracked_job_id);
                    setLoading(false);
                  });
                });
              } else {
                setLoading(false);
              }
            } else {
              console.error("❌ Save failed:", response.error);
              message.error("Error while saving");
              setLoading(false);
            }
          }
        );
      } catch (err) {
        console.error("❌ Save failed:", err);
        message.error("Error while saving");
        setLoading(false);
      }
    });
  };

  return (
    <Button
      data-tour="addtracker-save"
      type="primary"
      size="large"
      icon={isJobSaved ? <CheckOutlined /> : <PlusOutlined />}
      loading={loading}
      onClick={handleSave}
      disabled={isJobSaved}
    >
      {loading ? "Saving" : isJobSaved ? "Saved" : "Save"}
    </Button>
  );
};

export default HideJobsPanelSave;
