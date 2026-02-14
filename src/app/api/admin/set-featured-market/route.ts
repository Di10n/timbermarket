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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { marketId } = await request.json();

  if (!marketId || typeof marketId !== "string") {
    return NextResponse.json(
      { error: "Market ID is required" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  // Ensure market exists and is active
  const { data: market, error: fetchError } = await serviceClient
    .from("markets")
    .select("id, status")
    .eq("id", marketId)
    .single();

  if (fetchError || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  if (market.status !== "active") {
    return NextResponse.json(
      { error: "Only active markets can be featured" },
      { status: 400 }
    );
  }

  // Clear current featured, then set the selected market as featured
  await serviceClient
    .from("markets")
    .update({ is_featured: false })
    .eq("is_featured", true);

  const { error: updateError } = await serviceClient
    .from("markets")
    .update({ is_featured: true })
    .eq("id", marketId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
