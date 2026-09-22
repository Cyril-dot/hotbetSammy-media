/**
 * Temporary browser reset utility.
 *
 * On mobile browsers it runs automatically on the first app open. On desktop,
 * run it by opening the app with `?clear-cache=1`.
 * It clears client-side authentication and browser-managed app state, then
 * reloads the page without the reset query parameter.
 */
export async function clearClientCache(): Promise<void> {
  if (typeof window === "undefined") return;

  const token = window.localStorage.getItem("accessToken");

  // Clear authentication synchronously so the app cannot render with an old
  // token while the asynchronous browser-cache cleanup is still running.
  window.localStorage.clear();
  window.sessionStorage.clear();

  // Best effort: notify the backend before removing the token locally.
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
    } catch {
      // Clearing local state must still proceed if the backend is unavailable.
    }
  }

  // Remove all non-HttpOnly cookies available to JavaScript.
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name) continue;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  // Clear Cache Storage entries created by the app or its dependencies.
  if ("caches" in window) {
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    } catch {
      // Cache Storage may be unavailable in restricted/private contexts.
    }
  }

  // Unregister any service workers that could keep stale assets alive.
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Service workers may be unavailable in restricted/private contexts.
    }
  }

  // Delete IndexedDB databases where the browser exposes database enumeration.
  try {
    const indexedDb = window.indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string | null }>>;
    };
    if (typeof indexedDb.databases === "function") {
      const databases = await indexedDb.databases();
      await Promise.all(
        databases
          .map((database) => database.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => new Promise<void>((resolve) => {
            const request = indexedDb.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          })),
      );
    }
  } catch {
    // IndexedDB enumeration is not supported in every browser.
  }
}

/**
 * Mobile browsers run this once per URL load. A short-lived URL marker avoids
 * an infinite reload loop, then is removed from the address bar immediately.
 * Desktop browsers remain opt-in through `?clear-cache=1`.
 */
export function runTemporaryClientReset(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const requested = url.searchParams.get("clear-cache") === "1";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const completed = url.searchParams.get("clear-cache-complete") === "1";

  if (completed) {
    url.searchParams.delete("clear-cache-complete");
    window.history.replaceState({}, document.title, url.toString());
    return;
  }

  if (!requested && !mobile) return;

  if (mobile) {
    url.searchParams.set("clear-cache-complete", "1");
  }

  void clearClientCache().finally(() => {
    if (!mobile) url.searchParams.delete("clear-cache");
    window.location.replace(url.toString());
  });
}
