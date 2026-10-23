"use client";

import { FormEvent, useState } from "react";
import { MiniLogo } from "../shared";

export default function PasswordRecoveryPage() {
  const [token] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (token && password !== String(form.get("confirmPassword") || "")) { setBusy(false); setError("As senhas não coincidem."); return; }
    const response = await fetch(token ? "/api/customer/password-reset/confirm" : "/api/customer/password-reset/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(token ? { token, password } : { taxId: form.get("taxId") }) });
    const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
    setBusy(false); if (!response.ok) return setError(data.error || "Não foi possível concluir.");
    setMessage(token ? "Senha atualizada. Você já pode entrar na sua conta." : data.message || "Confira seu e-mail.");
  }
  return <main className="customer-login-page"><section className="customer-login-card password-recovery-card"><MiniLogo/><div className="customer-login-copy"><h1>{token ? "Criar nova senha" : "Recuperar senha"}</h1><p>{token ? "Digite e confirme a nova senha da sua conta." : "Informe seu CPF ou CNPJ. As instruções serão enviadas ao e-mail já cadastrado."}</p></div><form onSubmit={submit}>{token ? <><label>Nova senha<input name="password" type="password" minLength={8} autoComplete="new-password" required/></label><label>Confirmar senha<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required/></label></> : <label>CPF ou CNPJ<input name="taxId" inputMode="numeric" autoComplete="off" required/></label>}{error ? <div className="register-error" role="alert">{error}</div> : null}{message ? <div className="integration-status" role="status">{message}</div> : null}<button className="primary-button" disabled={busy}>{busy ? "Processando…" : token ? "Salvar nova senha" : "Enviar instruções"}</button></form><p><a href="/entrar">Voltar para o login</a></p></section></main>;
}
