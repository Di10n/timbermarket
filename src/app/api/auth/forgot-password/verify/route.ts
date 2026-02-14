import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import twilio from "twilio";
import { createResetToken } from "@/lib/reset-token";

export async function POST(request: Request) {
  const { username, code } = await request.json();

  if (!username || typeof username !== "string") {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Verification code is required" },
      { status: 400 }
    );
  }

  const trimmed = username.trim();

  const serviceClient = await createServiceClient();

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, phone_number")
    .eq("username", trimmed)
    .single();

  if (!profile || !profile.phone_number) {
    return NextResponse.json(
      { error: "Invalid verification code" },
      { status: 400 }
    );
  }

  const phoneNumber = profile.phone_number;

  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  try {
    const check = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: phoneNumber, code });

    if (check.status !== "approved") {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    const resetToken = createResetToken(profile.id, phoneNumber);

    return NextResponse.json({
      success: true,
      resetToken,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
