"use client";

/* eslint-disable @next/next/no-img-element */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { listingPath } from "../../lib/listing-url";

type Category = { name: string; subs: string[] };
type Video = {
  id: string;
  slug?: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  videoUrl: string;
  videoType: string;
  thumbnailUrl: string;
  status: string;
  createdAt: string;
  static?: boolean;
};
type Draft = Omit<Video, "id" | "createdAt" | "static">;
type UploadState = { label: string; progress: number } | null;

const empty: Draft = {
  title: "",
  description: "",
  category: "",
  subcategory: "",
  videoUrl: "",
  videoType: "upload",
  thumbnailUrl: "",
  status: "active",
};

function uploadFile(file: File, onProgress: (progress: number) => void) {
  return new Promise<{ url: string; kind: "video" | "image" }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.set("file", file);
    request.open("POST", "/api/admin/video-upload");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      const response = request.response as { url?: string; kind?: "video" | "image"; error?: string } | null;
      if (request.status >= 200 && request.status < 300 && response?.url && response.kind) {
        resolve({ url: response.url, kind: response.kind });
        return;
      }
      reject(new Error(response?.error || "Não foi possível enviar o arquivo."));
    });
    request.addEventListener("error", () => reject(new Error("Falha de conexão durante o envio.")));
    request.send(form);
  });
}

function waitForMedia(target: HTMLVideoElement, eventName: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Não foi possível ler o vídeo.")), 12_000);
    const finish = () => { window.clearTimeout(timeout); resolve(); };
    target.addEventListener(eventName, finish, { once: true });
    target.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("Formato de vídeo não suportado para gerar a capa."));
    }, { once: true });
  });
}

