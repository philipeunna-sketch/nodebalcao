import { NextResponse } from "next/server";
import { readPortalSettings, writePortalSettings } from "../../../db/settings";
import { getAdminFromRequest } from "../../../db/admin-auth";
import { getMercadoPagoConfiguration } from "../../../db/mercadopago";

export async function GET() {
  const [settings, mercadoPago] = await Promise.all([
    readPortalSettings(),
    getMercadoPagoConfiguration(),
  ]);
  const privateKeys = new Set(["openai_api_key", "ai_chat_prompt", "google_maps_api", "mapbox_access_token", "resend_api_key", "verification_email_from", "whatsapp_access_token", "whatsapp_phone_number_id", "whatsapp_verify_template", "whatsapp_graph_version", "whatsapp_template_language", "wapi_token", "wapi_instance_id", "wapi_test_whatsapp", "registration_code_enabled", "mercadopago_access_token", "mercadopago_public_key", "mercadopago_test_access_token", "mercadopago_test_public_key", "mercadopago_production_access_token", "mercadopago_production_public_key", "cloudflare_api_token", "smtp_host", "smtp_port", "smtp_secure", "smtp_username", "smtp_password", "smtp_from_name", "smtp_from_email", "smtp_reply_to"]);
  const publicSettings = Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) =>
        !privateKeys.has(key) &&
        !key.startsWith("pagbank_") &&
        !key.startsWith("manual_pix_"),
    ),
  );
  return NextResponse.json(
    {
      ...publicSettings,
      mercadopago_enabled: mercadoPago.enabled,
      mercadopago_mode: mercadoPago.mode,
      mercadopago_pix_enabled: mercadoPago.enabled && mercadoPago.pixEnabled,
      mercadopago_card_enabled: mercadoPago.enabled && mercadoPago.cardEnabled,
      has_openai_api_key: Boolean(settings.openai_api_key),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const payload = await request.json() as Record<string, unknown>;
  const allowed = Object.fromEntries(Object.entries(payload).filter(([key]) => ["banners", "discover_pages", "categories", "login_image_url"].includes(key)));
  if (typeof allowed.login_image_url === "string") {
    const value = allowed.login_image_url.trim().slice(0, 500);
    allowed.login_image_url = value.startsWith("/api/media/") || /^https:\/\//i.test(value) ? value : "";
  }
  await writePortalSettings(allowed);
  return NextResponse.json({ ok: true });
}
