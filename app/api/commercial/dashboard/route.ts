import { NextResponse } from "next/server";
import { getCommercialFromRequest } from "../../../../db/admin-auth";
import { createListingByCommercial, sellListingHighlight } from "../../../../db/commercial";
import { createCustomerFromAdmin, isValidCnpj, isValidCpf, listCustomersForAdmin, onlyDigits } from "../../../../db/customer-auth";
import { getAdminListingMetadata, moderateListing } from "../../../../db/listings";
import { getPublicListings, invalidatePublicListingsCache } from "../../../../db/public-listings";
import { sendCommercialWelcomeEmail } from "../../../../db/verification-delivery";
import { readPortalSettings } from "../../../../db/settings";
import { portalCategories } from "../../../categories";
import { plainListingDescription } from "../../../../lib/listing-description";

function value(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function cents(valueToParse: unknown) { const number = Number(valueToParse); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }
function optionalCents(valueToParse: unknown) { if (valueToParse === null || valueToParse === undefined || valueToParse === "") return null; const number = Number(valueToParse); return Number.isInteger(number) && number >= 0 ? number : null; }
function safeVideoUrl(input: unknown) {
  const candidate = value(input).slice(0, 500); if (!candidate) return "";
  try { const url = new URL(candidate); const host = url.hostname.replace(/^www\./, ""); const provider = host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com") || host.endsWith("vimeo.com"); return url.protocol === "https:" && (provider || /\.(mp4|webm)$/i.test(url.pathname)) ? url.toString() : null; }
  catch { return null; }
}

async function authorized(request: Request) {
  const commercial = await getCommercialFromRequest(request);
  return commercial || null;
}

export async function GET(request: Request) {
  const commercial = await authorized(request);
  if (!commercial) return NextResponse.json({ error: "Acesso comercial necessário." }, { status: 401 });
  const [advertisers, publicListings, managedListings, settings] = await Promise.all([
    listCustomersForAdmin(),
    getPublicListings({ fresh: true }),
    getPublicListings({ includePending: true, fresh: true }),
    readPortalSettings(),
  ]);
  const listings = [...new Map([...publicListings, ...managedListings].map((item) => [item.id, item])).values()];
  const metadata = await getAdminListingMetadata(managedListings.map((item) => item.id));
  const manageableIds = new Set(managedListings.map((item) => item.id));
  return NextResponse.json({
    operator: { email: commercial.email },
    categories: Array.isArray(settings.categories) && settings.categories.length ? settings.categories : portalCategories,
    advertisers: advertisers.map((item) => ({
      id: item.id, name: item.name, email: item.email, whatsapp: item.whatsapp, accountType: item.accountType,
      taxId: item.taxId, profileImageUrl: item.profileImageUrl, planName: item.planName, adLimit: item.adLimit, activeAds: item.activeAds, createdAt: item.createdAt,
    })),
    listings: listings.map((item) => ({
      ...item,
      manageable: manageableIds.has(item.id),
      seller: { ...item.seller, email: metadata.get(item.id)?.sellerEmail, name: metadata.get(item.id)?.sellerName || item.seller.name },
      analytics: metadata.get(item.id),
    })),
    totalListings: listings.length,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const commercial = await authorized(request);
  if (!commercial) return NextResponse.json({ error: "Acesso comercial necessário." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = value(body.action);
  try {
    if (action === "create-advertiser") {
      const accountType = body.accountType === "empresa" ? "empresa" : "particular";
      const taxId = onlyDigits(value(body.taxId));
      const whatsapp = onlyDigits(value(body.whatsapp));
      const email = value(body.email).toLowerCase();
      const name = value(body.name);
      const password = value(body.password);
      const profileImageUrl = value(body.profileImageUrl);
      if (name.length < 2 || !email.includes("@")) return NextResponse.json({ error: "Informe nome e e-mail válidos." }, { status: 400 });
      if (accountType === "particular" ? !isValidCpf(taxId) : !isValidCnpj(taxId)) return NextResponse.json({ error: `${accountType === "particular" ? "CPF" : "CNPJ"} inválido.` }, { status: 400 });
      if (whatsapp.length < 10 || whatsapp.length > 11) return NextResponse.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
      if (password.length < 8) return NextResponse.json({ error: "A senha temporária deve ter pelo menos 8 caracteres." }, { status: 400 });
      if (profileImageUrl && !profileImageUrl.startsWith("/api/media/listing-commercial%2F")) return NextResponse.json({ error: "A foto de perfil enviada é inválida." }, { status: 400 });
      const created = await createCustomerFromAdmin({ accountType, taxId, email, name, whatsapp, password, profileImageUrl: profileImageUrl || null, isAdmin: false });
      const welcomeEmailSent = body.sendWelcomeEmail === true
        ? await sendCommercialWelcomeEmail({ email: created.email, name, temporaryPassword: password }).catch(() => false)
        : false;
      return NextResponse.json({ ok: true, id: created.id, welcomeEmailSent, message: welcomeEmailSent ? "Anunciante cadastrado e acesso enviado por e-mail." : body.sendWelcomeEmail === true ? "Anunciante cadastrado. O e-mail não foi enviado porque o serviço de entrega não está configurado." : "Anunciante cadastrado e integrado ao portal." }, { status: 201 });
    }

    if (action === "create-listing") {
      const userId = Number(body.userId);
      const title = value(body.title);
      const description = value(body.description);
      const category = value(body.category);
      const subcategory = value(body.subcategory);
      const negotiationType = value(body.negotiationType) || "Venda";
      const address = value(body.address);
      const displayName = value(body.displayName);
      const whatsapp = onlyDigits(value(body.whatsapp));
      const publicationType = body.publicationType === "featured" ? "featured" : "free";
      const plan = body.featuredPlan === "semiannual" ? "semiannual" : body.featuredPlan === "quarterly" ? "quarterly" : "monthly";
      const settings = await readPortalSettings();
      const configuredCategories = Array.isArray(settings.categories) && settings.categories.length ? settings.categories : portalCategories;
      const selectedCategory = configuredCategories.find((item) => item.name === category);
      const ownedImagePrefix = `/api/media/${encodeURIComponent(`listing-commercial/${commercial.id}/`)}`;
      const images = Array.isArray(body.images) ? [...new Set(body.images.map(value).filter((item) => item.startsWith(ownedImagePrefix)))].slice(0, 12) : [];
      if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Selecione o anunciante." }, { status: 400 });
      if (title.length < 8 || title.length > 120) return NextResponse.json({ error: "O título deve ter entre 8 e 120 caracteres." }, { status: 400 });
      const descriptionLength = plainListingDescription(description).length;
      if (descriptionLength < 30 || descriptionLength > 5000 || description.length > 20000) return NextResponse.json({ error: "A descrição deve ter entre 30 e 5.000 caracteres." }, { status: 400 });
      if (!selectedCategory || !selectedCategory.subs.includes(subcategory)) return NextResponse.json({ error: "Selecione uma categoria e subcategoria válidas." }, { status: 400 });
      if (!["Compra", "Venda", "Troca", "Aluguel", "Temporada", "Serviço", "Outra"].includes(negotiationType)) return NextResponse.json({ error: "Selecione um tipo de negociação válido." }, { status: 400 });
      const latitude = Number(body.latitude); const longitude = Number(body.longitude);
      if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return NextResponse.json({ error: "Selecione um endereço válido no mapa." }, { status: 400 });
      if (displayName.length < 2 || whatsapp.length < 10 || whatsapp.length > 13) return NextResponse.json({ error: "Informe o nome e o WhatsApp do anúncio." }, { status: 400 });
      if (!images.length) return NextResponse.json({ error: "Adicione pelo menos uma imagem." }, { status: 400 });
      const negotiable = body.negotiable === true;
      const priceCents = optionalCents(body.priceCents);
      const monthlyRentCents = optionalCents(body.monthlyRentCents);
      if (!negotiable && negotiationType === "Aluguel" && monthlyRentCents == null) return NextResponse.json({ error: "Informe o valor mensal do aluguel." }, { status: 400 });
      if (!negotiable && negotiationType !== "Aluguel" && priceCents == null) return NextResponse.json({ error: "Informe o valor do anúncio." }, { status: 400 });
      const rawAttributes = body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes) ? body.attributes as Record<string, unknown> : {};
      const videoUrl = safeVideoUrl(rawAttributes.videoUrl);
      if (videoUrl === null) return NextResponse.json({ error: "Use um link HTTPS válido do YouTube, Vimeo ou de um arquivo MP4/WebM." }, { status: 400 });
      const attributeEntries: Array<[string, string | number | boolean]> = [];
      for (const [key, attributeValue] of Object.entries(rawAttributes).slice(0, 30)) {
        if (key === "videoUrl" || !/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) continue;
        if (typeof attributeValue === "boolean" || typeof attributeValue === "number") attributeEntries.push([key, attributeValue]);
        else if (typeof attributeValue === "string") attributeEntries.push([key, attributeValue.slice(0, 160)]);
      }
      if (videoUrl) attributeEntries.push(["videoUrl", videoUrl]);
      const attributes = Object.fromEntries(attributeEntries) as Record<string, string | number | boolean>;
      const features = Array.isArray(body.features) ? body.features.map(value).filter(Boolean).slice(0, 20) : [];
      const created = await createListingByCommercial(userId, {
        title, description, negotiationType, category, subcategory,
        priceCents: negotiable ? null : priceCents, monthlyRentCents: negotiable ? null : monthlyRentCents,
        iptuCents: optionalCents(body.iptuCents), condoCents: optionalCents(body.condoCents),
        negotiable, address, latitude, longitude, displayName, whatsapp,
        attributes, features, images,
        publicationType, featuredPlan: publicationType === "featured" ? plan : null,
        paymentMethod: null, paymentAmountCents: publicationType === "featured" ? cents(body.saleAmountCents) : null,
        highlightedAmountCents: cents(body.saleAmountCents), operatorEmail: commercial.email,
      });
      if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
      invalidatePublicListingsCache();
      return NextResponse.json({ ok: true, id: created.id, message: "Anúncio cadastrado e enviado para aprovação." }, { status: 201 });
    }

    if (action === "moderate") {
      const listingId = value(body.listingId);
      const decision = body.decision === "reject" ? "reject" : "approve";
      const result = await moderateListing(listingId, decision);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
      invalidatePublicListingsCache();
      return NextResponse.json({ ok: true, message: decision === "approve" ? "Anúncio aprovado e publicado." : "Anúncio rejeitado." });
    }

    if (action === "sell-highlight") {
      const listingId = value(body.listingId);
      const planCode = body.planCode === "semiannual" ? "semiannual" : body.planCode === "quarterly" ? "quarterly" : "monthly";
      const amountCents = cents(body.amountCents);
      if (!listingId || amountCents <= 0) return NextResponse.json({ error: "Selecione o anúncio e informe o valor da venda." }, { status: 400 });
      const result = await sellListingHighlight({ listingId, planCode, amountCents, operatorEmail: commercial.email });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
      invalidatePublicListingsCache();
      return NextResponse.json({ ok: true, message: "Venda do destaque registrada no anúncio." });
    }

    return NextResponse.json({ error: "Ação comercial inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE|constraint/i.test(error.message)
      ? "CPF/CNPJ ou e-mail já cadastrado."
      : error instanceof Error ? error.message : "Não foi possível concluir a operação.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
