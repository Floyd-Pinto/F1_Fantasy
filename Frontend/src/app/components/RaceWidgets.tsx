import { ArrowUp, Flag, Play, Timer, TriangleAlert, Wrench } from "lucide-react";
import type { RaceEvent } from "../types";

const EVENT_ICON: Record<RaceEvent["type"], JSX.Element> = {
  start: <Play className="w-4 h-4 text-green-400" />,
  overtake: <ArrowUp className="w-4 h-4 text-blue-400" />,
  dnf: <TriangleAlert className="w-4 h-4 text-red-500" />,
  fastest_lap: <Timer className="w-4 h-4 text-purple-400" />,
  pit: <Wrench className="w-4 h-4 text-amber-400" />,
  finish: <Flag className="w-4 h-4 text-white" />,
};

/** Newest-first list of race events (overtakes, retirements, pit stops, fastest laps). */
export function RaceFeed({ events, emptyText }: { events: RaceEvent[]; emptyText: string }) {
  return (
    <div className="surface p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">Race feed</div>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
          {events.map((e, i) => (
            <li key={`${e.lap}-${i}-${e.text}`} className="flex items-start gap-2 text-sm animate-in fade-in slide-in-from-top-1 duration-300">
              <span className="mt-0.5">{EVENT_ICON[e.type]}</span>
              <span className="text-zinc-300 flex-1">{e.text}</span>
              <span className="font-mono text-xs text-zinc-600">L{e.lap}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type StandingRow = { userId: number; username: string; points: number; rank?: number };

/** Compact league table for one race (live view, results, replay). */
export function RaceStandings({ rows, meId, emptyText }: { rows: StandingRow[]; meId?: number; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-500">{emptyText}</p>;
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li
          key={r.userId}
          className={`flex justify-between text-sm py-1.5 px-2 rounded border-b border-zinc-800/50 last:border-0 ${r.userId === meId ? "bg-red-950/30" : ""}`}
        >
          <span className="text-zinc-300">
            <span className="font-mono text-zinc-500 w-6 inline-block">{r.rank ?? i + 1}</span>
            {r.username}
          </span>
          <span className="font-mono font-bold text-red-400">{r.points}</span>
        </li>
      ))}
    </ol>
  );
}
