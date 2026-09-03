"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Log" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 border-b border-neutral-200 px-6 py-3 text-sm dark:border-neutral-800">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? "font-medium underline" : "text-neutral-500"}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
