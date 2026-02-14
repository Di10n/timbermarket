import Link from "next/link";
import Image from "next/image";
import { formatLeaves } from "@/lib/utils";
import ThemeToggle from "@/components/theme-toggle";
import NavLink from "@/components/nav-link";
import LogoutButton from "@/components/logout-button";

interface HomeTopBarProps {
  user: { id: string } | null;
  profile: { username: string; balance: number } | null;
}

export default function HomeTopBar({ user, profile }: HomeTopBarProps) {
  return (
    <nav className="bg-background sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between border-b border-border">
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
            <NavLink href="/markets">Markets</NavLink>
            <NavLink href="/portfolio">Portfolio</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            <NavLink href="/trades">Trades</NavLink>
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
                  {formatLeaves(profile.balance)} 🍃
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
                className="text-sm font-medium text-accent hover:text-accent-hover transition-colors"
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
