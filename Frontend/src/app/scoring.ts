// Mirrors Backend/src/scoring/scoring.js — keep the two in sync.
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
export const QUALI_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const FASTEST_LAP_BONUS = 5;
export const PREDICTION_EXACT_BONUS = 5;
export const PREDICTION_CLOSE_BONUS = 2;
export const CAPTAIN_MULTIPLIER = 2;

const pointsFor = (table: number[], position?: number | null) => (position && position >= 1 && position <= table.length ? table[position - 1] : 0);

export function driverPoints(position: number | null, dnf: boolean, fastestLap: boolean) {
  if (dnf || !position) return 0;
  return pointsFor(RACE_POINTS, position) + (fastestLap && position <= 10 ? FASTEST_LAP_BONUS : 0);
}


export function predictionBonus(predicted: number | null | undefined, finish: number | null, dnf: boolean) {
  if (!predicted || dnf || !finish) return 0;
  const diff = Math.abs(predicted - finish);
  return diff === 0 ? PREDICTION_EXACT_BONUS : diff === 1 ? PREDICTION_CLOSE_BONUS : 0;
}
