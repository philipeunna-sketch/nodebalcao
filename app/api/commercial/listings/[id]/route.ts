import { NextResponse } from "next/server";
import { getCommercialFromRequest } from "../../../../../db/admin-auth";
import { adminDeleteListing, findStoredListingById, updateListingForUser } from "../../../../../db/listings";
import { invalidatePublicListingsCache } from "../../../../../db/public-listings";
import { readPortalSettings } from "../../../../../db/settings";
import { validateListingEdit } from "../../../../../lib/listing-edit";
import { portalCategories } from "../../../../categories";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const commercial = await getCommercialFromRequest(request);
  if (!commercial) return NextResponse.json({ error: "Sessão comercial expirada. Entre novamente no painel." }, { status: 401 });
  const { id } = await params;
  const listing = await findStoredListingById(id, true);
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  return NextResponse.json({
    listing: {
      ...listing,
      attributes: JSON.parse(listing.attributesJson || "{}"),
      features: JSON.parse(listing.featuresJson || "[]"),
      images: JSON.parse(listing.imagesJson || "[]"),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, { params }: Context) {
  const commercial = await getCommercialFromRequest(request);
  if (!commercial) return NextResponse.json({ error: "Sessão comercial expirada. Entre novamente no painel." }, { status: 401 });
  const { id } = await params;
  const current = await findStoredListingById(id, true);
  if (!current) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const staffImagePrefix = `/api/media/${encodeURIComponent(`listing-commercial/${commercial.id}/`)}`;
  const settings = await readPortalSettings();
  const categories = Array.isArray(settings.categories) && settings.categories.length ? settings.categories as Array<{ name: string; subs: string[] }> : portalCategories;
  const validated = validateListingEdit(payload, current, staffImagePrefix, categories);
  if (!validated.input) return NextResponse.json({ error: validated.error }, { status: 400 });
  const result = await updateListingForUser(id, current.userId, validated.input);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  if (result.changed) invalidatePublicListingsCache();
  return NextResponse.json({
    ok: true,
    changed: result.changed,
    status: result.changed ? "pending_review" : current.status,
    message: result.changed ? "Alterações salvas. O anúncio voltou para aprovação." : "Nenhuma alteração foi feita; o anúncio permanece no estado atual.",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, { params }: Context) {
  const commercial = await getCommercialFromRequest(request);
  if (!commercial) return NextResponse.json({ error: "Sessão comercial expirada. Entre novamente no painel." }, { status: 401 });
  const { id } = await params;
  if (!(await adminDeleteListing(id))) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  invalidatePublicListingsCache();
  return NextResponse.json({ ok: true, message: "Anúncio excluído do portal." }, { headers: { "Cache-Control": "no-store" } });
}
