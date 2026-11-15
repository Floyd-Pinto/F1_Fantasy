import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Calendar, ChevronRight, Flag, History, KeyRound, Lock, Plus, Trophy, Users, X, Zap } from "lucide-react";
import { api, session } from "../api";
import type { LeagueSummary, Race } from "../types";
import { CreateLeagueForm } from "../components/CreateLeagueForm";
import { ErrorBox } from "../components/common";
import { formatDate, formatDateTime } from "../format";

function useCountdown(target?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  const ms = Math.max(0, (target ? new Date(target).getTime() : 0) - now);
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    done: ms === 0,
  };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-3xl md:text-5xl font-semibold tabular-nums bg-black/30 border border-white/10 rounded-xl px-3 py-2 md:px-4 md:py-3 min-w-[3.5rem] md:min-w-[5rem]">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 mt-2">{label}</div>
    </div>
  );
}

export function Dashboard() {
  const [modal, setModal] = useState<"join" | "create" | null>(null);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const user = session.user();

  const load = () =>
    Promise.all([api.get<LeagueSummary[]>("/leagues"), api.get<Race[]>("/races")])
      .then(([l, r]) => {
        setLeagues(l);
        setRaces(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const join = async () => {
    try {
      setSubmitting(true);
      await api.post("/leagues/join", { code: joinCode.trim().toUpperCase() });
      setModal(null);
      setJoinCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join league");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = races.find((r) => r.status === "ONGOING" || r.status === "RESULTS_PENDING");
  const next = races.find((r) => r.status === "SCHEDULED" && !r.live);
  const last = [...races].reverse().find((r) => r.status === "COMPLETED");
  const completed = races.filter((r) => r.status === "COMPLETED").length;
  const firstLeague = leagues[0];
  const countdown = useCountdown(next?.lockAt || next?.raceStart);
  const base = (race: Race) => (firstLeague ? `/league/${firstLeague.id}/race/${race.id}` : `/race/${race.id}`);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Welcome back{user ? "," : ""}</p>
          <h1 className="font-display text-3xl md:text-4xl font-black italic uppercase tracking-tight">{user?.username ?? "My Garage"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal("join")} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
            <KeyRound className="w-4 h-4" /> Join league
          </button>
          <button onClick={() => setModal("create")} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 text-white px-4 py-2.5 rounded-xl font-medium transition-colors">
            <Plus className="w-4 h-4" /> Create league
          </button>
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>

      {pending && (
        <Link to={`${base(pending)}/results`} className="surface surface-hover flex items-center justify-between gap-4 p-5 !border-amber-700/40">
          <div className="flex items-center gap-4">
            <span className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-amber-400" />
            </span>
            <div>
              <div className="text-xs font-bold uppercase text-amber-400 tracking-wider">Teams locked · awaiting official results</div>
              <div className="font-display text-lg font-bold text-white">{pending.name}</div>
              <p className="text-zinc-400 text-sm">Points and standings update here the moment results are published.</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400 shrink-0" />
        </Link>
      )}

      {/* Next race hero */}
      {next ? (
        <section className="surface relative overflow-hidden">
          <div className="livery absolute inset-x-0 top-0 h-1" />
          <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-red-600/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{ backgroundImage: "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 16px)" }}
          />
          <div className="relative p-6 md:p-9 grid lg:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">Next race · Round {next.round}</span>
                {next.sprintStart && (
                  <span className="flex items-center gap-1 text-[11px] font-bold uppercase bg-orange-500/15 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full">
                    <Zap className="w-3 h-3" /> Sprint weekend
                  </span>
                )}
              </div>
              <h2 className="font-display text-4xl md:text-6xl font-black italic uppercase tracking-tight leading-[0.9]">{next.name.replace(" Grand Prix", "")}</h2>
              <p className="font-display text-xl md:text-2xl italic font-bold uppercase text-zinc-500 -mt-0.5">Grand Prix</p>
              <p className="text-zinc-400 mt-3 text-sm">
                {next.circuit}
                {next.locality && ` · ${next.locality}, ${next.country}`}
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                {firstLeague ? (
                  <Link to={`${base(next)}/team-builder`} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 px-5 py-3 rounded-xl font-semibold">
                    Pick your team <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link to="/league" className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 px-5 py-3 rounded-xl font-semibold">
                    Join a league to play <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link to="/races" className="inline-flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-5 py-3 rounded-xl font-medium">
                  <Calendar className="w-4 h-4" /> Full calendar
                </Link>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 mb-3 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Teams lock in
              </div>
              <div className="flex gap-2 md:gap-3">
                <CountdownUnit value={countdown.days} label="Days" />
                <CountdownUnit value={countdown.hours} label="Hrs" />
                <CountdownUnit value={countdown.minutes} label="Min" />
                <CountdownUnit value={countdown.seconds} label="Sec" />
              </div>
              <div className="text-xs text-zinc-500 mt-3">{formatDateTime(next.lockAt || next.raceStart)}</div>
            </div>
          </div>
        </section>
      ) : (
        !loading && <div className="surface p-6 text-zinc-400">The season is complete. See you next year.</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="surface p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <Trophy className="w-4 h-4 text-yellow-500" /> Last race
          </div>
          {last ? (
            <>
              <div className="font-display text-xl font-bold text-white">{last.name}</div>
              <div className="text-xs text-zinc-500">{formatDate(last.raceStart)}</div>
              <div className="flex gap-4 mt-3 text-sm font-medium">
                <Link to={`${base(last)}/results`} className="text-red-400 hover:text-red-300">Results →</Link>
                {last.replay_available && (
                  <Link to={`${base(last)}/replay`} className="text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <History className="w-4 h-4" /> Replay
                  </Link>
                )}
              </div>
            </>
          ) : (
            <p className="text-zinc-500 text-sm">{loading ? "Loading…" : "No races yet."}</p>
          )}
        </div>
        <div className="surface p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <Flag className="w-4 h-4 text-red-400" /> Season progress
          </div>
          <div className="font-mono text-3xl font-semibold">
            {completed}
            <span className="text-zinc-600 text-xl"> / {races.filter((r) => r.round).length}</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
            <div className="livery h-full rounded-full" style={{ width: `${races.length ? (completed / races.filter((r) => r.round).length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="surface p-5">
          <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3">
            <Users className="w-4 h-4 text-blue-400" /> Your leagues
          </div>
          <div className="font-mono text-3xl font-semibold">{loading ? "…" : leagues.length}</div>
          <Link to="/league" className="text-sm text-zinc-400 hover:text-white mt-3 inline-block">Browse public leagues →</Link>
        </div>
      </div>

      <section>
        <h2 className="font-display text-xl font-bold italic uppercase mb-4">Your leagues</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((league) => (
            <Link key={league.id} to={`/league/${league.id}`} className="group surface surface-hover p-5">
              <div className="flex justify-between items-start mb-5 gap-2">
                <h3 className="font-display font-bold text-lg group-hover:text-red-400 transition-colors">{league.name}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/[0.05] border border-white/10 text-zinc-400 shrink-0">
                  {league.type === "PUBLIC" ? "Public" : "Private"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> {(league.member_count ?? 0).toLocaleString()} members
                </span>
                {league.code && <span className="font-mono text-xs text-zinc-500">#{league.code}</span>}
              </div>
            </Link>
          ))}
          {!loading && leagues.length === 0 && (
            <div className="surface p-6 text-sm text-zinc-500 md:col-span-2 lg:col-span-3">
              No leagues yet. Create one, join with a code, or{" "}
              <Link to="/league" className="text-red-400 hover:text-red-300">browse public leagues</Link>.
            </div>
          )}
        </div>
      </section>

      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setModal(null)}>
          <div className="surface !bg-zinc-900 p-6 w-full max-w-md animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold">{modal === "join" ? "Join a league" : "Create a league"}</h3>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-white" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            {modal === "create" ? (
              <CreateLeagueForm onDone={() => setModal(null)} />
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  autoFocus
                  placeholder="LEAGUE CODE"
                  value={joinCode}
                  maxLength={6}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && joinCode.trim() && join()}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white font-mono tracking-[0.3em] text-center text-lg focus:outline-none focus:border-red-500/60"
                />
                <button onClick={join} disabled={submitting || !joinCode.trim()} className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold">
                  {submitting ? "Joining…" : "Join"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
