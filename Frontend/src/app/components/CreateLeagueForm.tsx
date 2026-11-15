import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api";

export function CreateLeagueForm({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      const league = await api.post("/leagues/create", { name: name.trim(), league_type: type });
      onDone?.();
      navigate(`/league/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        placeholder="League name"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-red-600/50"
      />
      <div className="grid grid-cols-2 gap-2">
        {(["PRIVATE", "PUBLIC"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              type === t ? "bg-red-600/20 border-red-600/60 text-red-300" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {t === "PRIVATE" ? "Private · invite code" : "Public · anyone can join"}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {submitting ? "Creating…" : "Create league"}
      </button>
    </form>
  );
}
