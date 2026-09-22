import { useCallback, useEffect, useState } from "react";

export type FavoriteKind = "team" | "league" | "match";
export interface FavoriteEntry { kind: FavoriteKind; id: string; label: string; meta?: string }

const KEY = "hotbet_favorites_v1";

function loadAll(): FavoriteEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FavoriteEntry[]) : [];
  } catch { return []; }
}
function saveAll(items: FavoriteEntry[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  window.dispatchEvent(new Event("hotbet-favorites-changed"));
}

export function isFavorite(kind: FavoriteKind, id: string): boolean {
  return loadAll().some((f) => f.kind === kind && f.id === id);
}

export function toggleFavorite(entry: FavoriteEntry): boolean {
  const all = loadAll();
  const idx = all.findIndex((f) => f.kind === entry.kind && f.id === entry.id);
  if (idx >= 0) { all.splice(idx, 1); saveAll(all); return false; }
  all.unshift(entry);
  saveAll(all);
  return true;
}

export function useFavorites(): { favorites: FavoriteEntry[]; toggle: (e: FavoriteEntry) => boolean; has: (kind: FavoriteKind, id: string) => boolean } {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(() => (typeof window !== "undefined" ? loadAll() : []));

  useEffect(() => {
    const onChange = () => setFavorites(loadAll());
    window.addEventListener("hotbet-favorites-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => { window.removeEventListener("hotbet-favorites-changed", onChange); window.removeEventListener("storage", onChange); };
  }, []);

  const toggle = useCallback((entry: FavoriteEntry) => toggleFavorite(entry), []);
  const has = useCallback((kind: FavoriteKind, id: string) => favorites.some((f) => f.kind === kind && f.id === id), [favorites]);

  return { favorites, toggle, has };
}
