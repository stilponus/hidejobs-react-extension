import React from "react";
import { Button } from "antd";

const HideJobsPanelLoginRequired = () => {
  const openAuthPage = () => {
    const url = "https://app.hidejobs.com/login?source=extension";

    try {
      // Fixed: Use the same key that the web app expects
      localStorage.setItem("login_source", "extension");
    } catch (_) {
      /* ignore storage errors */
    }

    // Always just open directly in a new tab
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-full justify-between text-center">
      {/* Main content in the middle */}
      <div className="flex flex-col items-center justify-center flex-grow space-y-4">
        <p className="text-sm text-gray-600">
          Please log in or sign up to continue.
        </p>
        <div className="flex gap-2 justify-center">
          <Button type="primary" size="large" onClick={openAuthPage}>
            Log in
          </Button>
          <Button type="default" size="large" onClick={openAuthPage}>
            Sign up
          </Button>
        </div>
      </div>

      {/* Disclaimer at the very bottom */}
      <p className="mt-8 text-xs text-gray-400 mb-4 px-4">
        HideJobs offers free features and full access from <strong>$4.99/month </strong>
        with a <strong>7-day free trial</strong> — no payment details needed.
      </p>
    </div>
  );
};

export default HideJobsPanelLoginRequired;
