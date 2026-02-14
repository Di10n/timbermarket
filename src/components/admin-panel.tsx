"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatProbability } from "@/lib/utils";
import type { Market } from "@/lib/types";

interface AdminPanelProps {
  activeMarkets: Market[];
}

export default function AdminPanel({ activeMarkets }: AdminPanelProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CreateMarketForm />
      <ResolveMarketForm markets={activeMarkets} />
    </div>
  );
}

function CreateMarketForm() {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState(50);
  const [ante, setAnte] = useState("100");
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
      setAnte("100");
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
            Initial Liquidity (leaves)
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
