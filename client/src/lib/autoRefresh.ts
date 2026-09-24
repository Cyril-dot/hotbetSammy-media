import { useEffect, useRef } from "react";

export const DATA_REFRESH_EVENT = "hotbet:data-refresh";

export type DataRefreshReason =
  | "interval"
  | "visible"
  | "online"
  | "bet-placed"
  | "deposit-updated"
  | "withdrawal-updated"
  | "payment-updated"
  | "manual";

export function emitDataRefresh(reason: DataRefreshReason = "manual"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_REFRESH_EVENT, { detail: { reason } }));
}

/**
 * Listen for refresh signals from other flows and reconcile periodically while
 * the tab is visible. The callback is kept in a ref so callers can pass their
 * async loader without restarting the timer on every render.
 */
export function useAutoRefresh(
  onRefresh: () => void | Promise<void>,
  options: { enabled?: boolean; intervalMs?: number; refreshOnVisible?: boolean } = {},
): void {
  const { enabled = true, intervalMs = 30_000, refreshOnVisible = true } = options;
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let running = false;
    const run = () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      Promise.resolve(callbackRef.current()).catch(() => undefined).finally(() => {
        running = false;
      });
    };
    const onVisibility = () => {
      if (refreshOnVisible && document.visibilityState === "visible") run();
    };
    const onRefreshEvent = () => run();

    window.addEventListener(DATA_REFRESH_EVENT, onRefreshEvent);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(run, intervalMs);

    return () => {
      window.removeEventListener(DATA_REFRESH_EVENT, onRefreshEvent);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, refreshOnVisible]);
}

/** A small app-level heartbeat for pages that do not mount a data hook. */
export function useRefreshHeartbeat(intervalMs = 30_000): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => emitDataRefresh("interval"), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") emitDataRefresh("visible");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}

export default useAutoRefresh;

