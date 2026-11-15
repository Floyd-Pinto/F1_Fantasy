import { Crown, Lock, Repeat, Target, Timer, Trophy, Zap } from "lucide-react";
import { PageHeader } from "../components/common";
import {
  CAPTAIN_MULTIPLIER,
  FASTEST_LAP_BONUS,
  PREDICTION_CLOSE_BONUS,
  PREDICTION_EXACT_BONUS,
  QUALI_POINTS,
  RACE_POINTS,
  SPRINT_POINTS,
} from "../scoring";

function PointsRow({ label, table }: { label: string; table: number[] }) {
  return (
    <div>
      <div className="text-sm font-bold text-white mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {table.map((p, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-center min-w-12">
            <div className="text-[10px] text-zinc-500">P{i + 1}</div>
            <div className="font-mono font-bold text-white">{p}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Rule({ icon, title, children }: { icon: JSX.Element; title: string; children: React.ReactNode }) {
  return (
    <div className="surface p-5 flex gap-4">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <div className="font-bold text-white">{title}</div>
        <div className="text-sm text-zinc-400 mt-1 space-y-1">{children}</div>
      </div>
    </div>
  );
}

export function Rules() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="How to play">
        <p className="text-zinc-400">Pick 5 drivers and 1 constructor within $100M for every Grand Prix. Points come from the official results.</p>
      </PageHeader>

      <div className="surface p-6 space-y-5">
        <PointsRow label="Race" table={RACE_POINTS} />
        <PointsRow label="Sprint (sprint weekends)" table={SPRINT_POINTS} />
        <PointsRow label="Qualifying" table={QUALI_POINTS} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Rule icon={<Timer className="w-5 h-5 text-purple-400" />} title={`Fastest lap +${FASTEST_LAP_BONUS}`}>
          Only if that driver finishes in the top 10. A DNF scores 0 in the race.
        </Rule>
        <Rule icon={<Crown className="w-5 h-5 text-yellow-400" />} title={`Captain ×${CAPTAIN_MULTIPLIER}`}>
          Pick one of your drivers as captain: their race, sprint and qualifying points are doubled.
        </Rule>
        <Rule icon={<Target className="w-5 h-5 text-blue-400" />} title="Predictions">
          Optional: predict where each driver finishes. Exact = +{PREDICTION_EXACT_BONUS}, one place off = +{PREDICTION_CLOSE_BONUS}. Not doubled by the captain.
        </Rule>
        <Rule icon={<Trophy className="w-5 h-5 text-amber-500" />} title="Constructor">
          Scores the race, sprint and qualifying points of both its drivers.
        </Rule>
        <Rule icon={<Lock className="w-5 h-5 text-red-400" />} title="Lock time">
          Teams lock when the weekend's first scoring session starts: qualifying, or the sprint on sprint weekends. Everyone in a league locks at the same moment.
        </Rule>
        <Rule icon={<Repeat className="w-5 h-5 text-green-400" />} title="Forgot to pick?">
          Your previous team in that league carries over automatically, including your captain (predictions don't carry).
        </Rule>
        <Rule icon={<Zap className="w-5 h-5 text-orange-400" />} title="Prices">
          Prices follow the real championship standings and are updated after every round. Watch for value picks.
        </Rule>
      </div>
    </div>
  );
}
