import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatLeaves } from "@/lib/utils";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NavLink from "./nav-link";
import LeafIcon from "./leaf-icon";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("username, balance, is_admin")
        .eq("id", user.id)
        .single()
    : { data: null };

  return (
    <nav className="bg-background sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/timbermarket_logo.svg"
              alt="Timbermarket"
              width={36}
              height={36}
              className="shrink-0"
            />
            <span className="text-accent font-bold text-base sm:text-lg font-[family-name:var(--font-gaegu)]">Timbermarket</span>
          </Link>
          {/* Desktop nav - hide on mobile */}
          <div className="hidden lg:flex items-center gap-4 text-sm">
            <NavLink href="/portfolio">Portfolio</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            {profile?.is_admin && <NavLink href="/admin">Admin</NavLink>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && profile ? (
            <div className="text-sm">
              <Link
                href="/portfolio"
                className="text-foreground hover:text-accent transition-colors mr-1"
              >
                {profile.username}
              </Link>
              <span className="text-accent font-medium">
                {formatLeaves(profile.balance)} <LeafIcon />
              </span>
            </div>
          ) : (
            <Link
              href="/signup"
              className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
            >
              Sign up
            </Link>
          )}
          {/* Mobile nav - show only on mobile */}
          <div className="lg:hidden">
            <details className="relative">
              <summary className="list-none cursor-pointer p-2 min-h-[44px] min-w-[44px] flex items-center justify-center border border-border rounded hover:bg-card-hover">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </summary>
              <nav className="fixed right-2 top-[60px] bg-card border border-border rounded-lg shadow-lg min-w-[180px] max-w-[calc(100vw-16px)] z-50 overflow-hidden">
                <NavLink href="/portfolio" className="block px-4 py-3 hover:bg-card-hover border-b border-border">Portfolio</NavLink>
                <NavLink href="/leaderboard" className="block px-4 py-3 hover:bg-card-hover border-b border-border">Leaderboard</NavLink>
                {profile?.is_admin && <NavLink href="/admin" className="block px-4 py-3 hover:bg-card-hover border-b border-border">Admin</NavLink>}
                {user && <LogoutButton className="w-full text-left block px-4 py-3 hover:bg-card-hover text-foreground" />}
              </nav>
            </details>
          </div>
        </div>
      </div>
    </nav>
  );
}
