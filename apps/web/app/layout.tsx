import "./globals.css";
import Link from "next/link";
import SidebarNav from "../components/SidebarNav";

export const metadata = { title: "OmniBuy AI — Verified Autonomous Commerce", description: "AI can decide what to buy. OmniBuy proves it should." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><aside className="sidebar"><Link href="/" className="logo"><span>✦</span> Omni<span>Buy</span> <small>AI</small></Link><p className="version">V2.4 · AGENT CORE</p><SidebarNav /><div className="sidebar-bottom"><p>● Sandbox Mode</p><Link href="/policy-guard">⚙ <span>Terminal Settings</span></Link><div className="user"><b>A</b><span>Alex Delgadillo<small>Principal Supervisor</small></span></div></div></aside><main className="main"><header><div className="search">⌕ <span>Search agents, orders, policy rules...</span><kbd>⌘ K</kbd></div><div className="top-status">● PayPal Sandbox &nbsp; ◉ &nbsp; ♢</div></header>{children}</main></body></html>;
}
