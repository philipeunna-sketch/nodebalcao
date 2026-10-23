import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { ensureAllListingSlugs } from "../../../../db/listing-slugs";
import { listingPath } from "../../../../lib/listing-url";

type CatalogRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory: string;
  address: string;
  priceCents: number | null;
  monthlyRentCents: number | null;
  negotiable: number;
  coverImage: string;
  createdAt: string;
  status: string;
  publicationType: string;
  featuredPlan: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  paymentAmountCents: number | null;
  paymentExpiresAt: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
};

type PageviewRow = { listingId: string; pageViews: number; sessions: number };
type ContactRow = { listingId: string; views: number; phoneClicks: number; whatsappClicks: number };

function isoBoundary(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
}

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  const { env } = await import("cloudflare:workers");
  await ensureAllListingSlugs();
  const params = new URL(request.url).searchParams;
  const page = Math.min(10_000, Math.max(1, Math.trunc(Number(params.get("page")) || 1)));
  const pageSize = 30;
  const query = (params.get("query") || "").trim().slice(0, 120);
  const category = (params.get("category") || "").trim().slice(0, 100);
  const status = (params.get("status") || "").trim().slice(0, 40);
  const from = isoBoundary(params.get("from") || "");
  const to = isoBoundary(params.get("to") || "");
  const where: string[] = [];
  const bindings: Array<string> = [];

  if (status) {
    where.push("l.status = ?");
    bindings.push(status);
  }
  if (category) {
    where.push(category === "Veículos" ? "l.category IN (?, 'Autos')" : "l.category = ?");
    bindings.push(category);
  }
  if (from) {
    where.push("l.created_at >= ?");
    bindings.push(from);
  }
  if (to) {
    where.push("l.created_at < ?");
    bindings.push(to);
  }
  if (query) {
    const term = `%${query.replace(/[\\%_]/g, "\\$&").toLowerCase()}%`;
    where.push("(lower(l.title) LIKE ? ESCAPE '\\' OR lower(l.description) LIKE ? ESCAPE '\\' OR lower(u.name) LIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\')");
    bindings.push(term, term, term, term);
  }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromTable = `FROM portal_listings l LEFT JOIN portal_users u ON u.id = l.user_id ${filter}`;

  const [rowsResult, countResult, pendingResult] = await Promise.all([
    env.DB.prepare(`SELECT l.id, l.slug, l.title, l.category, l.subcategory, l.address,
      l.price_cents AS priceCents, l.monthly_rent_cents AS monthlyRentCents,
      l.negotiable, l.cover_image AS coverImage, l.created_at AS createdAt,
      l.status, l.publication_type AS publicationType, l.featured_plan AS featuredPlan,
      l.payment_status AS paymentStatus, l.payment_method AS paymentMethod,
      l.payment_amount_cents AS paymentAmountCents, l.payment_expires_at AS paymentExpiresAt,
      u.name AS sellerName, u.email AS sellerEmail
      ${fromTable} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, pageSize, (page - 1) * pageSize).all<CatalogRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS total ${fromTable}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM portal_listings WHERE status = 'pending_review'").first<{ total: number }>(),
  ]);
  const ids = rowsResult.results.map((row) => row.id);
  const pageviews = new Map<string, PageviewRow>();
  const contacts = new Map<string, ContactRow>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const [viewsResult, contactResult] = await Promise.all([
      env.DB.prepare(`SELECT listing_id AS listingId, COUNT(*) AS pageViews, COUNT(DISTINCT session_id) AS sessions
        FROM portal_analytics_pageviews WHERE listing_id IN (${placeholders}) GROUP BY listing_id`)
        .bind(...ids).all<PageviewRow>(),
      env.DB.prepare(`SELECT listing_id AS listingId,
        SUM(CASE WHEN event_type = 'detail_view' THEN 1 ELSE 0 END) AS views,
        SUM(CASE WHEN event_type = 'phone_reveal' THEN 1 ELSE 0 END) AS phoneClicks,
        SUM(CASE WHEN event_type = 'whatsapp_click' THEN 1 ELSE 0 END) AS whatsappClicks
        FROM portal_listing_contact_events WHERE listing_id IN (${placeholders}) GROUP BY listing_id`)
        .bind(...ids).all<ContactRow>(),
    ]);
    viewsResult.results.forEach((row) => pageviews.set(row.listingId, row));
    contactResult.results.forEach((row) => contacts.set(row.listingId, row));
  }

  const data = rowsResult.results.map((row) => {
    const cents = row.negotiable ? null : row.monthlyRentCents ?? row.priceCents;
    return {
      id: row.id,
      slug: row.slug,
      url: listingPath(row.slug),
      title: row.title,
      category: row.category === "Autos" ? "Veículos" : row.category,
      subcategory: row.subcategory,
      location: row.address,
      price: cents == null ? 0 : cents / 100,
      priceLabel: !cents ? "Valor a combinar" : `${(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${row.monthlyRentCents != null ? "/mês" : ""}`,
      image: row.coverImage,
      age: "",
      description: "",
      createdAt: row.createdAt,
      sellerName: row.sellerName || "",
      sellerEmail: row.sellerEmail || "",
      status: row.status,
      publicationType: row.publicationType,
      featuredPlan: row.featuredPlan,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
      paymentAmountCents: row.paymentAmountCents,
      paymentExpiresAt: row.paymentExpiresAt,
      analytics: {
        views: Number(contacts.get(row.id)?.views || 0),
        pageViews: Number(pageviews.get(row.id)?.pageViews || 0),
        sessions: Number(pageviews.get(row.id)?.sessions || 0),
        phoneClicks: Number(contacts.get(row.id)?.phoneClicks || 0),
        whatsappClicks: Number(contacts.get(row.id)?.whatsappClicks || 0),
      },
    };
  });
  return NextResponse.json(
    { data, total: Number(countResult?.total || 0), pendingCount: Number(pendingResult?.total || 0), page, pageSize },
    { headers: { "Cache-Control": "no-store" } },
  );
}
