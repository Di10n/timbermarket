import Link from "next/link";
import { formatLeaves } from "@/lib/utils";

interface LeaderboardProps {
  leaders: { username: string; portfolio_value: number }[];
}

export default function Leaderboard({ leaders }: LeaderboardProps) {
  if (!leaders || leaders.length === 0) {
    return (
      <div>
        <Link href="/leaderboard" className="text-sm font-medium text-foreground hover:text-accent transition-colors mb-3 inline-block">
          Leaderboard
        </Link>
        <p className="text-sm text-muted">No users yet.</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/leaderboard" className="text-sm font-medium text-foreground hover:text-accent transition-colors mb-3 inline-block">
        Leaderboard
      </Link>
      <div>
        {leaders.slice(0, 5).map((user, i) => (
          <div
            key={user.username}
            className="flex items-center justify-between text-sm py-2 px-2 hover:bg-card-hover/30 transition-colors border-b border-border/50 last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-muted text-xs w-5 shrink-0 tabular-nums">#{i + 1}</span>
              <span className="text-foreground truncate min-w-0" title={user.username}>
                {user.username}
              </span>
            </div>
            <span className="text-accent font-medium shrink-0 ml-2">
              {formatLeaves(user.portfolio_value)}
            </span>
          </div>
        ))}
      </div>
      {leaders.length > 5 && (
        <Link href="/leaderboard" className="block text-xs text-muted hover:text-foreground transition-colors mt-2 px-2">
          View all {leaders.length} users
        </Link>
      )}
    </div>
  );
}
