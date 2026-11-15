import type { ReactNode } from "react";
import { teamColor } from "../format";

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="bg-red-950/30 border border-red-900/50 text-red-300 rounded-xl p-4 text-sm">{children}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="bg-green-950/20 border border-green-900/30 text-green-400 rounded-xl p-4 text-sm">{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-zinc-400 py-8">
      <span className="w-4 h-4 border-2 border-zinc-600 border-t-red-500 rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function LiveBadge({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
      {label}
    </span>
  );
}

export function StatusBadge({ status, live }: { status: string; live?: boolean }) {
  if (live) return <LiveBadge />;
  if (status === "ONGOING") return <LiveBadge label="Race underway" />;
  const styles: Record<string, [string, string]> = {
    COMPLETED: ["bg-zinc-800 text-zinc-300 border-zinc-700", "Finished"],
    RESULTS_PENDING: ["bg-amber-950/40 text-amber-300 border-amber-900/50", "Awaiting results"],
    SCHEDULED: ["bg-blue-950/40 text-blue-300 border-blue-900/50", "Upcoming"],
  };
  const [cls, label] = styles[status] || styles.SCHEDULED;
  return <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>{label}</span>;
}

export function TeamStripe({ color, className = "h-8" }: { color?: string | null; className?: string }) {
  return <span className={`w-1 rounded-full shrink-0 ${className}`} style={{ backgroundColor: teamColor(color) }} />;
}

export function DriverAvatar({ url, name, color, size = 36 }: { url?: string | null; name: string; color?: string | null; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(-2).join("");
  return (
    <span
      className="rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white bg-zinc-800 border-2"
      style={{ width: size, height: size, borderColor: teamColor(color) }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover object-top" loading="lazy" /> : initials}
    </span>
  );
}

// Logos are mostly dark-on-transparent, so they sit on a light tile to stay legible on the dark UI.
export function TeamLogo({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (!url) return null;
  return (
    <span className="rounded-lg bg-white shrink-0 flex items-center justify-center p-1.5" style={{ width: size, height: size }}>
      <img src={url} alt={`${name} logo`} className="max-w-full max-h-full object-contain" loading="lazy" />
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="surface relative overflow-hidden">
      {/* Livery: red stripe with speed lines along the left edge, glow in the corner */}
      <div className="livery absolute inset-y-0 left-0 w-1.5" />
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-red-600/10 blur-3xl" />
      <div
        className="absolute inset-y-0 right-0 w-1/2 opacity-[0.05] pointer-events-none"
        style={{ backgroundImage: "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 12px)" }}
      />
      <div className="relative z-10 px-6 py-7 md:px-9 md:py-9">
        {eyebrow && <div className="mb-3">{eyebrow}</div>}
        <h1 className="font-display text-3xl md:text-5xl font-black italic uppercase tracking-tight leading-none mb-3">{title}</h1>
        {children}
      </div>
    </div>
  );
}
