"use client";

import { useEffect, useState } from "react";
import type { CampaignLanding } from "../campanha/landing-data";

export default function LandingPagesManager() {
  const [pages, setPages] = useState<CampaignLanding[]>([]);
  const [pixelId, setPixelId] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/landing-pages", { cache: "no-store" }).then((response) => response.json()).then((data) => { setPages(Array.isArray(data.pages) ? data.pages.filter(Boolean) : []); setPixelId(typeof data.facebookPixelId === "string" ? data.facebookPixelId : ""); }).finally(() => setBusy(false)); }, []);
  const update = (index: number, field: "eyebrow" | "title" | "description" | "ctaLabel", value: string) => setPages((current) => current.map((page, pageIndex) => pageIndex === index ? { ...page, [field]: value } : page));
  async function save() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/landing-pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pages, facebookPixelId: pixelId }) });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Landing pages e Pixel salvos." : data.error || "Não foi possível salvar."); setBusy(false);
  }
  return <section className="admin-section landing-admin"><span className="hero-kicker">Campanhas</span><h1>Landing pages</h1><p>Edite as páginas de conversão e use os links com UTM nas campanhas do Facebook e Instagram.</p>
    <div className="panel-card landing-pixel-card"><div><h2>Meta Pixel</h2><p>Informe o ID numérico para registrar visualizações e leads nas três páginas.</p></div><label>ID do Pixel<input inputMode="numeric" value={pixelId} onChange={(event) => setPixelId(event.target.value.replace(/\D/g, ""))} placeholder="Ex.: 123456789012345" /></label></div>
    <div className="landing-admin-grid">{pages.map((page, index) => <article className="panel-card" key={page.slug}><header><div><span>{page.theme === "property" ? "Imóveis" : page.theme === "vehicle" ? "Veículos" : "Destaque"}</span><h2>{page.slug}</h2></div><a href={`/campanha/${page.slug}`} target="_blank" rel="noreferrer">Abrir página ↗</a></header><label>Chamada superior<input value={page.eyebrow} onChange={(event) => update(index, "eyebrow", event.target.value)} /></label><label>Título principal<textarea rows={2} value={page.title} onChange={(event) => update(index, "title", event.target.value)} /></label><label>Texto de apresentação<textarea rows={4} value={page.description} onChange={(event) => update(index, "description", event.target.value)} /></label><label>Texto do botão<input value={page.ctaLabel} onChange={(event) => update(index, "ctaLabel", event.target.value)} /></label><small>URL: /campanha/{page.slug}</small></article>)}</div>
    <div className="landing-admin-save"><button type="button" className="primary-button" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar páginas"}</button>{message ? <span>{message}</span> : null}</div>
  </section>;
}
