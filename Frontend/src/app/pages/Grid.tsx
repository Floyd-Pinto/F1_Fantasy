import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import type { Constructor } from "../types";
import { DriverAvatar, ErrorBox, Loading, PageHeader, TeamLogo } from "../components/common";
import { teamColor } from "../format";

/** Real current grid: teams, principals, drivers, championship points and fantasy prices. */
export function Grid() {
  const [teams, setTeams] = useState<Constructor[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<Constructor[]>("/constructors?active=true")
      .then(setTeams)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!teams) return <Loading label="Loading the grid…" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader title="Drivers & Teams">
        <p className="text-zinc-400">
          The real {new Date().getFullYear()} grid with live championship standings. Fantasy prices follow championship form and update after every race.
        </p>
      </PageHeader>

      {teams.length === 0 && <p className="text-zinc-500 text-sm">No teams yet — an admin can sync real data from the Admin page.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {teams.map((team) => (
          <div key={team.id} className="surface overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: teamColor(team.color) }} />
            <div className="p-5">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="flex items-start gap-3">
                  <TeamLogo url={team.logoUrl} name={team.name} size={52} />
                  <div>
                  <div className="text-xs text-zinc-500 font-bold uppercase">
                    {team.championshipPosition ? `P${team.championshipPosition} in constructors'` : "Constructor"}
                  </div>
                  <h2 className="text-xl font-bold text-white">{team.name}</h2>
                  <div className="text-sm text-zinc-400 mt-1">
                    Team principal: <span className="text-zinc-200">{team.teamPrincipal || "—"}</span>
                  </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-2xl text-white">{team.points}</div>
                  <div className="text-xs text-zinc-500">pts · {team.wins ?? 0} wins</div>
                  <div className="font-mono text-sm text-green-400 mt-1">${team.price.toFixed(1)}M</div>
                </div>
              </div>

              <div className="space-y-2">
                {(team.drivers || []).map((d) => (
                  <Link to={`/driver/${d.id}`} key={d.id} className="flex items-center gap-3 bg-zinc-950/50 rounded-lg p-2.5 hover:bg-zinc-800/60 transition-colors">
                    <DriverAvatar url={d.headshotUrl} name={d.name} color={team.color} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white truncate">
                        {d.name} {d.number != null && <span className="text-zinc-500 font-mono text-sm">#{d.number}</span>}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {d.nationality} · {d.championshipPosition ? `P${d.championshipPosition}` : "—"} · {d.points} pts
                      </div>
                    </div>
                    <div className="font-mono text-sm text-green-400">${d.price.toFixed(1)}M</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-600">
        Data: Jolpica-F1 (standings, results, calendar) and OpenF1 (numbers, colours, headshots). Team logos and photos of drivers without an
        official headshot come from Wikipedia / Wikimedia Commons under their respective licences; logos are trademarks of their teams. Team
        principals are maintained manually.
      </p>
    </div>
  );
}
