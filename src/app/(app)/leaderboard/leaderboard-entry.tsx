'use client';

import { formatLeaves } from '@/lib/utils';
import LeafIcon from '@/components/leaf-icon';
import Link from 'next/link';
import { useState } from 'react';

interface Position {
  market_id: string;
  market_question: string;
  yes_shares: number;
  no_shares: number;
  market_probability: number;
}

interface LeaderboardEntryProps {
  rank: number;
  username: string;
  balance: number;
  portfolioValue: number;
  positions: Position[];
  isCurrentUser: boolean;
}

export function LeaderboardEntry({
  rank,
  username,
  balance,
  portfolioValue,
  positions,
  isCurrentUser,
}: LeaderboardEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getRankDisplay = () => {
    if (rank <= 3) {
      return (
        <span className="text-sm font-bold text-accent">#{rank}</span>
      );
    }
    return <span className="text-sm text-muted">#{rank}</span>;
  };

  const positionsValue = portfolioValue - balance;

  return (
    <div className={isCurrentUser ? 'bg-accent/5' : ''}>
      {/* Main row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-4 py-4 px-2 text-left hover:bg-card-hover/30 transition-colors border-b border-border"
      >
        {/* Rank */}
        <div className="w-8 shrink-0 text-center tabular-nums">{getRankDisplay()}</div>

        {/* Username */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/profile/${username}`}
              onClick={(e) => e.stopPropagation()}
              className="text-foreground font-medium truncate hover:text-accent transition-colors"
            >
              {username}
            </Link>
            {isCurrentUser && (
              <span className="text-xs px-1.5 py-0.5 bg-accent/20 text-accent">
                You
              </span>
            )}
          </div>
        </div>

        {/* Portfolio breakdown */}
        <div className="shrink-0 text-right">
          <div className="font-bold text-foreground">{formatLeaves(portfolioValue)} <LeafIcon /></div>
          <div className="text-xs text-muted">
            <span>Bal: {formatLeaves(balance)}</span>
            {' · '}
            <span>Pos: {formatLeaves(positionsValue)}</span>
          </div>
        </div>

        {/* Expand indicator */}
        <div className="shrink-0 w-5 text-muted">
          <svg
            className={`w-4 h-4 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expanded positions */}
      {isExpanded && positions.length > 0 && (
        <div className="border-b border-border px-2 py-3">
          <div className="text-xs text-muted mb-2">
            Positions ({positions.length} markets)
          </div>
          {positions.map((position) => {
            const yesValue = position.yes_shares * position.market_probability;
            const noValue =
              position.no_shares * (1 - position.market_probability);
            const totalValue = yesValue + noValue;

            return (
              <Link
                key={position.market_id}
                href={`/markets/${position.market_id}`}
                className="block py-2 px-2 hover:bg-card-hover/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {position.market_question}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {position.yes_shares > 0 && (
                        <span className="text-yes mr-3">
                          YES: {position.yes_shares.toFixed(2)} shares (
                          {formatLeaves(yesValue)} <LeafIcon />)
                        </span>
                      )}
                      {position.no_shares > 0 && (
                        <span className="text-no">
                          NO: {position.no_shares.toFixed(2)} shares (
                          {formatLeaves(noValue)} <LeafIcon />)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium text-foreground">
                      {formatLeaves(totalValue)} <LeafIcon />
                    </div>
                    <div className="text-xs text-muted">
                      @{(position.market_probability * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {isExpanded && positions.length === 0 && (
        <div className="border-b border-border px-2 py-3 text-sm text-muted">
          No active positions
        </div>
      )}
    </div>
  );
}
