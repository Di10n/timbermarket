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

  // Check approval
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();

  if (!profile?.is_approved) {
    return NextResponse.json(
      { error: "Account not approved" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { marketId, outcome, amount, shares, type } = body;

  if (!marketId || !outcome || !type) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  // Fetch market to determine type
  const { data: market, error: marketError } = await serviceClient
    .from("markets")
    .select("market_type, outcomes")
    .eq("id", marketId)
    .single();

  if (marketError || !market) {
    return NextResponse.json(
      { error: "Market not found" },
      { status: 404 }
    );
  }

  // Validate outcome for multi-outcome markets
  if (market.market_type === 'multi') {
    if (!market.outcomes || !market.outcomes.includes(outcome)) {
      return NextResponse.json(
        { error: `Invalid outcome: ${outcome}` },
        { status: 400 }
      );
    }
  }

  if (type === "BUY") {
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid bet amount" },
        { status: 400 }
      );
    }

    // Route to appropriate function based on market type
    const functionName = market.market_type === 'multi' ? 'execute_trade_multi' : 'execute_trade';

    const { data, error } = await serviceClient.rpc(functionName, {
      p_user_id: user.id,
      p_market_id: marketId,
      p_outcome: outcome,
      p_amount: amount,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } else if (type === "SELL") {
    if (!shares || shares <= 0) {
      return NextResponse.json(
        { error: "Invalid share amount" },
        { status: 400 }
      );
    }

    // Fetch the user's actual position to clamp shares (avoids floating-point mismatch)
    let clampedShares = shares;

    if (market.market_type === 'binary') {
      const { data: position } = await serviceClient
        .from("positions")
        .select("yes_shares, no_shares")
        .eq("user_id", user.id)
        .eq("market_id", marketId)
        .single();

      if (position) {
        const available =
          outcome === "YES" ? position.yes_shares : position.no_shares;
        // If the requested amount is close to or exceeds available, use the exact DB value
        if (shares >= available || Math.abs(shares - available) < 0.01) {
          clampedShares = available;
        }
      }
    } else {
      // Multi-outcome market
      const { data: position } = await serviceClient
        .from("positions")
        .select("shares_by_outcome")
        .eq("user_id", user.id)
        .eq("market_id", marketId)
        .single();

      if (position && position.shares_by_outcome) {
        const available = position.shares_by_outcome[outcome] || 0;
        // If the requested amount is close to or exceeds available, use the exact DB value
        if (shares >= available || Math.abs(shares - available) < 0.01) {
          clampedShares = available;
        }
      }
    }

    // Route to appropriate function based on market type
    const functionName = market.market_type === 'multi' ? 'execute_sell_multi' : 'execute_sell';

    const { data, error } = await serviceClient.rpc(functionName, {
      p_user_id: user.id,
      p_market_id: marketId,
      p_outcome: outcome,
      p_shares: clampedShares,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Invalid trade type" }, { status: 400 });
}
