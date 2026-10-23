"use client";

import { FormEvent, useState } from "react";

export function ListenArticleButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  function toggle() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = .95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }
  return <button className="news-listen-button" type="button" onClick={toggle}>{speaking ? "■ Parar áudio" : "▶ Ouvir a matéria"}</button>;
}

export function NewsCommentForm({ postSlug }: { postSlug: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/news/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postSlug, name: data.get("name"), comment: data.get("comment") }) });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    setBusy(false); setStatus(response.ok ? result.message || "Comentário enviado para moderação." : result.error || "Não foi possível enviar o comentário.");
    if (response.ok) form.reset();
  }
  return <section className="news-comments"><h2>Comentar matéria</h2><form onSubmit={submit}><label>Nome<input name="name" maxLength={80} required /></label><label>Comentário<textarea name="comment" rows={5} maxLength={1500} required /></label><button className="primary-button" disabled={busy}>{busy ? "Enviando…" : "Enviar comentário"}</button>{status ? <p role="status">{status}</p> : null}</form></section>;
}
