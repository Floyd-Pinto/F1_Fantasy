import { Link } from "react-router";
import { Timer, TriangleAlert, Trophy } from "lucide-react";
import type { ResultRow } from "../types";
import { DriverAvatar, TeamStripe } from "./common";

type Props = {
  rows: ResultRow[];
  highlight?: Set<number>; // driver ids in the viewer's team
  previous?: Map<number, number>; // driver id -> previous position, for gain/loss arrows
};

export function RaceOrderTable({ rows, highlight, previous }: Props) {
  if (rows.length === 0) {
    return <div className="p-6 text-sm text-zinc-500">No results yet.</div>;
  }
  const hasQuali = rows.some((r) => r.quali_pos);
  const hasSprint = rows.some((r) => r.sprint_pos || r.sprint_dnf);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[560px]">
        <thead>
          <tr className="bg-zinc-950/50 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400">
            <th className="px-4 py-3 font-medium w-16 text-center">Pos</th>
            <th className="px-4 py-3 font-medium">Driver</th>
            {hasQuali && <th className="px-3 py-3 font-medium text-center hidden md:table-cell" title="Qualifying position">Quali</th>}
            {hasSprint && <th className="px-3 py-3 font-medium text-center hidden md:table-cell" title="Sprint position">Sprint</th>}
            <th className="px-4 py-3 font-medium text-center">Status</th>
            <th className="px-4 py-3 font-medium text-right">Fantasy Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {rows.map((r) => {
            const mine = highlight?.has(r.driver_id);
            const was = previous?.get(r.driver_id);
            const delta = was && r.finish_pos ? was - r.finish_pos : 0;
            return (
              <tr key={r.driver_id} className={`transition-colors ${mine ? "bg-red-950/25" : "hover:bg-zinc-800/30"}`}>
                <td className="px-4 py-3 text-center">
                  {r.finish_pos === 1 ? (
                    <Trophy className="w-5 h-5 text-yellow-500 mx-auto" />
                  ) : (
                    <span className={`font-bold font-mono ${r.dnf ? "text-red-500" : "text-zinc-300"}`}>{r.dnf ? "DNF" : r.finish_pos}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TeamStripe color={r.team_color} />
                    <DriverAvatar url={r.headshot_url} name={r.driver_name} color={r.team_color} />
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <Link to={`/driver/${r.driver_id}`} className="hover:text-red-400 transition-colors">
                          {r.driver_name}
                        </Link>
                        {mine && <span className="text-[10px] uppercase font-bold bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded">Your team</span>}
                        {delta > 0 && <span className="text-xs text-green-400 font-mono">▲{delta}</span>}
                        {delta < 0 && <span className="text-xs text-red-400 font-mono">▼{-delta}</span>}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {r.driver_number != null && `#${r.driver_number} · `}
                        {r.constructor_name || "—"}
                      </div>
                    </div>
                  </div>
                </td>
                {hasQuali && <td className="px-3 py-3 text-center font-mono text-sm text-zinc-400 hidden md:table-cell">{r.quali_pos ?? "—"}</td>}
                {hasSprint && (
                  <td className="px-3 py-3 text-center font-mono text-sm text-zinc-400 hidden md:table-cell">
                    {r.sprint_dnf ? <span className="text-red-500">DNF</span> : r.sprint_pos ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {r.fastest_lap && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold bg-purple-900/30 text-purple-400 px-2 py-1 rounded border border-purple-800/50" title="Fastest lap">
                        <Timer className="w-3 h-3" /> FL
                      </span>
                    )}
                    {r.dnf && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold bg-red-900/30 text-red-500 px-2 py-1 rounded border border-red-800/50">
                        <TriangleAlert className="w-3 h-3" /> DNF
                      </span>
                    )}
                    {!r.fastest_lap && !r.dnf && <span className="text-zinc-600 text-sm">—</span>}
                  </div>
                </td>
                <td
                  className="px-4 py-3 text-right"
                  title={r.points_breakdown ? `Race ${r.points_breakdown.race} · Sprint ${r.points_breakdown.sprint} · Quali ${r.points_breakdown.quali}` : undefined}
                >
                  <span className={`font-mono font-bold ${r.points > 0 ? "text-green-400" : "text-zinc-500"}`}>
                    {r.points > 0 ? `+${r.points}` : 0}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
