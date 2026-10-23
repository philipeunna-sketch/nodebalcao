import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../../db/admin-auth";
import { adminConfirmFeaturedPaymentById, adminDeleteListing, adminFeatureListing, adminUpdateListing, findStoredListingById, updateListingForUser } from "../../../../../db/listings";
import { invalidatePublicListingsCache } from "../../../../../db/public-listings";
import { readPortalSettings } from "../../../../../db/settings";
import { validateListingEdit } from "../../../../../lib/listing-edit";
import { portalCategories } from "../../../../categories";

async function authorized(request: Request) { return Boolean(await getAdminFromRequest(request)); }

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params;
  const listing = await findStoredListingById(id, true);
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  return NextResponse.json({ listing: { ...listing, attributes: JSON.parse(listing.attributesJson || "{}"), features: JSON.parse(listing.featuresJson || "[]"), images: JSON.parse(listing.imagesJson || "[]") } }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params; const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (payload.attributes && typeof payload.attributes === "object" && Array.isArray(payload.images)) {
    const current = await findStoredListingById(id, true);
    if (!current) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
    const imagePrefix = `/api/media/${encodeURIComponent(`listing-drafts/${current.userId}/`)}`;
    const settings = await readPortalSettings();
    const categories = Array.isArray(settings.categories) && settings.categories.length ? settings.categories as Array<{ name: string; subs: string[] }> : portalCategories;
    const validated = validateListingEdit(payload, current, imagePrefix, categories);
    if (!validated.input) return NextResponse.json({ error: validated.error }, { status: 400 });
    const result = await updateListingForUser(id, current.userId, validated.input);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
    if (result.changed) invalidatePublicListingsCache();
    return NextResponse.json({ ok: true, changed: result.changed, listing: result.listing, message: result.changed ? "Alterações salvas. O anúncio voltou para aprovação." : "Nenhuma alteração foi feita." }, { headers: { "Cache-Control": "no-store" } });
  }
  const listing = await adminUpdateListing(id, {
    title: String(payload.title || ""), description: String(payload.description || ""), category: String(payload.category || "Outros"),
    subcategory: String(payload.subcategory || "Outros"), negotiationType: String(payload.negotiationType || "Venda"), address: String(payload.address || ""),
    priceCents: payload.priceCents == null ? null : Math.max(0, Math.round(Number(payload.priceCents))), status: typeof payload.status === "string" ? payload.status : undefined,
    images: Array.isArray(payload.images) ? payload.images.filter((item): item is string => typeof item === "string") : undefined,
  });
  if (listing) invalidatePublicListingsCache();
  return listing ? NextResponse.json({ ok: true, listing }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params; return await adminDeleteListing(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const { id } = await params; const payload = await request.json().catch(() => ({})) as { action?: string };
  if (payload.action === "confirm-payment") {
    const listing = await adminConfirmFeaturedPaymentById(id);
    return listing ? NextResponse.json({ ok: true, listing }) : NextResponse.json({ error: "Pagamento manual não localizado." }, { status: 404 });
  }
  if (payload.action !== "feature") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const listing = await adminFeatureListing(id, false);
  return listing ? NextResponse.json({ ok: true, listing }) : NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
}
