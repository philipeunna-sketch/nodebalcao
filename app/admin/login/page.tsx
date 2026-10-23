"use client";
import { FormEvent, useEffect, useState } from "react";
import { MiniLogo, OptimizedImage } from "../../shared";

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginImage, setLoginImage] = useState("/banner-home-classificados.webp");
  useEffect(()=>{fetch("/api/settings").then(response=>response.json()).then(settings=>{if(typeof settings.admin_login_image_url==="string"&&settings.admin_login_image_url)setLoginImage(settings.admin_login_image_url);else if(typeof settings.login_image_url==="string"&&settings.login_image_url)setLoginImage(settings.login_image_url);}).catch(()=>undefined);},[]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: data.get("admin_user"),
        password: data.get("admin_pass"),
        remember: data.get("remember") === "on",
      }),
    });
    if (response.ok) {
      location.href = "/admin";
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setError(payload.error || "Não foi possível entrar.");
    setBusy(false);
  }
  return (
    <main className="customer-login-page admin-login-split-page">
      <section className="customer-login-split" aria-labelledby="admin-login-title">
        <aside className="customer-login-visual"><OptimizedImage src={loginImage} alt="Acesso administrativo do Jornal Balcão" width="1320" height="900" loading="eager" decoding="async" fetchPriority="high" /></aside>
      <section className="customer-login-card admin-login-card-modern">
        <MiniLogo />
        <div className="customer-login-copy"><h1 id="admin-login-title">Acesso administrativo</h1><p>Entre com suas credenciais para gerenciar o Jornal Balcão.</p></div>
        <form onSubmit={login} autoComplete="off">
          <label>
            E-mail
            <input
              name="admin_user"
              type="email"
              defaultValue=""
              autoComplete="one-time-code"
              readOnly
              onFocus={(event)=>event.currentTarget.removeAttribute("readonly")}
              placeholder="Digite seu e-mail"
              required
            />
          </label>
          <label>
            Senha
            <input
              name="admin_pass"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="new-password"
              readOnly
              onFocus={(event)=>event.currentTarget.removeAttribute("readonly")}
              required
            />
          </label>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary-button wide" type="submit" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
      </section>
    </main>
  );
}
