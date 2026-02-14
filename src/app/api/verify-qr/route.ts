import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid QR data" }, { status: 400 });
  }

  const hash = createHash("sha256").update(url).digest("hex");

  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient.rpc("verify_qr_code", {
    p_user_id: user.id,
    p_code_hash: hash,
  });

  if (error) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Invalid or already used QR code" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
