import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Calendar, ChevronRight, Clock, History, Lock } from "lucide-react";
import { api } from "../api";
import type { LeagueSummary, Race } from "../types";
import { ErrorBox, Loading, PageHeader, StatusBadge } from "../components/common";
import { formatDate, formatDateTime, timeUntil } from "../format";

/** Season hub: next race, races awaiting results, and every past race with results + replay. */
export function Races() {
  const [races, setRaces] = useState<Race[] | null>(null);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get<Race[]>("/races"), api.get<LeagueSummary[]>("/leagues")])
      .then(([r, l]) => {
        setRaces(r);
        setLeagues(l);
        setLeagueId(l[0]?.id ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!races) return <Loading label="Loading the calendar…" />;

  const base = (race: Race) => (leagueId ? `/league/${leagueId}/race/${race.id}` : `/race/${race.id}`);
  const upcoming = races.filter((r) => r.status === "SCHEDULED");
  const inProgress = races.filter((r) => r.status === "ONGOING" || r.status === "RESULTS_PENDING");
  const past = races.filter((r) => r.status === "COMPLETED").reverse();
  const next = upcoming[0];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader title="Races">
        <p className="text-zinc-400">
          Lock in your team before the weekend starts. Points land as soon as the official results are published.{" "}
          <Link to="/rules" className="text-red-400 hover:text-red-300">How scoring works</Link>
        </p>
        {leagues.length > 1 && (
          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            Viewing as league
            <select value={leagueId ?? ""} onChange={(e) => setLeagueId(Number(e.target.value))} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-white">
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </PageHeader>

      {inProgress.map((race) => (
        <Link key={race.id} to={`${base(race)}/results`} className="flex items-center justify-between gap-4 bg-amber-950/20 border border-amber-800/40 rounded-xl p-5 hover:border-amber-600/60 transition-colors">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={race.status} live={race.live} />
            </div>
            <div className="text-lg font-bold text-white">{race.name}</div>
            <div className="text-sm text-zinc-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Teams are locked. Points update automatically the moment official results are out.
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400 shrink-0" />
        </Link>
      ))}

      {next && (
        <section>
          <h2 className="text-xl font-bold uppercase italic mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-red-500" /> Next race
          </h2>
          <div className="surface p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-zinc-500 font-bold uppercase flex items-center gap-2">
                Round {next.round}
                {next.sprintStart && <span className="bg-orange-950/50 text-orange-300 border border-orange-900/50 px-1.5 rounded">Sprint weekend</span>}
              </div>
              <div className="text-2xl font-bold text-white">{next.name}</div>
              <div className="text-sm text-zinc-400 mt-1">
                {next.circuit} · {formatDateTime(next.raceStart)}
              </div>
              <div className="text-sm text-red-400 mt-2 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Teams lock in {timeUntil(next.lockAt || next.raceStart)} ({formatDateTime(next.lockAt || next.raceStart)})
              </div>
            </div>
            {leagueId ? (
              <Link to={`${base(next)}/team-builder`} className="px-5 py-3 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 rounded-lg font-medium text-center">
                Pick your team
              </Link>
            ) : (
              <Link to="/league" className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium text-center">
                Join a league to play
              </Link>
            )}
          </div>
          {upcoming.length > 1 && (
            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              {upcoming.slice(1).map((r) => (
                <div key={r.id} className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3 text-sm flex justify-between">
                  <span className="text-zinc-300">{r.name}</span>
                  <span className="text-zinc-500">{formatDate(r.raceStart)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold uppercase italic mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-zinc-400" /> Past races
        </h2>
        <div className="space-y-2">
          {past.map((race) => (
            <div key={race.id} className="flex items-center justify-between gap-4 surface rounded-xl p-4">
              <div className="flex items-center gap-4 min-w-0">
                <span className="font-mono text-zinc-600 w-6 text-right shrink-0">{race.round ?? "–"}</span>
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{race.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {formatDate(race.raceStart)} · {race.locality || race.circuit}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link to={`${base(race)}/results`} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded">
                  Results
                </Link>
                {race.replay_available && (
                  <Link to={`${base(race)}/replay`} className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 rounded flex items-center gap-1.5">
                    <History className="w-4 h-4" /> <span className="hidden sm:inline">Lap-by-lap</span> replay
                  </Link>
                )}
              </div>
            </div>
          ))}
          {past.length === 0 && <p className="text-sm text-zinc-500">No races finished yet.</p>}
        </div>
      </section>
    </div>
  );
}
