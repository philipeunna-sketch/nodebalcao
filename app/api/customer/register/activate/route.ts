import { NextResponse } from "next/server";
import {
  CUSTOMER_SESSION_COOKIE,
  createCustomerSession,
  onlyDigits,
  verifyPendingRegistration,
} from "../../../../../db/customer-auth";
import { sendWelcomeAccountEmail } from "../../../../../db/verification-delivery";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const registrationId = url.searchParams.get("registrationId") || "";
  const code = onlyDigits(url.searchParams.get("code") || "");
  if (!registrationId || code.length !== 4) {
    return NextResponse.redirect(new URL("/cadastro?activation=invalid", request.url));
  }
  const result = await verifyPendingRegistration(registrationId, code);
  if ("error" in result) {
    const message = typeof result.error === "string" ? result.error : "Não foi possível ativar a conta.";
    return NextResponse.redirect(new URL(`/cadastro?activation=error&message=${encodeURIComponent(message)}`, request.url));
  }
  const session = await createCustomerSession(result.userId, true);
  await sendWelcomeAccountEmail({ email: result.email, name: result.name }).catch(() => false);
  const response = NextResponse.redirect(new URL("/anunciar?conta=ativada", request.url));
  response.cookies.set(CUSTOMER_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}

export const dynamic = "force-dynamic";
