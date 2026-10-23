import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import {
  continueFipeSync,
  fipeStats,
  startFipeSync,
  validFipeType,
} from "../../../../db/fipe";
export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request)))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  return NextResponse.json(await fipeStats(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: NextRequest) {
  if (!(await getAdminFromRequest(request)))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  const body = (await request.json()) as {
    action?: string;
    type?: string;
    jobId?: string;
  };
  const type = body.type || null;
  try {
    if (body.action === "start" && validFipeType(type))
      return NextResponse.json(await startFipeSync(type));
    if (body.action === "continue" && body.jobId)
      return NextResponse.json(await continueFipeSync(body.jobId));
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha na sincronização.",
      },
      { status: 502 },
    );
  }
}
