"use client";

import { useEffect, useMemo, useState } from "react";

type CallUser = { id: string; name: string; email: string; whatsapp?: string };
type CallItem = { id: string; userId: number; customerName: string; customerEmail: string; customerPhone: string; offerType: string; prompt: string; script: string; audioMimeType: string; createdAt: string };

function phoneHref(value: string) { const digits = value.replace(/\D/g, ""); return digits ? `tel:+${digits.startsWith("55") ? digits : `55${digits}`}` : "#"; }

export default function CallCampaignsManager({ users }: { users: CallUser[] }) {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [keyHint, setKeyHint] = useState("");
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [offerType, setOfferType] = useState<"new_listing" | "featured">("new_listing");
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<CallItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/call-campaigns", { cache: "no-store" }).then((response) => response.json()).then((data) => { setConfigured(data.configured === true); setKeyHint(typeof data.keyHint === "string" ? data.keyHint : ""); setHistory(Array.isArray(data.history) ? data.history : []); }).catch(() => setMessage("Não foi possível carregar o histórico.")); }, []);
  const availableUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.whatsapp || ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))).slice(0, 100), [query, users]);
  async function saveKey() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/call-campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settings", apiKey }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) { setConfigured(true); setKeyHint(apiKey ? `••••${apiKey.slice(-4)}` : keyHint); setApiKey(""); setMessage("API do Gemini salva."); } else setMessage(data.error || "Não foi possível salvar a API.");
    setBusy(false);
  }
  async function generate() {
    if (!userId) return setMessage("Escolha o cliente antes de gerar.");
    setBusy(true); setMessage("Gerando roteiro e áudio…");
    const response = await fetch("/api/admin/call-campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generate", userId, offerType, notes }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.item) { setHistory((current) => [data.item, ...current]); setMessage("Roteiro e áudio gerados com sucesso."); } else setMessage(data.error || "Não foi possível gerar o áudio.");
    setBusy(false);
  }
  function prepareAgain(item: CallItem) { setUserId(`customer-${item.userId}`); setOfferType(item.offerType === "featured" ? "featured" : "new_listing"); setNotes(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  return <section className="admin-section ai-calls-admin"><span className="hero-kicker">Prospecção</span><h1>Ligações com Gemini</h1><p>Gere um roteiro e um áudio comercial personalizado, escute antes de ligar e abra a chamada no dispositivo. O histórico fica salvo no painel.</p>
    <div className="panel-card gemini-key-card"><div><h2>API do Gemini</h2><p>{configured ? `Integração configurada (${keyHint}).` : "Cadastre sua chave do Google AI Studio para gerar roteiros e voz."}</p></div><label>Chave da API<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? "Deixe vazio para manter a chave atual" : "Cole a chave da API"} /></label><button className="soft-button" type="button" onClick={saveKey} disabled={busy || (!apiKey && !configured)}>Salvar API</button></div>
    <div className="panel-card ai-call-builder"><header><div><span>Novo contato</span><h2>Preparar ligação</h2></div><b>1. Cliente&nbsp;&nbsp; 2. Oferta&nbsp;&nbsp; 3. Áudio</b></header><div className="ai-call-form"><label>Pesquisar cliente<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, e-mail ou WhatsApp" /></label><label>Cliente<select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Escolha um cliente</option>{availableUsers.map((user) => <option value={user.id} key={user.id}>{user.name} — {user.email}</option>)}</select></label><label>Objetivo da ligação<select value={offerType} onChange={(event) => setOfferType(event.target.value as "new_listing" | "featured")}><option value="new_listing">Ofertar criação de anúncio</option><option value="featured">Ofertar plano de destaque</option></select></label><label className="ai-call-notes">Observações opcionais<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: cliente possui uma imobiliária; enfatizar divulgação local." /></label></div><button className="primary-button" type="button" onClick={generate} disabled={busy || !configured}>{busy ? "Gerando…" : "Gerar roteiro e áudio"}</button>{message ? <span className="admin-inline-status">{message}</span> : null}</div>
    <div className="ai-call-history"><header><div><span className="hero-kicker">Histórico</span><h2>Áudios gerados</h2></div><strong>{history.length} registro{history.length === 1 ? "" : "s"}</strong></header>{history.length ? <div>{history.map((item) => <article className="panel-card" key={item.id}><header><div><h3>{item.customerName}</h3><small>{item.customerEmail} · {item.customerPhone || "Sem telefone"}</small></div><time>{new Date(item.createdAt).toLocaleString("pt-BR")}</time></header><span className="ai-call-offer">{item.offerType === "featured" ? "Plano de destaque" : "Novo anúncio"}</span><p>{item.script}</p><audio controls preload="none" src={`/api/admin/call-campaigns/audio?id=${encodeURIComponent(item.id)}`}><track kind="captions" /></audio><div className="ai-call-actions"><a className="primary-button" href={phoneHref(item.customerPhone)}>Ligar agora</a><a className="soft-button" href={`/api/admin/call-campaigns/audio?id=${encodeURIComponent(item.id)}&download=1`}>Baixar áudio</a><button className="soft-button" type="button" onClick={() => prepareAgain(item)}>Gerar novo</button></div></article>)}</div> : <p className="empty-rail">Nenhum áudio gerado até o momento.</p>}</div>
    <aside className="ai-call-note"><strong>Como funciona</strong><p>O Gemini prepara o roteiro e a locução. O botão “Ligar agora” abre o discador do dispositivo; a chamada não é realizada automaticamente pela API.</p></aside>
  </section>;
}
