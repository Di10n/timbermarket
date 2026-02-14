import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyResetToken } from "@/lib/reset-token";

export async function POST(request: Request) {
  const { resetToken, newPassword } = await request.json();

  if (!resetToken || typeof resetToken !== "string") {
    return NextResponse.json(
      { error: "Reset token is required" },
      { status: 400 }
    );
  }

  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 6
  ) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const payload = verifyResetToken(resetToken);

  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired reset link. Please start over." },
      { status: 400 }
    );
  }

  const serviceClient = await createServiceClient();

  const { error } = await serviceClient.auth.admin.updateUserById(
    payload.userId,
    { password: newPassword }
  );

  if (error) {
    return NextResponse.json(
      { error: "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
