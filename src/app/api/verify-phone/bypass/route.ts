import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = await createServiceClient();

  // Check if user is already approved to avoid resetting their balance
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();

  const updateData = profile?.is_approved
    ? { phone_number: "dev-bypass" }
    : { is_approved: true, balance: 1000, phone_number: "dev-bypass" };

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update(updateData)
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to approve account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
