import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatLeaves } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();

  if (!profile?.is_approved) redirect("/verify");

  const { data: leaders, error } = await supabase.rpc("get_leaderboard", {
    p_limit: 100,
  });

  const list = error || !leaders ? [] : (leaders as { username: string; balance: number }[]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Global Leaderboard</h1>
        <p className="text-sm text-muted">
          Ranked by total leaves. More leaves means a better rank.
        </p>
      </div>

      <div className="border-t border-border">
        {list.length === 0 ? (
          <p className="text-muted py-8 text-center">No users on the leaderboard yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((entry, i) => (
              <li
                key={entry.username}
                className="flex items-center justify-between py-4 px-2 hover:bg-card-hover/30 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-muted text-sm w-8 shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-foreground font-medium truncate" title={entry.username}>
                    {entry.username}
                  </span>
                </div>
                <span className="text-accent font-semibold shrink-0 ml-4">
                  {formatLeaves(entry.balance)} leaves
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted mt-8 text-center">
        <Link href="/" className="hover:text-foreground transition-colors">
          Back to home
        </Link>
      </p>
    </div>
  );
}
