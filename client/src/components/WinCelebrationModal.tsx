import { useEffect, useState } from "react";
import api, { type Bet } from "@/lib/api";
import TrophyCelebration from "./TrophyCelebration";

/**
 * Global "you won!" celebration — pops up on any route the moment a bet
 * settles as a win the user hasn't seen yet (api.bets.getUnseenWins /
 * dismissWin, both already live server-side). Mounted once near the top
 * of the app — see App.tsx.
 *
 * The actual card UI lives in TrophyCelebration.tsx so the same "YOU WON"
 * screen can also be opened on demand from a settled ticket in Bet History
 * via the "View Trophy" button, without needing to be an unseen win.
 */
export default function WinCelebrationModal() {
  const [queue, setQueue] = useState<Bet[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    if (!token) return;
    api.bets.getUnseenWins().then((res) => setQueue(res.data ?? [])).catch(() => undefined);
  }, []);

  if (queue.length === 0) return null;
  const bet = queue[0];

  const close = async () => {
    try { await api.bets.dismissWin(bet.id); } catch { /* still advance locally */ }
    setQueue((q) => q.slice(1));
  };

  return <TrophyCelebration bet={bet} onClose={close} />;
}