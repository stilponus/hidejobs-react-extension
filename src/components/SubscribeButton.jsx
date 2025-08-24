import React from "react";
import { Button } from "antd";
import { CrownFilled } from "@ant-design/icons";

/**
 * Reusable Subscribe button with pricing text.
 * - Opens subscription page in a new tab
 * - Styled with global "ai-button" class + Ant Design Button
 */
export default function SubscribeButton() {
  const openSubscribe = () => {
    chrome.runtime?.sendMessage?.({
      type: "open-tab",
      url: "https://app.hidejobs.com/account/subscription",
    });
  };

  return (
    <div className="py-2">
      <Button
        type="text"
        size="large"
        block
        onClick={openSubscribe}
        icon={<CrownFilled />}
        className="ai-button"
      >
        Subscribe
      </Button>
      <div className="mt-2 text-center text-xs text-gray-500">
        Starting at <span className="font-medium">$2.99</span> per month
      </div>
    </div>
  );
}
