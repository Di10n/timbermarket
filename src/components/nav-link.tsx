"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`transition-colors ${
        isActive
          ? "text-foreground font-medium"
          : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
