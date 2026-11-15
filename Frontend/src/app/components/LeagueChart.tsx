import { useEffect, useState } from "react";
import { api, session } from "../api";
import { LineChart, MAX_SERIES, SERIES_COLORS } from "./charts";

type History = {
  races: { id: number; name: string; round: number | null }[];
  players: { userId: number; username: string; perRace: number[]; cumulative: number[] }[];
};

/** Running season totals per player. Colors follow the player (league join order), never their rank. */
export function LeagueChart({ leagueId, refreshKey }: { leagueId: string | number; refreshKey?: unknown }) {
  const [data, setData] = useState<History | null>(null);
  const me = session.user();

  useEffect(() => {
    api.get<History>(`/leaderboard/${leagueId}/history`).then(setData).catch(() => setData(null));
  }, [leagueId, refreshKey]);

  if (!data || data.races.length === 0) {
    return <p className="text-sm text-zinc-500">The chart appears once the league has scored a race.</p>;
  }

  // Large leagues: show the top players by total (and always you), capped at the palette size.
  const byTotal = [...data.players].sort((a, b) => (b.cumulative.at(-1) ?? 0) - (a.cumulative.at(-1) ?? 0));
  const shown = new Set(byTotal.slice(0, MAX_SERIES).map((p) => p.userId));
  if (me && data.players.some((p) => p.userId === me.id) && !shown.has(me.id)) {
    shown.delete(byTotal[MAX_SERIES - 1].userId);
    shown.add(me.id);
  }
  const visible = data.players.filter((p) => shown.has(p.userId)); // join order keeps colors stable

  return (
    <div>
      <LineChart
        title="Season points"
        categories={data.races.map((r) => `R${r.round ?? "?"}`)}
        series={visible.map((p, i) => ({
          id: p.userId,
          name: p.userId === me?.id ? `${p.username} (you)` : p.username,
          values: p.cumulative,
          color: SERIES_COLORS[i],
          emphasis: p.userId === me?.id,
        }))}
      />
      {data.players.length > visible.length && (
        <p className="text-xs text-zinc-500 mt-2">
          Showing {visible.length} of {data.players.length} players.
        </p>
      )}
    </div>
  );
}
