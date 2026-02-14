import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatLeaves } from "@/lib/utils";
import LogoutButton from "./logout-button";
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
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/markets" className="text-accent font-bold text-lg">
            Timbermarket
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

        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted mr-1">
              {profile?.username}
            </span>
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
