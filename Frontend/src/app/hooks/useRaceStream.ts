import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import type { RaceSnapshot } from "../types";

/**
 * Subscribes to a race's Server-Sent Events feed. The server pushes a full snapshot every lap;
 * EventSource reconnects automatically if the connection drops.
 */
export function useRaceStream(raceId: number | string | undefined | null) {
  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!raceId) return;
    setSnapshot(null);
    const source = new EventSource(`${API_BASE}/races/${raceId}/live`);
    source.addEventListener("update", (e) => {
      try {
        setSnapshot(JSON.parse((e as MessageEvent).data));
      } catch {
        // ignore malformed frames
      }
    });
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [raceId]);

  return { snapshot, connected };
}
