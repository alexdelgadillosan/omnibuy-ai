"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const links = [
  ["▦", "Command Center", "/"],
  ["✦", "Agent Workspace", "/workspace"],
  ["✓", "Decision Proofs", "/decision-proofs"],
  ["⚖", "Policy Guard", "/policy-guard"],
  ["$", "PayPal Checkout", "/checkout"],
  ["▤", "Audit Ledger", "/audit-ledger"],
] as const;

export default function SidebarNav() {
  const pathname = usePathname();
  const [proofs, setProofs] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/api/decision-proofs`)
      .then((response) => (response.ok ? response.json() : []))
      .then((items: any[]) => setProofs(items.length))
      .catch(() => undefined);
  }, [pathname]);

  return (
    <nav>
      {links.map(([icon, label, href]) => {
        const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link className={active ? "active" : ""} href={href} key={href}>
            <b>{icon}</b>
            <span>{label}</span>
            {label === "Decision Proofs" && proofs !== null ? <em>{proofs}</em> : null}
          </Link>
        );
      })}
    </nav>
  );
}
