"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { portalCategories, type PortalCategory } from "../categories";
import { formatPlanPrice, getFeaturedPlans } from "../featured-plans";
import { MapPlaceSearch } from "../google-place-search";
import { encryptMercadoPagoCard } from "../mercadopago-card";
import ListingDescriptionEditor from "../listing-description-editor";
import { plainListingDescription } from "../../lib/listing-description";

type Step = "describe" | "plan" | "preview" | "account" | "payment" | "success";
type Offer = "free" | "premium" | "video" | "complete";
type Draft = {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  negotiationType: "Compra" | "Venda" | "Troca" | "Aluguel" | "Temporada" | "Serviço" | "Outra";
  priceCents: number | null;
  negotiable: boolean;
  assistantMessage: string;
};
type Photo = { file: File; preview: string };
type Account = { name: string; email: string; whatsapp: string };
type Verification = { registrationId: string; deliveryChannels: string[]; email: string; whatsapp: string };
type Success = {
  listingId: string;
  message: string;
  qrCodeText?: string;
  qrCodeImage?: string;
  paymentExpiresAt?: string;
  paymentMethod?: "PIX" | "CREDIT_CARD" | null;
  paymentStatus?: string | null;
  paymentAmountCents?: number;
  paid?: boolean;
};

const offerContent: Record<Offer, { label: string; eyebrow: string; description: string }> = {
  free: { label: "Anúncio grátis", eyebrow: "Somente internet", description: "Publicação gratuita no portal, sujeita à revisão da equipe." },
  premium: { label: "Internet Premium", eyebrow: "Mais visibilidade", description: "Anúncio destacado na home, nas categorias e nos resultados de busca." },
  video: { label: "Vídeo anúncio", eyebrow: "Formato audiovisual", description: "Anúncio destacado com link de vídeo do YouTube, Vimeo ou arquivo MP4/WebM." },
  complete: { label: "Pacote completo", eyebrow: "Todos os recursos", description: "Internet Premium, identificação de destaque e vídeo em um único anúncio." },
};
const negotiations = ["Venda", "Aluguel", "Troca", "Compra", "Temporada", "Serviço", "Outra"] as const;
const digits = (value: string) => value.replace(/\D/g, "");
const moneyToCents = (value: string) => { const raw = digits(value); return raw ? Number(raw) : null; };
const formatMoney = (value: string) => { const raw = digits(value).slice(0, 13); return raw ? (Number(raw) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""; };
const formatPhone = (value: string) => {
  const raw = digits(value).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (raw.length <= 2) return raw ? `(${raw}` : "";
  if (raw.length <= 6) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
  if (raw.length <= 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
};
const formatDraftPrice = (value: number | null) => value == null ? "" : (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function readResponse(response: Response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
  catch { return { error: response.ok ? "O servidor retornou uma resposta inválida." : raw.slice(0, 180) || "Não foi possível concluir a solicitação." }; }
}

async function optimizeImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.84;
  let blob: Blob | null = null;
  do {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    quality -= 0.08;
  } while (blob && blob.size > 1_500_000 && quality >= 0.52);
  if (!blob) throw new Error(`Não foi possível otimizar a imagem ${file.name}.`);
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

function PaymentCardFields({ amountCents }: { amountCents: number }) {
  return <div className="ai-payment-card-fields">
    <header><div><strong>Dados do cartão</strong><span>Tokenizados pelo Mercado Pago</span></div><b>{formatPlanPrice(amountCents)}</b></header>
    <div className="ai-form-grid two">
      <label className="full">Nome impresso no cartão<input name="cardHolder" autoComplete="cc-name" required /></label>
      <label className="full">Número do cartão<input name="cardNumber" inputMode="numeric" autoComplete="cc-number" maxLength={23} required onInput={(event) => { event.currentTarget.value = digits(event.currentTarget.value).slice(0, 19).replace(/(.{4})/g, "$1 ").trim(); }} /></label>
      <label>Mês<input name="cardExpMonth" inputMode="numeric" autoComplete="cc-exp-month" maxLength={2} placeholder="MM" required /></label>
      <label>Ano<input name="cardExpYear" inputMode="numeric" autoComplete="cc-exp-year" maxLength={4} placeholder="AAAA" required /></label>
      <label>CVV<input name="cardSecurityCode" type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} required /></label>
      <label>Parcelamento<select name="cardInstallments" defaultValue="1"><option value="1">1x sem juros</option><option value="2">2x</option><option value="3">3x</option></select></label>
      <label className="full">CPF ou CNPJ do titular<input name="cardTaxId" inputMode="numeric" minLength={11} maxLength={18} required /></label>
    </div>
  </div>;
}

export default function ListingAssistantClient() {
  const [step, setStep] = useState<Step>("describe");
  const [categories, setCategories] = useState<PortalCategory[]>(portalCategories);
  const [prompt, setPrompt] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [offer, setOffer] = useState<Offer>("free");
  const [videoUrl, setVideoUrl] = useState("");
  const [price, setPrice] = useState("");
  const [negotiable, setNegotiable] = useState(true);
  const [address, setAddress] = useState("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountMode, setAccountMode] = useState<"login" | "register">("register");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [paymentOptions, setPaymentOptions] = useState({ pix: false, card: false });
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [success, setSuccess] = useState<Success | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (Array.isArray(data.categories) && data.categories.length) setCategories(data.categories);
      const mercadoPago = data.mercadopago_enabled === true;
      const options = {
        pix: mercadoPago && data.mercadopago_pix_enabled !== false,
        card: mercadoPago && data.mercadopago_card_enabled !== false,
      };
      setPaymentOptions(options);
      if (!options.pix && options.card) setPaymentMethod("card");
      if (!options.pix && !options.card) setOffer("free");
    }).catch(() => undefined);
    fetch("/api/customer/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setAccount({ name: String(data.customer?.name || ""), email: String(data.customer?.email || ""), whatsapp: String(data.customer?.whatsapp || "") });
    }).finally(() => setAuthChecked(true));
  }, []);

  const selectedCategory = categories.find((item) => item.name === draft?.category);
  const featuredPlans = useMemo(
    () => getFeaturedPlans(draft?.category || "", draft?.subcategory || ""),
    [draft?.category, draft?.subcategory],
  );
  const featuredPlanCode = offer === "complete" ? "semiannual" : "monthly";
  const selectedFeaturedPlan = featuredPlans.find((item) => item.code === featuredPlanCode) || featuredPlans[0];
  const offerAmount = offer === "free" ? 0 : selectedFeaturedPlan.amountCents;
  const needsVideo = offer === "video" || offer === "complete";
  const paymentsAvailable = paymentOptions.pix || paymentOptions.card;

  function addPhotos(files: FileList | null) {
    const selected = Array.from(files || []);
    const accepted = selected.filter((file) => ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) && file.size <= 8 * 1024 * 1024);
    if (accepted.length !== selected.length) setError("Use imagens JPG, PNG, WebP ou AVIF com até 8 MB.");
    setPhotos((current) => [...current, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, 12));
  }
  function removePhoto(index: number) {
    setPhotos((current) => { URL.revokeObjectURL(current[index].preview); return current.filter((_, itemIndex) => itemIndex !== index); });
  }

  async function generateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (prompt.trim().length < 20) return setError("Descreva o produto ou serviço com mais detalhes.");
    if (!photos.length) return setError("Adicione pelo menos uma imagem para preparar o anúncio.");
    setBusy(true);
    const response = await fetch("/api/listing-assistant/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: prompt }) }).catch(() => null);
    const data = response ? await readResponse(response) : {};
    setBusy(false);
    if (!response?.ok || !data.draft || typeof data.draft !== "object") return setError(typeof data.error === "string" ? data.error : "Não foi possível gerar o anúncio.");
    const next = data.draft as Draft;
    setDraft(next); setPrice(formatDraftPrice(next.priceCents)); setNegotiable(next.negotiable); setStep("plan"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPreview() {
    setError("");
    if (needsVideo && !/^https:\/\//i.test(videoUrl.trim())) return setError("Informe um link HTTPS do vídeo para este formato.");
    setStep("preview"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validatePreview() {
    if (!draft) return "Gere o anúncio antes de continuar.";
    if (draft.title.trim().length < 8 || draft.title.trim().length > 120) return "O título deve ter entre 8 e 120 caracteres.";
    const descriptionLength = plainListingDescription(draft.description).length;
    if (descriptionLength < 30 || descriptionLength > 5000 || draft.description.length > 20000) return "A descrição deve ter entre 30 e 5.000 caracteres.";
    if (!selectedCategory?.subs.includes(draft.subcategory)) return "Selecione uma categoria e subcategoria válidas.";
    if (!coordinates || !address) return "Selecione o endereço do anúncio na pesquisa de localização.";
    if (!negotiable && moneyToCents(price) == null) return "Informe o preço ou marque Valor a combinar.";
    if (needsVideo && !/^https:\/\//i.test(videoUrl.trim())) return "Informe o link do vídeo.";
    return "";
  }

  async function continueFromPreview() {
    const issue = validatePreview(); setError(issue); if (issue) return;
    if (offer !== "free" && !paymentOptions.pix && !paymentOptions.card) {
      setError("Os pagamentos estão desativados no momento. Escolha o anúncio grátis.");
      setStep("plan");
      return;
    }
    if (!authChecked) return setError("Aguarde a verificação da conta.");
    if (!account) { setStep("account"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (offer !== "free") { setStep("payment"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    await publishListing(undefined, account);
  }

  async function readAccount() {
    const response = await fetch("/api/customer/me", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível confirmar a conta.");
    const data = await response.json();
    return { name: String(data.customer?.name || ""), email: String(data.customer?.email || ""), whatsapp: String(data.customer?.whatsapp || "") } satisfies Account;
  }

  async function afterAuthentication(resolved: Account) {
    setAccount(resolved);
    if (offer !== "free" && !paymentOptions.pix && !paymentOptions.card) {
      setError("Os pagamentos estão desativados no momento. Escolha o anúncio grátis.");
      setStep("plan");
    }
    else if (offer !== "free") { setStep("payment"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else await publishListing(undefined, resolved);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/customer/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password"), remember: true }) });
    const data = await readResponse(response);
    if (!response.ok) { setBusy(false); return setError(typeof data.error === "string" ? data.error : "Não foi possível entrar."); }
    try { await afterAuthentication(await readAccount()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar a conta."); }
    setBusy(false);
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/customer/register/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountType: form.get("accountType"), taxId: form.get("taxId"), name: form.get("name"), email: form.get("email"), whatsapp: form.get("whatsapp"), password: form.get("password") }) });
    const data = await readResponse(response); setBusy(false);
    if (!response.ok) return setError(typeof data.error === "string" ? data.error : "Não foi possível criar a conta.");
    if (data.verificationRequired === true) {
      setVerification({ registrationId: String(data.registrationId || ""), deliveryChannels: Array.isArray(data.deliveryChannels) ? data.deliveryChannels.map(String) : [], email: String(data.email || ""), whatsapp: String(data.whatsapp || "") });
      return;
    }
    try { await afterAuthentication(await readAccount()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar a conta."); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!verification) return; setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/customer/register/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ registrationId: verification.registrationId, code: form.get("code") }) });
    const data = await readResponse(response); setBusy(false);
    if (!response.ok) return setError(typeof data.error === "string" ? data.error : "Código inválido.");
    try { await afterAuthentication(await readAccount()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar a conta."); }
  }

  async function publishListing(cardForm?: FormData, accountOverride?: Account) {
    const issue = validatePreview(); if (issue) { setError(issue); setStep("preview"); return; }
    const currentAccount = accountOverride || account; if (!currentAccount || !draft || !coordinates) { setStep("account"); return; }
    setBusy(true); setError("");
    try {
      const cardPayload = offer !== "free" && paymentMethod === "card" && cardForm
        ? await encryptMercadoPagoCard(cardForm)
        : {};
      const images: string[] = [];
      for (const photo of photos) {
        const upload = new FormData(); upload.append("file", await optimizeImage(photo.file));
        const response = await fetch("/api/listing-images", { method: "POST", body: upload });
        const data = await readResponse(response);
        if (!response.ok || typeof data.url !== "string") throw new Error(typeof data.error === "string" ? data.error : "Falha ao enviar uma imagem.");
        images.push(data.url);
      }
      const amount = moneyToCents(price);
      const response = await fetch("/api/listings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        title: draft.title.trim(), description: draft.description.trim(), category: draft.category, subcategory: draft.subcategory,
        negotiationType: draft.negotiationType, priceCents: draft.negotiationType === "Aluguel" ? null : amount, monthlyRentCents: draft.negotiationType === "Aluguel" ? amount : null,
        negotiable, address, latitude: coordinates.lat, longitude: coordinates.lng, displayName: currentAccount.name, whatsapp: currentAccount.whatsapp,
        images, attributes: { salesFormat: offer, videoUrl: needsVideo ? videoUrl.trim() : "" }, features: [], publicationType: offer === "free" ? "free" : "featured",
        featuredPlan: featuredPlanCode, paymentMethod, ...cardPayload,
      }) });
      const data = await readResponse(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível publicar o anúncio.");
      setSuccess({ listingId: String(data.listingId || ""), message: String(data.message || "Anúncio criado com sucesso e enviado para revisão."), qrCodeText: typeof data.qrCodeText === "string" ? data.qrCodeText : undefined, qrCodeImage: typeof data.qrCodeImage === "string" ? data.qrCodeImage : undefined, paymentExpiresAt: typeof data.paymentExpiresAt === "string" ? data.paymentExpiresAt : undefined, paymentMethod: data.paymentMethod === "PIX" || data.paymentMethod === "CREDIT_CARD" ? data.paymentMethod : null, paymentStatus: typeof data.paymentStatus === "string" ? data.paymentStatus : null, paymentAmountCents: typeof data.paymentAmountCents === "number" ? data.paymentAmountCents : undefined, paid: data.paid === true });
      setStep("success"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível publicar o anúncio."); }
    finally { setBusy(false); }
  }

  return <section className="ai-listing-page">
    <header className="ai-listing-hero"><span>Criação inteligente</span><h1>Crie seu anúncio com IA</h1><p>Descreva o produto ou serviço, adicione as imagens e revise tudo antes de publicar.</p><ol><li className={step === "describe" ? "active" : "done"}>1. Descrição</li><li className={step === "plan" ? "active" : ["preview", "account", "payment", "success"].includes(step) ? "done" : ""}>2. Formato</li><li className={step === "preview" ? "active" : ["account", "payment", "success"].includes(step) ? "done" : ""}>3. Prévia</li><li className={["account", "payment"].includes(step) ? "active" : step === "success" ? "done" : ""}>4. Publicação</li></ol></header>
    <div className="ai-listing-workspace">
      {step === "describe" ? <section className="ai-chat-panel">
        <header><i aria-hidden="true">✦</i><div><strong>Assistente de anúncios</strong><span>Jornal Balcão</span></div></header>
        <div className="ai-chat-messages"><article className="assistant"><b>Assistente</b><p>O que você deseja anunciar? Descreva o produto ou serviço com as principais informações.</p></article>{prompt.trim() ? <article className="visitor"><b>Você</b><p>{prompt}</p></article> : null}</div>
        <form onSubmit={generateDraft}>
          <label>Descreva o produto ou serviço<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={20} maxLength={6000} rows={7} placeholder="Ex.: Quero vender um veículo, informe marca, modelo, ano, estado, preço e demais detalhes reais..." required /></label>
          <label className="ai-photo-picker"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => addPhotos(event.target.files)} /><span>＋</span><strong>Insira as imagens do que deseja anunciar</strong><small>Até 12 imagens · JPG, PNG, WebP ou AVIF</small></label>
          {photos.length ? <div className="ai-photo-list">{photos.map((photo, index) => <figure key={photo.preview}><img src={photo.preview} alt={`Imagem ${index + 1}`} /><button type="button" onClick={() => removePhoto(index)} aria-label={`Remover imagem ${index + 1}`}>×</button></figure>)}</div> : null}
          {error ? <p className="ai-listing-error" role="alert">{error}</p> : null}
          <button className="ai-primary-action" disabled={busy}>{busy ? "Gerando anúncio…" : "✦ Gerar anúncio com IA"}</button>
        </form>
      </section> : null}

      {step === "plan" && draft ? <section className="ai-step-card"><header><span>Rascunho preparado</span><h2>{draft.assistantMessage}</h2><p>Escolha como deseja publicar o anúncio.</p></header>
        <div className="ai-offer-grid">{(Object.keys(offerContent) as Offer[]).map((item) => { const content = offerContent[item]; const priceLabel = item === "free" ? "Grátis" : formatPlanPrice(item === "complete" ? featuredPlans.find((plan) => plan.code === "semiannual")?.amountCents || 0 : featuredPlans[0]?.amountCents || 0); const disabled = item !== "free" && !paymentsAvailable; return <label className={`${offer === item ? "selected" : ""}${disabled ? " unavailable" : ""}`} key={item}><input type="radio" name="offer" value={item} checked={offer === item} disabled={disabled} onChange={() => setOffer(item)} /><span>{content.eyebrow}</span><strong>{content.label}</strong><b>{priceLabel}</b><small>{content.description}</small></label>; })}</div>
        {!paymentsAvailable ? <p className="ai-listing-error" role="status">Os formatos pagos estão temporariamente desativados. O anúncio grátis continua disponível.</p> : null}
        {needsVideo ? <label className="ai-video-field">Link do vídeo<input type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtube.com/..." required /><small>Use YouTube, Vimeo ou link direto MP4/WebM.</small></label> : null}
        {error ? <p className="ai-listing-error" role="alert">{error}</p> : null}
        <footer><button className="ai-secondary-action" type="button" onClick={() => setStep("describe")}>Voltar</button><button className="ai-primary-action" type="button" onClick={openPreview}>Gerar prévia</button></footer>
      </section> : null}

      {step === "preview" && draft ? <section className="ai-step-card ai-preview-step"><header><span>Revise antes de publicar</span><h2>Prévia do anúncio</h2><p>Confirme as informações. A IA não substitui os dados reais fornecidos pelo anunciante.</p></header>
        <div className="ai-preview-layout"><div className="ai-preview-gallery"><img src={photos[0]?.preview} alt="Foto principal do anúncio" />{photos.length > 1 ? <div>{photos.slice(1, 5).map((photo, index) => <img key={photo.preview} src={photo.preview} alt={`Foto adicional ${index + 2}`} />)}</div> : null}<span>{offerContent[offer].label}</span></div>
          <div className="ai-preview-form">
            <label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={120} /></label>
            <ListingDescriptionEditor value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
            <div className="ai-form-grid two"><label>Categoria<select value={draft.category} onChange={(event) => { const nextCategory = categories.find((item) => item.name === event.target.value); setDraft({ ...draft, category: event.target.value, subcategory: nextCategory?.subs[0] || "" }); }}><option value="">Selecione</option>{categories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Subcategoria<select value={draft.subcategory} onChange={(event) => setDraft({ ...draft, subcategory: event.target.value })}>{selectedCategory?.subs.map((item) => <option key={item}>{item}</option>)}</select></label><label>Negociação<select value={draft.negotiationType} onChange={(event) => setDraft({ ...draft, negotiationType: event.target.value as Draft["negotiationType"] })}>{negotiations.map((item) => <option key={item}>{item}</option>)}</select></label><label>Preço em reais<input value={price} onChange={(event) => setPrice(formatMoney(event.target.value))} inputMode="numeric" disabled={negotiable} placeholder="0,00" /></label></div>
            <label className="ai-inline-check"><input type="checkbox" checked={negotiable} onChange={(event) => setNegotiable(event.target.checked)} /><span>Valor a combinar</span></label>
            <label>Localização<MapPlaceSearch onSelect={(result) => { setAddress(result.formattedAddress); setCoordinates({ lat: result.lat, lng: result.lng }); }} />{address ? <small>Selecionado: {address}</small> : null}</label>
          </div>
        </div>
        <aside className="ai-selected-offer"><div><span>Formato escolhido</span><strong>{offerContent[offer].label}</strong></div><b>{offer === "free" ? "Grátis" : formatPlanPrice(offerAmount)}</b></aside>
        {error ? <p className="ai-listing-error" role="alert">{error}</p> : null}
        <footer><button className="ai-secondary-action" type="button" onClick={() => setStep("plan")}>Alterar formato</button><button className="ai-primary-action" type="button" disabled={busy} onClick={() => void continueFromPreview()}>{busy ? "Publicando…" : "Publicar anúncio"}</button></footer>
      </section> : null}

      {step === "account" ? <section className="ai-step-card ai-account-step"><header><span>Conta do anunciante</span><h2>Entre ou crie sua conta</h2><p>O anúncio será salvo nesta conta e encaminhado para revisão.</p></header>
        {verification ? <form className="ai-account-form narrow" onSubmit={verify}><label>Código de ativação<input name="code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="0000" required /></label><p>O código foi enviado pelos canais configurados: {verification.deliveryChannels.join(" e ") || "e-mail"}.</p><button className="ai-primary-action" disabled={busy}>{busy ? "Validando…" : "Ativar conta e continuar"}</button></form> : <><div className="ai-account-tabs"><button className={accountMode === "register" ? "active" : ""} type="button" onClick={() => setAccountMode("register")}>Criar conta</button><button className={accountMode === "login" ? "active" : ""} type="button" onClick={() => setAccountMode("login")}>Já tenho conta</button></div>
          {accountMode === "login" ? <form className="ai-account-form narrow" onSubmit={login}><label>E-mail<input name="email" type="email" autoComplete="email" required /></label><label>Senha<input name="password" type="password" autoComplete="current-password" required /></label><button className="ai-primary-action" disabled={busy}>{busy ? "Entrando…" : "Entrar e continuar"}</button></form> : <form className="ai-account-form" onSubmit={register}><div className="ai-form-grid two"><label>Tipo de cadastro<select name="accountType" defaultValue="particular"><option value="particular">Particular</option><option value="empresa">Empresa</option></select></label><label>CPF ou CNPJ<input name="taxId" inputMode="numeric" required /></label><label>Nome completo ou empresa<input name="name" autoComplete="name" minLength={3} maxLength={120} required /></label><label>E-mail<input name="email" type="email" autoComplete="email" required /></label><label>WhatsApp<input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} required /></label><label>Senha<input name="password" type="password" autoComplete="new-password" minLength={8} required /><small>Mínimo de 8 caracteres, com letras e números.</small></label></div><button className="ai-primary-action" disabled={busy}>{busy ? "Criando conta…" : "Criar conta e continuar"}</button></form>}</>}
        {error ? <p className="ai-listing-error" role="alert">{error}</p> : null}<footer><button className="ai-secondary-action" type="button" onClick={() => setStep("preview")}>Voltar à prévia</button></footer>
      </section> : null}

      {step === "payment" && draft ? <section className="ai-step-card ai-payment-step"><header><span>Pagamento do anúncio</span><h2>{offerContent[offer].label}</h2><p>A cobrança utiliza a integração ativa no painel administrativo.</p></header><aside className="ai-payment-summary"><div><strong>{draft.title}</strong><span>{draft.category} · {selectedFeaturedPlan.durationLabel}</span></div><b>{formatPlanPrice(offerAmount)}</b></aside>
        <form onSubmit={(event) => { event.preventDefault(); void publishListing(new FormData(event.currentTarget)); }}>
          <div className="ai-payment-methods">{paymentOptions.pix ? <label className={paymentMethod === "pix" ? "selected" : ""}><input type="radio" name="method" checked={paymentMethod === "pix"} onChange={() => setPaymentMethod("pix")} /><strong>Pix</strong><small>QR Code após confirmar</small></label> : null}{paymentOptions.card ? <label className={paymentMethod === "card" ? "selected" : ""}><input type="radio" name="method" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /><strong>Cartão</strong><small>Pagamento protegido</small></label> : null}</div>
          {paymentMethod === "card" ? <PaymentCardFields amountCents={offerAmount} /> : null}
          {error ? <p className="ai-listing-error" role="alert">{error}</p> : null}
          <footer><button className="ai-secondary-action" type="button" onClick={() => setStep("preview")}>Voltar</button><button className="ai-primary-action" disabled={busy}>{busy ? "Processando…" : paymentMethod === "pix" ? "Gerar Pix e publicar" : "Pagar e publicar"}</button></footer>
        </form>
      </section> : null}

      {step === "success" && success ? <section className="ai-step-card ai-success-step"><span className="ai-success-icon">✓</span><header><span>Cadastro concluído</span><h2>{success.paymentMethod === "PIX" && !success.paid ? "Anúncio criado e pagamento aguardando" : "Anúncio criado com sucesso"}</h2><p>{success.message}</p></header>
        {success.qrCodeImage ? <section className="ai-pix-result"><strong>Faça o pagamento pelo QR Code</strong><img src={success.qrCodeImage} alt="QR Code Pix do anúncio" />{success.paymentAmountCents ? <b>{formatPlanPrice(success.paymentAmountCents)}</b> : null}{success.qrCodeText ? <label>Pix Copia e Cola<textarea value={success.qrCodeText} readOnly onFocus={(event) => event.currentTarget.select()} /></label> : null}<p>Após a confirmação pelo Mercado Pago, o anúncio será encaminhado automaticamente para revisão.</p></section> : null}
        {!success.paymentMethod ? <p className="ai-review-notice">Seu anúncio foi cadastrado na sua conta, será revisado pela nossa equipe e publicado após a aprovação.</p> : null}
        <footer><Link className="ai-secondary-action" href="/minha-conta/anuncios">Ver meus anúncios</Link><Link className="ai-primary-action" href="/">Voltar para a página inicial</Link></footer>
      </section> : null}
    </div>
  </section>;
}
