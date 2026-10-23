import { NextRequest, NextResponse } from "next/server";
import { listFipeModels, validFipeType } from "../../../../db/fipe";
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type"),
    brandId = (request.nextUrl.searchParams.get("brandId") || "").slice(0, 100);
  if (!validFipeType(type) || !brandId)
    return NextResponse.json(
      { error: "Parâmetros inválidos." },
      { status: 400 },
    );
  return NextResponse.json(
    { models: await listFipeModels(type, brandId) },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
