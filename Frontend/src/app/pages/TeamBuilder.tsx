import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { Lock, Check, CircleAlert, ChevronLeft, Crown, Repeat, Target } from "lucide-react";
import { api, ApiError } from "../api";
import type { Constructor, Driver } from "../types";
import { DriverAvatar, TeamLogo, TeamStripe } from "../components/common";
import { formatDateTime, timeUntil } from "../format";

type Race = {
  id: number;
  name: string;
  raceStart: string;
  lockAt?: string | null;
  sprintStart?: string | null;
  status: string;
  team_locked?: boolean;
};

type League = {
  id: number;
  name: string;
};

type SavedTeam = {
  locked: boolean;
  driverIds: number[];
  constructorId: number | null;
  captainId: number | null;
  carriedOver?: boolean;
  predictions: { driverId: number; predictedPosition: number | null }[];
  fromRace?: string;
};

const DEFAULT_PRICE = 10.0;

// Championship points per $M — the "bang for buck" when building under budget.
const value = (d: Driver) => d.points / d.price;

type SortKey = "priceDesc" | "priceAsc" | "value" | "team";

const SORTS: Record<SortKey, { label: string; title: string; compare: (a: Driver, b: Driver) => number }> = {
  priceDesc: { label: "Price ↓", title: "Most expensive first", compare: (a, b) => b.price - a.price },
  priceAsc: { label: "Price ↑", title: "Cheapest first", compare: (a, b) => a.price - b.price },
  value: { label: "Value", title: "Championship points per $M", compare: (a, b) => value(b) - value(a) || b.points - a.points },
  team: {
    label: "Team",
    title: "Grouped by team",
    compare: (a, b) => (a.constructor?.name || "").localeCompare(b.constructor?.name || "") || b.price - a.price,
  },
};

function normalizePrice(value: unknown) {
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) ? price : DEFAULT_PRICE;
}

