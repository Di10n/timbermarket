import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import twilio from "twilio";

export async function POST(request: Request) {
  const { username, phoneNumber: rawPhone } = await request.json();

  if (!username || typeof username !== "string") {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  if (!rawPhone || typeof rawPhone !== "string") {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  const trimmed = username.trim();

  // Normalize phone: strip non-digit/+ chars, prepend +1 if no international prefix
  const stripped = rawPhone.replace(/[^\d+]/g, "");
  const phoneNumber = stripped.startsWith("+") ? stripped : `+1${stripped}`;

  const serviceClient = await createServiceClient();

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, phone_number")
    .eq("username", trimmed)
    .single();

  // Verify the phone number matches what's on file
  if (!profile || !profile.phone_number || profile.phone_number !== phoneNumber) {
    return NextResponse.json(
      { error: "Username and phone number do not match" },
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
