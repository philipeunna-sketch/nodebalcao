import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { testMercadoPago, type MercadoPagoMode } from "../../../../db/mercadopago";
import { readPrivateSetting, writePortalSettings } from "../../../../db/settings";

function booleanSetting(value: unknown, fallback: boolean) {
  if (value === true || String(value) === "true") return true;
  if (value === false || String(value) === "false") return false;
  return fallback;
}

function paymentMode(value: unknown): MercadoPagoMode {
  return value === "test" ? "test" : "production";
}

function keyHint(value: string) {
  return value ? `${value.slice(0, 8)}••••${value.slice(-4)}` : "";
}

async function readConfiguration(modeOverride?: MercadoPagoMode) {
  const [modeValue, legacyTokenValue, legacyKeyValue, testTokenValue, testKeyValue, productionTokenValue, productionKeyValue, enabledValue, pixValue, cardValue] = await Promise.all([
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
  const mode = modeOverride || paymentMode(modeValue);
  const testAccessToken = String(testTokenValue || "").trim();
  const testPublicKey = String(testKeyValue || "").trim();
  const productionAccessToken = String(productionTokenValue || legacyTokenValue || "").trim();
  const productionPublicKey = String(productionKeyValue || legacyKeyValue || "").trim();
  const accessToken = mode === "test" ? testAccessToken : productionAccessToken;
  const publicKey = mode === "test" ? testPublicKey : productionPublicKey;
  return {
    mode,
    accessToken,
    publicKey,
    configured: Boolean(accessToken && publicKey),
    testConfigured: Boolean(testAccessToken && testPublicKey),
    productionConfigured: Boolean(productionAccessToken && productionPublicKey),
    testPublicKeyHint: keyHint(testPublicKey),
    productionPublicKeyHint: keyHint(productionPublicKey),
    enabled: booleanSetting(enabledValue, false),
    pixEnabled: booleanSetting(pixValue, true),
    cardEnabled: booleanSetting(cardValue, true),
  };
}

function publicConfiguration(configuration: Awaited<ReturnType<typeof readConfiguration>>) {
  return {
    mode: configuration.mode,
    configured: configuration.configured,
    enabled: configuration.configured && configuration.enabled,
    pixEnabled: configuration.pixEnabled,
    cardEnabled: configuration.cardEnabled,
    testConfigured: configuration.testConfigured,
    productionConfigured: configuration.productionConfigured,
    publicKeyHint: configuration.mode === "test" ? configuration.testPublicKeyHint : configuration.productionPublicKeyHint,
    publicKeyHints: {
      test: configuration.testPublicKeyHint,
      production: configuration.productionPublicKeyHint,
    },
  };
}

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  return NextResponse.json(publicConfiguration(await readConfiguration()), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = paymentMode(body.mode);
  const current = await readConfiguration(mode);
  const accessToken = typeof body.accessToken === "string" && body.accessToken.trim() ? body.accessToken.trim().slice(0, 500) : current.accessToken;
  const publicKey = typeof body.publicKey === "string" && body.publicKey.trim() ? body.publicKey.trim().slice(0, 500) : current.publicKey;
  const nextEnabled = typeof body.enabled === "boolean" ? body.enabled : current.enabled;
  const pixEnabled = typeof body.pixEnabled === "boolean" ? body.pixEnabled : current.pixEnabled;
  const cardEnabled = typeof body.cardEnabled === "boolean" ? body.cardEnabled : current.cardEnabled;

  if (nextEnabled && (!accessToken || !publicKey)) {
    return NextResponse.json({ error: `Informe o Access Token e a Public Key de ${mode === "test" ? "teste" : "produção"} antes de ativar o Mercado Pago.` }, { status: 400 });
  }
  if (nextEnabled && !pixEnabled && !cardEnabled) {
    return NextResponse.json({ error: "Ative Pix ou cartão antes de ativar o Mercado Pago." }, { status: 400 });
  }

  const credentialSettings = mode === "test"
    ? { mercadopago_test_access_token: accessToken, mercadopago_test_public_key: publicKey }
    : {
        mercadopago_production_access_token: accessToken,
        mercadopago_production_public_key: publicKey,
        // Compatibilidade com instalações que já usavam as chaves anteriores.
        mercadopago_access_token: accessToken,
        mercadopago_public_key: publicKey,
      };
  await writePortalSettings({
    ...credentialSettings,
    mercadopago_mode: mode,
    mercadopago_enabled: nextEnabled,
    mercadopago_pix_enabled: pixEnabled,
    mercadopago_card_enabled: cardEnabled,
  });

  return NextResponse.json(publicConfiguration({
    ...current,
    mode,
    accessToken,
    publicKey,
    configured: Boolean(accessToken && publicKey),
    testConfigured: mode === "test" ? Boolean(accessToken && publicKey) : current.testConfigured,
    productionConfigured: mode === "production" ? Boolean(accessToken && publicKey) : current.productionConfigured,
    testPublicKeyHint: mode === "test" ? keyHint(publicKey) : current.testPublicKeyHint,
    productionPublicKeyHint: mode === "production" ? keyHint(publicKey) : current.productionPublicKeyHint,
    enabled: nextEnabled,
    pixEnabled,
    cardEnabled,
  }));
}

export async function PUT(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { accessToken?: string; mode?: MercadoPagoMode };
  const mode = paymentMode(body.mode);
  const current = await readConfiguration(mode);
  try {
    return NextResponse.json({ ...(await testMercadoPago(body.accessToken?.trim() || current.accessToken)), mode });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({
      error: code.includes(":401") || code.includes(":403")
        ? `Credencial de ${mode === "test" ? "teste" : "produção"} do Mercado Pago não aceita.`
        : code.includes("NOT_CONFIGURED")
          ? "Informe o Access Token antes de testar a integração."
          : "Não foi possível validar a integração.",
    }, { status: 400 });
  }
}
