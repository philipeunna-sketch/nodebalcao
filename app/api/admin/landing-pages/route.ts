import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { readPortalSettings, writePortalSettings } from "../../../../db/settings";
import { campaignLandings, mergeCampaignLanding } from "../../../campanha/landing-data";

async function authorize(request: Request) { return Boolean(await getAdminFromRequest(request)); }

export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const settings = await readPortalSettings();
  const stored = settings.campaign_landings && typeof settings.campaign_landings === "object" ? settings.campaign_landings as Record<string, unknown> : {};
  return NextResponse.json({
    pages: Object.keys(campaignLandings).map((slug) => mergeCampaignLanding(slug, stored[slug])),
    facebookPixelId: typeof settings.facebook_pixel_id === "string" ? settings.facebook_pixel_id : "",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { pages?: unknown; facebookPixelId?: unknown };
  const inputPages = Array.isArray(body.pages) ? body.pages : [];
  const stored = Object.fromEntries(inputPages.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const slug = typeof value.slug === "string" ? value.slug : "";
    const merged = mergeCampaignLanding(slug, value);
    return merged ? [[slug, { eyebrow: merged.eyebrow, title: merged.title, description: merged.description, ctaLabel: merged.ctaLabel }]] : [];
  }));
  const pixelId = typeof body.facebookPixelId === "string" ? body.facebookPixelId.replace(/\D/g, "").slice(0, 30) : "";
  await writePortalSettings({ campaign_landings: stored, facebook_pixel_id: pixelId });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
