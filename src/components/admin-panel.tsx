"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatProbability, formatLeaves, formatShares, timeAgo, cn } from "@/lib/utils";
import type { Market, Trade } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import LeafIcon from "@/components/leaf-icon";

interface AdminPanelProps {
  activeMarkets: Market[];
  allMarkets: Market[];
  featuredMarketId: string | null;
}

export default function AdminPanel({
  activeMarkets,
  allMarkets,
  featuredMarketId,
}: AdminPanelProps) {
  return (
    <div className="space-y-6">
      <FeaturedMarketForm
        markets={activeMarkets}
        featuredMarketId={featuredMarketId}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CreateMarketForm />
        <ResolveMarketForm markets={activeMarkets} />
      </div>
      <RollbackTradesForm markets={allMarkets} />
    </div>
  );
}

function FeaturedMarketForm({
  markets,
  featuredMarketId,
}: {
  markets: Market[];
  featuredMarketId: string | null;
}) {
  const [selectedMarket, setSelectedMarket] = useState(featuredMarketId ?? "");
  useEffect(() => {
    setSelectedMarket(featuredMarketId ?? "");
  }, [featuredMarketId]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSetFeatured(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!selectedMarket) {
      setMessage("Select a market");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/set-featured-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: selectedMarket }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to set featured market");
        setLoading(false);
        return;
      }
      setMessage("Featured market updated.");
      router.refresh();
    } catch {
      setMessage("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-lg font-bold mb-4">Featured Market (TV page)</h2>
      {markets.length === 0 ? (
        <p className="text-muted text-sm">No active markets. Create one first.</p>
      ) : (
        <form onSubmit={handleSetFeatured} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-muted mb-1">Market to feature</label>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">Select a market...</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.question} ({formatProbability(m.probability)})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading || !selectedMarket}
            className="py-2 px-4 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Set as featured"}
          </button>
          {featuredMarketId && (
            <span className="text-xs text-muted">
              Current: {markets.find((m) => m.id === featuredMarketId)?.question ?? "—"}
            </span>
          )}
          {message && (
            <p className={`text-sm w-full ${message.includes("updated") ? "text-yes" : "text-no"}`}>
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function CreateMarketForm() {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState(50);
  const [ante, setAnte] = useState("3000");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/create-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          description: description || undefined,
          initialProbability: probability / 100,
          ante: parseFloat(ante),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Failed to create market");
        setLoading(false);
        return;
      }

      setMessage("Market created!");
      setQuestion("");
      setDescription("");
      setProbability(50);
      setAnte("3000");
      router.refresh();
    } catch {
      setMessage("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-lg font-bold mb-4">Create Market</h2>

      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <label className="block text-sm text-muted mb-1">Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will X happen by Y date?"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">
            Initial Probability: {probability}%
          </label>
          <input
            type="range"
            min="1"
            max="99"
            value={probability}
            onChange={(e) => setProbability(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>1%</span>
            <span>99%</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">
            Initial Liquidity (<LeafIcon />)
          </label>
          <input
            type="number"
            value={ante}
            onChange={(e) => setAnte(e.target.value)}
            min="10"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
          />
        </div>

        {message && (
          <p
            className={`text-sm ${
              message.includes("created") ? "text-yes" : "text-no"
            }`}
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Market"}
        </button>
      </form>
    </div>
  );
}

function ResolveMarketForm({ markets }: { markets: Market[] }) {
  const [selectedMarket, setSelectedMarket] = useState("");
  const [resolution, setResolution] = useState("YES");
  const [customPct, setCustomPct] = useState("50");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!selectedMarket) {
      setMessage("Select a market");
      return;
    }

    setLoading(true);

    const resolveValue =
      resolution === "PERCENT" ? (parseFloat(customPct) / 100).toString() : resolution;

    try {
      const res = await fetch("/api/admin/resolve-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: selectedMarket,
          resolution: resolveValue,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Failed to resolve market");
        setLoading(false);
        return;
      }

      setMessage("Market resolved!");
      setSelectedMarket("");
      router.refresh();
    } catch {
      setMessage("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-lg font-bold mb-4">Resolve Market</h2>

      {markets.length === 0 ? (
        <p className="text-muted text-sm">No active markets to resolve.</p>
      ) : (
        <form onSubmit={handleResolve} className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Market</label>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
            >
              <option value="">Select a market...</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.question} ({formatProbability(m.probability)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">Resolution</label>
            <div className="grid grid-cols-2 gap-2">
              {(["YES", "NO", "N/A", "PERCENT"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setResolution(opt)}
                  className={`py-2 text-sm font-medium rounded-lg border transition-colors ${
                    resolution === opt
                      ? opt === "YES"
                        ? "border-yes bg-yes/10 text-yes"
                        : opt === "NO"
                          ? "border-no bg-no/10 text-no"
                          : "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {opt === "PERCENT" ? "%" : opt}
                </button>
              ))}
            </div>
          </div>

          {resolution === "PERCENT" && (
            <div>
              <label className="block text-sm text-muted mb-1">
                Percentage: {customPct}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={customPct}
                onChange={(e) => setCustomPct(e.target.value)}
                className="w-full accent-accent"
              />
            </div>
          )}

          {message && (
            <p
              className={`text-sm ${
                message.includes("resolved") ? "text-yes" : "text-no"
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !selectedMarket}
            className="w-full py-2 bg-no hover:bg-no/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Resolving..." : "Resolve Market"}
          </button>
        </form>
      )}
    </div>
  );
}

interface TradeWithProfile extends Trade {
  profiles: { username: string };
}

function RollbackTradesForm({ markets }: { markets: Market[] }) {
  const [selectedMarket, setSelectedMarket] = useState("");
  const [trades, setTrades] = useState<TradeWithProfile[]>([]);
  const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  const fetchTrades = useCallback(async (marketId: string) => {
    if (!marketId) {
      setTrades([]);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("trades")
        .select("*, profiles!inner(username)")
        .eq("market_id", marketId)
        .neq("type", "REDEEM")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setMessage("Failed to load trades");
        setTrades([]);
      } else {
        setTrades((data ?? []) as TradeWithProfile[]);
      }
    } catch {
      setMessage("Failed to load trades");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedTradeIds(new Set());
    fetchTrades(selectedMarket);
  }, [selectedMarket, fetchTrades]);

  const selectableTradeIds = trades
    .filter((t) => !t.is_rolled_back)
    .map((t) => t.id);

  const allSelected =
    selectableTradeIds.length > 0 &&
    selectableTradeIds.every((id) => selectedTradeIds.has(id));

  function handleSelectAll() {
    if (allSelected) {
      setSelectedTradeIds(new Set());
    } else {
      setSelectedTradeIds(new Set(selectableTradeIds));
    }
  }

  function handleToggleTrade(tradeId: string) {
    const next = new Set(selectedTradeIds);
    if (next.has(tradeId)) {
      next.delete(tradeId);
    } else {
      next.add(tradeId);
    }
    setSelectedTradeIds(next);
  }

  async function handleRollback() {
    if (selectedTradeIds.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to rollback ${selectedTradeIds.size} trade(s)? This will reverse balance, position, and pool changes.`
    );
    if (!confirmed) return;

    setRollbackLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/rollback-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeIds: Array.from(selectedTradeIds) }),
      });

      const data = await res.json();

      if (!res.ok && res.status !== 207) {
        setMessage(data.error || "Failed to rollback trades");
      } else {
        const succeeded = data.results.filter(
          (r: { success: boolean }) => r.success
        ).length;
        const failed = data.results.filter(
          (r: { success: boolean }) => !r.success
        ).length;

        if (failed > 0) {
          const errors = data.results
            .filter((r: { success: boolean }) => !r.success)
            .map((r: { error?: string }) => r.error)
            .join("; ");
          setMessage(
            `${succeeded} rolled back successfully, ${failed} failed: ${errors}`
          );
        } else {
          setMessage(`Successfully rolled back ${succeeded} trade(s).`);
        }
      }

      setSelectedTradeIds(new Set());
      fetchTrades(selectedMarket);
      router.refresh();
    } catch {
      setMessage("Something went wrong");
    } finally {
      setRollbackLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-lg font-bold mb-4">Rollback Trades</h2>

      <div className="mb-4">
        <label className="block text-sm text-muted mb-1">Market</label>
        <select
          value={selectedMarket}
          onChange={(e) => setSelectedMarket(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
        >
          <option value="">Select a market...</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.question} ({formatProbability(m.probability)}) [{m.status}]
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading trades...</p>
      ) : !selectedMarket ? null : trades.length === 0 ? (
        <p className="text-muted text-sm">No trades for this market.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      className="accent-accent"
                    />
                  </th>
                  <th className="py-2 pr-2">User</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Outcome</th>
                  <th className="py-2 pr-2">Amount</th>
                  <th className="py-2 pr-2">Shares</th>
                  <th className="py-2 pr-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr
                    key={trade.id}
                    className={cn(
                      "border-b border-border/50",
                      trade.is_rolled_back && "opacity-40"
                    )}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        disabled={trade.is_rolled_back}
                        checked={selectedTradeIds.has(trade.id)}
                        onChange={() => handleToggleTrade(trade.id)}
                        className="accent-accent"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <span className={cn(trade.is_rolled_back && "line-through")}>
                        {trade.profiles.username}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className={cn(trade.is_rolled_back && "line-through")}>
                        {trade.type}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-2",
                        trade.outcome === "YES" ? "text-yes" : "text-no",
                        trade.is_rolled_back && "line-through"
                      )}
                    >
                      {trade.outcome}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={cn(trade.is_rolled_back && "line-through")}>
                        {formatLeaves(trade.amount)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className={cn(trade.is_rolled_back && "line-through")}>
                        {formatShares(trade.shares)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-muted">
                      {timeAgo(trade.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedTradeIds.size > 0 && (
            <button
              onClick={handleRollback}
              disabled={rollbackLoading}
              className="mt-4 w-full py-2 bg-no hover:bg-no/90 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {rollbackLoading
                ? "Rolling back..."
                : `Rollback ${selectedTradeIds.size} trade${selectedTradeIds.size > 1 ? "s" : ""}`}
            </button>
          )}
        </>
      )}

      {message && (
        <p
          className={`text-sm mt-2 ${
            message.includes("Successfully") ? "text-yes" : "text-no"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
