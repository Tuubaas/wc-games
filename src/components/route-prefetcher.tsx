"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const USER_ROUTES = ["/dashboard", "/matches", "/picks", "/leagues", "/rules"] as const;
const PREFETCH_DELAY_MS = 180;

export function RoutePrefetcher({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const routes = isAdmin ? [...USER_ROUTES, "/admin"] : [...USER_ROUTES];
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const browserWindow = window;

    function prefetchRoute(index: number) {
      if (cancelled || index >= routes.length) return;

      router.prefetch(routes[index]);
      timeoutId = browserWindow.setTimeout(() => {
        prefetchRoute(index + 1);
      }, PREFETCH_DELAY_MS);
    }

    function startPrefetching() {
      prefetchRoute(0);
    }

    if (typeof browserWindow.requestIdleCallback === "function") {
      idleId = browserWindow.requestIdleCallback(startPrefetching, { timeout: 1500 });
    } else {
      timeoutId = browserWindow.setTimeout(startPrefetching, 500);
    }

    return () => {
      cancelled = true;
      if (timeoutId) browserWindow.clearTimeout(timeoutId);
      if (idleId !== null && typeof browserWindow.cancelIdleCallback === "function") {
        browserWindow.cancelIdleCallback(idleId);
      }
    };
  }, [isAdmin, router]);

  return null;
}
