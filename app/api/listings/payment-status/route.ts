import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { confirmFeaturedPayment, findListingForUser, setListingPaymentStatus } from "../../../../db/listings";
import { mercadoPagoLocalStatus, verifyMercadoPagoPayment } from "../../../../db/mercadopago";
import { updatePaymentByReference } from "../../../../db/payments";
import { updateInvoiceStatusByListing } from "../../../../db/invoices";

export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  const listing = id ? await findListingForUser(id, customer.id) : null;
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  if (listing.paymentStatus === "paid") return NextResponse.json({ paid: true, status: "paid" });
  if (!listing.paymentReference) return NextResponse.json({ paid: false, status: listing.paymentStatus || "pending" });
  try {
    const result = await verifyMercadoPagoPayment(listing.paymentReference);
    if (result.reference === `listing-${listing.id}` && result.paid) {
      await confirmFeaturedPayment(listing.paymentReference);
      return NextResponse.json({ paid: true, status: "paid" });
    }
    if (result.reference === `listing-${listing.id}`) {
      const status = mercadoPagoLocalStatus(result.status);
      await Promise.all([
        setListingPaymentStatus(listing.id, status),
        updatePaymentByReference(listing.paymentReference, {
          status,
          providerStatus: result.status,
        }),
        updateInvoiceStatusByListing(
          listing.id,
          status === "pending" ? "pending" : "failed",
          listing.paymentMethod,
        ),
      ]);
      return NextResponse.json({ paid: false, status });
    }
  } catch {
    return NextResponse.json({ paid: false, status: listing.paymentStatus || "pending" });
  }
  return NextResponse.json({ paid: false, status: listing.paymentStatus || "pending" });
}

export const dynamic = "force-dynamic";
