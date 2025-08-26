import React, { useEffect, useState } from "react";
import { Select, Rate, Input, Button, Skeleton, Tooltip } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, QuestionCircleFilled } from "@ant-design/icons";
import AddToTrackerTour from "./Tours/AddToTrackerTour";

const { Option } = Select;

const categoryPairs = [
  [
    { key: "salary", label: "Salary" },
    { key: "employment_type", label: "Employment type" },
  ],
  [
    { key: "job_required_skills", label: "Key skills" },
    { key: "work_format", label: "Work format" },
  ],
  [
    { key: "job_location", label: "Location" },
    { key: "job_description", label: "Job description" },
  ],
];

const HideJobsPanelContent = ({ isJobSaved, setIsJobSaved, setTrackedJobId, handleOpenJob }) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("bookmarked");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  const [openTour, setOpenTour] = useState(false);

  const jobStatuses = [
    { key: "bookmarked", label: "Bookmarked" },
    { key: "applying", label: "Applying" },
    { key: "applied", label: "Applied" },
    { key: "interviewing", label: "Interviewing" },
    { key: "negotiating", label: "Negotiating" },
  ];

  // Receive messages from the scraper
  useEffect(() => {
    const handleMessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "hidejobs-job-loading") {
        setData(null);
        setIsJobSaved(false);
        setStatus("bookmarked");
        setRating(0);
        setNotes("");
        setTrackedJobId(null);
        return;
      }

      if (msg.type === "hidejobs-job-data" && msg.payload) {
        console.log("🟡 Job data received:", msg.payload);
        setData(msg.payload);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setIsJobSaved, setTrackedJobId]);

  // Check if this job is already saved
  useEffect(() => {
    setIsJobSaved(false);
    setStatus("bookmarked");
    setRating(0);
    setNotes("");
    setTrackedJobId(null);

    if (data?.externalJobId) {
      chrome.storage.local.get(["saved_jobs"], ({ saved_jobs = {} }) => {
        const jobData = saved_jobs[data.externalJobId];
        if (jobData) {
          if (typeof jobData === "boolean") {
            setIsJobSaved(jobData);
          } else if (jobData.saved) {
            setIsJobSaved(true);
            setTrackedJobId(jobData.tracked_job_id);
          }
        }
      });
    }
  }, [data?.externalJobId, setIsJobSaved, setTrackedJobId]);

  return {
    title: "HideJobs",
    content: !data ? (
      <Skeleton active />
    ) : (
      <>
        {/* Header with title + help button */}
        <div className="w-full flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-hidejobs-700 flex items-center gap-1">
            Add to Tracker
            {!isJobSaved && (
              <Tooltip title="How it works">
                <Button
                  type="text"
                  size="small"
                  icon={<QuestionCircleFilled className="text-gray-400" />}
                  onClick={() => setOpenTour(true)}
                  aria-label="How it works"
                />
              </Tooltip>
            )}
          </h2>
        </div>

        {/* Title and company */}
        <div data-tour="addtracker-title" className="mb-3">
          {data.job_title && (
            <p className="text-2xl font-semibold text-hidejobs-700 mb-0">{data.job_title}</p>
          )}
          {data.company_name && (
            <p className="text-base text-gray-600 mb-0">{data.company_name}</p>
          )}
        </div>

        {/* Categories table */}
        <table data-tour="addtracker-categories" className="w-full mb-4 text-sm">
          <tbody>
            {categoryPairs.map((pair, rowIdx) => (
              <tr key={rowIdx}>
                {pair.map(({ key, label }) => (
                  <React.Fragment key={key}>
                    <td className="w-5 pr-1">
                      {data[key] ? (
                        <CheckCircleOutlined style={{ color: "#009966" }} />
                      ) : (
                        <CloseCircleOutlined style={{ color: "#e60008" }} />
                      )}
                    </td>
                    <td className="pr-4">{label}</td>
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="h-px bg-gray-200 w-full mb-4 mt-6" />

        {/* Saved / actions */}
        {isJobSaved ? (
          <div className="flex justify-center" data-tour="addtracker-open-saved-job">
            <Button onClick={handleOpenJob} type="primary" size="large">
              Open saved job
            </Button>
          </div>
        ) : (
          <>
            {/* Status */}
            <div className="mb-3" data-tour="addtracker-status">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Status</label>
              <Select
                value={status}
                style={{ width: "100%" }}
                onChange={(value) => {
                  console.log("Status changed to:", value);
                  setStatus(value);
                }}
                className="text-sm"
              >
                {jobStatuses.map((s) => (
                  <Option key={s.key} value={s.key}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </div>

            {/* Interest */}
            <div className="mb-3" data-tour="addtracker-interest">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Interest</label>
              <Rate
                value={rating}
                onChange={(value) => {
                  console.log("Rating changed to:", value);
                  setRating(value);
                }}
              />
            </div>

            {/* Notes */}
            <div data-tour="addtracker-notes">
              <label className="block text-lg font-semibold text-hidejobs-700 mb-1">Notes</label>
              <Input.TextArea
                rows={4}
                style={{ resize: "none" }}
                className="text-sm"
                placeholder="Add notes about this job"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Tour instance */}
        <AddToTrackerTour open={openTour} onClose={() => setOpenTour(false)} />
      </>
    ),
    status,
    rating,
    notes,
    data,
    jobStatuses,
  };
};

export default HideJobsPanelContent;
