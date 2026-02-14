import Link from "next/link";
import { formatLeaves } from "@/lib/utils";

interface LeaderboardProps {
  leaders: { username: string; balance: number }[];
}

export default function Leaderboard({ leaders }: LeaderboardProps) {
  if (!leaders || leaders.length === 0) {
    return (
      <div className="border-b border-border py-4">
        <Link href="/leaderboard" className="text-sm text-muted hover:text-foreground transition-colors mb-3 inline-block">
          Leaderboard
        </Link>
        <p className="text-sm text-muted">No users yet.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-border py-4">
      <Link href="/leaderboard" className="text-sm text-muted hover:text-foreground transition-colors mb-3 inline-block">
        Leaderboard
      </Link>

      {/* Column headers */}
      <div className="flex items-center justify-between text-xs text-muted px-2 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="w-5 shrink-0">#</span>
          <span>User</span>
        </div>
        <span>Total Value</span>
      </div>

      <div className="space-y-1.5 mt-1.5">
        {leaders.map((user, i) => (
          <div
            key={user.username}
            className="flex items-center justify-between text-sm py-1.5 px-2 hover:bg-card-hover/30 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted text-xs w-5 shrink-0">{i + 1}</span>
              <span className="text-foreground truncate min-w-0" title={user.username}>
                {user.username}
              </span>
            </div>
            <span className="text-accent font-medium shrink-0 ml-2">
              {formatLeaves(user.balance)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
