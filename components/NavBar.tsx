"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "/" isn't linked here: once setup is complete it just redirects straight to
// /dashboard (by design — see the setup-gate behavior), so a persistent "Home"
// nav entry would only ever be a slower path to a page already in this list.
// It's still reachable directly, and via the setup banner while incomplete.
const LINKS = [
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
