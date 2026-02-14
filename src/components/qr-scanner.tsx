"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

async function stopScanner(scanner: Html5Qrcode) {
  try {
    await scanner.stop();
  } catch {
    // throws synchronously or rejects if not running
  }
}

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

let pendingCleanup = Promise.resolve();

export default function QrScanner({ onScan, onError }: QrScannerProps) {
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let startedScanner: Html5Qrcode | null = null;

    const init = async () => {
      await pendingCleanup;
      if (cancelled) return;

      const scanner = new Html5Qrcode("qr-reader");

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            stopScanner(scanner);
            onScanRef.current(decodedText);
          },
          () => {}
        );

        if (cancelled) {
          await stopScanner(scanner);
        } else {
          startedScanner = scanner;
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : typeof err === "string" ? err : "";
          onErrorRef.current?.(
            message || "Failed to access camera. Please allow camera access."
          );
        }
      }
    };

    const ready = init();

    return () => {
      cancelled = true;
      pendingCleanup = ready.then(async () => {
        if (startedScanner) {
          await stopScanner(startedScanner);
          startedScanner = null;
        }
      });
    };
  }, []);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div id="qr-reader" className="rounded-lg overflow-hidden" />
    </div>
  );
}
