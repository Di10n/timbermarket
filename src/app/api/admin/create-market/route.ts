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

  const { question, description, marketType, initialProbability, outcomes, ante } = await request.json();

  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const type = marketType || 'binary';

  if (!['binary', 'multi'].includes(type)) {
    return NextResponse.json(
      { error: "Invalid market type" },
      { status: 400 }
    );
  }

  const anteAmount = parseFloat(ante);
  if (isNaN(anteAmount) || anteAmount < 10) {
    return NextResponse.json(
      { error: "Ante must be at least 10" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();
  let data, error;

  if (type === 'binary') {
    // Binary market - requires initial probability
    const prob = parseFloat(initialProbability);
    if (isNaN(prob) || prob <= 0 || prob >= 1) {
      return NextResponse.json(
        { error: "Probability must be between 0 and 1" },
        { status: 400 }
      );
    }

    ({ data, error } = await serviceClient.rpc("create_market", {
      p_creator_id: user.id,
      p_question: question,
      p_description: description || null,
      p_initial_prob: prob,
      p_ante: anteAmount,
    }));
  } else {
    // Multi-outcome market - requires outcomes array
    if (!Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > 10) {
      return NextResponse.json(
        { error: "Outcomes must be an array with 2-10 items" },
        { status: 400 }
      );
    }

    // Validate outcomes are unique non-empty strings
    const uniqueOutcomes = new Set(outcomes.map((o: string) => o.trim()).filter(Boolean));
    if (uniqueOutcomes.size !== outcomes.length) {
      return NextResponse.json(
        { error: "Outcomes must be unique and non-empty" },
        { status: 400 }
      );
    }

    ({ data, error } = await serviceClient.rpc("create_market_multi", {
      p_creator_id: user.id,
      p_question: question,
      p_description: description || null,
      p_outcomes: outcomes,
      p_ante: anteAmount,
    }));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ marketId: data });
}
