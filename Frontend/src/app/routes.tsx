import { createBrowserRouter, useRouteError, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { League } from "./pages/League";
import { TeamBuilder } from "./pages/TeamBuilder";
import { Results } from "./pages/Results";
import { Leaderboard } from "./pages/Leaderboard";
import { Admin } from "./pages/Admin";
import { LiveRace } from "./pages/LiveRace";
import { Replay } from "./pages/Replay";
import { Races } from "./pages/Races";
import { Profile } from "./pages/Profile";
import { Rules } from "./pages/Rules";
import { DriverPage } from "./pages/DriverPage";
import { Grid } from "./pages/Grid";

function ErrorBoundary() {
  const error = useRouteError();
  console.error(error);
  const message =
    error && typeof error === "object" && "statusText" in error
      ? `${(error as any).status} ${(error as any).statusText}`
      : error instanceof Error
        ? error.message
        : "Something went wrong.";

  return (
    <div className="p-8 bg-zinc-950 text-white min-h-screen flex flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-bold mb-4">Something went wrong</h1>
      <p className="text-zinc-400 max-w-xl">{message}</p>
      <a href="/" className="mt-8 px-6 py-3 bg-red-600 hover:bg-red-500 shadow-lg shadow-red-950/40 rounded-lg font-bold transition-colors">
        Return to Home
      </a>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/login", Component: Login, errorElement: <ErrorBoundary /> },
  { path: "/register", Component: Register, errorElement: <ErrorBoundary /> },
  {
    path: "/",
    Component: Layout,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, Component: Dashboard },
      { path: "league", Component: League },
      { path: "league/:leagueId", Component: League },
      { path: "league/:leagueId/race/:raceId/team-builder", Component: TeamBuilder },
      { path: "league/:leagueId/race/:raceId/results", Component: Results },
      { path: "league/:leagueId/race/:raceId/live", Component: LiveRace },
      { path: "league/:leagueId/race/:raceId/replay", Component: Replay },
      { path: "race/:raceId/live", Component: LiveRace },
      { path: "race/:raceId/replay", Component: Replay },
      { path: "race/:raceId/results", Component: Results },
      { path: "races", Component: Races },
      { path: "live", element: <Navigate to="/races" replace /> },
      { path: "profile", Component: Profile },
      { path: "rules", Component: Rules },
      { path: "driver/:driverId", Component: DriverPage },
      { path: "grid", Component: Grid },
      { path: "admin", Component: Admin },
      { path: "leaderboard", Component: Leaderboard },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
