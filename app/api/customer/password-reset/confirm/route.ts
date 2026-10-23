import { NextResponse } from "next/server";
import { resetCustomerPassword } from "../../../../../db/customer-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown };
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!token || password.length < 8) return NextResponse.json({ error: "Informe uma senha com pelo menos 8 caracteres." }, { status: 400 });
  if (!await resetCustomerPassword(token, password)) return NextResponse.json({ error: "Este link expirou ou já foi utilizado." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
