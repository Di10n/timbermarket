import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import twilio from "twilio";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phoneNumber: rawPhone } = await request.json();

  if (!rawPhone || typeof rawPhone !== "string") {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  // Normalize: strip non-digit/+ chars, prepend +1 if no international prefix
  const stripped = rawPhone.replace(/[^\d+]/g, "");
  const phoneNumber = stripped.startsWith("+") ? stripped : `+1${stripped}`;

  // Check if phone number is already used by another user
  const serviceClient = await createServiceClient();
  const { data: existingProfile } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("phone_number", phoneNumber)
    .single();

  if (existingProfile && existingProfile.id !== user.id) {
    return NextResponse.json(
      { error: "This phone number is already associated with another account" },
      { status: 400 }
    );
  }

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  try {
    await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to send verification code";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
