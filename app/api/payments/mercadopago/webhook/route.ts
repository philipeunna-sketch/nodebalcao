import { NextResponse } from "next/server";
import {
  confirmFeaturedPayment,
  findListingByPaymentReference,
  setListingPaymentStatus,
} from "../../../../../db/listings";
import {
  mercadoPagoLocalStatus,
  verifyMercadoPagoPayment,
} from "../../../../../db/mercadopago";
import { updatePaymentByReference } from "../../../../../db/payments";
import { updateInvoiceStatusByListing } from "../../../../../db/invoices";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    data?: { id?: string | number };
  };
  const id = String(body.data?.id || url.searchParams.get("data.id") || "");
  if (!id) return NextResponse.json({ ok: true });

  const listing = await findListingByPaymentReference(id);
  if (!listing) return NextResponse.json({ ok: true });

  let payment: Awaited<ReturnType<typeof verifyMercadoPagoPayment>>;
  try {
    payment = await verifyMercadoPagoPayment(id);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Não foi possível validar o pagamento." },
      { status: 502 },
    );
  }
  if (payment.reference !== `listing-${listing.id}`) {
    return NextResponse.json({ ok: true });
  }

  const status = mercadoPagoLocalStatus(payment.status);
  try {
    if (status === "paid") {
      await confirmFeaturedPayment(id);
    } else {
      await Promise.all([
        setListingPaymentStatus(listing.id, status),
        updatePaymentByReference(id, {
          status,
          providerStatus: payment.status,
        }),
        updateInvoiceStatusByListing(
          listing.id,
          status === "pending" ? "pending" : "failed",
          listing.paymentMethod,
        ),
      ]);
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Não foi possível atualizar o pagamento." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
