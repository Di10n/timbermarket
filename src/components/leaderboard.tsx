import Link from "next/link";
import { formatLeaves } from "@/lib/utils";
import LeafIcon from "@/components/leaf-icon";

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
    <div className="border border-border rounded-lg p-4 bg-gradient-to-br from-card via-card to-accent/5" style={{ maxHeight: '500px' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Leaderboard</h3>
        <Link href="/leaderboard" className="text-xs text-muted hover:text-accent transition-colors">
          View All →
        </Link>
      </div>

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
          <Link
            key={user.username}
            href={`/profile/${user.username}`}
            className="flex items-center justify-between text-sm py-1.5 px-2 hover:bg-card-hover/30 transition-colors rounded"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted text-xs w-5 shrink-0">{i + 1}</span>
              <span className="text-foreground hover:text-accent transition-colors truncate min-w-0" title={user.username}>
                {user.username}
              </span>
            </div>
            <span className="text-accent font-medium shrink-0 ml-2">
              {formatLeaves(user.portfolio_value)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
