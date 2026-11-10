"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["⌂", "Command Center", "/"],
  ["✦", "Agent Workspace", "/workspace"],
  ["✓", "Decision Proofs", "/decision-proofs"],
  ["⚖", "Policy Guard", "/policy-guard"],
  ["$", "PayPal Checkout", "/checkout"],
  ["▤", "Audit Ledger", "/audit-ledger"],
] as const;

export default function SidebarNav() {
  const pathname = usePathname();
  return <nav>{links.map(([icon, label, href]) => {
    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    return <Link className={active ? "active" : ""} href={href} key={href}><b>{icon}</b> <span>{label}</span>{label === "Decision Proofs" ? <em>LIVE</em> : null}</Link>;
  })}</nav>;
}
