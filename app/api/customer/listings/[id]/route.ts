import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { confirmFeaturedPayment, deleteListingForUser, findListingForUser, prepareListingHighlight, setListingPaymentReference, setListingPaymentStatus, updateListingForUser } from "../../../../../db/listings";
import { createMercadoPagoCard, createMercadoPagoPix, getMercadoPagoConfiguration } from "../../../../../db/mercadopago";
import { createPaymentRecord } from "../../../../../db/payments";
import { readPortalSettings } from "../../../../../db/settings";
import { validateListingEdit } from "../../../../../lib/listing-edit";
import { getFeaturedPlan } from "../../../../featured-plans";
import { portalCategories } from "../../../../categories";

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function authenticated(request: Request) {
  return getCustomerBySessionToken(readCustomerCookie(request));
}

function publicEditRecord(listing: NonNullable<Awaited<ReturnType<typeof findListingForUser>>>) {
  return { ...listing, attributes: JSON.parse(listing.attributesJson || "{}"), features: JSON.parse(listing.featuresJson || "[]"), images: JSON.parse(listing.imagesJson || "[]") };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const listing = await findListingForUser(id, customer.id);
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  return NextResponse.json({ listing: publicEditRecord(listing) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const current = await findListingForUser(id, customer.id);
  if (!current) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  const payload = await request.json().catch(() => ({})) as UnknownRecord;
  const ownedPrefix = `/api/media/${encodeURIComponent(`listing-drafts/${customer.id}/`)}`;
  const settings = await readPortalSettings();
  const categories = Array.isArray(settings.categories) && settings.categories.length ? settings.categories as Array<{ name: string; subs: string[] }> : portalCategories;
  const validated = validateListingEdit(payload, current, ownedPrefix, categories);
  if (!validated.input) return NextResponse.json({ error: validated.error }, { status: 400 });
  const result = await updateListingForUser(id, customer.id, validated.input);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, changed: result.changed, status: result.changed ? "pending_review" : current.status, message: result.changed ? "Alterações salvas. O anúncio voltou para aprovação." : "Nenhuma alteração foi feita; o anúncio continua publicado." });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const removed = await deleteListingForUser(id, customer.id);
  return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await authenticated(request); if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params; const listing = await findListingForUser(id, customer.id);
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  const payload = await request.json().catch(() => ({})) as UnknownRecord;
  if (payload.action !== "highlight") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const superFeatured = payload.plan === "super";
  const monthly = getFeaturedPlan(listing.category, "monthly", listing.subcategory);
  const amountCents = superFeatured ? 9900 : monthly?.amountCents || 4900;
  const planCode = superFeatured ? "super" : "monthly";
  const planLabel = superFeatured ? "Super destaque" : `Destaque mensal · ${listing.category}`;
  const method = payload.method === "card" ? "CREDIT_CARD" : "PIX";
  const paymentConfiguration = await getMercadoPagoConfiguration();
  if (!paymentConfiguration.enabled) return NextResponse.json({ error: "Os pagamentos estão desativados. Ative o Mercado Pago no painel administrativo." }, { status: 503 });
  if (method === "PIX" && !paymentConfiguration.pixEnabled) return NextResponse.json({ error: "O pagamento por Pix está desativado." }, { status: 400 });
  if (method === "CREDIT_CARD" && !paymentConfiguration.cardEnabled) return NextResponse.json({ error: "O pagamento por cartão está desativado." }, { status: 400 });
  if (method === "CREDIT_CARD" && (text(payload.encryptedCard).length < 20 || !text(payload.mpPaymentMethodId))) return NextResponse.json({ error: "Confira os dados do cartão e tente novamente." }, { status: 400 });
  await prepareListingHighlight(id, customer.id, planCode, amountCents, method);
  try {
    const origin = new URL(request.url).origin;
    const paymentInput = { listingId: id, planLabel, amountCents, origin, customer: { name: customer.name, email: customer.email, taxId: customer.taxId, whatsapp: customer.whatsapp } };
    if (method === "PIX") {
      const pix = await createMercadoPagoPix(paymentInput); await setListingPaymentReference(id, pix.orderId, pix.expiresAt);
      await createPaymentRecord({ userId: customer.id, listingId: id, providerReference: pix.orderId, method: "PIX", amountCents, status: "pending", providerStatus: "WAITING", planCode, planLabel, description: planLabel, expiresAt: pix.expiresAt });
      return NextResponse.json({ ok: true, method: "PIX", amountCents, qrCodeText: pix.qrCodeText, qrCodeImage: pix.qrCodeImage, expiresAt: pix.expiresAt });
    }
    const card = await createMercadoPagoCard({ ...paymentInput, cardToken: text(payload.encryptedCard), paymentMethodId: text(payload.mpPaymentMethodId), issuerId: text(payload.mpIssuerId) || undefined, installments: Number(payload.cardInstallments || 1) });
    await setListingPaymentReference(id, card.orderId); await setListingPaymentStatus(id, card.paid ? "paid" : "pending");
    await createPaymentRecord({ userId: customer.id, listingId: id, providerReference: card.orderId, method: "CREDIT_CARD", amountCents, status: card.paid ? "paid" : "pending", providerStatus: card.status, planCode, planLabel, description: planLabel, cardBrand: card.cardBrand, cardLast4: card.cardLast4, paidAt: card.paidAt });
    if (card.paid) await confirmFeaturedPayment(card.orderId);
    return NextResponse.json({ ok: true, method: "CREDIT_CARD", amountCents, paid: card.paid, cardBrand: card.cardBrand, cardLast4: card.cardLast4 });
  } catch {
    await setListingPaymentStatus(id, "failed");
    return NextResponse.json({ error: "O Mercado Pago não conseguiu iniciar o pagamento. Confira a integração e tente novamente." }, { status: 502 });
  }
}
