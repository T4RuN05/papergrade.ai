"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type PortalTab = "dashboard" | "exams";

interface UsePortalTabSwipeOptions {
  initialTab?: PortalTab;
  isModalOpen?: boolean;
}

export function usePortalTabSwipe(options: UsePortalTabSwipeOptions = {}) {
  const { initialTab = "dashboard", isModalOpen = false } = options;

  const [activeTab, setActiveTab] = useState<PortalTab>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "exams") return "exams";
    }
    return initialTab;
  });
  const activeTabRef = useRef<PortalTab>(activeTab);
  activeTabRef.current = activeTab;

  const tabTrackRef = useRef<HTMLDivElement>(null);
  const tabIndicatorPillRef = useRef<HTMLSpanElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const isTouchDraggingRef = useRef(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchGestureLockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const touchContainerWidthRef = useRef<number>(0);
  const tabTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabSwitch = useCallback(
    (newTab: PortalTab, scrollToTop = true) => {
      const currentTab = activeTabRef.current;
      if (newTab === currentTab) {
        if (scrollToTop && typeof window !== "undefined" && window.scrollY > 100) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      if (tabTransitionTimerRef.current) clearTimeout(tabTransitionTimerRef.current);

      setIsTransitioning(true);
      setActiveTab(newTab);
      activeTabRef.current = newTab;

      if (tabTrackRef.current) {
        tabTrackRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
        tabTrackRef.current.style.transform =
          newTab === "exams" ? "translate3d(-50%, 0, 0)" : "translate3d(0%, 0, 0)";
      }
      if (tabIndicatorPillRef.current) {
        tabIndicatorPillRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
        tabIndicatorPillRef.current.style.transform =
          newTab === "exams" ? "translate3d(100%, 0, 0)" : "translate3d(0%, 0, 0)";
      }

      const newUrl = newTab === "exams" ? "/student/portal?tab=exams" : "/student/portal";
      window.history.replaceState(null, "", newUrl);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("papergrade:tab-changed", { detail: newTab }));
      }

      if (scrollToTop && typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      tabTransitionTimerRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    },
    []
  );

  useEffect(() => {
    const handleUrlTab = () => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get("tab") === "exams" ? "exams" : "dashboard";
        if (tab !== activeTabRef.current) {
          handleTabSwitch(tab, true);
        }
      }
    };
    handleUrlTab();

    const handleCustomTabSwitch = (e: Event) => {
      const ce = e as CustomEvent<PortalTab>;
      if (ce.detail && ce.detail !== activeTabRef.current) {
        handleTabSwitch(ce.detail, true);
      }
    };
    window.addEventListener("papergrade:switch-tab", handleCustomTabSwitch);
    window.addEventListener("popstate", handleUrlTab);

    return () => {
      window.removeEventListener("papergrade:switch-tab", handleCustomTabSwitch);
      window.removeEventListener("popstate", handleUrlTab);
      if (tabTransitionTimerRef.current) clearTimeout(tabTransitionTimerRef.current);
    };
  }, [handleTabSwitch]);

  const handlePortalTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement;

    if (
      isModalOpen ||
      target.closest(".overflow-x-auto, [data-no-swipe], input, textarea, select, [role='dialog']")
    ) {
      touchGestureLockedRef.current = "vertical";
      return;
    }

    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchGestureLockedRef.current = null;
    isTouchDraggingRef.current = false;
    touchContainerWidthRef.current = tabContainerRef.current?.offsetWidth || window.innerWidth || 360;
  };

  const handlePortalTouchMove = (e: React.TouchEvent) => {
    if (touchGestureLockedRef.current === "vertical") return;
    if (e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartXRef.current;
    const dy = currentY - touchStartYRef.current;

    if (touchGestureLockedRef.current === null) {
      if (Math.abs(dy) > 7 && Math.abs(dy) >= Math.abs(dx)) {
        touchGestureLockedRef.current = "vertical";
        return;
      }
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        touchGestureLockedRef.current = "horizontal";
        isTouchDraggingRef.current = true;
        setIsTouchDragging(true);
        setIsTransitioning(true);

        if (tabTrackRef.current) tabTrackRef.current.style.transition = "none";
        if (tabIndicatorPillRef.current) tabIndicatorPillRef.current.style.transition = "none";
      }
    }

    if (touchGestureLockedRef.current === "horizontal") {
      const containerW = touchContainerWidthRef.current || 360;

      let effectiveDx = dx;
      if (activeTabRef.current === "dashboard" && dx > 0) {
        effectiveDx = dx * 0.25;
      } else if (activeTabRef.current === "exams" && dx < 0) {
        effectiveDx = dx * 0.25;
      }

      const baseTrackPx = activeTabRef.current === "dashboard" ? 0 : -containerW;
      const currentTrackPx = baseTrackPx + effectiveDx;
      if (tabTrackRef.current) {
        tabTrackRef.current.style.transform = `translate3d(${currentTrackPx}px, 0, 0)`;
      }

      const rawProgress = -currentTrackPx / containerW;
      const clampedProgress = Math.max(0, Math.min(1, rawProgress));
      if (tabIndicatorPillRef.current) {
        tabIndicatorPillRef.current.style.transform = `translate3d(${clampedProgress * 100}%, 0, 0)`;
      }
    }
  };

  const handlePortalTouchEnd = (e: React.TouchEvent) => {
    if (touchGestureLockedRef.current !== "horizontal" || !isTouchDraggingRef.current) {
      touchGestureLockedRef.current = null;
      isTouchDraggingRef.current = false;
      setIsTouchDragging(false);
      return;
    }

    touchGestureLockedRef.current = null;
    isTouchDraggingRef.current = false;
    setIsTouchDragging(false);

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartXRef.current;
    const containerW = touchContainerWidthRef.current || 360;
    const threshold = Math.max(50, containerW * 0.15);

    const currentTab = activeTabRef.current;
    let targetTab: PortalTab = currentTab;

    if (currentTab === "dashboard" && dx < -threshold) {
      targetTab = "exams";
    } else if (currentTab === "exams" && dx > threshold) {
      targetTab = "dashboard";
    }

    if (targetTab !== currentTab && typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch (_) {}
    }

    setIsTransitioning(true);
    if (tabTrackRef.current) {
      tabTrackRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
      tabTrackRef.current.style.transform =
        targetTab === "dashboard" ? "translate3d(0%, 0, 0)" : "translate3d(-50%, 0, 0)";
    }
    if (tabIndicatorPillRef.current) {
      tabIndicatorPillRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
      tabIndicatorPillRef.current.style.transform =
        targetTab === "dashboard" ? "translate3d(0%, 0, 0)" : "translate3d(100%, 0, 0)";
    }

    if (targetTab !== currentTab) {
      setActiveTab(targetTab);
      activeTabRef.current = targetTab;
      const newUrl = targetTab === "exams" ? "/student/portal?tab=exams" : "/student/portal";
      window.history.replaceState(null, "", newUrl);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("papergrade:tab-changed", { detail: targetTab }));
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }

    if (tabTransitionTimerRef.current) clearTimeout(tabTransitionTimerRef.current);
    tabTransitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  };

  return {
    activeTab,
    setActiveTab,
    handleTabSwitch,
    tabTrackRef,
    tabIndicatorPillRef,
    tabContainerRef,
    isTouchDragging,
    isTransitioning,
    handlePortalTouchStart,
    handlePortalTouchMove,
    handlePortalTouchEnd,
  };
}
