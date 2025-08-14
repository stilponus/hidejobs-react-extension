import React, { useState, useEffect, useRef } from "react";
import { Button, Dropdown } from "antd";
import {
  MenuOutlined,
  HomeFilled,
  FileDoneOutlined,
  DoubleRightOutlined,
  CloseOutlined,
  ArrowsAltOutlined,
} from "@ant-design/icons";

import Logo from "../assets/Logo";

import StilponPanelContent from "./StilponPanelContent";
import StilponPanelCustomJob from "./StilponPanelCustomJob";
import StilponPanelSave from "./StilponPanelSave";
import StilponPanelLoginRequired from "./StilponPanelLoginRequired";

const StilponPanelShell = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isButtonVisible, setIsButtonVisible] = useState(false);
  const [isJobSaved, setIsJobSaved] = useState(false);
  const [trackedJobId, setTrackedJobId] = useState(null);
  const [manualMode, setManualMode] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dragState = useRef({ drag: false, dragged: false, startY: 0, initTop: 0 });

  // Check login status on mount and listen for storage changes
  useEffect(() => {
    // Initial check
    chrome.storage.local.get("user", (result) => {
      setIsLoggedIn(!!result.user?.id);
    });

    // Listen for changes to the 'user' key
    const handleStorageChange = (changes, namespace) => {
      if (namespace === "local" && "user" in changes) {
        setIsLoggedIn(!!changes.user.newValue?.id);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Panel visibility from storage
  useEffect(() => {
    chrome?.storage?.local?.get(["stilpon_panel_visible"], (result) => {
      if (result?.stilpon_panel_visible === true) {
        setIsPanelVisible(true);
      }
    });
  }, []);

  // Draggable button logic
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleMouseDown = (e) => {
      dragState.current.drag = true;
      dragState.current.dragged = false;
      dragState.current.startY = e.clientY;
      dragState.current.initTop = parseInt(button.style.top) || button.getBoundingClientRect().top;
      button.classList.add("dragging");
      button.style.transition = "none";
    };

    const handleMouseMove = (e) => {
      if (!dragState.current.drag) return;
      requestAnimationFrame(() => {
        const newY = dragState.current.initTop + (e.clientY - dragState.current.startY);
        const max = window.innerHeight - button.offsetHeight - 5;
        button.style.top = `${Math.min(Math.max(5, newY), max)}px`;
        if (Math.abs(e.clientY - dragState.current.startY) > 5) {
          dragState.current.dragged = true;
        }
      });
    };

    const handleMouseUp = () => {
      if (dragState.current.drag) {
        dragState.current.drag = false;
        button.classList.remove("dragging");
        button.style.transition = "right 0.3s ease-in-out";
      }
    };

    const handleClick = (e) => {
      if (dragState.current.dragged) {
        e.preventDefault();
        dragState.current.dragged = false;
        return;
      }
      setIsPanelVisible(true);
      chrome.storage.local.set({ stilpon_panel_visible: true });
      setIsButtonVisible(false);
    };

    button.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    button.addEventListener("click", handleClick);

    return () => {
      button.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      button.removeEventListener("click", handleClick);
    };
  }, []);

  // Toggle panel visibility
  useEffect(() => {
    const toggleHandler = () => {
      setIsPanelVisible((prev) => {
        const nowVisible = !prev;
        chrome.storage.local.set({ stilpon_panel_visible: nowVisible });
        if (nowVisible) setIsButtonVisible(false);
        if (!nowVisible) setIsButtonVisible(true);
        return nowVisible;
      });
    };
    window.addEventListener("toggle-stilpon-panel", toggleHandler);
    return () => window.removeEventListener("toggle-stilpon-panel", toggleHandler);
  }, []);

  // Show button after delay
  useEffect(() => {
    setTimeout(() => {
      setIsButtonVisible(true);
    }, 1000);
  }, []);

  // ⬇️ FIXED: detect pages that have no scraper
  useEffect(() => {
    // if URL is NOT hh.ru/vacancy/*  AND NOT zarplata.ru/vacancy/*  → manual mode
    const noScraper = !/\/\/[^/]*?hh\.ru\/vacancy\//i.test(location.href) &&
      !/\/\/[^/]*?zarplata\.ru\/vacancy\//i.test(location.href);

    setManualMode(noScraper);
  }, []);

  const handleOpenJob = () => {
    if (trackedJobId) {
      const url = `https://app.stilpon.ru/job-tracker/${trackedJobId}`;
      console.log("🔓 Opening job in app:", url);
      chrome.runtime.sendMessage({ type: "open-tab", url });
    } else {
      console.warn("⚠️ No tracked_job_id available");
    }
  };

  // ⬇️ FIXED: Always call both hooks, then choose which data to use
  const contentHookResult = StilponPanelContent({
    isJobSaved,
    setIsJobSaved,
    setTrackedJobId,
    handleOpenJob,
  });

  const customJobHookResult = StilponPanelCustomJob({
    isJobSaved,
    setIsJobSaved,
    setTrackedJobId,
    handleOpenJob,
  });

  // Choose which result to use based on manualMode
  const { title, content, status, rating, notes, data, jobStatuses } = manualMode 
    ? customJobHookResult 
    : contentHookResult;

  const dropdownItems = [
    {
      key: "home",
      label: "Панель управления",
      icon: <HomeFilled />,
      onClick: () => {
        chrome.runtime.sendMessage({ type: "open-tab", url: "https://app.stilpon.ru/home" });
        setDropdownOpen(false);
      },
    },
    {
      key: "resume-builder",
      label: "Конструктор резюме",
      icon: <FileDoneOutlined />,
      onClick: () => {
        chrome.runtime.sendMessage({ type: "open-tab", url: "https://app.stilpon.ru/resume-builder" });
        setDropdownOpen(false);
      },
    },
    {
      key: "job-tracker",
      label: "Трекер вакансий",
      icon: <DoubleRightOutlined />,
      onClick: () => {
        chrome.runtime.sendMessage({ type: "open-tab", url: "https://app.stilpon.ru/job-tracker" });
        setDropdownOpen(false);
      },
    },
  ];

  return (
    <>
      <style>
        {`
          .button-wrapper {
            right: -150px;
            transition: right 0.3s ease-in-out, top 0.3s ease-in-out;
          }
          .button-wrapper.slide-visible {
            right: -20px;
            transition: right 0.3s ease-in-out, top 0.3s ease-in-out;
          }
          .button-wrapper.slide-visible:hover {
            right: 0;
          }
          .button-wrapper.dragging {
            right: 0;
          }
          .button-wrapper:hover .tooltip {
            opacity: 1;
          }
          .button-wrapper.dragging .tooltip {
            opacity: 0 !important;
          }
          .button-wrapper.hidden {
            right: -150px;
          }
          .blue-section {
            background-color: #ffffff;
            border: 2px solid #28507c;
            border-right: none;
            color: white;
            border-radius: 5px 0 0 5px;
            padding: 0 5px;
            height: 65px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .red-section {
            background-color: #28507c;
            width: 20px;
            height: 65px;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .tooltip {
            position: absolute;
            top: -35px;
            left: -10px;
            transform: translateX(-50%);
            background-color: #233b57;
            color: white;
            font-size: 12px;
            padding: 5px 8px;
            border-radius: 5px;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            pointer-events: none;
          }
        `}
      </style>
      <div
        ref={buttonRef}
        className={`button-wrapper fixed top-[70%] border-none z-[9999] flex items-center rounded-l-md shadow-xl ${isButtonVisible && !isPanelVisible ? "slide-visible" : ""
          }`}
      >
        <div className="blue-section cursor-pointer">
          <Logo className="w-14 h-14" />
        </div>
        <div className="red-section cursor-grab">
          <ArrowsAltOutlined style={{ transform: "rotate(-45deg)", fontSize: "18px", color: "white" }} />
        </div>
        <div className="tooltip">Стильпон</div>
      </div>
      <div
        ref={containerRef}
        className={`fixed top-[20px] right-[-400px] w-96 h-[90vh] rounded-xl shadow-2xl border-1 border-gray-200 bg-white z-[9999] flex flex-col overflow-hidden text-gray-800 font-sans transition-right duration-[0.4s] ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] user-select-none ${isPanelVisible ? "right-[20px]" : ""
          }`}
      >
        {/* Sticky Header */}
        <div className="bg-stilpon-50 shrink-0 sticky top-0 z-10 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
          <div className="text-lg font-bold text-stilpon-700">{title}</div>
          <div className="flex items-center gap-2">
            <Dropdown
              menu={{ items: dropdownItems }}
              placement="bottomRight"
              trigger={["click"]}
              open={dropdownOpen}
              onOpenChange={setDropdownOpen}
              getPopupContainer={() => containerRef.current || document.body}
              overlayStyle={{
                zIndex: 10001,
                position: "absolute",
              }}
            >
              <Button
                type="text"
                icon={<MenuOutlined className="text-xl" />}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              />
            </Dropdown>
            <Button
              type="text"
              icon={<CloseOutlined className="text-xl" />}
              onClick={() => {
                setIsPanelVisible(false);
                setIsButtonVisible(true);
                chrome.storage.local.set({ stilpon_panel_visible: false });
              }}
              className="hover:bg-gray-200 rounded-full"
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
          {isLoggedIn ? content : <StilponPanelLoginRequired />}
        </div>

        {/* Sticky Footer - Only shown when logged in */}
        {isLoggedIn && (
          <div className="shrink-0 sticky bottom-0 z-10 bg-stilpon-50 border-t border-gray-200 px-4 py-3 flex justify-center items-center">
            <StilponPanelSave
              data={data}
              status={status}
              rating={rating}
              notes={notes}
              jobStatuses={jobStatuses}
              isJobSaved={isJobSaved}
              setIsJobSaved={setIsJobSaved}
              setTrackedJobId={setTrackedJobId}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default StilponPanelShell;