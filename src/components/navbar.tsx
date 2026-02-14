import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatLeaves } from "@/lib/utils";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";

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
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
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
            <Link
              href="/markets"
              className="text-muted hover:text-foreground transition-colors"
            >
              Markets
            </Link>
            <Link
              href="/leaderboard"
              className="text-muted hover:text-foreground transition-colors"
            >
              Leaderboard
            </Link>
            {profile?.is_admin && (
              <Link
                href="/admin"
                className="text-muted hover:text-foreground transition-colors"
              >
                Admin
              </Link>
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
