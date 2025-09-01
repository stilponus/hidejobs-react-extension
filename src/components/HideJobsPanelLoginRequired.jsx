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
    <div className="flex items-center justify-center h-full text-center space-y-4">
      <div>
        <p className="text-sm mb-4 text-gray-600">
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
    </div>
  );
};

export default HideJobsPanelLoginRequired;