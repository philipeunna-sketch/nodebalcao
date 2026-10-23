import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, writePortalSettings } from "../../../../db/settings";
import { SITE_URL } from "../../../../lib/site-url";
import { submitSitemapToGoogle } from "../../../../lib/google-search";

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  const credentials = typeof settings.google_search_service_account === "string" ? settings.google_search_service_account : "";
  return NextResponse.json({ enabled: settings.google_search_enabled === true, configured: Boolean(credentials), credentialHint: credentials ? "Conta de serviço configurada" : "", siteUrl: SITE_URL, sitemapUrl: `${SITE_URL}/sitemap.xml`, lastSubmittedAt: settings.google_search_last_submitted_at || "" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { credentials?: string; enabled?: boolean; test?: boolean };
  const current = await readPortalSettings();
  const credentials = payload.credentials?.trim() || (typeof current.google_search_service_account === "string" ? current.google_search_service_account : "");
  if (payload.enabled && !credentials) return NextResponse.json({ error: "Informe o JSON da conta de serviço do Google Search Console." }, { status: 400 });
  if (payload.credentials) { try { const parsed = JSON.parse(credentials) as Record<string, unknown>; if (!parsed.client_email || !parsed.private_key) throw new Error(); } catch { return NextResponse.json({ error: "JSON da conta de serviço inválido." }, { status: 400 }); } }
  let lastSubmittedAt = typeof current.google_search_last_submitted_at === "string" ? current.google_search_last_submitted_at : "";
  if (payload.test && credentials) { try { const result = await submitSitemapToGoogle(credentials, SITE_URL, `${SITE_URL}/sitemap.xml`); lastSubmittedAt = result.submittedAt; } catch { return NextResponse.json({ error: "Não foi possível enviar o sitemap. Confirme a conta de serviço e a permissão no Search Console." }, { status: 400 }); } }
  await writePortalSettings({ google_search_service_account: credentials, google_search_enabled: payload.enabled === true, google_search_last_submitted_at: lastSubmittedAt });
  return NextResponse.json({ ok: true, enabled: payload.enabled === true, configured: Boolean(credentials), credentialHint: credentials ? "Conta de serviço configurada" : "", lastSubmittedAt }, { headers: { "Cache-Control": "no-store" } });
}
