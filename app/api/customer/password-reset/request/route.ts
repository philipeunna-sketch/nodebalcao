import { NextResponse } from "next/server";
import { createPasswordResetByTaxId, onlyDigits } from "../../../../../db/customer-auth";
import { sendPasswordResetEmail } from "../../../../../db/verification-delivery";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { taxId?: unknown };
  const taxId = onlyDigits(String(body.taxId || ""));
  if (taxId.length !== 11 && taxId.length !== 14) return NextResponse.json({ error: "Informe um CPF ou CNPJ válido." }, { status: 400 });
  const reset = await createPasswordResetByTaxId(taxId);
  if (reset) await sendPasswordResetEmail(reset).catch(() => undefined);
  return NextResponse.json({ message: "Se o cadastro estiver ativo, enviaremos as instruções ao e-mail registrado." });
}
