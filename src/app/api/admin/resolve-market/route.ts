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

  const { marketId, resolution } = await request.json();

  if (!marketId || !resolution) {
    return NextResponse.json(
      { error: "Market ID and resolution are required" },
      { status: 400 }
    );
  }

  // Validate resolution
  const validResolutions = ["YES", "NO", "N/A"];
  const isPercentage =
    !validResolutions.includes(resolution) &&
    !isNaN(parseFloat(resolution)) &&
    parseFloat(resolution) >= 0 &&
    parseFloat(resolution) <= 1;

  if (!validResolutions.includes(resolution) && !isPercentage) {
    return NextResponse.json(
      { error: "Resolution must be YES, NO, N/A, or a number between 0 and 1" },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient.rpc("resolve_market", {
    p_market_id: marketId,
    p_resolution: resolution,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
