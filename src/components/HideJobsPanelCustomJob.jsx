import React, { useState, useEffect } from "react";
import { Select, Rate, Input, Button } from "antd";

const { Option } = Select;
const { TextArea } = Input;

const jobStatuses = [
  { key: "bookmarked", label: "Bookmarked" },
  { key: "applying", label: "Planning to apply" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "negotiating", label: "Negotiating" },
];

const HideJobsPanelCustomJob = ({ isJobSaved, setIsJobSaved, setTrackedJobId, handleOpenJob }) => {
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [status, setStatus] = useState("bookmarked");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // ⬇️ Use clean URL for custom jobs
    const cleanUrl = window.location.origin + window.location.pathname;
    setIsJobSaved(false);
    setStatus("bookmarked");
    setRating(0);
    setNotes("");
    setTrackedJobId(null);

    chrome.storage.local.get(["saved_jobs"], ({ saved_jobs = {} }) => {
      const jobData = saved_jobs[cleanUrl];
      if (jobData) {
        if (typeof jobData === "boolean") {
          setIsJobSaved(jobData);
        } else if (jobData.saved) {
          setIsJobSaved(true);
          setTrackedJobId(jobData.tracked_job_id);

          // Load only title and company for custom jobs
          if (jobData.job_title) setJobTitle(jobData.job_title);
          if (jobData.company_name) setCompanyName(jobData.company_name);
        }
      }
    });
  }, []);

  return {
    title: "HideJobs",
    content: (
      <>
        {/* Show saved job info or full form */}
        {isJobSaved ? (
          <>
            {/* Show only job title and company when saved */}
            {jobTitle && (
              <p className="text-2xl font-semibold text-hidejobs-700 mb-0">{jobTitle}</p>
            )}
            {companyName && (
              <p className="text-base text-gray-600 mb-6">{companyName}</p>
            )}

            <div className="flex justify-center">
              <Button onClick={handleOpenJob} type="primary" size="large">
                Open saved job
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Job title */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Job title</label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Enter job title"
                className="text-sm"
              />
            </div>

            {/* Company */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Company</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name"
                className="text-sm"
              />
            </div>

            {/* Location */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Location</label>
              <Input
                value={jobLocation}
                onChange={(e) => setJobLocation(e.target.value)}
                placeholder="Enter job location"
                className="text-sm"
              />
            </div>

            {/* Job description */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Job description</label>
              <TextArea
                rows={4}
                style={{ resize: "none" }}
                className="text-sm"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Enter job description"
              />
            </div>

            {/* Status */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Status</label>
              <Select value={status} style={{ width: "100%" }} onChange={setStatus} className="text-sm">
                {jobStatuses.map((s) => (
                  <Option key={s.key} value={s.key}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </div>

            {/* Interest */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Interest</label>
              <Rate value={rating} onChange={setRating} />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Notes</label>
              <TextArea
                rows={4}
                style={{ resize: "none" }}
                className="text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes"
              />
            </div>
          </>
        )}
      </>
    ),
    status,
    rating,
    notes,
    data: {
      job_title: jobTitle,
      company_name: companyName,
      job_location: jobLocation,
      job_description: jobDescription,
      // ⬇️ Use clean URL for custom jobs
      externalJobId: window.location.origin + window.location.pathname,
      job_url: window.location.href,
    },
    jobStatuses,
  };
};

export default HideJobsPanelCustomJob;
