import "./globals.css";
import Link from "next/link";
import SidebarNav from "../components/SidebarNav";
import TopBar from "../components/TopBar";
import NavController from "../components/NavController";

export const metadata = { title: "OmniBuy AI — Verified Autonomous Commerce", description: "AI can decide what to buy. OmniBuy proves it should." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{if(localStorage.getItem("omnibuy-theme")==="light"){document.documentElement.setAttribute("data-theme","light")}}catch(e){}})();',
          }}
        />
        <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-label="Toggle navigation" />
        <label htmlFor="nav-toggle" className="nav-scrim" aria-hidden="true" />
        <NavController />
        <aside className="sidebar">
          <label htmlFor="nav-toggle" className="nav-close" aria-label="Close navigation">✕</label>
          <Link href="/" className="logo"><span>✦</span> Omni<span>Buy</span> <small>AI</small></Link>
          <p className="version">AGENTIC SPEND ENGINE V2.4</p>
          <Link href="/workspace" className="deploy-agent"><b>✦</b> Deploy Agent</Link>
          <SidebarNav />
          <div className="sidebar-bottom">
            <Link href="/audit-ledger">🛡 <span>Security Telemetry</span></Link>
            <Link href="/policy-guard">⚙ <span>Terminal Settings</span></Link>
            <div className="user"><b>A</b><span>Alex Delgadillo<small>Chief Financial Controller · L4</small></span></div>
          </div>
        </aside>
        <main className="main">
          <TopBar />
          {children}
        </main>
      </body>
    </html>
  );
}
