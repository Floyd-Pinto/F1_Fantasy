import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Users, Trophy, ChevronLeft, ChevronRight, Copy, Check, LogOut, Trash2 } from "lucide-react";
import { api, session } from "../api";
import type { LeaderboardEntry, LeagueDetails, LeagueSummary, Race } from "../types";
import { ErrorBox, Loading, PageHeader, StatusBadge } from "../components/common";
import { CreateLeagueForm } from "../components/CreateLeagueForm";
import { LeagueChart } from "../components/LeagueChart";
import { useRaceStream } from "../hooks/useRaceStream";
import { formatDate, timeUntil } from "../format";

type Tab = "leaderboard" | "races" | "members";

export function League() {
  const { leagueId } = useParams();
  if (!leagueId) return <AllLeaguesView />;
  return <LeagueView key={leagueId} leagueId={leagueId} />;
}

function raceLink(leagueId: number | string, race: Race) {
  if (race.live) return { to: `/league/${leagueId}/race/${race.id}/live`, label: "Watch live" };
  if (race.status === "COMPLETED") return { to: `/league/${leagueId}/race/${race.id}/results`, label: race.replay_available ? "Results · Replay" : "Results" };
  if (race.status === "SCHEDULED") return { to: `/league/${leagueId}/race/${race.id}/team-builder`, label: "Pick team" };
  return { to: `/league/${leagueId}/race/${race.id}/results`, label: "Awaiting results" };
}

