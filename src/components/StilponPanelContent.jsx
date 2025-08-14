import React, { useEffect, useState } from "react";
import { Select, Rate, Input, Button, Skeleton } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

const { Option } = Select;

const categoryPairs = [
  [
    { key: "salary", label: "Зарплата" },
    { key: "employment_type", label: "Тип занятости" },
  ],
  [
    { key: "job_required_skills", label: "Ключевые навыки" },
    { key: "work_format", label: "Формат работы" },
  ],
  [
    { key: "job_location", label: "Локация" },
    { key: "job_description", label: "Описание вакансии" },
  ],
];

const StilponPanelContent = ({ isJobSaved, setIsJobSaved, setTrackedJobId, handleOpenJob }) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("bookmarked");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");

  const jobStatuses = [
    { key: "bookmarked", label: "В избранном" },
    { key: "applying", label: "Планирую отклик" },
    { key: "applied", label: "Откликнулся" },
    { key: "interviewing", label: "Собеседование" },
    { key: "negotiating", label: "Переговоры" },
  ];

  /* Приём данных от контент-скрипта */
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === "stilpon-job-data") {
        console.log("🟡 Получены данные вакансии:", e.data.payload);
        setData(e.data.payload);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  /* Проверяем, сохранена ли вакансия */
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
          if (typeof jobData === "boolean") setIsJobSaved(jobData);
          else if (jobData.saved) {
            setIsJobSaved(true);
            setTrackedJobId(jobData.tracked_job_id);
          }
        }
      });
    }
  }, [data?.externalJobId, setIsJobSaved, setTrackedJobId]);

  return {
    title: "Стильпон",
    content: !data ? (
      <Skeleton active />
    ) : (
      <>
        {/* Название и компания */}
        {data.job_title && (
          <p className="text-2xl font-semibold text-stilpon-700 mb-0">{data.job_title}</p>
        )}
        {data.company_name && (
          <p className="text-base text-gray-600 mb-3">{data.company_name}</p>
        )}

        {/* Таблица категорий */}
        <table className="w-full mb-4 text-sm">
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

        {/* Сохранено */}
        {isJobSaved ? (
          <div className="flex justify-center">
            <Button onClick={handleOpenJob} type="primary" size="large">
              Перейти к вакансии
            </Button>
          </div>
        ) : (
          <>
            {/* Статус */}
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

            {/* Интерес */}
            <div className="mb-3">
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Интерес</label>
              <Rate value={rating} onChange={setRating} />
            </div>

            {/* Заметки */}
            <div>
              <label className="block text-lg font-semibold text-stilpon-700 mb-1">Заметки</label>
              <Input.TextArea
                rows={4}
                style={{ resize: "none" }}
                className="text-sm"
                placeholder="Добавьте заметки по вакансии"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </>
        )}
      </>
    ),
    status,
    rating,
    notes,
    data,
    jobStatuses,
  };
};

export default StilponPanelContent;
