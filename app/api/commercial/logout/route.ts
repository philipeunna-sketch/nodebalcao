import { NextResponse } from "next/server";
import { COMMERCIAL_SESSION_COOKIE, deleteAdminSession, readCommercialCookie } from "../../../../db/admin-auth";

export async function POST(request: Request) {
  await deleteAdminSession(readCommercialCookie(request));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COMMERCIAL_SESSION_COOKIE, "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
