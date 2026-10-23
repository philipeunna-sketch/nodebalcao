import { NextRequest, NextResponse } from "next/server";
import { listFipeBrands, validFipeType } from "../../../../db/fipe";
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  if (!validFipeType(type))
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  return NextResponse.json(
    { brands: await listFipeBrands(type) },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
