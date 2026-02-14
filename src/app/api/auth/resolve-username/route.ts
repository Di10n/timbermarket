import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { username } = body;

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  const { data: profile, error } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (error || !profile) {
    return NextResponse.json(
      { error: "Invalid login credentials" },
      { status: 400 }
    );
  }

  // Look up the user's email from Supabase Auth
  const {
    data: { user },
    error: userError,
  } = await serviceClient.auth.admin.getUserById(profile.id);

  if (userError || !user?.email) {
    return NextResponse.json(
      { error: "Invalid login credentials" },
      { status: 400 }
    );
  }

  return NextResponse.json({ email: user.email });
}
