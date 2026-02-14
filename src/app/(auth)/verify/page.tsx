"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import QrScanner from "@/components/qr-scanner";

export default function VerifyPage() {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "verifying" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleScan = useCallback(
    async (decodedText: string) => {
      setStatus("verifying");
      setScanning(false);

      try {
        const response = await fetch("/api/verify-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: decodedText }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          setMessage("Verified! Redirecting...");
          setTimeout(() => {
            router.push("/markets");
            router.refresh();
          }, 1000);
        } else {
          setStatus("error");
          setMessage(data.error || "Invalid QR code. Please try again.");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
    },
    [router]
  );

  const handleCameraError = useCallback((error: string) => {
    setStatus("error");
    setMessage(error);
    setScanning(false);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-accent mb-2">Timbermarket</h1>
        <p className="text-muted text-sm mb-8">
          Scan your invitation QR code to get started
        </p>

        {!scanning && status !== "success" && (
          <button
            onClick={() => {
              setScanning(true);
              setStatus("idle");
              setMessage("");
            }}
            className="px-6 py-3 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg transition-colors"
          >
            {status === "error" ? "Try Again" : "Scan QR Code"}
          </button>
        )}

        {scanning && (
          <div className="mt-4">
            <QrScanner onScan={handleScan} onError={handleCameraError} />
            <button
              onClick={() => setScanning(false)}
              className="mt-4 text-muted text-sm hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        {status === "verifying" && (
          <p className="mt-4 text-muted">Verifying...</p>
        )}

        {status === "success" && (
          <div className="mt-4">
            <p className="text-yes font-medium">{message}</p>
          </div>
        )}

        {status === "error" && !scanning && (
          <p className="mt-4 text-no text-sm">{message}</p>
        )}
      </div>
    </div>
  );
}
