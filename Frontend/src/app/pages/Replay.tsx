import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ChevronLeft, Pause, Play, RotateCcw } from "lucide-react";
import { api, session } from "../api";
import type { LeagueSummary, RaceEvent, ReplayData, ResultRow } from "../types";
import { RaceFeed, RaceStandings } from "../components/RaceWidgets";
import { RaceOrderTable } from "../components/RaceOrderTable";
import { ErrorBox, Loading, PageHeader } from "../components/common";
import { CAPTAIN_MULTIPLIER, driverPoints, predictionBonus } from "../scoring";

const SPEEDS = [1, 2, 4, 8];
const BASE_LAP_MS = 1500;


/** Lap-by-lap replay of a finished real race, with every league member's points building up as it plays. */
export function Replay() {
  const params = useParams();
  const [search] = useSearchParams();
  const raceId = params.raceId;
  const leagueId = params.leagueId || search.get("league");
  const me = session.user();

  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);

  useEffect(() => {
    setData(null);
    setIdx(0);
    api
      .get<ReplayData>(`/races/${raceId}/replay${leagueId ? `?leagueId=${leagueId}` : ""}`)
      .then((d) => {
        setData(d);
        setPlaying(true);
      })
      .catch((err) => setError(err.message));
    if (!leagueId) api.get<LeagueSummary[]>("/leagues").then(setLeagues).catch(() => {});
  }, [raceId, leagueId]);

  useEffect(() => {
    if (!playing || !data) return;
    if (idx >= data.frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => i + 1), BASE_LAP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, idx, speed, data]);

  const driverById = useMemo(() => new Map((data?.drivers || []).map((d) => [d.id, d])), [data]);

  // Positions + provisional fantasy points for a frame.
  const scoreFrame = (frameIdx: number) => {
    const frame = data!.frames[frameIdx];
    const dnf = new Set(frame.dnf);
    const pos = new Map<number, number | null>();
    let p = 0;
    for (const id of frame.order) pos.set(id, dnf.has(id) ? null : ++p);
    // Weekend points so far: qualifying + sprint are banked before lights out, race points build per lap.
    const pts = new Map<number, number>();
    for (const id of frame.order) {
      const pre = data!.preRace?.[id];
      const race = frameIdx === 0 ? 0 : driverPoints(pos.get(id) ?? null, dnf.has(id), frame.fl === id);
      pts.set(id, race + (pre?.quali || 0) + (pre?.sprint || 0));
    }
    return { frame, dnf, pos, pts };
  };

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <Loading label="Loading replay — the first viewing of a race fetches its real timing data, this can take a few seconds…" />;

  const { frame, dnf, pos, pts } = scoreFrame(idx);
  const prev = idx > 0 ? scoreFrame(idx - 1).pos : new Map<number, number | null>();

  const rows: ResultRow[] = frame.order.map((id) => {
    const d = driverById.get(id)!;
    return {
      driver_id: id,
      driver_name: d.name,
      driver_code: d.code,
      driver_number: d.number,
      headshot_url: d.headshotUrl,
      constructor_name: d.constructorName,
      team_color: d.color,
      finish_pos: pos.get(id) ?? null,
      dnf: dnf.has(id),
      fastest_lap: frame.fl === id,
      points: pts.get(id) || 0,
    };
  });

  const previous = new Map<number, number>();
  prev.forEach((v, k) => v && previous.set(k, v));

  const constructorPts = (cid: number | null) =>
    cid == null ? 0 : data.drivers.filter((d) => d.constructorId === cid).reduce((s, d) => s + (pts.get(d.id) || 0), 0);

  const table = data.teams
    .map((t) => ({
      ...t,
      total:
        t.driverIds.reduce(
          (s, id) =>
            s +
            (pts.get(id) || 0) * (t.captainId === id ? CAPTAIN_MULTIPLIER : 1) +
            (idx > 0 ? predictionBonus(t.predictions?.[id], pos.get(id) ?? null, dnf.has(id)) : 0),
          0
        ) + constructorPts(t.constructorId),
    }))
    .sort((a, b) => b.total - a.total);
  const myTeam = data.teams.find((t) => t.userId === me?.id);

  const events = data.frames
    .slice(0, idx + 1)
    .flatMap((f) => f.events.map((e): RaceEvent => ({ ...e, lap: f.lap })))
    .reverse()
    .slice(0, 60);

  const leader = rows[0];
  const back = leagueId ? `/league/${leagueId}/race/${data.race.id}/results` : `/race/${data.race.id}/results`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to={back} className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium w-fit">
        <ChevronLeft className="w-4 h-4" /> Back to results
      </Link>

      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded">Replay</span>
            {data.race.round && <span className="text-xs text-zinc-500 font-bold uppercase">Round {data.race.round} · {data.race.season}</span>}
          </div>
        }
        title={data.race.name}
      >
        <p className="text-zinc-400">{data.race.circuit}</p>

        <div className="mt-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-mono font-bold text-white">{idx === 0 ? "Grid" : `Lap ${frame.lap} / ${data.totalLaps}`}</span>
            {leader && idx > 0 && <span className="text-zinc-400">Leader: <span className="text-white font-medium">{leader.driver_name}</span></span>}
          </div>
          <input
            type="range"
            min={0}
            max={data.frames.length - 1}
            value={idx}
            onChange={(e) => {
              setIdx(Number(e.target.value));
              setPlaying(false);
            }}
            className="w-full accent-red-600"
            aria-label="Lap"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => (idx >= data.frames.length - 1 ? (setIdx(0), setPlaying(true)) : setPlaying(!playing))}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 rounded-lg text-sm font-medium"
            >
              {playing ? <Pause className="w-4 h-4" /> : idx >= data.frames.length - 1 ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? "Pause" : idx >= data.frames.length - 1 ? "Replay" : "Play"}
            </button>
            <div className="flex rounded-lg overflow-hidden border border-zinc-800">
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => setSpeed(s)} className={`px-3 py-2 text-sm font-mono ${speed === s ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                  {s}×
                </button>
              ))}
            </div>
            <button onClick={() => { setIdx(data.frames.length - 1); setPlaying(false); }} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">
              Skip to flag
            </button>
          </div>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 surface overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400 font-bold">Running order</div>
          <RaceOrderTable rows={rows} highlight={new Set(myTeam?.driverIds || [])} previous={previous} />
        </div>

        <div className="space-y-6">
          {leagueId ? (
            <div className="surface p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">League points as the race unfolds</div>
              <RaceStandings
                rows={table.map((t) => ({ userId: t.userId, username: t.username, points: t.total }))}
                meId={me?.id}
                emptyText="Nobody in this league entered a team for this race."
              />
            </div>
          ) : (
            leagues.length > 0 && (
              <div className="surface p-4">
                <div className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3">Watch with a league's teams</div>
                {leagues.map((l) => (
                  <Link key={l.id} to={`/league/${l.id}/race/${data.race.id}/replay`} className="block text-sm text-zinc-300 hover:text-red-400 py-1">
                    {l.name} →
                  </Link>
                ))}
              </div>
            )
          )}

          <RaceFeed events={events} emptyText="Waiting for lights out…" />

          <p className="text-xs text-zinc-600">
            Rebuilt from real OpenF1 timing data. Qualifying and sprint points are banked from the start; captain and prediction bonuses are
            applied as the order changes. Final points use the official classification.
          </p>
        </div>
      </div>
    </div>
  );
}
