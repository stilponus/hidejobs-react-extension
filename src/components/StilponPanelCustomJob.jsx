import React, { useState, useEffect } from "react";
import { Select, Rate, Input, Button } from "antd";

const { Option } = Select;
const { TextArea } = Input;

const jobStatuses = [
  { key: "bookmarked", label: "В избранном" },
  { key: "applying", label: "Планирую отклик" },
  { key: "applied", label: "Откликнулся" },
  { key: "interviewing", label: "Собеседование" },
  { key: "negotiating", label: "Переговоры" },
];

const StilponPanelCustomJob = ({ isJobSaved, setIsJobSaved, setTrackedJobId, handleOpenJob }) => {
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [status, setStatus] = useState("bookmarked");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // ⬇️ UPDATED: Use clean URL for custom jobs
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

          // ⬇️ Load only title and company for custom jobs
          if (jobData.job_title) setJobTitle(jobData.job_title);
          if (jobData.company_name) setCompanyName(jobData.company_name);
        }
      }
    });
  }, []);

  return {
    title: "Стильпон",
    content: (
      <>
        {/* Show saved job info or full form */}
        {isJobSaved ? (
          <>
            {/* Show only job title and company when saved */}
            {jobTitle && (
              <p className="text-2xl font-semibold text-stilpon-700 mb-0">{jobTitle}</p>
            )}
            {companyName && (
              <p className="text-base text-gray-600 mb-6">{companyName}</p>
            )}

            <div className="flex justify-center">
              <Button onClick={handleOpenJob} type="primary" size="large">
                Перейти к вакансии
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Название вакансии */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Название вакансии</label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Введите название вакансии"
                className="text-sm"
              />
            </div>

            {/* Компания */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Компания</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Введите название компании"
                className="text-sm"
              />
            </div>

            {/* Локация */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Локация</label>
              <Input
                value={jobLocation}
                onChange={(e) => setJobLocation(e.target.value)}
                placeholder="Введите локацию"
                className="text-sm"
              />
            </div>

            {/* Описание вакансии */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Описание вакансии</label>
              <TextArea
                rows={4}
                style={{ resize: "none" }}
                className="text-sm"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Введите описание вакансии"
              />
            </div>

            {/* Статус */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Статус</label>
              <Select value={status} style={{ width: "100%" }} onChange={setStatus} className="text-sm">
                {jobStatuses.map((s) => (
                  <Option key={s.key} value={s.key}>
                    {s.label}
                  </Option>
                ))}
              </Select>
            </div>

            {/* Интерес */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Интерес</label>
              <Rate value={rating} onChange={setRating} />
            </div>

            {/* Заметки */}
            <div>
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Заметки</label>
              <TextArea
                rows={4}
                style={{ resize: "none" }}
                className="text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Добавьте заметки"
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
      // ⬇️ UPDATED: Use clean URL for custom jobs
      externalJobId: window.location.origin + window.location.pathname,
      job_url: window.location.href,
    },
    jobStatuses,
  };
};

export default StilponPanelCustomJob;