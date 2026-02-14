"use client";

import { useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

export default function QrScanner({ onScan, onError }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScanned = useRef(false);

  const handleScan = useCallback(
    (decodedText: string) => {
      if (hasScanned.current) return;
      hasScanned.current = true;

      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
      onScan(decodedText);
    },
    [onScan]
  );

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScan,
        () => {}
      )
      .catch((err) => {
        onError?.(
          err?.message || "Failed to access camera. Please allow camera access."
        );
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [handleScan, onError]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div id="qr-reader" className="rounded-lg overflow-hidden" />
    </div>
  );
}
