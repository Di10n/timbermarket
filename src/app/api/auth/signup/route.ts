import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { username, password } = body;

  if (!username || typeof username !== "string") {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const trimmed = username.trim();

  if (trimmed.length < 2 || trimmed.length > 30) {
    return NextResponse.json(
      { error: "Username must be 2-30 characters" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return NextResponse.json(
      { error: "Username can only contain letters, numbers, and underscores" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  // Check username uniqueness
  const { data: existing } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("username", trimmed)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Username is already taken" },
      { status: 400 }
    );
  }

  const email = `${trimmed}@timbermarket.lol`;

  const { error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: trimmed },
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
