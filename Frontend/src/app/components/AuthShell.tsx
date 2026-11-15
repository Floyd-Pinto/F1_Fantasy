import type { ReactNode } from "react";
import { Bell, History, Trophy, Zap } from "lucide-react";
import { Logo } from "./Layout";

const FEATURES = [
  { icon: <Trophy className="w-4 h-4" />, text: "Real 2026 drivers, teams and results" },
  { icon: <Zap className="w-4 h-4" />, text: "Points land the moment official results do" },
  { icon: <History className="w-4 h-4" />, text: "Replay every Grand Prix lap by lap" },
  { icon: <Bell className="w-4 h-4" />, text: "Reminders before your team locks" },
];

/** Split-screen frame for the sign-in and registration pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 border-r border-white/[0.06]">
        <div className="livery absolute inset-0 opacity-[0.12]" />
        <div className="absolute -bottom-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-red-600/20 blur-3xl" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative">
          <h2 className="font-display text-6xl font-black italic uppercase leading-[0.9] tracking-tight">
            Your team.
            <br />
            <span className="text-red-500">Real races.</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-zinc-300">
                <span className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center text-red-400">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-zinc-600">Unofficial fan project. Data from Jolpica-F1 and OpenF1.</p>
      </aside>

      <main className="flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo />
          </div>
          <h1 className="font-display text-3xl font-black italic uppercase tracking-tight">{title}</h1>
          <p className="text-zinc-400 mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
