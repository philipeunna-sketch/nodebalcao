import { NextResponse } from "next/server";
import { getSynchronizedNews } from "../../../db/news";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 10));
  const query = url.searchParams.get("search")?.trim().slice(0, 120) || "";
  try {
    const result = await getSynchronizedNews({ search: query, limit, force: url.searchParams.get("fresh") === "1" });
    return NextResponse.json(result, { headers: { "Cache-Control": query ? "public, max-age=30, s-maxage=60" : "public, max-age=120, s-maxage=300, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ posts: [], configured: true, unavailable: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
