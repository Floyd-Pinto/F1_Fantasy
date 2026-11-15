import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, Timer } from "lucide-react";
import { api } from "../api";
import type { Driver } from "../types";
import { DriverAvatar, ErrorBox, Loading, TeamLogo } from "../components/common";
import { BarChart, LineChart, SERIES_COLORS } from "../components/charts";
import { teamColor } from "../format";

type DriverResult = {
  raceId: number;
  raceName: string;
  round: number | null;
  qualiPosition: number | null;
  sprintPosition: number | null;
  sprintDnf: boolean;
  finishPosition: number | null;
  dnf: boolean;
  fastestLap: boolean;
  points: { race: number; sprint: number; quali: number; total: number };
};

type DriverDetail = Driver & {
  results: DriverResult[];
  priceHistory: { round: number | null; raceName: string; price: number }[];
  stats: { races: number; fantasyPoints: number; averageFinish: number | null; podiums: number; dnfs: number };
};

const short = (name: string) => name.replace(" Grand Prix", "").replace("Bahrain Grand Prix in ", "");

export function DriverPage() {
  const { driverId } = useParams();
  const [d, setD] = useState<DriverDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setD(null);
    api.get<DriverDetail>(`/drivers/${driverId}`).then(setD).catch((err) => setError(err.message));
  }, [driverId]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!d) return <Loading label="Loading driver…" />;

  const color = d.constructor?.color;
  const stat = (label: string, value: string | number) => (
    <div className="bg-zinc-950/50 rounded-lg p-3">
      <div className="text-[11px] uppercase font-bold text-zinc-500">{label}</div>
      <div className="font-mono font-bold text-xl text-white">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to="/grid" className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium w-fit">
        <ChevronLeft className="w-4 h-4" /> Drivers & Teams
      </Link>

      <div className="surface overflow-hidden">
        <div className="h-1.5" style={{ background: teamColor(color) }} />
        <div className="p-6 flex flex-col md:flex-row md:items-center gap-6">
          <DriverAvatar url={d.headshotUrl} name={d.name} color={color} size={96} />
          <div className="flex-1">
            <div className="text-xs text-zinc-500 font-bold uppercase">
              {d.championshipPosition ? `P${d.championshipPosition} in the championship` : "Driver"} · {d.nationality}
            </div>
            <h1 className="text-3xl md:text-4xl font-bold uppercase italic tracking-tight">
              {d.name} {d.number != null && <span className="text-zinc-500 font-mono not-italic text-2xl">#{d.number}</span>}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-zinc-300">
              <TeamLogo url={d.constructor?.logoUrl} name={d.constructor?.name || ""} size={28} />
              {d.constructor?.name}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500 uppercase font-bold">Fantasy price</div>
            <div className="font-mono font-bold text-3xl text-green-400">${d.price.toFixed(1)}M</div>
            <div className="text-xs text-zinc-500">{d.points} championship pts · {d.wins ?? 0} wins</div>
          </div>
        </div>
        <div className="px-6 pb-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          {stat("Races", d.stats.races)}
          {stat("Fantasy pts", d.stats.fantasyPoints)}
          {stat("Avg finish", d.stats.averageFinish ?? "—")}
          {stat("Podiums", d.stats.podiums)}
          {stat("DNFs", d.stats.dnfs)}
        </div>
      </div>

      {d.results.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="surface p-5">
            <BarChart
              title="Fantasy points per race"
              categories={d.results.map((r) => `R${r.round}`)}
              values={d.results.map((r) => r.points.total)}
              color={color ? `#${color}` : SERIES_COLORS[0]}
              details={(i) => {
                const r = d.results[i];
                return (
                  <div className="text-zinc-400 mt-1 space-y-0.5">
                    <div>{r.raceName}</div>
                    <div>
                      Race {r.points.race} · Sprint {r.points.sprint} · Quali {r.points.quali}
                    </div>
                  </div>
                );
              }}
            />
          </div>
          {d.priceHistory.length > 1 && (
            <div className="surface p-5">
              <LineChart
                title="Fantasy price after each round"
                categories={d.priceHistory.map((p) => `R${p.round}`)}
                series={[{ id: d.id, name: d.name, values: d.priceHistory.map((p) => p.price), color: SERIES_COLORS[0] }]}
                format={(v) => `$${v}M`}
                zeroBased={false}
              />
            </div>
          )}
        </div>
      )}

      <div className="surface overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400 font-bold">Season results</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs uppercase text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-2">Rd</th>
                <th className="px-4 py-2">Grand Prix</th>
                <th className="px-4 py-2 text-center">Quali</th>
                <th className="px-4 py-2 text-center">Sprint</th>
                <th className="px-4 py-2 text-center">Race</th>
                <th className="px-4 py-2 text-right">Fantasy pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {[...d.results].reverse().map((r) => (
                <tr key={r.raceId} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-2 font-mono text-zinc-500">{r.round}</td>
                  <td className="px-4 py-2">
                    <Link to={`/race/${r.raceId}/results`} className="text-zinc-200 hover:text-red-400">
                      {short(r.raceName)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-center font-mono text-zinc-400">{r.qualiPosition ?? "—"}</td>
                  <td className="px-4 py-2 text-center font-mono text-zinc-400">{r.sprintDnf ? "DNF" : r.sprintPosition ?? "—"}</td>
                  <td className="px-4 py-2 text-center font-mono">
                    {r.dnf ? <span className="text-red-500">DNF</span> : <span className="text-white">P{r.finishPosition}</span>}
                    {r.fastestLap && <Timer className="w-3 h-3 text-purple-400 inline ml-1" />}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-green-400">{r.points.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
