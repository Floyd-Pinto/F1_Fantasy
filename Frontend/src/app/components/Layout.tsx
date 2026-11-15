import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  BookOpen,
  Car,
  ChevronDown,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LeagueDropdown } from "./LeagueDropdown";
import { api, session } from "../api";

type NavItem = { name: string; path: string; icon: ReactNode };

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 group">
      <span className="livery relative w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-red-950/50 -skew-x-6">
        <span className="font-display font-black italic text-white text-lg skew-x-6">F1</span>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display font-black italic uppercase text-xl tracking-tight">Fantasy</span>
          <span className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-1">{new Date().getFullYear()} season</span>
        </span>
      )}
    </Link>
  );
}

export function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const authed = Boolean(session.token());
  const user = session.user();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setLeagueDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!authed) navigate("/login", { replace: true });
  }, [authed, navigate]);

  // Close menus on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setLeagueDropdownOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // logout is client-side anyway
    } finally {
      session.clear();
      navigate("/login", { replace: true });
    }
  };

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "Play",
      items: [
        { name: "Dashboard", path: "/", icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
        { name: "Races", path: "/races", icon: <Flag className="w-[18px] h-[18px]" /> },
      ],
    },
    {
      title: "Stats",
      items: [
        { name: "Drivers & Teams", path: "/grid", icon: <Car className="w-[18px] h-[18px]" /> },
        { name: "Global Leaderboard", path: "/leaderboard", icon: <Trophy className="w-[18px] h-[18px]" /> },
      ],
    },
    {
      title: "You",
      items: [
        { name: "Profile", path: "/profile", icon: <User className="w-[18px] h-[18px]" /> },
        { name: "How to Play", path: "/rules", icon: <BookOpen className="w-[18px] h-[18px]" /> },
        ...(user?.role === "ADMIN" ? [{ name: "Admin", path: "/admin", icon: <Shield className="w-[18px] h-[18px]" /> }] : []),
      ],
    },
  ];

  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  if (!authed) return null;

  const navLink = (item: NavItem, large = false) => {
    const active = isActive(item.path);
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`relative flex items-center gap-3 px-3 ${large ? "py-3.5 text-base" : "py-2.5 text-sm"} rounded-xl font-medium transition-colors ${
          active ? "bg-white/[0.06] text-white" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03]"
        }`}
      >
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-red-500" />}
        <span className={active ? "text-red-400" : ""}>{item.icon}</span>
        {item.name}
      </Link>
    );
  };

  const leaguesButton = (large = false) => (
    <button
      onClick={() => setLeagueDropdownOpen(!leagueDropdownOpen)}
      className={`w-full flex items-center gap-3 px-3 ${large ? "py-3.5 text-base" : "py-2.5 text-sm"} rounded-xl font-medium transition-colors ${
        leagueDropdownOpen || location.pathname.startsWith("/league") ? "bg-white/[0.06] text-white" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.03]"
      }`}
    >
      <Users className="w-[18px] h-[18px]" />
      Leagues
      <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${leagueDropdownOpen ? "rotate-180" : ""}`} />
    </button>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
      <Link to="/profile" className="flex items-center gap-3 min-w-0 flex-1">
        <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center font-display font-bold text-sm uppercase shrink-0">
          {user?.username?.slice(0, 2) || "?"}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white truncate">{user?.username}</span>
          <span className="block text-[11px] text-zinc-500">{user?.role === "ADMIN" ? "Admin" : "Player"}</span>
        </span>
      </Link>
      <button onClick={handleLogout} title="Log out" aria-label="Log out" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06]">
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen text-zinc-100">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 left-0 z-50 border-r border-white/[0.06] bg-zinc-950/70 backdrop-blur-xl">
        <div className="px-5 pt-6 pb-5">
          <Logo />
        </div>

        <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">{section.title}</div>
              <div className="space-y-0.5">
                {section.items.map((item) => navLink(item))}
                {section.title === "Play" && (
                  <div ref={dropdownRef} className="relative">
                    {leaguesButton()}
                    {leagueDropdownOpen && <LeagueDropdown onClose={() => setLeagueDropdownOpen(false)} />}
                  </div>
                )}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3">{userCard}</div>
      </aside>

      {/* Header (mobile) */}
      <div className="md:hidden flex items-center justify-between px-4 h-16 bg-zinc-950/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-50">
        <Logo compact />
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-zinc-400 hover:text-white" aria-label="Menu">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Menu (mobile) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-zinc-950/95 backdrop-blur-xl z-40 p-4 flex flex-col gap-1 overflow-y-auto animate-in fade-in duration-150">
          {sections.flatMap((s) => s.items).map((item) => navLink(item, true))}
          {leaguesButton(true)}
          {leagueDropdownOpen && <LeagueDropdown onClose={() => setLeagueDropdownOpen(false)} />}
          <div className="mt-auto pt-4">{userCard}</div>
        </div>
      )}

      <main className="md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
