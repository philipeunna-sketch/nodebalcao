"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PortalHeader } from "../shared";
import { PortalCategory, portalCategories } from "../categories";
import {
  featuredBenefits,
  formatPlanPrice,
  getFeaturedPlans,
} from "../featured-plans";
import ListingFormCore, {
  emptyListingFormValue,
  listingMoneyToCents,
  type ListingFormValue,
} from "../listing-form-core";
import { encryptMercadoPagoCard } from "../mercadopago-card";
import { plainListingDescription } from "../../lib/listing-description";

type Photo = { file: File; preview: string };
const maskPhone = (value: string) => {
  const digits = value
    .replace(/\D/g, "")
    .replace(/^55(?=\d{10,11}$)/, "")
    .slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};
type SuccessState = {
  message: string;
  listingId: string;
  qrCodeText?: string;
  qrCodeImage?: string;
  paymentExpiresAt?: string;
  paymentAmountCents?: number;
  paymentMethod?: "PIX" | "CREDIT_CARD" | null;
  paymentStatus?: string | null;
  paymentUnavailable?: boolean;
  paid?: boolean;
  cardBrand?: string | null;
  cardLast4?: string | null;
  preview: {
    title: string;
    category: string;
    address: string;
    priceLabel: string;
    image: string;
  };
};

async function readResponse(response: Response) {
  const raw = await response.text();
  if (response.status === 413)
    return {
      error:
        "A imagem ultrapassou o limite de envio. Ela será otimizada; selecione-a novamente e tente publicar.",
    };
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {
      error: response.ok
        ? "O servidor retornou uma resposta inválida."
        : raw.slice(0, 180) || "Não foi possível concluir a solicitação.",
    };
  }
}

async function optimizeImage(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let quality = 0.84;
    let blob: Blob | null = null;
    do {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      quality -= 0.08;
    } while (blob && blob.size > 1_500_000 && quality >= 0.52);
    if (!blob) throw new Error("IMAGE_OPTIMIZATION_FAILED");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
    });
  } catch {
    if (file.size <= 1_500_000) return file;
    throw new Error(
      `Não foi possível otimizar a imagem ${file.name}. Use uma imagem JPG, PNG ou WebP menor.`,
    );
  }
}

function CardFields({ amountCents }: { amountCents: number }) {
  return (
    <div className="inline-card-fields">
      <div className="inline-card-heading">
        <div>
          <strong>Dados do cartão</strong>
          <span>Tokenizados no navegador pelo Mercado Pago</span>
        </div>
        <b>{formatPlanPrice(amountCents)}</b>
      </div>
      <div className="listing-fields two">
        <label className="full">
          Nome impresso no cartão
          <input
            name="cardHolder"
            autoComplete="cc-name"
            required
            placeholder="Nome completo"
          />
        </label>
        <label className="full">
          Número do cartão
          <input
            name="cardNumber"
            inputMode="numeric"
            autoComplete="cc-number"
            required
            maxLength={23}
            onInput={(event) => {
              const input = event.currentTarget;
              input.value = input.value
                .replace(/\D/g, "")
                .slice(0, 19)
                .replace(/(.{4})/g, "$1 ")
                .trim();
            }}
            placeholder="0000 0000 0000 0000"
          />
        </label>
        <label>
          Mês
          <input
            name="cardExpMonth"
            inputMode="numeric"
            autoComplete="cc-exp-month"
            required
            maxLength={2}
            placeholder="MM"
          />
        </label>
        <label>
          Ano
          <input
            name="cardExpYear"
            inputMode="numeric"
            autoComplete="cc-exp-year"
            required
            maxLength={4}
            placeholder="AAAA"
          />
        </label>
        <label>
          Código de segurança
          <input
            name="cardSecurityCode"
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            required
            maxLength={4}
            placeholder="CVV"
          />
        </label>
        <label>
          Parcelamento
          <select name="cardInstallments" defaultValue="1">
            <option value="1">1x sem juros</option>
            <option value="2">2x</option>
            <option value="3">3x</option>
          </select>
        </label>
        <label className="full">CPF ou CNPJ do titular<input name="cardTaxId" inputMode="numeric" required minLength={11} maxLength={18} placeholder="Somente números" /></label>
      </div>
      <p className="card-privacy-note">
        O Portal Balcão recebe somente o token do Mercado Pago, a bandeira e os
        quatro últimos dígitos. Número completo e CVV nunca são armazenados.
      </p>
    </div>
  );
}

