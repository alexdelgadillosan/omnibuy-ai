"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const prompts = ["Build a home office setup under $900", "Find the best value fitness essentials", "Find a verified gift under $100"];

type Product = { id: string; title: string; brand?: string; merchant: string; price: string; currency: string; image_url?: string; product_url: string; availability: string; category: string };

export default function CommandCenter() {
  const [request, setRequest] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("popular products");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function discover(nextQuery = query) {
    setLoading(true); setError(""); setQuery(nextQuery);
    try {
      const response = await fetch(`${API}/api/discovery?query=${encodeURIComponent(nextQuery)}&currency=USD`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Product discovery failed");
      setProducts(data.products || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setProducts([]); } finally { setLoading(false); }
  }

  useEffect(() => { void discover(); }, []);
  const submit = (event: React.FormEvent) => { event.preventDefault(); void discover(request.trim() || "popular products"); };

  return <div className="content command-center"><section className="hero"><label>● AUTONOMOUS ORCHESTRATOR READY</label><h1>What should we <span>buy today?</span></h1><p>Tell OmniBuy what you need. Your AI agent will research, optimize, and verify every purchase before you pay.</p><form className="request-card" onSubmit={submit}><textarea value={request} onChange={e=>setRequest(e.target.value)} placeholder="Build my perfect home office setup under $900 with high ergonomic rating and fast delivery..."/><div className="toolbar"><span>✦ Reasoning: <b>Deep Multi-Hop</b></span><span>◉ Currency: <b>USD</b></span><span>✓ Merchants: <b>Verified data</b></span><span>⌁ Priority: <b>Best Value</b></span></div><button className="run" type="submit" disabled={loading}>{loading ? "Searching live catalog…" : "▶ Search and build a verified plan"}</button></form></section><section className="suggestions"><label>SUGGESTED INTAKES</label>{prompts.map(prompt=><button type="button" onClick={()=>{setRequest(prompt);void discover(prompt)}} key={prompt}><span>✦</span><b>{prompt}</b><small>→</small></button>)}</section><section className="metrics"><Metric label="LIVE CATALOG" value="Channel3" detail={loading ? "Searching…" : `${products.length} live products loaded`}/><Metric label="VERIFIED & PROTECTED" value="Policy-first" detail="Server-side enforcement"/><Metric label="PAYMENT GATEWAY" value="PayPal" detail="Sandbox ready"/><Metric label="ACTIVE SESSIONS" value="Ready" detail="Awaiting your request"/></section><section className="catalog-section"><div className="section-head"><div><label>LIVE PRODUCT DISCOVERY</label><h2>{query}</h2></div><Link href="/workspace">Open Agent Workspace →</Link></div>{error?<div className="discovery-error"><b>Discovery unavailable</b><p>{error}</p></div>:loading?<div className="catalog-loading">Querying Channel3 live product graph…</div>:products.length===0?<div className="empty"><span>◈</span><div><b>No live products matched</b><p>Try a broader shopping request.</p></div></div>:<div className="product-grid">{products.slice(0,8).map(product=><article className="product-card" key={`${product.id}-${product.merchant}`}><a href={product.product_url} target="_blank" rel="noreferrer" className="product-image">{product.image_url?<img src={product.image_url} alt={product.title}/>:<span>◈</span>}</a><div className="product-card-body"><small>{product.brand || product.category} · {product.merchant}</small><h3>{product.title}</h3><strong>${product.price} {product.currency}</strong><span className={product.availability === "in_stock" ? "in-stock" : "out-stock"}>{product.availability.replaceAll("_", " ")}</span><Link href={`/workspace?request=${encodeURIComponent(`Evaluate ${product.title} and similar options`)}`}>Compare options →</Link></div></article>)}</div>}</section><div className="lower"><Panel title="ACTIVE TELEMETRY"><Row title="⚡ Agent reasoning" value="LangGraph workflow" status="Ready"/><Row title="⇄ Product discovery" value="Channel3 API" status={loading?"Searching":"Connected"}/></Panel><Panel title="ACTIVE POLICY GUARDRAILS"><Row title="✓ Budget cap enforcement" value="Server-side" status="Required"/><Row title="✓ Pre-pay Decision Proof" value="Human approval" status="Required"/></Panel></div></div>;
}
function Metric({label,value,detail}:{label:string,value:string,detail:string}){return <article><label>{label}</label><strong>{value}</strong><small>{detail}</small></article>}
function Panel({title,children}:{title:string,children:React.ReactNode}){return <article className="panel"><label>{title}</label><h2>System health</h2>{children}</article>}
function Row({title,value,status}:{title:string,value:string,status:string}){return <p className="row"><span>{title}</span><b>{value}</b><em>{status}</em></p>}
