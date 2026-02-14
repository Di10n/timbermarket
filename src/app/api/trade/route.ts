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

  if (type === "BUY") {
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid bet amount" },
        { status: 400 }
      );
    }

    const { data, error } = await serviceClient.rpc("execute_trade", {
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

    const { data, error } = await serviceClient.rpc("execute_sell", {
      p_user_id: user.id,
      p_market_id: marketId,
      p_outcome: outcome,
      p_shares: shares,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Invalid trade type" }, { status: 400 });
}
