// src/components/HideJobsPanelShell.jsx
import React, { useState, useEffect, useRef } from "react";
import { Button, Dropdown, Modal, message } from "antd";
import {
  MenuOutlined,
  PlusSquareOutlined,
  ClearOutlined,
  HomeFilled,
  FileDoneOutlined,
  DoubleRightOutlined,
  CloseOutlined,
  ArrowsAltOutlined,
  RetweetOutlined,
  QuestionCircleFilled,
  LogoutOutlined,
  LoginOutlined,
} from "@ant-design/icons";

import LogoNoBackground from "../assets/LogoNoBackground";
import Logo from "../assets/Logo";

import HideJobsPanelContent from "./HideJobsPanelContent";
import HideJobsPanelCustomJob from "./HideJobsPanelCustomJob";
import HideJobsPanelSave from "./HideJobsPanelSave";
import HideJobsPanelLoginRequired from "./HideJobsPanelLoginRequired";
import HideJobsFilters from "./HideJobsFilters";

import { EyeInvisibleFilled } from "@ant-design/icons";
import CompaniesHideList from "./CompaniesHideList";
import RepostedPanel from "./RepostedJobs/RepostedPanel";
import HideJobsHelpPanel from "./HideJobsHelpPanel"; // ← NEW

const HideJobsPanelShell = ({ currentHref }) => {
  const [modal, modalContextHolder] = Modal.useModal();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isButtonVisible, setIsButtonVisible] = useState(false);
  const [isJobSaved, setIsJobSaved] = useState(false);
  const [trackedJobId, setTrackedJobId] = useState(null);
  const [manualMode, setManualMode] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [panelView, setPanelView] = useState("filters");

  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dragState = useRef({ drag: false, dragged: false, startY: 0, initTop: 0 });

  // Safe fallback if prop is ever missing
  const hrefFromProp =
    typeof currentHref === "string" && currentHref.length ? currentHref : (typeof location !== "undefined" ? location.href : "");

  // helpers to disable/enable transition on demand (used by the tour)
  const setTransitionsEnabled = (enabled) => {
    const container = containerRef.current;
    const button = buttonRef.current;
    const value = enabled ? "" : "none";
    if (container) container.style.transition = value; // overrides Tailwind/CSS
    if (button) button.style.transition = value;
  };

  // Initial view — default to "filters" until user picks something else
  useEffect(() => {
    chrome?.storage?.local?.get(["hidejobs_panel_view"], (result) => {
      const v = result?.hidejobs_panel_view;
      if (
        v === "filters" ||
        v === "default" ||
        v === "companies" ||
        v === "reposted" ||
        v === "help"
      ) {
        setPanelView(v);
      } else {
        // first time ever → set filters
        setPanelView("filters");
        chrome?.storage?.local?.set({ hidejobs_panel_view: "filters" });
      }
    });
  }, []);

  // Login status
  useEffect(() => {
    chrome?.storage?.local?.get("user", (result) => {
      setIsLoggedIn(!!result?.user?.uid);
    });

    const handleStorageChange = (changes, namespace) => {
      if (namespace === "local" && "user" in changes) {
        setIsLoggedIn(!!changes.user.newValue?.uid);
      }
    };

    chrome?.storage?.onChanged?.addListener(handleStorageChange);
    return () => {
      chrome?.storage?.onChanged?.removeListener(handleStorageChange);
    };
  }, []);

  // Panel visibility from storage (on mount)
  useEffect(() => {
    chrome?.storage?.local?.get(["hidejobs_panel_visible"], (result) => {
      if (result?.hidejobs_panel_visible === true) setIsPanelVisible(true);
    });
  }, []);

  // EXPLICIT set-visible (used by the tour) — can disable transitions per action
  useEffect(() => {
    const onSetVisible = (e) => {
      const desired = !!e?.detail?.visible;
      const instant = !!e?.detail?.instant;

      if (instant) setTransitionsEnabled(false);

      setIsPanelVisible(desired);
      setIsButtonVisible(!desired);
      chrome?.storage?.local?.set({ hidejobs_panel_visible: desired });

      if (instant) {
        // restore transitions on the next tick
        setTimeout(() => setTransitionsEnabled(true), 0);
      }
    };

    window.addEventListener("hidejobs-panel-set-visible", onSetVisible);
    return () => window.removeEventListener("hidejobs-panel-set-visible", onSetVisible);
  }, []);

  // Draggable button logic
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleMouseDown = (e) => {
      dragState.current.drag = true;
      dragState.current.dragged = false;
      dragState.current.startY = e.clientY;
      dragState.current.initTop =
        parseInt(button.style.top) || button.getBoundingClientRect().top;
      button.classList.add("dragging");
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
      }
    };

    const handleClick = (e) => {
      if (dragState.current.dragged) {
        e.preventDefault();
        dragState.current.dragged = false;
        return;
      }

      chrome?.storage?.local?.get(["hidejobs_panel_view"], (res) => {
        const lastView =
          res?.hidejobs_panel_view === "filters"
            ? "filters"
            : res?.hidejobs_panel_view === "companies"
              ? "companies"
              : res?.hidejobs_panel_view === "reposted"
                ? "reposted"
                : res?.hidejobs_panel_view === "help" // ← NEW
                  ? "help"
                  : "default";
        setPanelView(lastView);
        setIsPanelVisible(true);
        chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
        setIsButtonVisible(false);
      });
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

  // Legacy toggle event — keep working for other parts of the app
  useEffect(() => {
    const toggleHandler = () => {
      setIsPanelVisible((prev) => {
        const nowVisible = !prev;
        chrome?.storage?.local?.set({ hidejobs_panel_view: panelView });
        chrome?.storage?.local?.set({ hidejobs_panel_visible: nowVisible });
        setIsButtonVisible(!nowVisible);
        return nowVisible;
      });
    };
    window.addEventListener("toggle-hidejobs-panel", toggleHandler);
    return () => window.removeEventListener("toggle-hidejobs-panel", toggleHandler);
  }, [panelView]);

  // Show floating button after delay
  useEffect(() => {
    const t = setTimeout(() => setIsButtonVisible(true), 1000);
    return () => clearTimeout(t);
  }, []);

  // Detect manual mode — recompute whenever currentHref changes
  useEffect(() => {
    // LinkedIn: jobs view/collections/search
    const isLinkedIn =
      /\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/jobs\/(view|collections|search)\b/i.test(hrefFromProp);

    // Indeed: any subdomain + any TLD, common job URLs: /viewjob, /jobs
    const isIndeed =
      /\/\/(?:[a-z0-9-]+\.)?indeed\.[a-z.]+\/(viewjob|jobs)\b/i.test(hrefFromProp);

    // Glassdoor: any subdomain + any TLD, common job URLs: /Job, /JobSearch
    const isGlassdoor =
      /\/\/(?:[a-z0-9-]+\.)?glassdoor\.[a-z.]+\/(Job|JobSearch)\b/i.test(hrefFromProp);

    const isSupportedJobPage = isLinkedIn || isIndeed || isGlassdoor;

    setManualMode(!isSupportedJobPage);
  }, [currentHref]);

  // Allow other components to force a view (companies/filters/reposted/help)
  useEffect(() => {
    const onSetView = (e) => {
      const view = e?.detail?.view;
      if (!view) return;

      setPanelView(view);
      chrome?.storage?.local?.set({ hidejobs_panel_view: view });

      setIsPanelVisible(true);
      chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
      setIsButtonVisible(false);
    };

    window.addEventListener("hidejobs-panel-set-view", onSetView);
    return () => window.removeEventListener("hidejobs-panel-set-view", onSetView);
  }, []);

  const handleOpenJob = () => {
    if (trackedJobId) {
      const url = `https://app.hidejobs.com/job-tracker/${trackedJobId}`;
      chrome?.runtime?.sendMessage?.({ type: "open-tab", url });
    }
  };

  const contentHookResult = HideJobsPanelContent({
    isJobSaved,
    setIsJobSaved,
    setTrackedJobId,
    handleOpenJob,
  });

  const customJobHookResult = HideJobsPanelCustomJob({
    isJobSaved,
    setIsJobSaved,
    setTrackedJobId,
    handleOpenJob,
  });

  const { title, content, status, rating, notes, data, jobStatuses } = manualMode
    ? customJobHookResult
    : contentHookResult;

  // ===== Logout handler (AntD Modal.confirm) =====
  const requestLogout = () => {
    modal.confirm({
      title: "Log out?",
      content: "You will be signed out of HideJobs on this browser.",
      icon: null,
      okText: "Log out",
      okButtonProps: { danger: true, icon: <LogoutOutlined /> },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await chrome?.storage?.local?.remove("user");
          setIsLoggedIn(false);
          message.success("You have been logged out.");
        } catch (e) {
          message.error("Failed to log out. Please try again.");
        }
      },
    });
  };


  const dropdownItems = [
    {
      key: "job-panel",
      label: "Add to Tracker",
      icon: <PlusSquareOutlined />,
      onClick: () => {
        setPanelView("default");
        chrome?.storage?.local?.set({ hidejobs_panel_view: "default" });
        setIsPanelVisible(true);
        chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
        setIsButtonVisible(false);
        setDropdownOpen(false);
      },
    },
    {
      key: "filters",
      label: "Filters",
      icon: <ClearOutlined />,
      onClick: () => {
        setPanelView("filters");
        chrome?.storage?.local?.set({ hidejobs_panel_view: "filters" });
        setIsPanelVisible(true);
        chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
        setIsButtonVisible(false);
        setDropdownOpen(false);
      },
    },
    {
      key: "hidden-companies",
      label: "Hidden Companies",
      icon: <EyeInvisibleFilled />,
      onClick: () => {
        setPanelView("companies");
        chrome?.storage?.local?.set({ hidejobs_panel_view: "companies" });
        setIsPanelVisible(true);
        chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
        setIsButtonVisible(false);
        setDropdownOpen(false);
      },
    },
    {
      key: "reposted",
      label: "Reposted jobs",
      icon: <RetweetOutlined />,
      onClick: () => {
        setPanelView("reposted");
        chrome?.storage?.local?.set({ hidejobs_panel_view: "reposted" });
        setIsPanelVisible(true);
        chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
        setIsButtonVisible(false);
        setDropdownOpen(false);
      },
    },
    {
      key: "help", // ← NEW
      label: "Help", // ← NEW
      icon: <QuestionCircleFilled />, // ← NEW
      onClick: () => {
        setPanelView("help");
        chrome?.storage?.local?.set({ hidejobs_panel_view: "help" });
        setIsPanelVisible(true);
        chrome?.storage?.local?.set({ hidejobs_panel_visible: true });
        setIsButtonVisible(false);
        setDropdownOpen(false);
      },
    },
    { type: "divider" },
    {
      key: "home",
      label: "Dashboard",
      icon: <HomeFilled />,
      onClick: () => {
        chrome?.runtime?.sendMessage?.({
          type: "open-tab",
          url: "https://app.hidejobs.com/home",
        });
        setDropdownOpen(false);
      },
    },
    {
      key: "resume-builder",
      label: "Resume Builder",
      icon: <FileDoneOutlined />,
      onClick: () => {
        chrome?.runtime?.sendMessage?.({
          type: "open-tab",
          url: "https://app.hidejobs.com/resume-builder",
        });
        setDropdownOpen(false);
      },
    },
    {
      key: "job-tracker",
      label: "Job Tracker",
      icon: <DoubleRightOutlined />,
      onClick: () => {
        chrome?.runtime?.sendMessage?.({
          type: "open-tab",
          url: "https://app.hidejobs.com/job-tracker",
        });
        setDropdownOpen(false);
      },
    },
    { type: "divider" },
    isLoggedIn
      ? {
        key: "logout",
        label: "Log out",
        icon: <LogoutOutlined />,
        onClick: () => {
          setDropdownOpen(false);
          requestLogout();
        },
      }
      : {
        key: "login",
        label: "Log in",
        icon: <LoginOutlined />,
        onClick: () => {
          setDropdownOpen(false);
          chrome?.runtime?.sendMessage?.({
            type: "open-tab",
            url: "https://app.hidejobs.com/login",
          });
        },
      }
  ];

  return (
    <>
      {modalContextHolder}
      <style>
        {`
          .button-wrapper {
            right: -150px;
            /* Only animate the slide-in/out on the RIGHT axis */
            transition: right 0.3s ease-in-out;
          }

          .button-wrapper.slide-visible {
            right: -20px;
            transition: right 0.3s ease-in-out;
          }

          .button-wrapper.slide-visible:hover { right: 0; }

          /* While dragging: no transitions at all => immediate movement */
          .button-wrapper.dragging {
            right: 0;
            transition: none !important;
          }

          .button-wrapper:hover .tooltip { opacity: 1; }
          .button-wrapper.dragging .tooltip { opacity: 0 !important; }
          .button-wrapper.hidden { right: -150px; }
          .blue-section {
            background-color: #28507c;
            border-right: none;
            border-radius: 8px 0 0 8px;
            padding: 0 5px; height: 50px;
            display: flex; align-items: center; justify-content: center;
          }
          .red-section {
            background-color: #233b57;
            width: 20px; height: 50px;
            display: flex; justify-content: center; align-items: center;
          }
          .tooltip {
            position: absolute; top: -35px; left: -10px; transform: translateX(-50%);
            background-color: #233b57; color: white; font-size: 14px; padding: 4px 8px;
            border-radius: 5px; white-space: nowrap; opacity: 0; transition: opacity 0.3s ease-in-out; pointer-events: none;
          }
        `}
      </style>

      <div
        ref={buttonRef}
        className={`button-wrapper fixed top-[70%] border-none z-[9999] flex items-center rounded-l-md shadow-xl ${isButtonVisible && !isPanelVisible ? "slide-visible" : ""}`}
      >
        <div className="blue-section cursor-pointer">
          <LogoNoBackground className="w-10 h-10" />
        </div>
        <div className="red-section cursor-grab">
          <ArrowsAltOutlined style={{ transform: "rotate(-45deg)", fontSize: "18px", color: "white" }} />
        </div>
        <div className="tooltip">HideJobs</div>
      </div>

      <div
        ref={containerRef}
        className={`fixed top-[20px] right-[-400px] w-96 h-[95vh] rounded-xl shadow-2xl border-1 border-gray-200 bg-white z-[9999] flex flex-col overflow-hidden text-gray-800 font-sans transition-right duration-[0.4s] ease-[cubic-bezier(0.68,-0.55,0.27,1.55)] user-select-none ${isPanelVisible ? "right-[20px]" : ""}`}
      >
        {/* Sticky Header */}
        <div className="bg-hidejobs-50 shrink-0 sticky top-0 z-10 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <span className="text-xl font-bold text-hidejobs-700">HideJobs</span>
          </div>
          <div className="flex items-center gap-2">
            <Dropdown
              menu={{ items: dropdownItems }}
              placement="bottomRight"
              trigger={["click"]}
              open={dropdownOpen}
              onOpenChange={setDropdownOpen}
              getPopupContainer={() => containerRef.current || document.body}
              overlayStyle={{ zIndex: 10001, position: "absolute" }}
            >
              <Button type="text" icon={<MenuOutlined className="text-xl" />} onClick={() => setDropdownOpen(!dropdownOpen)} />
            </Dropdown>
            <Button
              type="text"
              icon={<CloseOutlined className="text-xl" />}
              onClick={() => {
                chrome?.storage?.local?.set({ hidejobs_panel_view: panelView });
                setIsPanelVisible(false);
                setIsButtonVisible(true);
                chrome?.storage?.local?.set({ hidejobs_panel_visible: false });
              }}
              className="hover:bg-gray-200 rounded-full"
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-sm">
          {panelView === "companies" ? (
            <CompaniesHideList />
          ) : panelView === "reposted" ? (
            <RepostedPanel />
          ) : panelView === "help" ? ( // ← NEW
            <HideJobsHelpPanel />
          ) : isLoggedIn ? (
            panelView === "filters" ? <HideJobsFilters /> : content
          ) : (
            <HideJobsPanelLoginRequired />
          )}
        </div>

        {/* Sticky Footer */}
        {isLoggedIn && panelView === "default" && (
          <div className="shrink-0 sticky bottom-0 z-10 bg-hidejobs-50 border-t border-gray-200 px-4 py-3 flex justify-center items-center">
            <HideJobsPanelSave
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

export default HideJobsPanelShell;
