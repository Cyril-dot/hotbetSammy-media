import { Link } from "wouter";
import { Info, Star, Trash2 } from "lucide-react";
import { useFavorites, type FavoriteKind } from "@/lib/favorites";

const KIND_LABEL: Record<FavoriteKind, string> = { team: "Team", league: "Competition", match: "Match" };

export default function FavoritesPage() {
  const { favorites, toggle } = useFavorites();

  return (
    <main className="wrap support-page">
      <div className="bp-header">
        <div><span className="eyebrow">Saved</span><h1 style={{ fontSize: 40 }}>Favorites</h1></div>
      </div>

      <div className="deposit-note" style={{ marginBottom: 16 }}>
        <Info size={13} />
        Favorites are currently saved on this device only — they aren't yet synced to your account across devices.
      </div>

      <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
        {favorites.length === 0 ? (
          <>
            <Star size={24} />
            <p className="muted">No favorites yet. Tap the star on any match to save it here.</p>
            <Link href="/" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Browse matches</Link>
          </>
        ) : (
          favorites.map((f) => (
            <div className="activity-row" key={`${f.kind}-${f.id}`}>
              <span className="activity-icon"><Star size={13} fill="currentColor" /></span>
              <div>
                <b>{f.label}</b>
                <small>{KIND_LABEL[f.kind]}{f.meta ? ` · ${f.meta}` : ""}</small>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {f.kind === "match" && <Link href={`/match/${f.id}`} className="text-action">View</Link>}
                <button className="bp-remove" onClick={() => toggle(f)} aria-label="Remove favorite" type="button"><Trash2 size={13} /></button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
