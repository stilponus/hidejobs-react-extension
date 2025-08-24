// src/components/HowItWorksModal.jsx
import React from "react";
import { Modal, Switch, Tooltip } from "antd";
import { CrownFilled } from "@ant-design/icons";

function OffBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1">
      <span className="text-xs text-gray-600">Applied</span>
      <div className="text-xs font-semibold text-gray-700">OFF</div>
    </div>
  );
}

function OnBadgeCount() {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1">
      <span className="text-xs text-gray-600">Applied</span>
      <div className="text-xs font-semibold text-gray-700">8</div>
    </div>
  );
}

/**
 * Props:
 * - open: boolean (controls visibility)
 * - onClose: function (called when user closes)
 */
export default function HowItWorksModal({ open, onClose }) {
  return (
    <Modal
      title={<div className="text-hidejobs-700 font-semibold">How to Hide Jobs</div>}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="Got it"
      centered
      width={560}
    >
      <div className="space-y-4">
        {/* Step 1 */}
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">1.</span> Turn <span className="font-semibold">ON</span> the switch for{" "}
            <span className="italic">Dismissed</span>, <span className="italic">Promoted</span>,{" "}
            <span className="italic">Applied</span>, or <span className="italic">Viewed</span> jobs:
          </p>

          <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <CrownFilled className="text-[#b8860b]" />
              <span className="truncate text-sm">Applied</span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip title="Premium feature" placement="top">
                <CrownFilled className="text-[#b8860b]" />
              </Tooltip>
              <Switch size="small" checked disabled />
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">2.</span> A button will appear on the LinkedIn page with{" "}
            <span className="font-semibold">"OFF"</span> by default:
          </p>
          <OffBadge />
        </div>

        {/* Step 3 */}
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">3.</span> Click the button to hide jobs and see how many are hidden:
          </p>
          <OnBadgeCount />
        </div>
      </div>
    </Modal>
  );
}