export function TeamBuilder() {
  const { leagueId, raceId } = useParams();
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [selectedConstructor, setSelectedConstructor] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [constructors, setConstructors] = useState<Constructor[]>([]);
  const [race, setRace] = useState<Race | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [BUDGET, setBudget] = useState(100);
  // Prices are derived from championship position, so "price" and "points" would give the same
  // order — offer sorts that actually differ instead.
  const [sort, setSort] = useState<SortKey>("priceDesc");
  const [captain, setCaptain] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Record<string, number | null>>({});
  const [carriedOver, setCarriedOver] = useState(false);

  const applyTeam = (team: SavedTeam, withPredictions: boolean) => {
    setSelectedDrivers(team.driverIds.map(String));
    setSelectedConstructor(team.constructorId ? String(team.constructorId) : null);
    setCaptain(team.captainId ? String(team.captainId) : null);
    setPredictions(
      withPredictions ? Object.fromEntries(team.predictions.map((p) => [String(p.driverId), p.predictedPosition])) : {}
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function loadTeamBuilder() {
      if (!leagueId || !raceId) {
        setLoading(false);
        setError("Missing league or race.");
        return;
      }

      try {
        setLoading(true);
        setError("");
        setNotice("");

        const [leagueData, raceData, driverData, constructorData, config] = await Promise.all([
          api.get(`/leagues/${leagueId}`),
          api.get(`/races/${raceId}`),
          api.get("/drivers?active=true"),
          api.get("/constructors?active=true"),
          api.get("/config").catch(() => null),
        ]);
        if (config?.teamBudget) setBudget(config.teamBudget);

        let savedTeam: SavedTeam | null = null;

        try {
          savedTeam = await api.get(`/teams/${raceId}?leagueId=${leagueId}`);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) {
            throw err;
          }
        }

        if (cancelled) return;

        const activeDrivers = (driverData as Driver[])
          .filter((driver) => driver.active !== false)
          .map((driver) => ({
            ...driver,
            price: normalizePrice(driver.price),
          }));

        const activeConstructors = (constructorData as Constructor[])
          .filter((constructor) => constructor.active !== false)
          .map((constructor) => ({
            ...constructor,
            price: normalizePrice(constructor.price),
          }));

        setLeague(leagueData);
        setRace(raceData);
        setDrivers(activeDrivers);
        setConstructors(activeConstructors);

        if (savedTeam) {
          applyTeam(savedTeam, true);
          setCarriedOver(Boolean(savedTeam.carriedOver));
          setIsLocked(savedTeam.locked || Boolean(raceData.team_locked));
        } else {
          setIsLocked(Boolean(raceData.team_locked));
          // No team yet: start from last race's team (predictions are race-specific, so not copied).
          if (!raceData.team_locked) {
            const previous: SavedTeam | null = await api.get(`/teams/previous/${raceId}?leagueId=${leagueId}`).catch(() => null);
            if (previous && !cancelled) {
              applyTeam(previous, false);
              setNotice(`Prefilled with your team from ${previous.fromRace}. Save to confirm it, or change it. If you don't, it carries over automatically.`);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load team builder");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTeamBuilder();

    return () => {
      cancelled = true;
    };
  }, [leagueId, raceId]);
  
  const sortedDrivers = useMemo(
    () => [...drivers].sort(SORTS[sort].compare),
    [drivers, sort]
  );
  const driverById = useMemo(() => new Map(drivers.map((driver) => [String(driver.id), driver])), [drivers]);
  const constructorById = useMemo(() => new Map(constructors.map((constructor) => [String(constructor.id), constructor])), [constructors]);

  const currentCost = [
    ...selectedDrivers.map(id => driverById.get(id)?.price || 0),
    selectedConstructor ? (constructorById.get(selectedConstructor)?.price || 0) : 0
  ].reduce((a, b) => a + b, 0);
  
  const remainingBudget = BUDGET - currentCost;
  const isComplete = selectedDrivers.length === 5 && selectedConstructor !== null;
  const predicted = selectedDrivers.map((id) => predictions[id]).filter((p): p is number => p != null);
  const duplicatePrediction = new Set(predicted).size !== predicted.length;
  const isOverBudget = remainingBudget < 0;

  const toggleDriver = (id: string) => {
    if (isLocked) return;
    if (selectedDrivers.includes(id)) {
      setSelectedDrivers(selectedDrivers.filter(dId => dId !== id));
      if (captain === id) setCaptain(null);
      setPredictions(({ [id]: _, ...rest }) => rest);
    } else {
      if (selectedDrivers.length < 5) {
        setSelectedDrivers([...selectedDrivers, id]);
      }
    }
  };

  // Picking another constructor swaps it in directly.
  const toggleConstructor = (id: string) => {
    if (isLocked) return;
    setSelectedConstructor(selectedConstructor === id ? null : id);
  };

  const saveTeam = async () => {
    if (!leagueId || !raceId || !selectedConstructor || !isComplete || isOverBudget) return false;

    try {
      setSaving(true);
      setError("");
      setNotice("");

      await api.post("/teams/build", {
        leagueId: Number(leagueId),
        raceId: Number(raceId),
        predictions: selectedDrivers.map((id) => ({ driverId: Number(id), predictedPosition: predictions[id] ?? null })),
        constructorId: Number(selectedConstructor),
        captainId: captain ? Number(captain) : null,
      });

      setCarriedOver(false);
      setNotice("Team saved. You can keep editing until the team lock.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save team");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const lockTeam = async () => {
    if (!leagueId || !raceId) return;

    try {
      setSaving(true);
      setError("");
      setNotice("");

      if (!window.confirm("Locking is final — you won't be able to change this team. Lock it?")) return;
      const saved = await saveTeam();
      if (!saved) return;

      await api.post("/teams/lock", {
        leagueId: Number(leagueId),
        raceId: Number(raceId),
      });

      setIsLocked(true);
      setNotice("Team locked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lock team");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-zinc-400">Loading team builder...</div>;
  }

  if (!league || !race) {
    return (
      <div className="space-y-4">
        <Link to="/league" className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium">
          <ChevronLeft className="w-4 h-4" />
          Back to Leagues
        </Link>
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 rounded-xl p-4">
          {error || "Team builder could not be loaded."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-2">
        <Link to={`/league/${league.id}`} className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm font-medium">
          <ChevronLeft className="w-4 h-4" />
          Back to {league.name}
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-block bg-zinc-800 text-zinc-300 font-bold text-xs px-2 py-1 rounded border border-zinc-700 mb-3">
            {race.name}
          </div>
          <h1 className="text-3xl font-bold uppercase italic tracking-tight">Team Builder</h1>
          <p className="text-zinc-400 mt-1">Select 5 drivers and 1 constructor within the ${BUDGET}M budget.</p>
          {!isLocked && (
            <p className="text-xs text-zinc-500 mt-1">
              Teams lock when {race.sprintStart ? "the sprint weekend" : "qualifying"} starts: {formatDateTime(race.lockAt || race.raceStart)} (in{" "}
              {timeUntil(race.lockAt || race.raceStart)}). <Link to="/rules" className="text-red-400 hover:text-red-300">Scoring rules</Link>
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3 bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-800">
          <div className="text-sm text-zinc-400">Budget Remaining:</div>
          <div className={`text-xl font-bold font-mono ${isOverBudget ? 'text-red-500' : 'text-green-500'}`}>
            ${remainingBudget.toFixed(1)}M
          </div>
        </div>
      </div>

      {isLocked && (
        <div className="bg-amber-950/30 border border-amber-900/50 text-amber-500 p-4 rounded-xl flex items-center gap-3">
          <Lock className="w-5 h-5" />
          <p className="font-medium">Your team is locked for {race.name}. Editing is disabled.</p>
        </div>
      )}

      {carriedOver && (
        <div className="bg-blue-950/20 border border-blue-900/40 text-blue-300 p-4 rounded-xl flex items-center gap-3 text-sm">
          <Repeat className="w-5 h-5 shrink-0" />
          You didn't pick a team for this race, so your previous team carried over automatically.
        </div>
      )}

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 rounded-xl p-4">
          {error}
        </div>
      )}

      {notice && (
        <div className="bg-green-950/20 border border-green-900/30 text-green-400 rounded-xl p-4">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Roster Selection */}
        <div className="lg:col-span-2 space-y-8">
          {/* Drivers */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase italic">Drivers ({selectedDrivers.length}/5)</h2>
              <div className="flex gap-1 text-xs">
                {(Object.keys(SORTS) as SortKey[]).map((k) => (
                  <button key={k} onClick={() => setSort(k)} title={SORTS[k].title} className={`px-2.5 py-1 rounded ${sort === k ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                    {SORTS[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sortedDrivers.map(driver => {
                const driverId = String(driver.id);
                const isSelected = selectedDrivers.includes(driverId);
                return (
                  <button
                    key={driver.id}
                    onClick={() => toggleDriver(driverId)}
                    disabled={isLocked || (!isSelected && selectedDrivers.length >= 5)}
                    className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? "bg-red-950/20 border-red-600" 
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-600 disabled:opacity-50 disabled:hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <DriverAvatar url={driver.headshotUrl} name={driver.name} color={driver.constructor?.color} />
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{driver.name}</div>
                        <div className="text-xs text-zinc-500 uppercase font-medium mt-0.5">
                          {driver.constructor?.name || "No constructor"} · {driver.points} pts
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-zinc-300">${driver.price.toFixed(1)}M</div>
                      {isSelected && <Check className="w-4 h-4 text-red-500 inline-block mt-1" />}
                    </div>
                  </button>
                );
              })}
              {drivers.length === 0 && (
                <div className="text-sm text-zinc-500">No active drivers available.</div>
              )}
            </div>
          </section>

          {/* Constructors */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase italic">Constructor ({selectedConstructor ? 1 : 0}/1)</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {constructors.map(constructor => {
                const constructorId = String(constructor.id);
                const isSelected = selectedConstructor === constructorId;
                return (
                  <button
                    key={constructor.id}
                    onClick={() => toggleConstructor(constructorId)}
                    disabled={isLocked}
                    className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? "bg-blue-950/20 border-blue-600" 
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-600 disabled:opacity-50 disabled:hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <TeamStripe color={constructor.color} />
                      <TeamLogo url={constructor.logoUrl} name={constructor.name} size={36} />
                      <div>
                        <div className="font-bold text-white">{constructor.name}</div>
                        <div className="text-xs text-zinc-500">{constructor.teamPrincipal || ""} · {constructor.points} pts</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-zinc-300">${constructor.price.toFixed(1)}M</div>
                      {isSelected && <Check className="w-4 h-4 text-blue-500 inline-block mt-1" />}
                    </div>
                  </button>
                );
              })}
              {constructors.length === 0 && (
                <div className="text-sm text-zinc-500">No active constructors available.</div>
              )}
            </div>
          </section>
        </div>

        {/* Team Summary Sidebar */}
        <div className="space-y-4 relative">
          <div className="sticky top-24 surface p-6">
            <h3 className="text-lg font-bold uppercase italic mb-4 pb-4 border-b border-zinc-800">Your Lineup</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <div className="text-xs text-zinc-500 font-bold uppercase mb-2">Drivers</div>
                {Array.from({ length: 5 }).map((_, i) => {
                  const driverId = selectedDrivers[i];
                  const driver = driverId ? driverById.get(driverId) : null;
                  const isCaptain = driverId && captain === driverId;
                  return (
                    <div key={i} className="py-2 border-b border-zinc-800/50 last:border-0">
                      <div className="flex justify-between items-center gap-2">
                        <span className={`truncate ${driver ? "text-white font-medium" : "text-zinc-600 italic"}`}>
                          {driver ? driver.name : `Empty Slot ${i + 1}`}
                        </span>
                        {driver && <span className="text-xs font-mono text-zinc-400 shrink-0">${driver.price.toFixed(1)}M</span>}
                      </div>
                      {driver && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <button
                            onClick={() => !isLocked && setCaptain(isCaptain ? null : driverId)}
                            disabled={isLocked}
                            title="Captain: this driver's points are doubled"
                            className={`flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded border transition-colors ${
                              isCaptain ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300" : "border-zinc-700 text-zinc-500 hover:text-zinc-200"
                            }`}
                          >
                            <Crown className="w-3 h-3" /> {isCaptain ? "Captain ×2" : "Captain"}
                          </button>
                          <label className="flex items-center gap-1 text-[11px] text-zinc-500" title="Predict the finishing position: exact +5, one off +2">
                            <Target className="w-3 h-3" />
                            <select
                              value={predictions[driverId] ?? ""}
                              disabled={isLocked}
                              onChange={(e) => setPredictions({ ...predictions, [driverId]: e.target.value ? Number(e.target.value) : null })}
                              className="bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[11px] text-zinc-200"
                            >
                              <option value="">Predict</option>
                              {Array.from({ length: Math.max(20, drivers.length) }, (_, p) => (
                                <option key={p + 1} value={p + 1}>
                                  P{p + 1}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div>
                <div className="text-xs text-zinc-500 font-bold uppercase mb-2">Constructor</div>
                <div className="flex justify-between items-center py-2">
                  <span className={selectedConstructor ? "text-white font-medium" : "text-zinc-600 italic"}>
                    {selectedConstructor ? constructorById.get(selectedConstructor)?.name : "Empty Slot"}
                  </span>
                  {selectedConstructor && (
                    <span className="text-xs font-mono text-zinc-400">
                      ${constructorById.get(selectedConstructor)?.price.toFixed(1)}M
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!isComplete && (
              <div className="bg-amber-950/20 border border-amber-900/30 text-amber-500/80 p-3 rounded-lg text-sm flex items-start gap-2 mb-4">
                <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Select 5 drivers and 1 constructor to complete your team.</p>
              </div>
            )}

            {isComplete && !captain && !isLocked && (
              <div className="bg-yellow-950/20 border border-yellow-900/30 text-yellow-500/80 p-3 rounded-lg text-sm flex items-start gap-2 mb-4">
                <Crown className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Tip: pick a captain to double one driver's points.</p>
              </div>
            )}

            {duplicatePrediction && (
              <div className="bg-red-950/20 border border-red-900/30 text-red-500/80 p-3 rounded-lg text-sm flex items-start gap-2 mb-4">
                <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Two drivers can't be predicted in the same position.</p>
              </div>
            )}

            {isOverBudget && (
              <div className="bg-red-950/20 border border-red-900/30 text-red-500/80 p-3 rounded-lg text-sm flex items-start gap-2 mb-4">
                <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p>You are over budget. Remove some selections to proceed.</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={saveTeam}
                disabled={!isComplete || isOverBudget || duplicatePrediction || isLocked || saving}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Team"}
              </button>
              <button
                onClick={lockTeam}
                disabled={!isComplete || isOverBudget || duplicatePrediction || isLocked || saving}
                className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isLocked 
                    ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300" 
                    : "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 text-white"
                }`}
              >
                <Lock className="w-4 h-4" />
                {isLocked ? "Team Locked" : "Lock for Next Race"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
