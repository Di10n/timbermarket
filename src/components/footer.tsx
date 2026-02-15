"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();

  if (pathname === "/tv") return null;

  return (
    <footer className="w-full py-6 text-center text-xl text-foreground/85 font-[family-name:var(--font-gaegu)]">
      Made with love by Agniv Sarkar, Alex Huang, Dilon Chugh, and Gino Chiaranaipanich.
    </footer>
  );
}
