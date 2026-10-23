"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { listingPath } from "../../lib/listing-url";
import { portalCategories, type PortalCategory } from "../categories";
import { getFeaturedPlans } from "../featured-plans";
import EditListingClient from "../editar-anuncio/[id]/edit-listing-client";
import ListingFormCore, { emptyListingFormValue, listingMoneyToCents, type ListingFormValue } from "../listing-form-core";

type Section = "advertisers" | "listings" | "edit" | "create" | "sales" | "approval";
type Advertiser = { id: number; name: string; email: string; whatsapp: string; accountType: string; taxId: string; profileImageUrl: string | null; planName: string; adLimit: number; activeAds: number; createdAt: string };
type Listing = {
  id: string; slug: string; title: string; category: string; subcategory: string; status: string; publicationType: string;
  url: string; manageable: boolean; storeListing?: boolean;
  featuredPlan: string | null; paymentAmountCents: number | null; formattedPrice: string; coverImage: string | null;
  createdAt: string | null; seller: { name?: string; email?: string };
  analytics?: { views: number; pageViews: number; sessions: number; phoneClicks: number; whatsappClicks: number };
};
type DashboardData = { operator: { email: string }; advertisers: Advertiser[]; listings: Listing[]; totalListings: number; categories?: PortalCategory[] };

const sections: Array<{ id: Section; icon: string; label: string }> = [
  { id: "advertisers", icon: "♙", label: "Anunciantes" },
  { id: "listings", icon: "▤", label: "Anúncios do site" },
  { id: "create", icon: "＋", label: "Cadastrar anúncio" },
  { id: "sales", icon: "◆", label: "Destacar anúncio" },
  { id: "approval", icon: "✓", label: "Aprovar anúncios" },
];

function statusLabel(status: string) {
  return status === "active" ? "Publicado" : status === "pending_review" ? "Pendente" : status === "rejected" ? "Rejeitado" : status === "awaiting_payment" ? "Aguardando pagamento" : status;
}
function money(cents: number | null | undefined) { return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function digits(value: string) { return value.replace(/\D/g, ""); }
function maskCpfCnpj(value: string, accountType: string) {
  const number = digits(value).slice(0, accountType === "empresa" ? 14 : 11);
  return accountType === "empresa"
    ? number.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2")
    : number.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskPhone(value: string) {
  const number = digits(value).slice(0, 11);
  return number.length <= 10
    ? number.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}${ddd.length === 2 ? ") " : ""}${first}${last ? `-${last}` : ""}`)
    : number.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}) ${first}${last ? `-${last}` : ""}`);
}

