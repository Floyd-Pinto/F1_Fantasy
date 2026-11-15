import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, History, Lock } from "lucide-react";
import { api, ApiError, session } from "../api";
import { RaceStandings } from "../components/RaceWidgets";
import type { LeagueDetails, Race, RaceLeaderboardEntry, ResultRow } from "../types";
import { RaceOrderTable } from "../components/RaceOrderTable";
import { ErrorBox, Loading, PageHeader, StatusBadge } from "../components/common";
import { formatDate } from "../format";
import { useRaceStream } from "../hooks/useRaceStream";

export function Results() {
  const { leagueId, raceId } = useParams();
  const [race, setRace] = useState<Race | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [standings, setStandings] = useState<RaceLeaderboardEntry[]>([]);
  const [myDrivers, setMyDrivers] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // While a race waits for its official classification, listen for the server's push and reload instantly.
  const pending = race && race.status !== "COMPLETED";
  const { snapshot } = useRaceStream(pending ? raceId : null);
  useEffect(() => {
    if (snapshot?.status === "COMPLETED") setReloadKey((k) => k + 1);
  }, [snapshot?.status, snapshot?.updatedAt]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [raceData, resultData] = await Promise.all([api.get<Race>(`/races/${raceId}`), api.get<ResultRow[]>(`/results/${raceId}`)]);
        if (cancelled) return;
        setRace(raceData);
        setResults(resultData);

        if (leagueId) {
          const [leagueData, lb] = await Promise.all([
            api.get<LeagueDetails>(`/leagues/${leagueId}`),
            api.get<RaceLeaderboardEntry[]>(`/leaderboard/${leagueId}/race/${raceId}`),
          ]);
          const team = await api.get(`/teams/${raceId}?leagueId=${leagueId}`).catch((err) => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
          });
          if (cancelled) return;
          setLeague(leagueData);
          setStandings(lb);
          if (team) setMyDrivers(new Set(team.driverIds));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leagueId, raceId, reloadKey]);

  if (loading && !race) return <Loading label="Loading results…" />;
  if (error || !race) return <ErrorBox>{error || "Race not found"}</ErrorBox>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to={league ? `/league/${league.id}` : "/"} className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium w-fit">
        <ChevronLeft className="w-4 h-4" />
        Back to {league?.name || "dashboard"}
      </Link>

      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <StatusBadge status={race.status} live={race.live} />
            {race.round && <span className="text-xs text-zinc-500 font-bold uppercase">Round {race.round}</span>}
          </div>
        }
        title={race.name}
      >
        <p className="text-zinc-400 font-medium">
          {formatDate(race.raceDate, { year: "numeric", month: "long", day: "numeric" })}
          {race.circuit && ` · ${race.circuit}`}
        </p>
        {race.replay_available && (
          <Link
            to={league ? `/league/${league.id}/race/${race.id}/replay` : `/race/${race.id}/replay`}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium"
          >
            <History className="w-4 h-4" /> Watch lap-by-lap replay
          </Link>
        )}
      </PageHeader>

      {race.status !== "COMPLETED" && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-5 flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-white">{race.status === "SCHEDULED" ? "Race hasn't started yet" : "Waiting for official results"}</div>
            <p className="text-sm text-zinc-400 mt-1">
              {race.status === "SCHEDULED"
                ? "Teams lock automatically at lights out."
                : "All teams are locked. As soon as the official classification is published, points and standings update here automatically, no refresh needed."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 surface overflow-hidden">
          <RaceOrderTable rows={results} highlight={myDrivers} />
        </div>
        {league && (
          <div className="surface p-4 h-fit">
            <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">{league.name} · race points</div>
            <RaceStandings
              rows={standings.map((r) => ({ userId: r.userId, username: r.username, points: r.total_pts, rank: r.rank }))}
              meId={session.user()?.id}
              emptyText="Nobody in this league entered a team for this race."
            />
          </div>
        )}
      </div>
    </div>
  );
}
