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

  const { phoneNumber: rawPhone, code } = await request.json();

  if (!rawPhone || typeof rawPhone !== "string") {
    return NextResponse.json(
      { error: "Phone number is required" },
      { status: 400 }
    );
  }

  // Normalize: strip non-digit/+ chars, prepend +1 if no international prefix
  const stripped = rawPhone.replace(/[^\d+]/g, "");
  const phoneNumber = stripped.startsWith("+") ? stripped : `+1${stripped}`;

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Verification code is required" },
      { status: 400 }
    );
  }

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

    const serviceClient = await createServiceClient();

    // Check if user is already approved to avoid resetting their balance
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("is_approved")
      .eq("id", user.id)
      .single();

    const updateData = profile?.is_approved
      ? { phone_number: phoneNumber }
      : { is_approved: true, balance: 1000, phone_number: phoneNumber };

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
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