function LeagueView({ leagueId }: { leagueId: string }) {
  const navigate = useNavigate();
  const me = session.user();
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const loadLeaderboard = useCallback(
    () => api.get<LeaderboardEntry[]>(`/leaderboard/${leagueId}`).then(setLeaderboard).catch(() => {}),
    [leagueId]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get<LeagueDetails>(`/leagues/${leagueId}`), api.get<LeaderboardEntry[]>(`/leaderboard/${leagueId}`), api.get<Race[]>("/races")])
      .then(([l, lb, r]) => {
        if (cancelled) return;
        setLeague(l);
        setLeaderboard(lb);
        setRaces(r);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  // While a race is live, the season table updates every lap via the race's push stream.
  // A running test simulation streams laps; a real race streams the moment its results are published.
  const liveRace = races.find((r) => r.live) || races.find((r) => r.status === "ONGOING" || r.status === "RESULTS_PENDING");
  const { snapshot } = useRaceStream(liveRace?.id);
  useEffect(() => {
    if (snapshot) loadLeaderboard();
  }, [snapshot?.lap, snapshot?.status, loadLeaderboard]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading label="Loading league…" />;
  if (error || !league) {
    return (
      <div className="space-y-4">
        <Link to="/league" className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium">
          <ChevronLeft className="w-4 h-4" /> Back to Leagues
        </Link>
        <ErrorBox>{error || "League not found"}</ErrorBox>
      </div>
    );
  }

  const isOwner = league.ownerId === me?.id;
  const nextRace = races.find((r) => r.status === "SCHEDULED" && !r.live);

  const copyCode = async () => {
    await navigator.clipboard.writeText(league.code || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const leave = async () => {
    if (!confirmAction(isOwner ? "Delete this league for everyone?" : "Leave this league?")) return;
    try {
      if (isOwner) await api.del(`/leagues/${league.id}`);
      else await api.post(`/leagues/${league.id}/leave`);
      navigate("/league");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to="/league" className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium w-fit">
        <ChevronLeft className="w-4 h-4" /> Back to Leagues
      </Link>

      <PageHeader
        eyebrow={
          <span className="inline-block bg-red-600/20 text-red-500 font-bold text-xs px-2 py-1 rounded border border-red-600/20">
            {league.type === "PUBLIC" ? "PUBLIC LEAGUE" : "PRIVATE LEAGUE"}
          </span>
        }
        title={league.name}
      >
        <div className="flex flex-wrap items-center gap-4 text-zinc-400 text-sm">
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {league.members.length} members
          </span>
          <button onClick={copyCode} className="flex items-center gap-1.5 hover:text-white" title="Copy invite code">
            Code: <span className="font-mono text-white">{league.code}</span>
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button onClick={leave} className="flex items-center gap-1.5 text-zinc-500 hover:text-red-400">
            {isOwner ? <Trash2 className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
            {isOwner ? "Delete league" : "Leave"}
          </button>
        </div>
      </PageHeader>

      {liveRace && (
        <Link
          to={`/league/${league.id}/race/${liveRace.id}/${liveRace.live ? "live" : "results"}`}
          className="flex items-center justify-between bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 hover:border-amber-600/60 transition-colors"
        >
          <div>
            <div className="text-xs font-bold uppercase text-amber-400 tracking-wider">
              {liveRace.live ? `● Test race live — lap ${snapshot?.lap ?? 0}/${snapshot?.totalLaps ?? "?"}` : "Teams locked · awaiting official results"}
            </div>
            <div className="font-bold text-white">{liveRace.name}</div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400" />
        </Link>
      )}

      {!liveRace && nextRace && (
        <Link
          to={`/league/${league.id}/race/${nextRace.id}/team-builder`}
          className="flex items-center justify-between surface p-4 hover:border-red-600/40 transition-colors"
        >
          <div>
            <div className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Next race · in {timeUntil(nextRace.raceStart)}</div>
            <div className="font-bold text-white">{nextRace.name}</div>
          </div>
          <span className="text-sm font-medium text-red-400">Pick your team →</span>
        </Link>
      )}

      <div className="flex border-b border-zinc-800 overflow-x-auto">
        {(["leaderboard", "races", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-3 font-medium text-sm capitalize transition-colors border-b-2 whitespace-nowrap ${
              tab === t ? "border-red-600 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "leaderboard" && leaderboard.some((r) => r.season_total > 0) && (
        <div className="surface p-5">
          <LeagueChart leagueId={league.id} refreshKey={leaderboard.map((r) => r.season_total).join()} />
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="surface overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-6 py-4 font-medium w-20">Rank</th>
                <th className="px-6 py-4 font-medium">Player</th>
                <th className="px-6 py-4 font-medium text-center hidden sm:table-cell">Races</th>
                <th className="px-6 py-4 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.userId} className={`border-b border-zinc-800/60 last:border-0 ${row.userId === me?.id ? "bg-red-950/20" : "hover:bg-zinc-800/30"}`}>
                  <td className="px-6 py-4">
                    {row.rank <= 3 && row.season_total > 0 ? (
                      <Trophy className={`w-5 h-5 ${["text-yellow-500", "text-zinc-300", "text-amber-700"][row.rank - 1]}`} />
                    ) : (
                      <span className="font-bold text-zinc-500">{row.rank}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-semibold text-white">
                    {row.username}
                    {row.userId === me?.id && <span className="ml-2 text-[10px] uppercase font-bold bg-red-600/20 text-red-500 px-1.5 py-0.5 rounded">You</span>}
                  </td>
                  <td className="px-6 py-4 text-center text-zinc-400 font-mono hidden sm:table-cell">{row.races_played}</td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-red-400">{row.season_total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "races" && (
        <div className="space-y-2">
          {races.map((race) => {
            const link = raceLink(league.id, race);
            return (
              <Link
                key={race.id}
                to={link.to}
                className={`flex items-center justify-between gap-4 bg-zinc-900 border ${race.live ? "border-red-600/50" : "border-zinc-800"} rounded-lg p-4 hover:border-zinc-600 transition-colors`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-mono text-zinc-600 w-6 text-right shrink-0">{race.round ?? "–"}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">{race.name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {formatDate(race.raceStart)} · {race.locality || race.circuit}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={race.status} live={race.live} />
                  <span className="text-sm text-zinc-300 font-medium hidden sm:inline">{link.label}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </div>
              </Link>
            );
          })}
          {races.length === 0 && <div className="surface rounded-xl p-4 text-sm text-zinc-500">No races scheduled.</div>}
        </div>
      )}

      {tab === "members" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {league.members.map((m) => (
            <div key={m.userId} className="surface rounded-xl p-4">
              <div className="font-medium text-white">{m.username}</div>
              <div className="text-sm text-zinc-500 mt-1">{m.userId === league.ownerId ? "Owner" : "Member"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Native confirm keeps destructive actions deliberate without a modal library.
function confirmAction(message: string) {
  return window.confirm(message);
}

function AllLeaguesView() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [userLeagues, setUserLeagues] = useState<LeagueSummary[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get<LeagueSummary[]>("/leagues"), api.get<LeagueSummary[]>("/leagues/public")])
      .then(([mine, pub]) => {
        if (cancelled) return;
        setUserLeagues(mine);
        setPublicLeagues(pub);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function join(code: string) {
    if (!code.trim()) return;
    try {
      setJoining(true);
      setError("");
      const result = await api.post("/leagues/join", { code: code.trim().toUpperCase() });
      navigate(`/league/${result.league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join league");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader eyebrow={<span className="inline-block bg-red-600/20 text-red-500 font-bold text-xs px-2 py-1 rounded border border-red-600/20">LEAGUES</span>} title="All Leagues">
        <p className="text-zinc-400">Browse and join leagues, or create your own.</p>
      </PageHeader>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="surface p-6">
          <h2 className="text-lg font-bold text-white mb-4">Join with a code</h2>
          <input
            type="text"
            placeholder="Enter league code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && join(joinCode)}
            maxLength={6}
            className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-600/50 mb-3 font-mono tracking-widest"
          />
          <button
            onClick={() => join(joinCode)}
            disabled={joining || !joinCode.trim()}
            className="w-full px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {joining ? "Joining…" : "Join"}
          </button>
        </div>

        <div className="surface p-6">
          <h2 className="text-lg font-bold text-white mb-4">Create a league</h2>
          <CreateLeagueForm />
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>

      <section>
        <h2 className="text-xl font-bold text-white mb-4">Your Leagues</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {loading && <Loading />}
          {!loading &&
            userLeagues.map((league) => (
              <Link key={league.id} to={`/league/${league.id}`} className="surface surface-hover p-6 group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white group-hover:text-red-400 transition-colors">{league.name}</h3>
                    <p className="text-sm text-zinc-500 mt-1">{league.member_count ?? 0} members</p>
                  </div>
                  <Users className="w-5 h-5 text-zinc-600 group-hover:text-red-400 transition-colors" />
                </div>
                <div className="text-xs text-zinc-500">
                  {league.type === "PUBLIC" ? "Public" : "Private"} · Code <span className="font-mono">{league.code}</span>
                </div>
              </Link>
            ))}
          {!loading && userLeagues.length === 0 && <div className="text-sm text-zinc-500">You have not joined any leagues yet.</div>}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-4">Public Leagues</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {!loading &&
            publicLeagues.map((league) => (
              <div key={league.id} className="surface p-6 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white">{league.name}</h3>
                  <p className="text-sm text-zinc-500 mt-1">{league.member_count ?? 0} members</p>
                </div>
                {league.is_member ? (
                  <Link to={`/league/${league.id}`} className="text-sm text-red-400 hover:text-red-300 font-medium">
                    Open →
                  </Link>
                ) : (
                  <button onClick={() => join(league.code!)} disabled={joining} className="px-4 py-2 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                    Join
                  </button>
                )}
              </div>
            ))}
          {!loading && publicLeagues.length === 0 && <div className="text-sm text-zinc-500">No public leagues yet — create one!</div>}
        </div>
      </section>
    </div>
  );
}
