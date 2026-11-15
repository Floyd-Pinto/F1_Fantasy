import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Bell, BellOff, Crown, History, Lock, Pencil, Repeat, Timer, Trophy } from "lucide-react";
import { usePushReminders } from "../hooks/usePushReminders";
import { api } from "../api";
import { DriverAvatar, ErrorBox, Loading, PageHeader, StatusBadge, TeamStripe } from "../components/common";
import { formatDate, formatDateTime, timeUntil } from "../format";

type HistoryDriver = {
  id: number;
  name: string;
  code?: string | null;
  headshotUrl?: string | null;
  color?: string | null;
  finishPosition: number | null;
  dnf: boolean;
  fastestLap: boolean;
  points: number | null;
  race?: number;
  sprint?: number;
  quali?: number;
  prediction?: number;
  captain?: boolean;
  predictedPosition?: number | null;
};

type Entry = {
  teamId: number;
  locked: boolean;
  carriedOver?: boolean;
  race: { id: number; name: string; round?: number | null; season: number; raceStart: string; status: string; replay_available: boolean };
  league: { id: number; name: string };
  totalPts: number | null;
  rank: number | null;
  fieldSize: number;
  constructor: { id: number; name: string; color?: string | null; points: number | null } | null;
  drivers: HistoryDriver[];
};

type HistoryResponse = {
  user: { id: number; username: string; email: string; created_at: string; role: string };
  stats: { racesPlayed: number; totalPoints: number; bestRace: Entry | null; wins: number };
  upcoming: Entry[];
  past: Entry[];
};

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;

