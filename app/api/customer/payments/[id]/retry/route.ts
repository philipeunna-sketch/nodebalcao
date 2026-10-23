import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../../db/customer-auth";
import { confirmFeaturedPayment, findListingForUser, prepareListingHighlight, setListingPaymentReference, setListingPaymentStatus } from "../../../../../../db/listings";
import { createMercadoPagoCard, createMercadoPagoPix, getMercadoPagoConfiguration, mercadoPagoLocalStatus } from "../../../../../../db/mercadopago";
import { createPaymentRecord, getUserPayment } from "../../../../../../db/payments";
import { updateInvoiceStatusByListing } from "../../../../../../db/invoices";
import { getFeaturedPlan } from "../../../../../featured-plans";

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params;
  const previous = await getUserPayment(id, customer.id);
  if (!previous) return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  if (previous.status === "paid") return NextResponse.json({ error: "Este pagamento já foi aprovado." }, { status: 409 });
  const listing = await findListingForUser(previous.listingId, customer.id);
  if (!listing) return NextResponse.json({ error: "O anúncio vinculado ao pagamento não foi encontrado." }, { status: 404 });

  const payload = await request.json().catch(() => ({})) as UnknownRecord;
  const method = payload.method === "card" ? "CREDIT_CARD" : "PIX";
  const configuration = await getMercadoPagoConfiguration();
  if (!configuration.enabled) return NextResponse.json({ error: "Os pagamentos estão desativados. Ative o Mercado Pago no painel administrativo." }, { status: 503 });
  if (method === "PIX" && !configuration.pixEnabled) return NextResponse.json({ error: "O pagamento por Pix está desativado." }, { status: 400 });
  if (method === "CREDIT_CARD" && !configuration.cardEnabled) return NextResponse.json({ error: "O pagamento por cartão está desativado." }, { status: 400 });
  if (method === "CREDIT_CARD" && (text(payload.encryptedCard).length < 20 || !text(payload.mpPaymentMethodId))) return NextResponse.json({ error: "Confira os dados do cartão e tente novamente." }, { status: 400 });

  const planCode = ["monthly", "quarterly", "semiannual"].includes(
    previous.planCode || "",
  )
    ? previous.planCode!
    : "monthly";
  const planLabel = previous.planLabel || previous.description || "Destaque do anúncio";
  const currentPlan = getFeaturedPlan(listing.category, planCode, listing.subcategory);
  const amountCents = planCode === "monthly" && currentPlan?.amountCents === 199
    ? 199
    : previous.amountCents;
  await prepareListingHighlight(listing.id, customer.id, planCode, amountCents, method);
  try {
    const origin = new URL(request.url).origin;
    const paymentInput = {
      listingId: listing.id,
      planLabel,
      amountCents,
      origin,
      customer: { name: customer.name, email: customer.email, taxId: customer.taxId, whatsapp: customer.whatsapp },
    };
    if (method === "PIX") {
      const pix = await createMercadoPagoPix(paymentInput);
      await setListingPaymentReference(listing.id, pix.orderId, pix.expiresAt);
      const paymentId = await createPaymentRecord({ userId: customer.id, listingId: listing.id, providerReference: pix.orderId, method: "PIX", amountCents, status: "pending", providerStatus: "WAITING", planCode, planLabel, description: planLabel, expiresAt: pix.expiresAt });
      await updateInvoiceStatusByListing(listing.id, "pending", "PIX");
      return NextResponse.json({ ok: true, paymentId, method: "PIX", amountCents, qrCodeText: pix.qrCodeText, qrCodeImage: pix.qrCodeImage, expiresAt: pix.expiresAt });
    }

    const card = await createMercadoPagoCard({
      ...paymentInput,
      cardToken: text(payload.encryptedCard),
      paymentMethodId: text(payload.mpPaymentMethodId),
      issuerId: text(payload.mpIssuerId) || undefined,
      installments: Number(payload.cardInstallments || 1),
    });
    await setListingPaymentReference(listing.id, card.orderId);
    const status = mercadoPagoLocalStatus(card.status);
    await setListingPaymentStatus(listing.id, status);
    const paymentId = await createPaymentRecord({ userId: customer.id, listingId: listing.id, providerReference: card.orderId, method: "CREDIT_CARD", amountCents, status, providerStatus: card.status, planCode, planLabel, description: planLabel, cardBrand: card.cardBrand, cardLast4: card.cardLast4, paidAt: card.paidAt });
    if (card.paid) await confirmFeaturedPayment(card.orderId);
    await updateInvoiceStatusByListing(listing.id, status === "paid" ? "paid" : status === "pending" ? "pending" : "failed", "CREDIT_CARD");
    return NextResponse.json({ ok: true, paymentId, method: "CREDIT_CARD", amountCents, paid: card.paid, paymentStatus: status, cardBrand: card.cardBrand, cardLast4: card.cardLast4 });
  } catch {
    await setListingPaymentStatus(listing.id, "failed");
    await updateInvoiceStatusByListing(listing.id, "failed", method);
    return NextResponse.json({ error: "O Mercado Pago não conseguiu gerar a nova cobrança. Confira os dados e tente novamente." }, { status: 502 });
  }
}
