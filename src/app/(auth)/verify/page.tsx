"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // If user types a +, let them enter an international number freely
    if (raw.startsWith("+")) {
      setPhoneNumber(raw);
    } else {
      setPhoneNumber(formatPhone(raw));
    }
  }
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [status, setStatus] = useState<
    "idle" | "sending" | "verifying" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const res = await fetch("/api/verify-phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStep("code");
        setStatus("idle");
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to send code. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setMessage("");

    try {
      const res = await fetch("/api/verify-phone/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        setMessage("Verified! Redirecting...");
        setTimeout(() => {
          router.push("/markets");
          router.refresh();
        }, 1000);
      } else {
        setStatus("error");
        setMessage(data.error || "Invalid code. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-accent mb-2">Timbermarket</h1>
        <p className="text-muted text-sm mb-8">
          Verify your phone number to get started
        </p>

        {step === "phone" && (
          <form onSubmit={handleSendCode} className="space-y-4">
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

            {status === "error" && (
              <p className="text-no text-sm">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Send code"}
            </button>
          </form>
        )}

        {step === "code" && status !== "success" && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-muted text-sm">
              Code sent to {phoneNumber}
            </p>
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

            {status === "error" && (
              <p className="text-no text-sm">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === "verifying"}
              className="w-full py-2 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {status === "verifying" ? "Verifying..." : "Verify"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setStatus("idle");
                setMessage("");
              }}
              className="text-muted text-sm hover:text-foreground"
            >
              Change phone number
            </button>
          </form>
        )}

        {status === "success" && (
          <p className="text-yes font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}
