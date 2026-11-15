export type Constructor = {
  id: number;
  name: string;
  price: number;
  points: number;
  active: boolean;
  nationality?: string | null;
  teamPrincipal?: string | null;
  color?: string | null;
  logoUrl?: string | null;
  wins?: number;
  championshipPosition?: number | null;
  drivers?: Driver[];
};

export type Driver = {
  id: number;
  name: string;
  code?: string | null;
  number?: number | null;
  price: number;
  points: number;
  active: boolean;
  nationality?: string | null;
  headshotUrl?: string | null;
  wins?: number;
  championshipPosition?: number | null;
  constructor?: Constructor | null;
};

export type RaceStatus = "SCHEDULED" | "ONGOING" | "RESULTS_PENDING" | "COMPLETED";

export type Race = {
  id: number;
  name: string;
  circuit?: string | null;
  country?: string | null;
  locality?: string | null;
  round?: number | null;
  season: number;
  raceDate: string;
  raceStart: string;
  raceEnd?: string | null;
  lockAt?: string | null;
  qualifyingStart?: string | null;
  sprintStart?: string | null;
  totalLaps?: number | null;
  openf1SessionKey?: number | null;
  status: RaceStatus;
  team_locked: boolean;
  live: boolean;
  replay_available: boolean;
};

export type LeagueSummary = {
  id: number;
  name: string;
  code?: string;
  type?: "PUBLIC" | "PRIVATE";
  member_count?: number;
  is_member?: boolean;
  ownerId?: number | null;
};

export type LeagueDetails = LeagueSummary & {
  members: { userId: number; username: string }[];
};

export type LeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  season_total: number;
  races_played: number;
};

export type RaceLeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  total_pts: number;
};

export type ResultRow = {
  driver_id: number;
  driver_name: string;
  driver_code?: string | null;
  driver_number?: number | null;
  headshot_url?: string | null;
  constructor_name?: string | null;
  team_color?: string | null;
  finish_pos: number | null;
  fastest_lap: boolean;
  dnf: boolean;
  points: number;
  quali_pos?: number | null;
  sprint_pos?: number | null;
  sprint_dnf?: boolean;
  points_breakdown?: { race: number; sprint: number; quali: number };
};

export type RaceEvent = { lap: number; type: "start" | "overtake" | "dnf" | "fastest_lap" | "pit" | "finish"; text: string };

export type RaceSnapshot = {
  raceId: number;
  name: string;
  circuit?: string | null;
  status: RaceStatus;
  live: boolean;
  mode: "simulated" | "replay" | null;
  lap: number | null;
  totalLaps: number | null;
  events: RaceEvent[];
  order: ResultRow[];
  updatedAt: string;
};

export type ReplayFrame = { lap: number; order: number[]; dnf: number[]; fl: number | null; events: Omit<RaceEvent, "lap">[] };

export type ReplayData = {
  race: { id: number; name: string; circuit?: string | null; round?: number | null; season: number };
  totalLaps: number;
  drivers: { id: number; name: string; code?: string | null; number?: number | null; headshotUrl?: string | null; constructorId: number | null; constructorName: string | null; color: string | null }[];
  frames: ReplayFrame[];
  preRace: Record<number, { quali: number; sprint: number }>;
  teams: {
    userId: number;
    username: string;
    driverIds: number[];
    constructorId: number | null;
    captainId: number | null;
    predictions: Record<number, number>;
  }[];
};
