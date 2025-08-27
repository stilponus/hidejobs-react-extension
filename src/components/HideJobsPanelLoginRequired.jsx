import React from "react";
import { Button } from "antd";

const HideJobsPanelLoginRequired = () => {
  const handleLogin = () => {
    chrome.runtime.sendMessage({ type: "open-tab", url: "https://app.hidejobs.com/login" });
  };

  return (
    <div className="flex items-center justify-center h-full text-center space-y-4">
      <div>
        <p className="text-sm mb-4 text-gray-600">
          Please log in to continue.
        </p>
        <Button type="primary" size="large" onClick={handleLogin}>
          Log in
        </Button>
      </div>
    </div>
  );
};

export default HideJobsPanelLoginRequired;
