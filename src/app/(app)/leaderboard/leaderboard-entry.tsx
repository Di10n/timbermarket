'use client';

import { formatLeaves } from '@/lib/utils';
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
    if (rank === 1) return <span className="text-2xl font-bold">🥇</span>;
    if (rank === 2) return <span className="text-2xl font-bold">🥈</span>;
    if (rank === 3) return <span className="text-2xl font-bold">🥉</span>;
    return <span className="text-lg font-semibold text-muted-foreground">#{rank}</span>;
  };

  const positionsValue = portfolioValue - balance;

  return (
    <div
      className={`rounded-lg border ${
        isCurrentUser
          ? 'bg-primary/10 border-primary'
          : 'bg-card border-border'
      }`}
    >
      {/* Main row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 transition-colors"
      >
        {/* Rank */}
        <div className="flex-shrink-0 w-12 text-center">{getRankDisplay()}</div>

        {/* Username */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{username}</span>
            {isCurrentUser && (
              <span className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded">
                You
              </span>
            )}
          </div>
        </div>

        {/* Portfolio breakdown */}
        <div className="flex-shrink-0 text-right space-y-1">
          <div className="font-bold text-xl">{formatLeaves(portfolioValue)}</div>
          <div className="text-xs text-muted-foreground space-x-1">
            <span>Bal: {formatLeaves(balance)}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>Pos: {formatLeaves(positionsValue)}</span>
          </div>
        </div>

        {/* Expand indicator */}
        {positions.length > 0 && (
          <div className="flex-shrink-0 w-6 text-muted-foreground">
            <svg
              className={`w-5 h-5 transition-transform ${
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
        )}
      </button>

      {/* Expanded positions */}
      {isExpanded && positions.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="text-sm font-medium text-muted-foreground mb-2">
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
                className="block p-3 bg-muted/50 rounded hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {position.market_question}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {position.yes_shares > 0 && (
                        <span className="mr-3">
                          YES: {position.yes_shares.toFixed(2)} shares (
                          {formatLeaves(yesValue)})
                        </span>
                      )}
                      {position.no_shares > 0 && (
                        <span>
                          NO: {position.no_shares.toFixed(2)} shares (
                          {formatLeaves(noValue)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-semibold">
                      {formatLeaves(totalValue)}
                    </div>
                    <div className="text-xs text-muted-foreground">
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
        <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          No active positions
        </div>
      )}
    </div>
  );
}