export default function CommercialDashboard({ operatorEmail }: { operatorEmail: string }) {
  const [section, setSection] = useState<Section>("advertisers");
  const [data, setData] = useState<DashboardData>({ operator: { email: operatorEmail }, advertisers: [], listings: [], totalListings: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showAdvertiserForm, setShowAdvertiserForm] = useState(false);
  const [query, setQuery] = useState("");
  const [listingForm, setListingForm] = useState<ListingFormValue>(() => emptyListingFormValue());
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState("");
  const [listingFiles, setListingFiles] = useState<File[]>([]);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [accountType, setAccountType] = useState("particular");
  const [taxId, setTaxId] = useState("");
  const [advertiserPhone, setAdvertiserPhone] = useState("");
  const [highlightListingId, setHighlightListingId] = useState("");
  const [highlightPlan, setHighlightPlan] = useState<"monthly" | "quarterly" | "semiannual">("monthly");
  const [highlightAmount, setHighlightAmount] = useState("");
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editReturnSection, setEditReturnSection] = useState<"listings" | "approval">("listings");
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);

  async function reload() {
    try {
      const response = await fetch("/api/commercial/dashboard", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) { location.href = "/comercial/login"; return; }
      const payload = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os anúncios.");
      setData(payload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os anúncios.");
    } finally { setLoading(false); }
  }
  useEffect(() => { queueMicrotask(() => void reload()); }, []);

  function flash(message: string) {
    setNotice(message); setError("");
    window.setTimeout(() => setNotice(""), 4500);
  }
  async function action(payload: Record<string, unknown>) {
    const response = await fetch("/api/commercial/dashboard", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
    return result;
  }

  const filteredAdvertisers = useMemo(() => data.advertisers.filter((item) => `${item.name} ${item.email} ${item.whatsapp}`.toLowerCase().includes(query.toLowerCase())), [data.advertisers, query]);
  const filteredListings = useMemo(() => data.listings.filter((item) => `${item.title} ${item.category} ${item.seller.name || ""} ${item.seller.email || ""}`.toLowerCase().includes(query.toLowerCase())), [data.listings, query]);
  const pending = useMemo(() => data.listings.filter((item) => item.status === "pending_review"), [data.listings]);
  const selectedAdvertiser = data.advertisers.find((item) => String(item.id) === selectedAdvertiserId);
  const selectedHighlightListing = data.listings.find((item) => item.id === highlightListingId);

  useEffect(() => {
    queueMicrotask(() => {
      if (!selectedHighlightListing) { setHighlightAmount(""); return; }
      const selectedPlan = getFeaturedPlans(selectedHighlightListing.category, selectedHighlightListing.subcategory).find((plan) => plan.code === highlightPlan);
      setHighlightAmount(((selectedPlan?.amountCents || 0) / 100).toFixed(2));
    });
  }, [selectedHighlightListing, highlightPlan]);

  async function uploadProfileImage() {
    if (!profileFile) return "";
    const form = new FormData(); form.append("file", profileFile); form.append("purpose", "profile");
    const response = await fetch("/api/commercial/upload", { method: "POST", body: form });
    const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || "Falha ao enviar a foto de perfil.");
    return result.url;
  }

  async function createAdvertiser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const profileImageUrl = await uploadProfileImage();
      const result = await action({ action: "create-advertiser", accountType, taxId, name: form.get("name"), email: form.get("email"), whatsapp: advertiserPhone, password: form.get("password"), profileImageUrl, sendWelcomeEmail: form.get("sendWelcomeEmail") === "on" });
      event.currentTarget.reset(); setProfileFile(null); setAccountType("particular"); setTaxId(""); setAdvertiserPhone(""); setShowAdvertiserForm(false); await reload(); flash(result.message || "Anunciante cadastrado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar."); } finally { setBusy(false); }
  }

  async function uploadListingImages() {
    const urls: string[] = [];
    for (const file of listingFiles.slice(0, 12)) {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/commercial/upload", { method: "POST", credentials: "include", body: form });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Falha ao enviar uma imagem.");
      urls.push(result.url);
    }
    return urls;
  }

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (!listingForm.coordinates || !listingForm.address) throw new Error("Selecione um endereço válido no mapa.");
      const images = await uploadListingImages();
      const highlighted = form.get("publicationType") === "featured";
      const result = await action({
        action: "create-listing", userId: Number(form.get("userId")), title: listingForm.title, description: listingForm.description,
        category: listingForm.category, subcategory: listingForm.subcategory, negotiationType: listingForm.negotiationType,
        address: listingForm.address, latitude: listingForm.coordinates.lat, longitude: listingForm.coordinates.lng,
        displayName: form.get("displayName"), whatsapp: form.get("whatsapp"), priceCents: listingMoneyToCents(listingForm.price),
        monthlyRentCents: listingMoneyToCents(listingForm.rent), iptuCents: listingMoneyToCents(listingForm.iptu), condoCents: listingMoneyToCents(listingForm.condo),
        negotiable: listingForm.negotiable, attributes: { ...listingForm.attributes, videoUrl: listingForm.videoUrl.trim() }, features: listingForm.features, images,
        publicationType: highlighted ? "featured" : "free", featuredPlan: form.get("featuredPlan"), saleAmountCents: highlighted ? Math.round(Number(form.get("saleAmount")) * 100) : 0,
      });
      event.currentTarget.reset(); setListingFiles([]); setListingForm(emptyListingFormValue()); setSelectedAdvertiserId(""); await reload(); setSection("approval"); flash(result.message || "Anúncio cadastrado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o anúncio."); } finally { setBusy(false); }
  }

  async function moderate(listingId: string, decision: "approve" | "reject") {
    setBusy(true); setError("");
    try { const result = await action({ action: "moderate", listingId, decision }); await reload(); flash(result.message || "Situação atualizada."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível moderar."); } finally { setBusy(false); }
  }

  async function sellHighlight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await action({ action: "sell-highlight", listingId: highlightListingId, planCode: highlightPlan, amountCents: Math.round(Number(highlightAmount) * 100) });
      event.currentTarget.reset(); setHighlightListingId(""); setHighlightPlan("monthly"); setHighlightAmount(""); await reload(); flash(result.message || "Destaque aplicado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a venda."); } finally { setBusy(false); }
  }

  async function deleteListing(item: Listing) {
    if (!item.manageable || !window.confirm(`Excluir o anúncio “${item.title}” do portal? Essa ação não pode ser desfeita.`)) return;
    setDeletingListingId(item.id); setError("");
    try {
      const response = await fetch(`/api/commercial/listings/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
      if (response.status === 401) { location.href = "/comercial/login"; return; }
      const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível excluir o anúncio.");
      setData((current) => ({ ...current, listings: current.listings.filter((listing) => listing.id !== item.id), totalListings: current.totalListings - 1 }));
      flash(result.message || "Anúncio excluído do portal.");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o anúncio."); }
    finally { setDeletingListingId(null); }
  }

  function openListingEditor(listingId: string, returnSection: "listings" | "approval") {
    setEditingListingId(listingId);
    setEditReturnSection(returnSection);
    setSection("edit");
    setError("");
  }

  return (
    <main className="commercial-dashboard">
      <aside className="commercial-sidebar">
        <a className="commercial-brand" href="/"><span>Área comercial</span></a>
        <nav aria-label="Menu comercial">{sections.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} type="button" onClick={() => { setSection(item.id); setQuery(""); setError(""); }}><i>{item.icon}</i>{item.label}{item.id === "approval" && pending.length ? <b>{pending.length}</b> : null}</button>)}</nav>
        <div className="commercial-operator"><span>Operador conectado</span><strong>{operatorEmail}</strong></div>
        <button className="commercial-exit" type="button" onClick={() => fetch("/api/commercial/logout", { method: "POST" }).finally(() => { location.href = "/comercial/login"; })}>Sair do painel</button>
      </aside>
      <section className="commercial-content">
        <header className="commercial-topbar"><div><img src="/logo-balcao.webp" alt="Balcão" /><span>Portal Balcão</span><strong>Gestão comercial</strong></div><a href="/" target="_blank">Abrir site ↗</a></header>
        {notice ? <div className="commercial-notice" role="status">✓ {notice}</div> : null}
        {error ? <div className="commercial-error" role="alert">{error}</div> : null}
        {loading ? <div className="commercial-loading">Carregando dados comerciais…</div> : null}

        {!loading && section === "advertisers" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Anunciantes</span><h1>Clientes cadastrados</h1><p>Cadastre e consulte anunciantes integrados à mesma base do portal.</p></div><button className="primary-button" type="button" onClick={() => setShowAdvertiserForm((current) => !current)}>+ Novo anunciante</button></div>
          {showAdvertiserForm ? <form className="commercial-form-card" onSubmit={createAdvertiser}><h2>Cadastrar anunciante</h2><div className="commercial-advertiser-create"><label className="commercial-profile-upload">{profileFile ? <img src={URL.createObjectURL(profileFile)} alt="Prévia da foto" /> : <span>＋<small>Foto do perfil</small></span>}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setProfileFile(event.target.files?.[0] || null)} /></label><div className="commercial-form-grid"><label>Tipo de pessoa<select value={accountType} onChange={(event) => { setAccountType(event.target.value); setTaxId(""); }}><option value="particular">Pessoa física</option><option value="empresa">Pessoa jurídica</option></select></label><label>{accountType === "empresa" ? "CNPJ" : "CPF"}<input value={taxId} onChange={(event) => setTaxId(maskCpfCnpj(event.target.value, accountType))} required inputMode="numeric" autoComplete="off" /></label><label>Nome ou razão social<input name="name" required autoComplete="name" /></label><label>E-mail<input name="email" type="email" required autoComplete="email" /></label><label>WhatsApp<input value={advertiserPhone} onChange={(event) => setAdvertiserPhone(maskPhone(event.target.value))} required inputMode="tel" autoComplete="tel" /></label><label>Senha temporária<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label><label className="commercial-email-option full"><input name="sendWelcomeEmail" type="checkbox" defaultChecked /><span><strong>Enviar dados de acesso por e-mail</strong><small>O cliente receberá o endereço de acesso e a senha temporária.</small></span></label></div></div><footer><button type="button" className="soft-button" onClick={() => setShowAdvertiserForm(false)}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? "Salvando…" : "Salvar anunciante"}</button></footer></form> : null}
          <div className="commercial-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, e-mail ou WhatsApp" /><span>{filteredAdvertisers.length} anunciante(s)</span></div>
          <div className="commercial-table-wrap"><table><thead><tr><th>Anunciante</th><th>Contato</th><th>Plano</th><th>Anúncios</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>{filteredAdvertisers.map((item) => <tr key={item.id}><td><span className="commercial-advertiser-name">{item.profileImageUrl ? <img src={item.profileImageUrl} alt="" /> : <i>{item.name.slice(0, 1).toUpperCase()}</i>}<span><strong>{item.name}</strong><small>{item.accountType === "empresa" ? "Empresa" : "Particular"} · {item.taxId}</small></span></span></td><td><span>{item.email}</span><small>{item.whatsapp}</small></td><td>{item.planName}</td><td>{item.activeAds}/{item.adLimit}</td><td>{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td><td><span className="commercial-row-actions"><button type="button" onClick={() => { setSelectedAdvertiserId(String(item.id)); setSection("create"); }}>Cadastrar anúncio</button><button type="button" onClick={() => { setQuery(item.email); setSection("sales"); }}>Destacar anúncio</button></span></td></tr>)}</tbody></table></div>
        </section> : null}

        {!loading && section === "listings" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Anúncios</span><h1>Anúncios do site</h1><p>Edite ou exclua anúncios cadastrados no portal. Itens de lojas e fontes externas são gerenciados na origem.</p></div><button className="primary-button" type="button" onClick={() => setSection("create")}>+ Cadastrar anúncio</button></div>
          <div className="commercial-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar em todo o catálogo por título, categoria ou anunciante" /><span>{query ? `${filteredListings.length} resultado(s)` : `${data.totalListings} anúncio(s) no catálogo`}</span></div>
          <div className="commercial-listings">{filteredListings.map((item) => <article key={item.id}>{item.coverImage ? <img src={item.coverImage} alt="" /> : <div className="commercial-no-image">Sem imagem</div>}<div><small>{item.category} · {item.subcategory}</small><h3>{item.title}</h3><p>{item.seller.name || "Anunciante"} · {item.seller.email || ""}</p><strong>{item.formattedPrice}</strong>{item.analytics ? <p>{item.analytics.pageViews || item.analytics.views || 0} visualizações · {(item.analytics.phoneClicks || 0) + (item.analytics.whatsappClicks || 0)} contatos</p> : null}</div><aside><span className={`commercial-status ${item.status}`}>{statusLabel(item.status)}</span>{item.publicationType === "featured" ? <b>◆ Destaque</b> : <b>Grátis</b>}{item.manageable ? <div className="commercial-listing-actions"><button className="soft-button" type="button" disabled={deletingListingId !== null} onClick={() => openListingEditor(item.id, "listings")}>Editar anúncio</button><button className="commercial-delete-button" type="button" disabled={deletingListingId !== null} onClick={() => void deleteListing(item)}>{deletingListingId === item.id ? "Excluindo…" : "Excluir"}</button></div> : <small className="commercial-external-source">{item.storeListing ? "Gerenciado pela loja" : "Fonte externa"}</small>}<a href={item.url || listingPath(item.slug)} target="_blank" rel="noopener noreferrer">Abrir anúncio ↗</a></aside></article>)}</div>
        </section> : null}

        {!loading && section === "edit" && editingListingId ? <section className="commercial-section commercial-edit-section">
          <EditListingClient key={editingListingId} id={editingListingId} mode="commercial" intent={editReturnSection === "approval" ? "review" : "edit"}
            onCancel={() => { setEditingListingId(null); setSection(editReturnSection); }}
            onSaved={(message) => { setEditingListingId(null); setSection(editReturnSection); void reload(); flash(message); }} />
        </section> : null}

        {!loading && section === "create" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Novo anúncio</span><h1>Cadastrar anúncio</h1><p>O anúncio será vinculado ao anunciante selecionado e enviado para aprovação.</p></div></div>
          <form className="single-listing-form commercial-listing-form" onSubmit={createListing}>
            <section className="listing-section">
              <h2>Anunciante</h2>
              <div className="listing-fields two">
                <label className="full">Conta do anunciante<select name="userId" value={selectedAdvertiserId} onChange={(event) => setSelectedAdvertiserId(event.target.value)} required><option value="">Selecione</option>{data.advertisers.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.email}</option>)}</select></label>
              </div>
            </section>
            <ListingFormCore mode="create" categories={data.categories?.length ? data.categories : portalCategories} value={listingForm} onChange={setListingForm} />
            <section className="listing-section">
              <h2>Fotos do anúncio</h2>
              <label className="commercial-upload">＋<strong>Selecionar imagens</strong><span>Até 12 arquivos JPG, PNG, WebP ou AVIF</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => setListingFiles(Array.from(event.target.files || []).slice(0, 12))} required /></label>
              {listingFiles.length ? <div className="commercial-image-preview">{listingFiles.map((file) => <span key={`${file.name}-${file.size}`}><img src={URL.createObjectURL(file)} alt="" />{file.name}</span>)}</div> : null}
            </section>
            <section className="listing-section">
              <h2>Contato do anúncio</h2>
              <div className="listing-fields two"><label>Nome de exibição<input name="displayName" defaultValue={selectedAdvertiser?.name || ""} key={`name-${selectedAdvertiserId}`} required /></label><label>WhatsApp<input name="whatsapp" defaultValue={selectedAdvertiser?.whatsapp || ""} key={`phone-${selectedAdvertiserId}`} required /></label></div>
            </section>
            <section className="listing-section">
              <h2>Tipo de publicação</h2>
              <div className="commercial-publication"><label><input type="radio" name="publicationType" value="free" defaultChecked /> <strong>Anúncio grátis</strong><span>30 dias e aprovação obrigatória</span></label><label><input type="radio" name="publicationType" value="featured" /> <strong>Anúncio com destaque</strong><span>Venda registrada pela equipe comercial</span></label></div>
              <div className="listing-fields two"><label>Período do destaque<select name="featuredPlan"><option value="monthly">30 dias</option><option value="quarterly">90 dias</option><option value="semiannual">180 dias</option></select></label><label>Valor da venda (R$)<input name="saleAmount" type="number" min="0" step="0.01" /></label></div>
            </section>
            <footer className="listing-submit"><span>O anúncio será vinculado ao anunciante e enviado para revisão.</span><button className="primary-button" disabled={busy}>{busy ? "Salvando e enviando imagens…" : "Cadastrar anúncio"}</button></footer>
          </form>
        </section> : null}

        {!loading && section === "sales" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Destaque</span><h1>Destacar anúncio</h1><p>Escolha o anúncio e o período. O destaque e a fatura ficarão registrados na conta do cliente.</p></div></div>
          <form className="commercial-form-card commercial-sale-form" onSubmit={sellHighlight}><label>Anúncio<select value={highlightListingId} onChange={(event) => setHighlightListingId(event.target.value)} required><option value="">Selecione o anúncio</option>{filteredListings.filter((item) => item.seller.email).map((item) => <option key={item.id} value={item.id}>{item.title} — {item.seller.name || "Anunciante"}</option>)}</select></label><label>Período<select value={highlightPlan} onChange={(event) => setHighlightPlan(event.target.value as typeof highlightPlan)}><option value="monthly">Mensal · 30 dias</option><option value="quarterly">Trimestral · 90 dias</option><option value="semiannual">Semestral · 180 dias</option></select></label><label>Valor (R$)<input value={highlightAmount} onChange={(event) => setHighlightAmount(event.target.value)} type="number" min="0.01" step="0.01" required /></label><button className="primary-button" disabled={busy}>{busy ? "Aplicando…" : "Aplicar destaque"}</button></form>
          <div className="commercial-summary-grid"><article><span>Anúncios destacados</span><strong>{data.listings.filter((item) => item.publicationType === "featured").length}</strong></article><article><span>Valor registrado nos anúncios</span><strong>{money(data.listings.reduce((total, item) => total + (item.paymentAmountCents || 0), 0))}</strong></article></div>
        </section> : null}

        {!loading && section === "approval" ? <section className="commercial-section">
          <div className="commercial-section-head"><div><span>Moderação</span><h1>Anúncios pendentes</h1><p>A aprovação publica o anúncio imediatamente no Portal Balcão.</p></div><b className="commercial-pending-count">{pending.length} pendente(s)</b></div>
          <div className="commercial-approval-list">{pending.map((item) => <article key={item.id}>{item.coverImage ? <img src={item.coverImage} alt="" /> : null}<div><small>{item.category} · {item.subcategory}</small><h3>{item.title}</h3><p>{item.seller.name || "Anunciante"} · {item.seller.email || ""}</p><strong>{item.formattedPrice}{item.publicationType === "featured" ? " · Destaque vendido" : " · Gratuito"}</strong></div><footer>{item.manageable ? <button className="soft-button" type="button" disabled={busy} onClick={() => openListingEditor(item.id, "approval")}>Revisar anúncio</button> : null}<a className="soft-button" href={item.url || listingPath(item.slug)} target="_blank" rel="noopener noreferrer">Visualizar</a><button className="commercial-reject" type="button" disabled={busy} onClick={() => void moderate(item.id, "reject")}>Rejeitar</button><button className="primary-button" type="button" disabled={busy} onClick={() => void moderate(item.id, "approve")}>Aprovar e publicar</button></footer></article>)}{!pending.length ? <div className="commercial-empty"><span>✓</span><h2>Nenhum anúncio pendente</h2><p>A fila de aprovação está atualizada.</p></div> : null}</div>
        </section> : null}
      </section>
    </main>
  );
}
