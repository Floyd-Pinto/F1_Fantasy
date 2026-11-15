import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ChevronLeft, Radio } from "lucide-react";
import { api, ApiError, session } from "../api";
import { useRaceStream } from "../hooks/useRaceStream";
import type { LeagueSummary, Race, RaceLeaderboardEntry } from "../types";
import { RaceFeed, RaceStandings } from "../components/RaceWidgets";
import { RaceOrderTable } from "../components/RaceOrderTable";
import { ErrorBox, LiveBadge, Loading, PageHeader, StatusBadge } from "../components/common";
import { formatDateTime, timeUntil } from "../format";


export function LiveRace() {
  const params = useParams();
  const [search] = useSearchParams();
  const raceId = params.raceId;
  const leagueId = params.leagueId || search.get("league");

  const { snapshot, connected } = useRaceStream(raceId);
  const [race, setRace] = useState<Race | null>(null);
  const [error, setError] = useState("");
  const [myDrivers, setMyDrivers] = useState<Set<number>>(new Set());
  const [myPoints, setMyPoints] = useState<number | null>(null);
  const [standings, setStandings] = useState<RaceLeaderboardEntry[]>([]);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const previousOrder = useRef<Map<number, number>>(new Map());
  const [prevForRender, setPrevForRender] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (!raceId) return;
    api.get<Race>(`/races/${raceId}`).then(setRace).catch((err) => setError(err.message));
    if (!leagueId) api.get<LeagueSummary[]>("/leagues").then(setLeagues).catch(() => {});
  }, [raceId, leagueId]);

  useEffect(() => {
    if (!raceId || !leagueId) return;
    api
      .get(`/teams/${raceId}?leagueId=${leagueId}`)
      .then((team) => setMyDrivers(new Set(team.driverIds)))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 404)) console.warn(err);
      });
  }, [raceId, leagueId]);

  // Every lap the server pushes a snapshot; refresh the league's race standings alongside it.
  const lapKey = snapshot ? `${snapshot.lap}-${snapshot.status}` : "";
  useEffect(() => {
    if (!snapshot) return;
    const next = new Map<number, number>();
    snapshot.order.forEach((r) => r.finish_pos && next.set(r.driver_id, r.finish_pos));
    setPrevForRender(previousOrder.current);
    previousOrder.current = next;

    if (!leagueId || !raceId) return;
    api
      .get<RaceLeaderboardEntry[]>(`/leaderboard/${leagueId}/race/${raceId}`)
      .then((rows) => {
        setStandings(rows);
        setMyPoints(rows.find((r) => r.userId === session.user()?.id)?.total_pts ?? null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapKey, leagueId, raceId]);

  const lap = snapshot?.lap ?? 0;
  const total = snapshot?.totalLaps ?? race?.totalLaps ?? null;
  const progress = total ? Math.min(100, Math.round((lap / total) * 100)) : 0;
  const isLive = Boolean(snapshot?.live);
  const leader = snapshot?.order.find((r) => r.finish_pos === 1);
  const myRows = useMemo(() => snapshot?.order.filter((r) => myDrivers.has(r.driver_id)) ?? [], [snapshot, myDrivers]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!race) return <Loading label="Loading race…" />;

  const backLink = leagueId ? `/league/${leagueId}` : "/";
  const notStarted = race.status === "SCHEDULED" && !isLive && (snapshot?.order.length ?? 0) === 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to={backLink} className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium w-fit">
        <ChevronLeft className="w-4 h-4" />
        Back
      </Link>

      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2 flex-wrap">
            {isLive ? <LiveBadge label={snapshot?.mode === "replay" ? "Live · real race replay" : "Live · simulation"} /> : <StatusBadge status={snapshot?.status || race.status} />}
            {race.round && <span className="text-xs text-zinc-500 font-bold uppercase">Round {race.round} · {race.season}</span>}
            <span className={`text-[11px] ${connected ? "text-green-500" : "text-zinc-600"}`}>● {connected ? "connected" : "connecting…"}</span>
          </div>
        }
        title={race.name}
      >
        <p className="text-zinc-400">
          {race.circuit}
          {race.locality && ` · ${race.locality}, ${race.country}`}
        </p>
        {total ? (
          <div className="mt-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-mono font-bold text-white">
                Lap {lap} / {total}
              </span>
              {leader && <span className="text-zinc-400">Leader: <span className="text-white font-medium">{leader.driver_name}</span></span>}
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-600 transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </PageHeader>

      {notStarted ? (
        <div className="surface p-6 space-y-2">
          <div className="flex items-center gap-2 text-white font-bold">
            <Radio className="w-5 h-5 text-red-500" /> Lights out {formatDateTime(race.raceStart)} ({timeUntil(race.raceStart)})
          </div>
          <p className="text-sm text-zinc-400">
            This page updates automatically as soon as anything happens: leave it open.
          </p>
          {leagueId && (
            <Link to={`/league/${leagueId}/race/${race.id}/team-builder`} className="inline-block mt-2 text-sm font-medium text-red-400 hover:text-red-300">
              Pick your team before the race →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 surface overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400 font-bold">Running order</div>
            {snapshot ? <RaceOrderTable rows={snapshot.order} highlight={myDrivers} previous={isLive ? prevForRender : undefined} /> : <Loading label="Connecting to race feed…" />}
          </div>

          <div className="space-y-6">
            {leagueId ? (
              <div className="surface p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">League standings · this race</div>
                {myPoints !== null && (
                  <div className="mb-3 p-3 rounded-lg bg-red-950/30 border border-red-900/40 flex justify-between items-center">
                    <span className="text-sm text-zinc-300">Your points</span>
                    <span className="font-mono font-bold text-2xl text-white">{myPoints}</span>
                  </div>
                )}
                {myRows.length > 0 && (
                  <div className="mb-3 text-xs text-zinc-500">
                    Your drivers: {myRows.map((r) => `${r.driver_code || r.driver_name} ${r.dnf ? "DNF" : `P${r.finish_pos}`}`).join(" · ")}
                  </div>
                )}
                <RaceStandings
                  rows={standings.map((r) => ({ userId: r.userId, username: r.username, points: r.total_pts, rank: r.rank }))}
                  meId={session.user()?.id}
                  emptyText="No teams entered for this race yet."
                />
              </div>
            ) : (
              leagues.length > 0 && (
                <div className="surface p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">Follow with a league</div>
                  <div className="space-y-1">
                    {leagues.map((l) => (
                      <Link key={l.id} to={`/league/${l.id}/race/${race.id}/live`} className="block text-sm text-zinc-300 hover:text-red-400 py-1">
                        {l.name} →
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}

            <RaceFeed events={snapshot?.events ?? []} emptyText={snapshot?.status === "COMPLETED" ? "Race finished." : "Waiting for lights out…"} />
          </div>
        </div>
      )}
    </div>
  );
}
