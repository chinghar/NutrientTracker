"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/log", label: "Log" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

// Both solid (no opacity blending, so the verified ratios hold exactly):
// Butter on Cocoa = 13.42:1, Marigold on Cocoa = 7.87:1 — both clear AA normal text.
export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-5 gap-y-1 bg-cocoa px-6 py-3 text-sm">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`min-h-11 py-2 ${active ? "font-bold text-marigold" : "font-medium text-butter"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
