import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatLeaves } from "@/lib/utils";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NavLink from "./nav-link";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, balance, is_admin")
    .eq("id", user.id)
    .single();

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
            <span className="text-accent font-bold text-lg">TimberMarket</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <NavLink href="/markets">Markets</NavLink>
            <NavLink href="/portfolio">Portfolio</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            <NavLink href="/trades">Trades</NavLink>
            {profile?.is_admin && (
              <NavLink href="/admin">Admin</NavLink>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="text-sm">
            <Link
              href="/portfolio"
              className="text-foreground hover:text-accent transition-colors mr-1"
            >
              {profile?.username}
            </Link>
            <span className="text-accent font-medium">
              {formatLeaves(profile?.balance ?? 0)} leaves
            </span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