export function Profile() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [leagueFilter, setLeagueFilter] = useState<number | "all">("all");

  useEffect(() => {
    api.get<HistoryResponse>("/users/me/history").then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <Loading label="Loading your profile…" />;

  const leagues = [...new Map(data.past.map((e) => [e.league.id, e.league])).values()];
  const past = leagueFilter === "all" ? data.past : data.past.filter((e) => e.league.id === leagueFilter);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader title={data.user.username}>
        <p className="text-zinc-400 text-sm">
          {data.user.email} · joined {formatDate(data.user.created_at)}
        </p>
      </PageHeader>

      <Reminders />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Races played" value={data.stats.racesPlayed} />
        <Stat label="Total points" value={data.stats.totalPoints} />
        <Stat label="League race wins" value={data.stats.wins} icon={<Trophy className="w-4 h-4 text-yellow-500" />} />
        <Stat label="Best race" value={data.stats.bestRace?.totalPts ?? "—"} hint={data.stats.bestRace?.race.name} />
      </div>

      {data.upcoming.length > 0 && (
        <section>
          <h2 className="text-xl font-bold uppercase italic mb-4">Upcoming</h2>
          <div className="space-y-3">
            {data.upcoming.map((e) => (
              <div key={e.teamId} className="surface p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-white">{e.race.name}</div>
                  <div className="text-xs text-zinc-500">
                    {e.league.name} · {e.race.status === "SCHEDULED" ? `${formatDateTime(e.race.raceStart)} (in ${timeUntil(e.race.raceStart)})` : "awaiting official results"}
                  </div>
                  <DriverChips drivers={e.drivers} constructorName={e.constructor?.name} />
                </div>
                {e.locked || e.race.status !== "SCHEDULED" ? (
                  <span className="flex items-center gap-1.5 text-sm text-amber-400 shrink-0">
                    <Lock className="w-4 h-4" /> Locked
                  </span>
                ) : (
                  <Link to={`/league/${e.league.id}/race/${e.race.id}/team-builder`} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm shrink-0">
                    <Pencil className="w-4 h-4" /> Edit team
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold uppercase italic">Past races</h2>
          {leagues.length > 1 && (
            <select
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All leagues</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {past.length === 0 ? (
          <div className="surface p-6 text-sm text-zinc-500">
            No past races yet. Pick a team for the <Link to="/races" className="text-red-400 hover:text-red-300">next race</Link> and your results will show up here.
          </div>
        ) : (
          <div className="space-y-4">
            {past.map((e) => (
              <div key={e.teamId} className="surface overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 p-4 border-b border-zinc-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 font-bold uppercase">R{e.race.round}</span>
                      <StatusBadge status={e.race.status} />
                    </div>
                    <div className="font-bold text-lg text-white">{e.race.name}</div>
                    <div className="text-xs text-zinc-500 flex items-center gap-2">
                      {e.league.name} · {formatDate(e.race.raceStart)}
                      {e.carriedOver && (
                        <span className="flex items-center gap-1 text-blue-400" title="You didn't pick a team; your previous one carried over">
                          <Repeat className="w-3 h-3" /> carried over
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-3xl text-white">{e.totalPts ?? 0}</div>
                    <div className="text-xs text-zinc-400">
                      {e.rank ? `${ordinal(e.rank)} of ${e.fieldSize} in league` : "points"}
                    </div>
                  </div>
                </div>
                <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {e.drivers.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 bg-zinc-950/50 rounded-lg p-2.5">
                      <DriverAvatar url={d.headshotUrl} name={d.name} color={d.color} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate flex items-center gap-1">
                          {d.captain && <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                          {d.name}
                        </div>
                        <div className="text-xs text-zinc-500 flex items-center gap-1.5 flex-wrap">
                          {d.dnf ? <span className="text-red-400">DNF</span> : d.finishPosition ? `P${d.finishPosition}` : "—"}
                          {d.fastestLap && <Timer className="w-3 h-3 text-purple-400" />}
                          {d.race !== undefined && (
                            <span title="Race · Sprint · Qualifying points">
                              ({d.race}/{d.sprint}/{d.quali}
                              {d.captain ? " ×2" : ""}
                              {d.prediction ? ` +${d.prediction} pred.` : ""})
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`font-mono font-bold ${d.points ? "text-green-400" : "text-zinc-500"}`}>+{d.points ?? 0}</span>
                    </div>
                  ))}
                  {e.constructor && (
                    <div className="flex items-center gap-3 bg-zinc-950/50 rounded-lg p-2.5">
                      <TeamStripe color={e.constructor.color} className="h-9" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{e.constructor.name}</div>
                        <div className="text-xs text-zinc-500">Constructor</div>
                      </div>
                      <span className={`font-mono font-bold ${e.constructor.points ? "text-green-400" : "text-zinc-500"}`}>+{e.constructor.points ?? 0}</span>
                    </div>
                  )}
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  <Link to={`/league/${e.league.id}/race/${e.race.id}/results`} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded">
                    Full results
                  </Link>
                  {e.race.replay_available && (
                    <Link to={`/league/${e.league.id}/race/${e.race.id}/replay`} className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 rounded flex items-center gap-1.5">
                      <History className="w-4 h-4" /> Replay
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, icon }: { label: string; value: number | string; hint?: string; icon?: JSX.Element }) {
  return (
    <div className="surface p-5">
      <div className="text-xs text-zinc-400 uppercase font-bold flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-bold text-white mt-1 font-mono">{value}</div>
      {hint && <div className="text-xs text-zinc-500 truncate">{hint}</div>}
    </div>
  );
}

function DriverChips({ drivers, constructorName }: { drivers: HistoryDriver[]; constructorName?: string | null }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {drivers.map((d) => (
        <span key={d.id} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
          {d.code || d.name}
        </span>
      ))}
      {constructorName && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{constructorName}</span>}
    </div>
  );
}

function Reminders() {
  const { supported, enabled, busy, error, enable, disable, sendTest } = usePushReminders();
  const [sent, setSent] = useState(false);
  if (!supported) return null;
  return (
    <div className="surface p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        {enabled ? <Bell className="w-5 h-5 text-green-400 mt-0.5" /> : <BellOff className="w-5 h-5 text-zinc-500 mt-0.5" />}
        <div>
          <div className="font-bold text-white">Lock reminders</div>
          <div className="text-sm text-zinc-400">
            {enabled
              ? "On: you'll get a browser notification about an hour before teams lock, if you haven't picked a team yet."
              : "Get a browser notification about an hour before teams lock, if you haven't picked a team yet."}
          </div>
          {error && <div className="text-sm text-red-400 mt-1">{error}</div>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {enabled && (
          <button
            onClick={async () => {
              await sendTest();
              setSent(true);
            }}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
          >
            {sent ? "Sent ✓" : "Send test"}
          </button>
        )}
        <button
          onClick={enabled ? disable : enable}
          disabled={busy}
          className={`px-3 py-2 rounded text-sm font-medium disabled:opacity-50 ${enabled ? "bg-zinc-800 hover:bg-zinc-700" : "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40"}`}
        >
          {enabled ? "Turn off" : "Turn on"}
        </button>
      </div>
    </div>
  );
}
