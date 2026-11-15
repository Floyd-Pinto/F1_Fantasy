import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router";
import { GripVertical, RefreshCw, Play, Square, Radio, FlaskConical } from "lucide-react";
import { api, session } from "../api";
import type { Constructor, Driver, Race, ResultRow } from "../types";
import { ErrorBox, Notice, StatusBadge, TeamLogo } from "../components/common";
import { formatDate } from "../format";

type EditRow = { driverId: number; driverName: string; fastest_lap: boolean; dnf: boolean; points?: number };
type AdminUser = { id: number; username: string; email: string; role: "USER" | "ADMIN" };
type SimStatus = { running: boolean; mode: string | null; lap: number | null; totalLaps: number | null; testRace: boolean };

export function Admin() {
  if (!session.isAdmin()) return <Navigate to="/" replace />;
  return <AdminPanel />;
}

function AdminPanel() {
  const me = session.user();
  const [races, setRaces] = useState<Race[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<Constructor[]>([]);
  const [selected, setSelected] = useState<Race | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [sim, setSim] = useState<SimStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      if (ok) setMessage(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const loadRaces = () => api.get<Race[]>("/races").then(setRaces);
  const loadUsers = () => api.get<AdminUser[]>("/admin/users").then(setUsers);
  const loadTeams = () => api.get<Constructor[]>("/constructors?active=true").then(setTeams);

  useEffect(() => {
    run(() => Promise.all([loadRaces(), loadUsers(), loadTeams()]));
  }, []);

  async function openRace(race: Race) {
    setSelected(race);
    await run(async () => {
      const [results, status] = await Promise.all([api.get<ResultRow[]>(`/results/${race.id}`), api.get<SimStatus>(`/simulation/${race.id}/status`)]);
      setSim(status);
      if (results.length) {
        setRows(results.map((r) => ({ driverId: r.driver_id, driverName: r.driver_name, fastest_lap: r.fastest_lap, dnf: r.dnf, points: r.points })));
      } else {
        // No results yet: start from the current grid ordered by championship position.
        const drivers = await api.get<Driver[]>("/drivers?active=true");
        setRows(drivers.map((d) => ({ driverId: d.id, driverName: d.name, fastest_lap: false, dnf: false })));
      }
    });
  }

  const refreshSelected = async () => {
    await loadRaces();
    if (selected) {
      const fresh = (await api.get<Race>(`/races/${selected.id}`)) as Race;
      await openRace(fresh);
    }
  };

  const startRun = () =>
    selected &&
    run(async () => {
      await api.post(`/simulation/start/${selected.id}`);
      setSim(await api.get(`/simulation/${selected.id}/status`));
      await loadRaces();
    }, "Simulation started — open the live view to watch.");

  // Test races have no championship round, so simulations can never overwrite a real Grand Prix.
  const createTestRace = () =>
    run(async () => {
      const start = new Date(Date.now() + 10 * 60 * 1000);
      const race = await api.post<Race>("/races", {
        name: `Test Race ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        circuit: "Simulator",
        season: start.getFullYear(),
        raceDate: start.toISOString(),
        raceStart: start.toISOString(),
      });
      await loadRaces();
      await openRace(race);
    }, "Test race created — it starts in 10 minutes, or simulate it now.");

  const stopRun = () =>
    selected &&
    run(async () => {
      await api.post(`/simulation/stop/${selected.id}`);
      await refreshSelected();
    }, "Stopped — partial results discarded.");

  const saveResults = () =>
    selected &&
    run(async () => {
      await api.put(`/results/${selected.id}`, {
        results: rows.map((r, i) => ({ driverId: r.driverId, finish_pos: r.dnf ? null : i + 1, fastest_lap: r.fastest_lap, dnf: r.dnf })),
      });
      await refreshSelected();
    }, "Results saved and every team re-scored.");

  const sync = () =>
    run(async () => {
      const s = await api.post("/admin/sync", {});
      await Promise.all([loadRaces(), loadTeams()]);
      setMessage(`Synced ${s.season}: ${s.races} races, ${s.resultsImported} new results imported.`);
    });

  const setFastestLap = (idx: number, on: boolean) => setRows((prev) => prev.map((r, i) => ({ ...r, fastest_lap: on ? i === idx : i === idx ? false : r.fastest_lap })));

  const onDrop = (to: number) => {
    if (dragging === null || dragging === to) return setDragging(null);
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragging, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragging(null);
  };

  const saveTeam = (team: Constructor, patch: Partial<Constructor>) =>
    run(async () => {
      await api.put(`/constructors/${team.id}`, patch);
      await loadTeams();
    }, `${team.name} updated.`);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-2">
          <button onClick={createTestRace} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm font-medium">
            <FlaskConical className="w-4 h-4" /> New test race
          </button>
          <button onClick={sync} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm font-medium">
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Sync real F1 data
          </button>
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>
      <Notice>{message}</Notice>

      <section className="surface p-4">
        <h2 className="font-semibold mb-3">Races</h2>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {races.map((r) => (
            <button
              key={r.id}
              onClick={() => openRace(r)}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded text-left transition-colors ${selected?.id === r.id ? "bg-zinc-800" : "hover:bg-zinc-800/50"}`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  <span className="font-mono text-zinc-500 mr-2">{r.round ?? "–"}</span>
                  {r.name}
                </div>
                <div className="text-xs text-zinc-500">{formatDate(r.raceStart)}</div>
              </div>
              <StatusBadge status={r.status} live={r.live} />
            </button>
          ))}
          {races.length === 0 && <p className="text-sm text-zinc-500">No races — press “Sync real F1 data”.</p>}
        </div>
      </section>

      {selected && (
        <section className="surface p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-lg">{selected.name}</h3>
              <div className="text-sm text-zinc-400">
                {sim?.running ? (
                  <span className="text-emerald-400">
                    {sim.mode === "replay" ? "Replaying real race" : "Simulating"} — lap {sim.lap}/{sim.totalLaps}
                  </span>
                ) : (
                  <>Status: {selected.status.toLowerCase()}</>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/race/${selected.id}/live`} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">
                <Radio className="w-4 h-4" /> {sim?.testRace ? "Live view" : "Push view"}
              </Link>
              {sim?.running ? (
                <button onClick={stopRun} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-sm">
                  <Square className="w-4 h-4" /> Stop
                </button>
              ) : (
                <>
                  {sim?.testRace && selected.status !== "COMPLETED" && (
                    <button onClick={startRun} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-sm">
                      <Play className="w-4 h-4" /> Simulate
                    </button>
                  )}
                  <button onClick={saveResults} disabled={busy || rows.length === 0} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 disabled:opacity-50 rounded text-sm">
                    Save results & score
                  </button>
                </>
              )}
            </div>
          </div>

          {!sim?.running && (
            <div className="overflow-x-auto">
              <p className="text-sm text-zinc-400 mb-2">
                {sim?.testRace
                  ? "Drag rows to set the finishing order. DNF drivers are classified at the back."
                  : "Real races are scored automatically from official results. Only edit here to correct a mistake."}
              </p>
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="bg-zinc-950/50 border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400">
                    <th className="px-4 py-2">Pos</th>
                    <th className="px-4 py-2">Driver</th>
                    <th className="px-4 py-2 text-center">Fastest lap</th>
                    <th className="px-4 py-2 text-center">DNF</th>
                    <th className="px-4 py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {rows.map((row, idx) => (
                    <tr
                      key={row.driverId}
                      draggable
                      onDragStart={() => setDragging(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(idx)}
                      onDragEnd={() => setDragging(null)}
                      className={`hover:bg-zinc-800/30 ${dragging === idx ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2 w-24">
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-zinc-500 cursor-grab" />
                          <span className="font-mono text-sm">{row.dnf ? "DNF" : idx + 1}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-medium">{row.driverName}</td>
                      <td className="px-4 py-2 text-center">
                        <input type="radio" name="fastest" checked={row.fastest_lap} onChange={(e) => setFastestLap(idx, e.target.checked)} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={row.dnf} onChange={(e) => setRows((p) => p.map((r, i) => (i === idx ? { ...r, dnf: e.target.checked } : r)))} />
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{row.points ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="surface p-4">
        <h2 className="font-semibold mb-1">Teams</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Team principals and logos aren't reliably available from free APIs. Logos are filled from Wikipedia on the first sync and never overwritten
          afterwards, so fix any outdated one here (paste an https image URL). Prices are recalculated on each sync.
        </p>
        <div className="space-y-2">
          {teams.map((t) => (
            <TeamRow key={t.id} team={t} onSave={(patch) => saveTeam(t, patch)} disabled={busy} />
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="font-semibold mb-3">Users</h2>
        <div className="space-y-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded hover:bg-zinc-800/30">
              <div>
                <div className="font-medium">
                  {u.username} <span className="text-xs text-zinc-400">({u.email})</span>
                </div>
                <div className="text-xs text-zinc-500">{u.role}</div>
              </div>
              {u.id !== me?.id &&
                (u.role !== "ADMIN" ? (
                  <button onClick={() => run(() => api.post(`/admin/promote/${u.id}`).then(loadUsers), "User promoted")} className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
                    Promote
                  </button>
                ) : (
                  <button onClick={() => run(() => api.post(`/admin/demote/${u.id}`).then(loadUsers), "User demoted")} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">
                    Demote
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TeamRow({ team, onSave, disabled }: { team: Constructor; onSave: (patch: Partial<Constructor>) => void; disabled: boolean }) {
  const [principal, setPrincipal] = useState(team.teamPrincipal || "");
  const [logo, setLogo] = useState(team.logoUrl || "");
  const changed = principal !== (team.teamPrincipal || "") || logo !== (team.logoUrl || "");
  return (
    <div className="flex flex-wrap items-center gap-3 p-2 rounded hover:bg-zinc-800/30">
      <span className="w-3 h-3 rounded-full" style={{ background: team.color ? `#${team.color}` : "#555" }} />
      <TeamLogo url={logo || null} name={team.name} size={32} />
      <span className="font-medium w-32">{team.name}</span>
      <input
        value={principal}
        onChange={(e) => setPrincipal(e.target.value)}
        placeholder="Team principal"
        className="flex-1 min-w-36 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm"
      />
      <input
        value={logo}
        onChange={(e) => setLogo(e.target.value)}
        placeholder="Logo URL (https://…)"
        className="flex-1 min-w-48 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm font-mono text-xs"
      />
      <span className="font-mono text-sm text-zinc-400 w-16 text-right">${team.price}M</span>
      <button
        disabled={!changed || disabled}
        onClick={() => onSave({ teamPrincipal: principal, logoUrl: logo || null })}
        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded text-sm"
      >
        Save
      </button>
    </div>
  );
}
