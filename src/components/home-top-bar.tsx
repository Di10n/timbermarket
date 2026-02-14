import Link from "next/link";
import Image from "next/image";
import { formatLeaves } from "@/lib/utils";
import ThemeToggle from "@/components/theme-toggle";

interface HomeTopBarProps {
  user: { id: string } | null;
  profile: { username: string; balance: number } | null;
}

export default function HomeTopBar({ user, profile }: HomeTopBarProps) {
  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/timbermarket_logo.svg"
            alt="TimberMarket"
            width={36}
            height={36}
            className="shrink-0"
          />
          <span className="text-accent font-bold text-lg">TimberMarket</span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && profile ? (
            <>
              <span className="text-sm text-muted">
                <span className="text-accent font-medium">
                  {formatLeaves(profile.balance)} leaves
                </span>
                {" · "}
                <Link
                  href="/portfolio"
                  className="text-foreground hover:text-accent transition-colors"
                >
                  {profile.username}
                </Link>
              </span>
              <Link
                href="/markets"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Markets
              </Link>
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
