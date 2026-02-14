"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = "username" | "code" | "reset" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw.startsWith("+")) {
      setPhoneNumber(raw);
    } else {
      setPhoneNumber(formatPhone(raw));
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), phoneNumber }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStep("code");
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), code }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResetToken(data.resetToken);
        setStep("reset");
      } else {
        setError(data.error || "Invalid code. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStep("success");
      } else {
        setError(data.error || "Failed to reset password. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-accent mb-2">Timbermarket</h1>
        <p className="text-muted text-sm mb-8">Reset your password</p>

        {/* Step 1: Enter username and phone number */}
        {step === "username" && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="text-left">
              <label className="block text-sm text-muted mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                required
              />
            </div>

            <div className="text-left">
              <label className="block text-sm text-muted mb-1">
                Phone number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="(123) 456-7890"
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                required
              />
            </div>

            <p className="text-muted text-xs">
              Enter the phone number you used when creating your account.
            </p>

            {error && <p className="text-no text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send code"}
            </button>
          </form>
        )}

        {/* Step 2: Enter verification code */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-muted text-sm">Code sent to {phoneNumber}</p>
            <div className="text-left">
              <label className="block text-sm text-muted mb-1">
                Verification code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground text-center tracking-widest focus:outline-none focus:border-accent"
                required
                maxLength={6}
              />
            </div>

            {error && <p className="text-no text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify code"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("username");
                setCode("");
                setError("");
              }}
              className="text-muted text-sm hover:text-foreground"
            >
              Start over
            </button>
          </form>
        )}

        {/* Step 3: Enter new password */}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-yes text-sm font-medium">
              Phone verified! Enter your new password.
            </p>
            <div className="text-left">
              <label className="block text-sm text-muted mb-1">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                required
                minLength={6}
              />
            </div>
            <div className="text-left">
              <label className="block text-sm text-muted mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
                required
                minLength={6}
              />
            </div>

            {error && <p className="text-no text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === "success" && (
          <div className="space-y-4">
            <p className="text-yes font-medium">
              Password reset successfully!
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors"
            >
              Sign in
            </button>
          </div>
        )}

        {/* Back to login link */}
        {step !== "success" && (
          <p className="text-sm text-muted mt-6">
            Remember your password?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
