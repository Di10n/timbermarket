"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { timeAgo, formatShares } from "@/lib/utils";
import type { CommentWithProfile } from "@/lib/types";

interface MarketCommentsProps {
  marketId: string;
  comments: CommentWithProfile[];
  isAdmin: boolean;
  currentUserId?: string;
}

export default function MarketComments({
  marketId,
  comments,
  isAdmin,
  currentUserId,
}: MarketCommentsProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, content: content.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post comment");
        setLoading(false);
        return;
      }
      setContent("");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(commentId: string) {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } catch {
      // silent
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted mb-3">Comments</h3>

      {currentUserId && (
        <form onSubmit={handleSubmit} className="mb-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a comment..."
            maxLength={1000}
            rows={2}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent resize-none"
          />
          {error && <p className="text-no text-sm mt-1">{error}</p>}
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="mt-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-background text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Posting..." : "Post"}
          </button>
        </form>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted">
          {currentUserId ? "No comments yet." : <><a href="/signup" className="text-accent hover:underline">Sign up</a> to see comments.</>}
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="py-2 border-b border-border/50 last:border-0"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted font-medium">
                    {comment.profiles.username}
                  </span>
                  {comment.positions &&
                    comment.positions.yes_shares > 0 && (
                      <span className="text-yes">
                        {formatShares(comment.positions.yes_shares)} YES
                      </span>
                    )}
                  {comment.positions &&
                    comment.positions.no_shares > 0 && (
                      <span className="text-no">
                        {formatShares(comment.positions.no_shares)} NO
                      </span>
                    )}
                  <span className="text-muted">
                    {timeAgo(comment.created_at)}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-xs text-muted hover:text-no transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="text-sm text-foreground">{comment.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