async function makeThumbnail(file: File) {
  const source = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.src = source;
  try {
    await waitForMedia(video, "loadedmetadata");
    video.currentTime = Math.min(Math.max(video.duration * 0.15, 0.1), 2);
    await waitForMedia(video, "seeked");
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context || !video.videoWidth || !video.videoHeight) throw new Error("Não foi possível gerar a capa.");
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("Não foi possível gerar a capa.");
    return new File([blob], `capa-${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(source);
    video.removeAttribute("src");
  }
}

export default function VideosManager() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadState>(null);
  const [notice, setNotice] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [thumbnailFileName, setThumbnailFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function load() {
    const response = await fetch("/api/admin/videos", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setVideos(data.videos || []);
      setCategories(data.categories || []);
    }
  }

  useEffect(() => { queueMicrotask(() => void load()); }, []);

  const subs = categories.find((category) => category.name === draft.category)?.subs || [];
  const shown = useMemo(() => videos.filter((video) =>
    (!query || `${video.title} ${video.description}`.toLowerCase().includes(query.toLowerCase())) &&
    (!filter || video.category === filter) &&
    (!status || video.status === status)
  ), [videos, query, filter, status]);

  function resetForm() {
    setDraft(empty);
    setEditing("");
    setVideoFileName("");
    setThumbnailFileName("");
    setUploading(null);
  }

  function startCreate() {
    resetForm();
    setNotice("");
    setOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function onVideoSelected(file?: File) {
    if (!file) return;
    setNotice("");
    setVideoFileName(file.name);
    try {
      setUploading({ label: "Preparando vídeo e gerando capa automática", progress: 2 });
      const generatedThumbnail = await makeThumbnail(file).catch(() => null);
      setUploading({ label: "Enviando vídeo", progress: 0 });
      const uploadedVideo = await uploadFile(file, (progress) => setUploading({ label: "Enviando vídeo", progress }));
      let thumbnailUrl = "";
      if (generatedThumbnail) {
        setUploading({ label: "Enviando capa gerada automaticamente", progress: 0 });
        const uploadedThumbnail = await uploadFile(generatedThumbnail, (progress) => setUploading({ label: "Enviando capa gerada automaticamente", progress }));
        thumbnailUrl = uploadedThumbnail.url;
        setThumbnailFileName("Capa gerada automaticamente");
      }
      setDraft((current) => ({ ...current, videoUrl: uploadedVideo.url, videoType: "upload", ...(thumbnailUrl ? { thumbnailUrl } : {}) }));
      setNotice(generatedThumbnail ? "Vídeo enviado e capa gerada corretamente." : "Vídeo enviado. Selecione uma imagem para usar como capa.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível enviar o vídeo.");
    } finally {
      setUploading(null);
    }
  }

  async function onThumbnailSelected(file?: File) {
    if (!file) return;
    setNotice("");
    setThumbnailFileName(file.name);
    try {
      setUploading({ label: "Enviando capa", progress: 0 });
      const uploaded = await uploadFile(file, (progress) => setUploading({ label: "Enviando capa", progress }));
      setDraft((current) => ({ ...current, thumbnailUrl: uploaded.url }));
      setNotice("Capa enviada corretamente.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível enviar a capa.");
    } finally {
      setUploading(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.videoUrl) {
      setNotice("Selecione um arquivo de vídeo ou informe uma URL válida.");
      return;
    }
    setSaving(true);
    const url = editing ? `/api/admin/videos/${editing}` : "/api/admin/videos";
    const response = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    setNotice(response.ok ? "Vídeo salvo corretamente." : data.error || "Não foi possível salvar.");
    if (response.ok) {
      setOpen(false);
      resetForm();
      await load();
    }
    setSaving(false);
  }

  function edit(video: Video) {
    if (video.static) return;
    setEditing(video.id);
    setDraft({ title: video.title, description: video.description, category: video.category, subcategory: video.subcategory, videoUrl: video.videoUrl, videoType: video.videoType, thumbnailUrl: video.thumbnailUrl, status: video.status });
    setVideoFileName("");
    setThumbnailFileName("");
    setNotice("");
    setOpen(true);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function toggle(video: Video) {
    if (video.static) return;
    setNotice("");
    const response = await fetch(`/api/admin/videos/${video.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...video, status: video.status === "active" ? "inactive" : "active" }) });
    const data = await response.json();
    setNotice(response.ok ? `Vídeo ${video.status === "active" ? "desativado" : "ativado"}.` : data.error || "Não foi possível alterar o status.");
    if (response.ok) await load();
  }

  async function remove(video: Video) {
    if (video.static || !confirm(`Excluir o vídeo “${video.title}”?`)) return;
    setNotice("");
    const response = await fetch(`/api/admin/videos/${video.id}`, { method: "DELETE" });
    const data = await response.json();
    setNotice(response.ok ? "Vídeo excluído corretamente." : data.error || "Não foi possível excluir.");
    if (response.ok) await load();
  }

  const locked = saving || Boolean(uploading);

  return (
    <section className="admin-section video-admin-manager">
      <div className="admin-section-head">
        <div><span className="hero-kicker">Conteúdo audiovisual</span><h1>Vídeos</h1><p>Envie vídeos, gere a capa automaticamente e gerencie os conteúdos publicados no portal.</p></div>
        <button className="primary-button" onClick={startCreate}>+ Adicionar novo vídeo</button>
      </div>
      {notice ? <p className="integration-status" role="status">{notice}</p> : null}
      <div className="video-admin-filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por título ou descrição" />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.name}>{category.name}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos os status</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select>
      </div>

      {open ? (
        <form ref={formRef} className="panel-card admin-form video-admin-form" onSubmit={save}>
          <div className="video-admin-form-head"><div><h2>{editing ? "Editar vídeo" : "Adicionar novo vídeo"}</h2><p>Formatos aceitos: MP4 e WebM, com até 100 MB.</p></div><button type="button" className="video-admin-close" aria-label="Fechar formulário" onClick={() => setOpen(false)}>×</button></div>
          <label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required minLength={3} /></label>
          <label>Descrição<textarea rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Descreva o conteúdo do vídeo" /></label>
          <div className="field-pair"><label>Categoria<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value, subcategory: "" })}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.name}>{category.name}</option>)}</select></label><label>Subcategoria<select value={draft.subcategory} onChange={(event) => setDraft({ ...draft, subcategory: event.target.value })} disabled={!draft.category}><option value="">Sem subcategoria</option>{subs.map((sub) => <option key={sub}>{sub}</option>)}</select></label></div>

          <div className="video-upload-grid">
            <div className="video-upload-box"><span className="video-upload-icon" aria-hidden="true">▶</span><strong>Arquivo de vídeo</strong><p>Escolha o vídeo no computador ou celular.</p><label className="video-file-button">Selecionar vídeo<input type="file" accept="video/mp4,video/webm" disabled={locked} onChange={(event) => void onVideoSelected(event.target.files?.[0])} /></label><small>{videoFileName || (draft.videoType === "upload" && draft.videoUrl ? "Vídeo já enviado" : "Nenhum arquivo selecionado")}</small></div>
            <div className="video-upload-box">{draft.thumbnailUrl ? <img src={draft.thumbnailUrl} alt="Prévia da capa do vídeo" /> : <span className="video-upload-icon" aria-hidden="true">▧</span>}<strong>Capa do vídeo</strong><p>A capa é gerada ao enviar o vídeo, mas pode ser substituída.</p><label className="video-file-button secondary">Escolher outra capa<input type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={(event) => void onThumbnailSelected(event.target.files?.[0])} /></label><small>{thumbnailFileName || (draft.thumbnailUrl ? "Capa definida" : "JPG, PNG ou WebP")}</small></div>
          </div>

          {uploading ? <div className="video-upload-progress" role="status" aria-live="polite"><div><span>{uploading.label}</span><strong>{uploading.progress}%</strong></div><div><i style={{ width: `${uploading.progress}%` }} /></div></div> : null}

          <details className="video-url-alternative"><summary>Usar uma URL de vídeo em vez do upload</summary><label>URL do vídeo<input type="url" value={draft.videoType === "upload" ? "" : draft.videoUrl} onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value, videoType: "url" })} placeholder="https://youtube.com/... ou https://.../video.mp4" /></label><label>URL da capa (opcional)<input type="url" value={draft.thumbnailUrl.startsWith("http") ? draft.thumbnailUrl : ""} onChange={(event) => setDraft({ ...draft, thumbnailUrl: event.target.value })} placeholder="https://.../capa.webp" /></label></details>
          <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
          <div className="video-form-actions"><button className="primary-button" disabled={locked}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Publicar vídeo"}</button><button type="button" className="soft-button" disabled={locked} onClick={() => setOpen(false)}>Cancelar</button></div>
        </form>
      ) : null}

      <div className="panel-card video-admin-list">
        {shown.map((video) => <article key={video.id}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <span>▶</span>}<div><b>{video.title}</b><small>{video.category || "Sem categoria"}{video.subcategory ? ` · ${video.subcategory}` : ""}</small><em>{video.static ? "Vídeo institucional da home" : video.videoType === "upload" ? "Arquivo enviado" : "URL externa"} · {video.status === "active" ? "Ativo" : "Inativo"}</em></div><a href={listingPath(video.slug || "")} target="_blank" rel="noreferrer">Visualizar</a>{video.static ? <small className="video-static-label">Conteúdo fixo</small> : <><button onClick={() => edit(video)}>Editar</button><button onClick={() => void toggle(video)}>{video.status === "active" ? "Desativar" : "Ativar"}</button><button className="video-delete-button" onClick={() => void remove(video)}>Excluir</button></>}</article>)}
        {!shown.length ? <p>Nenhum vídeo encontrado.</p> : null}
      </div>
    </section>
  );
}
