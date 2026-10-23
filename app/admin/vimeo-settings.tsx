"use client";

import { FormEvent, useEffect, useState } from "react";

type VimeoState = {
  enabled: boolean;
  configured: boolean;
  tokenHint: string;
  lastSyncAt: string;
  lastImportResult: null | { total?: number; imported?: number; updated?: number; skipped?: number };
};

const emptyState: VimeoState = {
  enabled: false,
  configured: false,
  tokenHint: "",
  lastSyncAt: "",
  lastImportResult: null,
};

export default function VimeoSettings() {
  const [settings, setSettings] = useState<VimeoState>(emptyState);
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test" | "import">("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/admin/vimeo-settings", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((data: VimeoState) => setSettings({ ...emptyState, ...data }))
      .catch(() => setStatus("Não foi possível carregar a configuração do Vimeo."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setStatus("Salvando integração…");
    const response = await fetch("/api/admin/vimeo-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: accessToken.trim() || undefined, enabled: settings.enabled }),
    });
    const data = await response.json().catch(() => ({})) as Partial<VimeoState> & { error?: string };
    setBusy("");
    if (!response.ok) return setStatus(data.error || "Não foi possível salvar a integração.");
    setSettings((current) => ({ ...current, ...data }));
    setAccessToken("");
    setStatus("Integração do Vimeo salva.");
  }

  async function run(action: "test" | "import") {
    setBusy(action);
    setStatus(action === "test" ? "Validando a conta no Vimeo…" : "Importando os vídeos da conta…");
    const response = await fetch("/api/admin/vimeo-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, accessToken: accessToken.trim() || undefined }),
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      accountName?: string;
      lastSyncAt?: string;
      total?: number;
      imported?: number;
      updated?: number;
      skipped?: number;
    };
    setBusy("");
    if (!response.ok) return setStatus(data.error || "Não foi possível executar a operação.");
    if (action === "test") return setStatus(`Conexão validada: ${data.accountName || "conta Vimeo"}.`);
    setSettings((current) => ({
      ...current,
      enabled: true,
      configured: true,
      lastSyncAt: data.lastSyncAt || current.lastSyncAt,
      lastImportResult: { total: data.total, imported: data.imported, updated: data.updated, skipped: data.skipped },
    }));
    setAccessToken("");
    setStatus(`${data.imported || 0} vídeo(s) importado(s), ${data.updated || 0} atualizado(s) e ${data.skipped || 0} ignorado(s).`);
  }

  return (
    <form className="panel-card admin-form vimeo-settings-card" onSubmit={save}>
      <header className="vimeo-settings-head">
        <div><span>Biblioteca de vídeos</span><h2>Integração Vimeo</h2></div>
        <b className={settings.configured ? "connected" : ""}>{settings.configured ? "Conectado" : "Não configurado"}</b>
      </header>
      <p className="settings-help">Conecte a conta do Jornal Balcão, valide o token e importe os vídeos publicados com título, descrição e miniatura.</p>
      <label>Token de acesso pessoal
        <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={settings.tokenHint || "Token da aplicação Vimeo"} autoComplete="new-password" />
      </label>
      <label className="admin-access-checkbox">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} />
        <span><strong>Ativar integração com o Vimeo</strong><small>A importação só é executada ao clicar no botão; nenhum vídeo é duplicado.</small></span>
      </label>
      <div className="integration-actions">
        <button className="primary-button" disabled={Boolean(busy)}>{busy === "save" ? "Salvando…" : "Salvar Vimeo"}</button>
        <button className="soft-button" type="button" disabled={Boolean(busy) || (!settings.configured && !accessToken.trim())} onClick={() => void run("test")}>{busy === "test" ? "Testando…" : "Testar conexão"}</button>
        <button className="soft-button vimeo-import-button" type="button" disabled={Boolean(busy) || (!settings.configured && !accessToken.trim())} onClick={() => void run("import")}>{busy === "import" ? "Importando…" : "Importar vídeos"}</button>
      </div>
      {settings.lastSyncAt ? <small className="vimeo-last-sync">Última importação: {new Date(settings.lastSyncAt).toLocaleString("pt-BR")}</small> : null}
      {settings.lastImportResult ? <div className="vimeo-import-summary"><span>{settings.lastImportResult.total || 0} encontrados</span><span>{settings.lastImportResult.imported || 0} novos</span><span>{settings.lastImportResult.updated || 0} atualizados</span></div> : null}
      {status ? <p className="integration-status" role="status">{status}</p> : null}
    </form>
  );
}
