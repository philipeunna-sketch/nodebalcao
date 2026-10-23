import { readPrivateSetting } from "./settings";

type Customer = { name: string; email: string; taxId: string };

export type MercadoPagoMode = "test" | "production";

function enabled(value: unknown) {
  return value === true || String(value) === "true";
}

function paymentMode(value: unknown): MercadoPagoMode {
  return value === "test" ? "test" : "production";
}

export type MercadoPagoLocalStatus =
  | "pending"
  | "paid"
  | "declined"
  | "expired";

export function mercadoPagoLocalStatus(
  providerStatus: string,
): MercadoPagoLocalStatus {
  const status = providerStatus.trim().toUpperCase();
  if (status === "APPROVED") return "paid";
  if (status === "EXPIRED") return "expired";
  if (
    [
      "REJECTED",
      "CANCELLED",
      "CANCELED",
      "REFUNDED",
      "CHARGED_BACK",
    ].includes(status)
  ) {
    return "declined";
  }
  return "pending";
}

export async function getMercadoPagoConfiguration() {
  const [
    modeValue,
    legacyAccessTokenValue,
    legacyPublicKeyValue,
    testAccessTokenValue,
    testPublicKeyValue,
    productionAccessTokenValue,
    productionPublicKeyValue,
    enabledValue,
    pixValue,
    cardValue,
  ] = await Promise.all([
      readPrivateSetting("mercadopago_mode"),
      readPrivateSetting("mercadopago_access_token"),
      readPrivateSetting("mercadopago_public_key"),
      readPrivateSetting("mercadopago_test_access_token"),
      readPrivateSetting("mercadopago_test_public_key"),
      readPrivateSetting("mercadopago_production_access_token"),
      readPrivateSetting("mercadopago_production_public_key"),
      readPrivateSetting("mercadopago_enabled"),
      readPrivateSetting("mercadopago_pix_enabled"),
      readPrivateSetting("mercadopago_card_enabled"),
    ]);
  const mode = paymentMode(modeValue);
  const productionAccessToken = String(
    productionAccessTokenValue || legacyAccessTokenValue || "",
  ).trim();
  const productionPublicKey = String(
    productionPublicKeyValue || legacyPublicKeyValue || "",
  ).trim();
  const accessToken = String(
    mode === "test" ? testAccessTokenValue : productionAccessToken,
  ).trim();
  const publicKey = String(
    mode === "test" ? testPublicKeyValue : productionPublicKey,
  ).trim();
  const configured = Boolean(accessToken && publicKey);
  return {
    mode,
    accessToken,
    publicKey,
    configured,
    enabled: configured && enabled(enabledValue),
    pixEnabled: String(pixValue) !== "false",
    cardEnabled: String(cardValue) !== "false",
  };
}

async function callMercadoPago(
  path: string,
  init: RequestInit = {},
  overrideToken?: string,
) {
  const configuration = await getMercadoPagoConfiguration();
  const token = overrideToken?.trim() || configuration.accessToken;
  if (!token) throw new Error("MERCADOPAGO_NOT_CONFIGURED");

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.method && init.method !== "GET"
        ? { "X-Idempotency-Key": crypto.randomUUID() }
        : {}),
      ...(init.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(`MERCADOPAGO_FAILED:${response.status}`);
  }
  return body;
}

export async function testMercadoPago(accessToken?: string) {
  const body = await callMercadoPago(
    "/users/me",
    { method: "GET" },
    accessToken,
  );
  return {
    ok: true,
    accountId: String(body.id || ""),
    nickname: String(body.nickname || ""),
  };
}

function payer(customer: Customer) {
  const taxId = customer.taxId.replace(/\D/g, "");
  return {
    email: customer.email,
    identification: {
      type: taxId.length === 14 ? "CNPJ" : "CPF",
      number: taxId,
    },
  };
}

export async function createMercadoPagoPix(input: {
  listingId: string;
  planLabel: string;
  amountCents: number;
  origin: string;
  customer: Customer;
}) {
  const configuration = await getMercadoPagoConfiguration();
  if (!configuration.enabled) throw new Error("MERCADOPAGO_DISABLED");
  if (!configuration.pixEnabled) throw new Error("MERCADOPAGO_PIX_DISABLED");

  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const body = await callMercadoPago("/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: `Destaque ${input.planLabel} — Portal Balcão`,
      payment_method_id: "pix",
      payer: payer(input.customer),
      external_reference: `listing-${input.listingId}`,
      notification_url: `${new URL(input.origin).origin}/api/payments/mercadopago/webhook`,
      date_of_expiration: expiresAt,
    }),
  });
  const transaction = (
    body.point_of_interaction as {
      transaction_data?: { qr_code?: string; qr_code_base64?: string };
    } | undefined
  )?.transaction_data;
  if (!body.id || !transaction?.qr_code) {
    throw new Error("MERCADOPAGO_PIX_INVALID");
  }
  return {
    orderId: String(body.id),
    qrCodeText: transaction.qr_code,
    qrCodeImage: transaction.qr_code_base64
      ? `data:image/png;base64,${transaction.qr_code_base64}`
      : undefined,
    expiresAt,
  };
}

export async function createMercadoPagoCard(input: {
  listingId: string;
  planLabel: string;
  amountCents: number;
  origin: string;
  customer: Customer;
  cardToken: string;
  paymentMethodId: string;
  issuerId?: string;
  installments: number;
}) {
  const configuration = await getMercadoPagoConfiguration();
  if (!configuration.enabled) throw new Error("MERCADOPAGO_DISABLED");
  if (!configuration.cardEnabled) {
    throw new Error("MERCADOPAGO_CARD_DISABLED");
  }

  const body = await callMercadoPago("/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      token: input.cardToken,
      description: `Destaque ${input.planLabel} — Portal Balcão`,
      installments: input.installments,
      payment_method_id: input.paymentMethodId,
      issuer_id: input.issuerId || undefined,
      payer: payer(input.customer),
      external_reference: `listing-${input.listingId}`,
      notification_url: `${new URL(input.origin).origin}/api/payments/mercadopago/webhook`,
      three_d_secure_mode: "optional",
      capture: true,
      binary_mode: false,
    }),
  });
  if (!body.id) throw new Error("MERCADOPAGO_CARD_INVALID");
  const card = body.card as { last_four_digits?: string } | undefined;
  return {
    orderId: String(body.id),
    paid: body.status === "approved",
    status: String(body.status || "pending").toUpperCase(),
    cardBrand: input.paymentMethodId,
    cardLast4: card?.last_four_digits || null,
    paidAt: typeof body.date_approved === "string" ? body.date_approved : null,
  };
}

export async function verifyMercadoPagoPayment(id: string) {
  if (!/^\d{4,30}$/.test(id)) {
    return { paid: false, reference: "", status: "INVALID" };
  }
  const body = await callMercadoPago(`/v1/payments/${id}`, { method: "GET" });
  return {
    paid: body.status === "approved",
    reference:
      typeof body.external_reference === "string"
        ? body.external_reference
        : "",
    status: String(body.status || "pending").toUpperCase(),
  };
}
