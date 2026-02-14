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

  const { question } = await request.json();

  if (!question || typeof question !== "string") {
    return NextResponse.json(
      { error: "Question is required" },
      { status: 400 }
    );
  }

  const trimmedQuestion = question.trim();
  if (trimmedQuestion.length === 0 || trimmedQuestion.length > 500) {
    return NextResponse.json(
      { error: "Question must be 1-500 characters" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  const { data, error } = await serviceClient
    .from("market_ideas")
    .insert({
      user_id: user.id,
      question: trimmedQuestion,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