export default function CreateListing() {
  const [categories, setCategories] =
    useState<PortalCategory[]>(portalCategories);
  const [customer, setCustomer] = useState<{
    name: string;
    whatsapp: string;
    remainingAds: number;
  } | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [adminUsers, setAdminUsers] = useState<Array<{ id: string; name: string; email: string; whatsapp?: string; activeAds?: number; adLimit?: number; systemAdmin?: boolean }>>([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState("");
  const [adminUserConfirmed, setAdminUserConfirmed] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [accountLoading, setAccountLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [listingForm, setListingForm] = useState<ListingFormValue>(() => emptyListingFormValue());
  const [whatsapp, setWhatsapp] = useState("");
  const [publicationType, setPublicationType] = useState<
    "free" | "featured"
  >("free");
  const [featuredPlan, setFeaturedPlan] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [paymentOptions, setPaymentOptions] = useState<{
    pix: boolean;
    card: boolean;
    mode: "test" | "production";
  }>({
    pix: false,
    card: false,
    mode: "production",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const {
    category,
    subcategory,
    negotiationType: negotiation,
    attributes,
    features,
    price,
    rent,
    iptu,
    condo,
    negotiable,
    address,
    coordinates,
  } = listingForm;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const adminRequested = query.get("admin") === "1";
    const requestedUserId = query.get("adminUserId") || "";

    async function loadPublishingAccount() {
      if (adminRequested) {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        if (!response.ok) {
          window.location.assign(
            `/admin/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
          return;
        }
        const data = (await response.json()) as {
          users?: Array<{
            id: string;
            name: string;
            email: string;
            whatsapp?: string;
            activeAds?: number;
            adLimit?: number;
            systemAdmin?: boolean;
          }>;
        };
        const users = (data.users || []).filter(
          (user) => !user.systemAdmin && user.id.startsWith("customer-"),
        );
        setAdminMode(true);
        setAdminUsers(users);
        if (requestedUserId) {
          const found = users.find(
            (user) => user.id === `customer-${requestedUserId}`,
          );
          if (found) {
            setSelectedAdminUserId(requestedUserId);
            setAdminUserConfirmed(true);
            setCustomer({
              name: found.name,
              whatsapp: found.whatsapp || "",
              remainingAds: Math.max(
                0,
                (found.adLimit || 10) - (found.activeAds || 0),
              ),
            });
            setWhatsapp(maskPhone(found.whatsapp || ""));
          }
        }
        setAccountLoading(false);
        return;
      }

      setAdminMode(false);
      const customerResponse = await fetch("/api/customer/me", {
        cache: "no-store",
      });
      if (!customerResponse.ok) {
        window.location.assign("/entrar?returnTo=%2Fanunciar");
        return;
      }
      const customerData = await customerResponse.json();
      setCustomer(customerData.customer);
      setWhatsapp(maskPhone(String(customerData.customer.whatsapp || "")));
      setAccountLoading(false);
    }

    void loadPublishingAccount().catch(() => {
      window.location.assign(
        adminRequested
          ? "/admin/login?returnTo=%2Fanunciar%3Fadmin%3D1"
          : "/entrar?returnTo=%2Fanunciar",
      );
    });
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.categories) && data.categories.length)
          setCategories(data.categories);
        const mercadoPagoEnabled = data.mercadopago_enabled === true;
        const options = {
          pix: mercadoPagoEnabled && data.mercadopago_pix_enabled !== false,
          card: mercadoPagoEnabled && data.mercadopago_card_enabled !== false,
          mode: data.mercadopago_mode === "test" ? "test" as const : "production" as const,
        };
        setPaymentOptions(options);
        if (!options.pix && options.card) setPaymentMethod("card");
        if (!options.pix && !options.card) setPublicationType("free");
      })
      .catch(() => undefined);
  }, []);
  useEffect(
    () => () => photos.forEach((photo) => URL.revokeObjectURL(photo.preview)),
    [photos],
  );
  useEffect(() => {
    if (!success?.paymentExpiresAt || success.paid) return;
    const timer = window.setInterval(
      () =>
        setSecondsLeft(
          Math.max(
            0,
            Math.floor(
              (new Date(success.paymentExpiresAt!).getTime() - Date.now()) /
                1000,
            ),
          ),
        ),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [success?.paymentExpiresAt, success?.paid]);
  useEffect(() => {
    if (!success?.listingId || !success.paymentMethod || success.paid) return;
    const poll = window.setInterval(async () => {
      const response = await fetch(
        `/api/listings/payment-status?id=${encodeURIComponent(success.listingId)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.paid)
        setSuccess((current) =>
          current
            ? {
                ...current,
                paid: true,
                message:
                  "Pagamento confirmado. O anúncio foi enviado para revisão.",
              }
            : current,
        );
    }, 7000);
    return () => window.clearInterval(poll);
  }, [success?.listingId, success?.paymentMethod, success?.paid]);

  const isProperty = category === "Imóveis";
  const isVehicle = category === "Veículos";
  const featuredPlans = useMemo(
    () => getFeaturedPlans(category, subcategory),
    [category, subcategory],
  );
  function addPhotos(files: FileList | null) {
    const incoming = Array.from(files || []).filter(
      (file) =>
        ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) &&
        file.size <= 8 * 1024 * 1024,
    );
    setPhotos((current) =>
      [
        ...current,
        ...incoming.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        })),
      ].slice(0, 12),
    );
  }
  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }
  function promotePhoto(index: number) {
    setPhotos((current) => [
      current[index],
      ...current.filter((_, itemIndex) => itemIndex !== index),
    ]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const descriptionLength = plainListingDescription(listingForm.description).length;
      if (descriptionLength < 30 || descriptionLength > 5000 || listingForm.description.length > 20000)
        throw new Error("A descrição deve ter entre 30 e 5.000 caracteres.");
      if (!coordinates || !address)
        throw new Error("Selecione um endereço válido na lista de resultados.");
      if (!photos.length) throw new Error("Adicione pelo menos uma foto.");
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const cardPayload =
        !adminMode && publicationType !== "free" && paymentMethod === "card"
          ? await encryptMercadoPagoCard(form)
          : {};
      const imageUrls: string[] = [];
      for (const photo of photos) {
        const optimized = await optimizeImage(photo.file);
        const upload = new FormData();
        upload.append("file", optimized);
        const response = await fetch(adminMode ? `/api/listing-images?adminUserId=${encodeURIComponent(selectedAdminUserId)}` : "/api/listing-images", {
          method: "POST",
          body: upload,
        });
        const data = await readResponse(response);
        if (!response.ok)
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Falha ao enviar uma foto.",
          );
        if (typeof data.url !== "string")
          throw new Error("O endereço da imagem não foi retornado.");
        imageUrls.push(data.url);
      }
      const payload = {
        title: listingForm.title,
        description: listingForm.description,
        negotiationType: negotiation,
        category,
        subcategory,
        priceCents: listingMoneyToCents(price),
        monthlyRentCents: listingMoneyToCents(rent),
        iptuCents: listingMoneyToCents(iptu),
        condoCents: listingMoneyToCents(condo),
        negotiable,
        address,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        displayName: form.get("displayName"),
        whatsapp,
        images: imageUrls,
        attributes: {
          ...attributes,
          videoUrl: listingForm.videoUrl.trim(),
        },
        features,
        publicationType,
        featuredPlan,
        paymentMethod,
        ...cardPayload,
        ...(adminMode ? { adminUserId: Number(selectedAdminUserId), adminDirect: true } : {}),
      };
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readResponse(response);
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível cadastrar o anúncio.",
        );
      const priceLabel = negotiable
        ? "Valor a combinar"
        : negotiation === "Aluguel"
          ? `R$ ${rent || "0,00"}/mês`
          : `R$ ${price || "0,00"}`;
      if (typeof data.paymentExpiresAt === "string")
        setSecondsLeft(
          Math.max(
            0,
            Math.floor(
              (new Date(data.paymentExpiresAt).getTime() - Date.now()) / 1000,
            ),
          ),
        );
      setSuccess({
        message: String(data.message || "Anúncio salvo."),
        listingId: String(data.listingId || ""),
        qrCodeText:
          typeof data.qrCodeText === "string" ? data.qrCodeText : undefined,
        qrCodeImage:
          typeof data.qrCodeImage === "string" ? data.qrCodeImage : undefined,
        paymentExpiresAt:
          typeof data.paymentExpiresAt === "string"
            ? data.paymentExpiresAt
            : undefined,
        paymentAmountCents:
          typeof data.paymentAmountCents === "number"
            ? data.paymentAmountCents
            : undefined,
        paymentMethod:
          data.paymentMethod === "PIX" || data.paymentMethod === "CREDIT_CARD"
            ? data.paymentMethod
            : null,
        paymentStatus:
          typeof data.paymentStatus === "string" ? data.paymentStatus : null,
        paymentUnavailable: data.paymentUnavailable === true,
        paid: data.paid === true,
        cardBrand: typeof data.cardBrand === "string" ? data.cardBrand : null,
        cardLast4: typeof data.cardLast4 === "string" ? data.cardLast4 : null,
        preview: {
          title: listingForm.title,
          category,
          address,
          priceLabel,
          image: imageUrls[0],
        },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível cadastrar o anúncio.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (success)
    return (
      <main>
        <PortalHeader />
        <section className="listing-success listing-payment-success">
          <span>
            {!success.paymentMethod || success.paid
              ? "✓"
              : success.paymentStatus === "declined" ||
                  success.paymentStatus === "failed"
                ? "!"
                : "◷"}
          </span>
          <h1>
            {!success.paymentMethod
              ? "Anúncio cadastrado com sucesso!"
              : success.paid
                ? "Pagamento confirmado"
                : success.paymentMethod === "PIX"
                  ? "Anúncio salvo com sucesso"
                  : success.paymentStatus === "declined"
                    ? "Pagamento não aprovado"
                    : "Pagamento em processamento"}
          </h1>
          <p>{success.message}</p>
          <article className="listing-confirmation-preview">
            <img
              src={success.preview.image}
              alt="Foto de destaque do anúncio"
            />
            <div>
              <small>{success.preview.category}</small>
              <h2>{success.preview.title}</h2>
              <p>{success.preview.address}</p>
              <strong>{success.preview.priceLabel}</strong>
            </div>
          </article>
          {success.paymentMethod === "PIX" &&
          !success.paymentUnavailable &&
          !success.paid ? (
            <section className="pix-payment-box">
              <h2>Pagamento via Pix</h2>
              <strong>
                {formatPlanPrice(success.paymentAmountCents || 0)}
              </strong>
              {success.qrCodeImage ? (
                <img src={success.qrCodeImage} alt="QR Code Pix do pagamento" />
              ) : (
                <p>Use o código Pix copia e cola abaixo.</p>
              )}
              <label>
                Pix copia e cola
                <textarea value={success.qrCodeText || ""} readOnly />
              </label>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(success.qrCodeText || "")
                }
              >
                Copiar código Pix
              </button>
              <div className="payment-countdown">
                Tempo restante:{" "}
                <b>
                  {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                  {String(secondsLeft % 60).padStart(2, "0")}
                </b>
              </div>
              <small>O status é atualizado automaticamente após a confirmação do Mercado Pago.</small>
            </section>
          ) : null}
          {success.paymentMethod === "CREDIT_CARD" ? (
            <section
              className={`card-payment-box payment-result ${success.paid ? "paid" : success.paymentStatus === "declined" || success.paymentStatus === "failed" ? "failed" : "pending"}`}
            >
              <h2>
                {success.paid
                  ? "Cartão aprovado"
                  : success.paymentStatus === "declined"
                    ? "Cartão não aprovado"
                    : "Processamento do cartão"}
              </h2>
              <strong>
                {formatPlanPrice(success.paymentAmountCents || 0)}
              </strong>
              {success.cardLast4 ? (
                <p>
                  {success.cardBrand
                    ? `${success.cardBrand.toUpperCase()} · `
                    : ""}
                  final {success.cardLast4}
                </p>
              ) : null}
              <p>O registro completo está disponível em Meus Pagamentos.</p>
            </section>
          ) : null}
          <div className="listing-success-actions">
            <a className="secondary-button" href={adminMode ? "/admin?section=anuncios" : "/minha-conta/anuncios"}>
              {adminMode ? "Voltar ao painel administrativo" : "Ver anúncio na minha conta"}
            </a>
            {success.paymentMethod ? (
              <a className="primary-button" href="/minha-conta/pagamentos">
                Meus Pagamentos
              </a>
            ) : (
              <a className="primary-button" href={adminMode ? "/anunciar?admin=1" : "/anunciar"}>
                Cadastrar outro anúncio
              </a>
            )}
          </div>
        </section>
      </main>
    );
  if (accountLoading) return <main><PortalHeader /><div className="listing-create-shell"><p>Carregando cadastro…</p></div></main>;
  if (adminMode && !adminUserConfirmed) {
    const filteredUsers = adminUsers.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR").includes(adminUserSearch.trim().toLocaleLowerCase("pt-BR")));
    return <main><PortalHeader /><div className="listing-create-shell admin-listing-wizard"><header className="listing-create-head"><span>Etapa 1 de 2</span><h1>Escolha o usuário do anúncio</h1><p>Pesquise pelo nome ou e-mail e selecione a conta que receberá o anúncio.</p></header><section className="listing-section"><label className="admin-user-picker-search">Pesquisar anunciante<input value={adminUserSearch} onChange={(event)=>setAdminUserSearch(event.target.value)} placeholder="Digite o nome ou e-mail" /></label><label className="admin-user-picker-select">Usuário<select value={selectedAdminUserId} onChange={(event)=>{const id=event.target.value;setSelectedAdminUserId(id);const found=adminUsers.find((user)=>user.id===`customer-${id}`);if(found){setCustomer({name:found.name,whatsapp:found.whatsapp||"",remainingAds:Math.max(0,(found.adLimit||10)-(found.activeAds||0))});setWhatsapp(maskPhone(found.whatsapp||""));}}}><option value="">Selecione um usuário</option>{filteredUsers.map((user)=><option key={user.id} value={user.id.replace("customer-","")}>{user.name} — {user.email}</option>)}</select></label><button className="primary-button admin-wizard-next" type="button" disabled={!selectedAdminUserId} onClick={()=>{setAdminUserConfirmed(true);window.scrollTo({top:0,behavior:"smooth"});}}>Avançar para o formulário</button></section></div></main>;
  }
  return (
    <main>
      <PortalHeader />
      <div className="listing-create-shell">
        <header className="listing-create-head">
          {adminMode ? <span>Etapa 2 de 2 · Anúncio para {customer?.name}</span> : null}
          <h1>Cadastro do anúncio</h1>
        </header>
        <form className="single-listing-form" onSubmit={submit}>
          <ListingFormCore mode="create" categories={categories} value={listingForm} onChange={setListingForm} />
          <section className="listing-section">
            <div className="listing-section-title">
              <b>{isProperty || isVehicle ? 6 : 5}</b>
              <div>
                <h2>Fotos</h2>
                <p>
                  Adicione até 12 fotos. A primeira será a foto de destaque.
                </p>
              </div>
            </div>
            <label className="listing-photo-upload">
              ＋<strong>Clique para escolher as imagens</strong>
              <span>
                JPG, PNG ou WebP · otimizadas automaticamente antes do envio
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                onChange={(event) => addPhotos(event.target.files)}
                disabled={photos.length >= 12}
              />
            </label>
            <div className="listing-photo-grid">
              {photos.map((photo, index) => (
                <article key={photo.preview}>
                  <img src={photo.preview} alt={`Foto ${index + 1}`} />
                  {index === 0 ? (
                    <em>Foto de destaque</em>
                  ) : (
                    <button type="button" onClick={() => promotePhoto(index)}>
                      Definir destaque
                    </button>
                  )}
                  <button
                    className="photo-remove"
                    type="button"
                    onClick={() => removePhoto(index)}
                    aria-label="Remover foto"
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
            <small className="listing-count">{photos.length}/12 fotos</small>
          </section>
          <section className="listing-section">
            <div className="listing-section-title">
              <b>{isProperty || isVehicle ? 7 : 6}</b>
              <div>
                <h2>Contato</h2>
                <p>Dados exibidos na página do anúncio.</p>
              </div>
            </div>
            <div className="listing-fields two">
              <label>
                Nome de exibição
                <input
                  name="displayName"
                  defaultValue={customer?.name || ""}
                  required
                  minLength={2}
                />
              </label>
              <label>
                WhatsApp do anúncio
                <input
                  name="whatsapp"
                  value={whatsapp}
                  onChange={(event) =>
                    setWhatsapp(maskPhone(event.target.value))
                  }
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="(31) 99999-9999"
                />
              </label>
            </div>
          </section>
          <section className="listing-section">
            <div className="listing-section-title">
              <b>{isProperty || isVehicle ? 8 : 7}</b>
              <div>
                <h2>Publicação e pagamento</h2>
                <p>
                  Escolha entre anúncio grátis ou anúncio destacado.
                </p>
              </div>
            </div>
            <div className="publication-plans">
              <label className={publicationType === "free" ? "selected" : ""}>
                <input
                  type="radio"
                  checked={publicationType === "free"}
                  onChange={() => setPublicationType("free")}
                />
                <strong>Publicar grátis</strong>
                <span>Publicação com duração de 30 dias.</span>
                <small>
                  O anúncio será revisado pela equipe antes da publicação.
                </small>
              </label>
              <label
                className={publicationType === "featured" ? "selected" : ""}
              >
                <input
                  type="radio"
                  checked={publicationType === "featured"}
                  onChange={() => setPublicationType("featured")}
                  disabled={!adminMode && !paymentOptions.pix && !paymentOptions.card}
                />
                <strong>Publicar com destaque</strong>
                <span>★ Mais visibilidade e prioridade sobre anúncios grátis.</span>
                <small>
                  Tag vermelha, borda especial e posição prioritária na home, busca e categorias.
                </small>
              </label>
            </div>
            {!adminMode && !paymentOptions.pix && !paymentOptions.card ? (
              <p className="payment-security-note" role="status">
                Os pagamentos estão desativados no momento. O anúncio grátis
                continua disponível.
              </p>
            ) : null}
            {publicationType !== "free" && !adminMode ? (
              <>
                {paymentOptions.mode === "test" ? (
                  <p className="payment-environment-note test" role="status">
                    Ambiente de teste do Mercado Pago. Nenhuma cobrança real será realizada.
                  </p>
                ) : null}
                <div className="featured-periods">
                  {featuredPlans.map((plan) => (
                    <label
                      className={featuredPlan === plan.code ? "selected" : ""}
                      key={plan.code}
                    >
                      <input
                        type="radio"
                        checked={featuredPlan === plan.code}
                        onChange={() => setFeaturedPlan(plan.code)}
                      />
                      <span>{plan.label}</span>
                      <strong>
                        {formatPlanPrice(
                          plan.amountCents,
                        )}
                      </strong>
                      <small>{plan.durationLabel}</small>
                      <ul>
                        {featuredBenefits.map((benefit) => (
                          <li key={benefit}>✓ {benefit}</li>
                        ))}
                      </ul>
                    </label>
                  ))}
                </div>
                <div
                  className="payment-methods"
                  role="radiogroup"
                  aria-label="Forma de pagamento"
                >
                  {paymentOptions.pix ? (
                    <label
                      className={paymentMethod === "pix" ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        checked={paymentMethod === "pix"}
                        onChange={() => setPaymentMethod("pix")}
                      />
                      Pix com QR Code
                    </label>
                  ) : null}
                  {paymentOptions.card ? (
                    <label
                      className={paymentMethod === "card" ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        checked={paymentMethod === "card"}
                        onChange={() => setPaymentMethod("card")}
                      />
                      Cartão de crédito
                    </label>
                  ) : null}
                </div>
                {paymentMethod === "pix" ? (
                  <p className="payment-security-note">
                    Ao continuar, o anúncio será salvo e o QR Code Pix aparecerá
                    logo abaixo para pagamento.
                  </p>
                ) : (
                  <CardFields
                    amountCents={
                      (featuredPlans.find((plan) => plan.code === featuredPlan)
                        ?.amountCents || 0) *
                      1
                    }
                  />
                )}
              </>
            ) : null}
          </section>
          {error ? (
            <div className="listing-error" role="alert">
              {error}
            </div>
          ) : null}
          <footer className="listing-submit">
            <span>
              {adminMode ? `O anúncio será inserido diretamente na conta de ${customer?.name}. Não haverá cobrança.` : "Ao publicar, você concorda com os termos de uso do portal."}
            </span>
            <button
              className="primary-button"
              disabled={busy || !customer || customer.remainingAds <= 0}
            >
              {busy
                ? adminMode
                  ? "Inserindo anúncio na conta…"
                  : publicationType === "free"
                    ? "Publicando anúncio…"
                    : paymentMethod === "card"
                      ? "Processando pagamento…"
                      : "Gerando QR Code…"
                : adminMode ? "Inserir anúncio na conta do usuário"
                : publicationType === "free"
                  ? "Publicar anúncio grátis"
                  : paymentMethod === "card"
                    ? "Pagar com cartão"
                    : "Gerar QR Code Pix"}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
