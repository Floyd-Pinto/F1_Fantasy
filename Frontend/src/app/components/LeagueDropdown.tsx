import { Link, useNavigate } from "react-router";
import { Plus, Search, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../api";
import type { LeagueSummary } from "../types";

export function LeagueDropdown({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [userLeagues, setUserLeagues] = useState<LeagueSummary[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.get<LeagueSummary[]>("/leagues"), api.get<LeagueSummary[]>("/leagues/public")])
      .then(([mine, pub]) => {
        if (!mounted) return;
        setUserLeagues(mine);
        setPublicLeagues(pub.filter((l) => !l.is_member));
      })
      .catch((err) => mounted && setError(err.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const join = async (code: string) => {
    if (!code.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.post("/leagues/join", { code: code.trim().toUpperCase() });
      onClose();
      navigate(`/league/${res.league.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="md:hidden fixed inset-0 top-[69px] bg-black/40 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-2 md:left-full md:ml-2 w-full md:w-auto min-w-0 md:min-w-[18rem] max-w-full md:max-w-md surface rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Leagues</h3>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && <div className="px-4 pt-3 pb-2 text-xs text-zinc-400">Loading leagues…</div>}
          {error && <div className="px-4 pt-3 pb-2 text-xs text-red-400">{error}</div>}

          {userLeagues.length > 0 && (
            <div className="px-4 pt-3 pb-2 border-b border-zinc-800">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Your Leagues</p>
              <div className="space-y-1">
                {userLeagues.map((league) => (
                  <Link
                    key={league.id}
                    to={`/league/${league.id}`}
                    onClick={onClose}
                    className="flex justify-between items-start px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800/50 hover:text-white rounded transition-colors group"
                  >
                    <div>
                      <div className="font-medium group-hover:text-red-400 transition-colors">{league.name}</div>
                      <div className="text-xs text-zinc-500">{league.member_count} members</div>
                    </div>
                    <span className="text-xs text-zinc-600 group-hover:text-red-400">#{league.code}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {publicLeagues.length > 0 && (
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Public Leagues</p>
              <div className="space-y-1">
                {publicLeagues.slice(0, 3).map((league) => (
                  <button
                    key={league.id}
                    onClick={() => join(league.code!)}
                    disabled={loading}
                    className="w-full text-left px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white rounded transition-colors group flex items-start justify-between"
                    title="Join this league"
                  >
                    <div>
                      <div className="font-medium group-hover:text-red-400 transition-colors">{league.name}</div>
                      <div className="text-xs text-zinc-600">{league.member_count} members</div>
                    </div>
                    <LogIn className="w-4 h-4 text-zinc-600 group-hover:text-red-400 transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Join League</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && join(joinCode)}
                maxLength={6}
                className="flex-1 min-w-0 px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-red-600/50 transition-colors"
              />
              <button
                onClick={() => join(joinCode)}
                disabled={loading || !joinCode.trim()}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                aria-label="Join league with code"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-3">
            <Link
              to="/league"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 hover:text-red-300 rounded font-medium text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Browse or create leagues
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
