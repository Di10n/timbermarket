import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatLeaves } from "@/lib/utils";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NavLink from "./nav-link";

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
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/timbermarket_logo.svg"
              alt="TimberMarket"
              width={36}
              height={36}
              className="shrink-0"
            />
            <span className="text-accent font-bold text-lg font-[family-name:var(--font-gaegu)]">TimberMarket</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <NavLink href="/portfolio">Portfolio</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            <NavLink href="/trades">Trades</NavLink>
            {profile?.is_admin && <NavLink href="/admin">Admin</NavLink>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && profile ? (
            <>
              <div className="text-sm">
                <Link
                  href="/portfolio"
                  className="text-foreground hover:text-accent transition-colors mr-1"
                >
                  {profile.username}
                </Link>
                <span className="text-accent font-medium">
                  {formatLeaves(profile.balance)} leaves
                </span>
              </div>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
