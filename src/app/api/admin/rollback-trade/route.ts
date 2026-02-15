import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { tradeIds } = await request.json();

  if (!tradeIds || !Array.isArray(tradeIds) || tradeIds.length === 0) {
    return NextResponse.json(
      { error: "At least one trade ID is required" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  // Sort trades in reverse chronological order (newest first) so pool
  // deltas are reversed correctly — each rollback assumes it's undoing
  // the most recent change to the pool.
  const { data: trades, error: fetchError } = await serviceClient
    .from("trades")
    .select("id, created_at")
    .in("id", tradeIds)
    .order("created_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch trades for ordering" },
      { status: 500 }
    );
  }

  const orderedIds = trades.map((t: { id: string }) => t.id);

  const results: Array<{
    tradeId: string;
    success: boolean;
    error?: string;
    data?: unknown;
  }> = [];

  // Process each trade rollback sequentially in reverse chronological order
  for (const tradeId of orderedIds) {
    const { data, error } = await serviceClient.rpc("rollback_trade", {
      p_trade_id: tradeId,
    });

    if (error) {
      results.push({ tradeId, success: false, error: error.message });
    } else {
      results.push({ tradeId, success: true, data });
    }
  }

  const allSucceeded = results.every((r) => r.success);

  return NextResponse.json(
    { results },
    { status: allSucceeded ? 200 : 207 }
  );
}
