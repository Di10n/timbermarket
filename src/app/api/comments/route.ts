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

  const { marketId, content } = await request.json();

  if (!marketId || !content || typeof content !== "string") {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 1000) {
    return NextResponse.json(
      { error: "Comment must be 1-1000 characters" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  // Verify market exists
  const { data: market } = await serviceClient
    .from("markets")
    .select("id")
    .eq("id", marketId)
    .single();

  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const { data, error } = await serviceClient
    .from("comments")
    .insert({
      market_id: marketId,
      user_id: user.id,
      content: trimmed,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
