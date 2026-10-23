import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import {
  createMercadoPagoCard,
  createMercadoPagoPix,
  getMercadoPagoConfiguration,
  mercadoPagoLocalStatus,
} from "../../../../db/mercadopago";

type UnknownRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  }

  const configuration = await getMercadoPagoConfiguration();
  if (
    configuration.mode !== "test" ||
    !configuration.configured ||
    !configuration.enabled
  ) {
    return NextResponse.json(
      {
        error:
          "Ative e salve o Mercado Pago no ambiente de teste antes de gerar uma cobrança de validação.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as UnknownRecord;
  const method = body.method === "card" ? "card" : "pix";
  const amountCents = Number(body.amountCents);
  const name = text(body.name).slice(0, 120);
  const email = text(body.email).toLowerCase().slice(0, 160);
  const taxId = text(body.taxId).replace(/\D/g, "");
  if (
    !Number.isInteger(amountCents) ||
    amountCents < 100 ||
    amountCents > 1_000_000 ||
    name.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    ![11, 14].includes(taxId.length)
  ) {
    return NextResponse.json(
      {
        error:
          "Informe um valor entre R$ 1,00 e R$ 10.000,00, nome, e-mail e CPF ou CNPJ válidos.",
      },
      { status: 400 },
    );
  }

  if (method === "pix" && !configuration.pixEnabled) {
    return NextResponse.json(
      { error: "O Pix está desativado nas configurações." },
      { status: 400 },
    );
  }
  if (method === "card" && !configuration.cardEnabled) {
    return NextResponse.json(
      { error: "O cartão está desativado nas configurações." },
      { status: 400 },
    );
  }

  const paymentInput = {
    listingId: `test-${crypto.randomUUID()}`,
    planLabel: "Teste de integração",
    amountCents,
    origin: new URL(request.url).origin,
    customer: { name, email, taxId },
  };

  try {
    if (method === "pix") {
      const pix = await createMercadoPagoPix(paymentInput);
      return NextResponse.json({
        ok: true,
        method: "PIX",
        status: "pending",
        providerReference: pix.orderId,
        qrCodeText: pix.qrCodeText,
        qrCodeImage: pix.qrCodeImage,
        expiresAt: pix.expiresAt,
      });
    }

    const cardToken = text(body.encryptedCard);
    const paymentMethodId = text(body.mpPaymentMethodId);
    const installments = Number(body.cardInstallments || 1);
    if (
      cardToken.length < 20 ||
      !paymentMethodId ||
      !Number.isInteger(installments) ||
      installments < 1 ||
      installments > 3
    ) {
      return NextResponse.json(
        { error: "Confira os dados do cartão de teste." },
        { status: 400 },
      );
    }
    const card = await createMercadoPagoCard({
      ...paymentInput,
      cardToken,
      paymentMethodId,
      issuerId: text(body.mpIssuerId) || undefined,
      installments,
    });
    return NextResponse.json({
      ok: true,
      method: "CREDIT_CARD",
      status: mercadoPagoLocalStatus(card.status),
      providerStatus: card.status,
      providerReference: card.orderId,
      paid: card.paid,
      cardBrand: card.cardBrand,
      cardLast4: card.cardLast4,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: code.includes("MERCADOPAGO_FAILED:401")
          ? "A credencial de teste do Mercado Pago não foi aceita."
          : "O Mercado Pago não conseguiu processar a cobrança de teste. Confira os dados da conta de teste e tente novamente.",
      },
      { status: 502 },
    );
  }
}
