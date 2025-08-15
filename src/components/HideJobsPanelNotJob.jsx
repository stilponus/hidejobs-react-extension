import React from "react";

const HideJobsPanelNotJob = () => {
  return (
    <div className="flex items-center justify-center h-full text-center space-y-4">
      <div>
        <p className="text-sm text-gray-600">
          This is not a job posting page. Please go to hh.ru to work with job listings.
        </p>
      </div>
    </div>
  );
};

export default HideJobsPanelNotJob;
