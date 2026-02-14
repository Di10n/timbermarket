import crypto from "crypto";

interface ResetTokenPayload {
  userId: string;
  phoneNumber: string;
  exp: number;
}

const TOKEN_EXPIRY_SECONDS = 600; // 10 minutes

function getSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return secret;
}

export function createResetToken(userId: string, phoneNumber: string): string {
  const payload: ResetTokenPayload = {
    userId,
    phoneNumber,
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64url");

  return `${payloadEncoded}.${signature}`;
}

export function verifyResetToken(token: string): ResetTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadEncoded, signature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64url");

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature, "base64url"),
      Buffer.from(expectedSignature, "base64url")
    )
  ) {
    return null;
  }

  try {
    const payload: ResetTokenPayload = JSON.parse(
      Buffer.from(payloadEncoded, "base64url").toString("utf-8")
    );

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
