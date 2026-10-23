"use client";
/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */

import { FormEvent, useEffect, useState } from "react";
import { normalizePortalCategories, portalCategories, type PortalCategory } from "../../categories";
import ListingFormCore, {
  emptyListingFormValue,
  listingMoneyToCents,
  type ListingFormValue,
} from "../../listing-form-core";
import { PortalHeader } from "../../shared";

type EditorMode = "customer" | "commercial" | "admin";
type EditorIntent = "edit" | "review";

type EditRecord = {
  id: string;
  userId: number;
  title: string;
  description: string;
  negotiationType: string;
  category: string;
  subcategory: string;
  priceCents: number | null;
  monthlyRentCents: number | null;
  iptuCents: number | null;
  condoCents: number | null;
  negotiable: number | boolean;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  displayName: string;
  whatsapp: string;
  attributes: Record<string, string | number | boolean>;
  features: string[];
  images: string[];
  status: string;
};

function showMoney(value: number | null) {
  return value == null
    ? ""
    : (value / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function validCategories(value: unknown): PortalCategory[] {
  return normalizePortalCategories(value);
}

export default function EditListingClient({
  id,
  mode = "customer",
  intent = "edit",
  onSaved,
  onCancel,
}: {
  id: string;
  mode?: EditorMode;
  intent?: EditorIntent;
  onSaved?: (message: string) => void;
  onCancel?: () => void;
}) {
  const Root = mode === "commercial" ? "div" : "main";
  const listingUrl =
    mode === "commercial"
      ? `/api/commercial/listings/${encodeURIComponent(id)}`
      : mode === "admin"
        ? `/api/admin/listings/${encodeURIComponent(id)}`
        : `/api/customer/listings/${encodeURIComponent(id)}`;
  const [listing, setListing] = useState<EditRecord | null>(null);
  const [categories, setCategories] = useState<PortalCategory[]>(portalCategories);
  const [formValue, setFormValue] = useState<ListingFormValue>(() => emptyListingFormValue());
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Carregando anúncio…");
  const isStaff = mode === "commercial" || mode === "admin";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setMessage("Carregando anúncio…");
      try {
        const [response, settings] = await Promise.all([
          fetch(listingUrl, {
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          }),
          fetch("/api/settings", { cache: "no-store", signal: controller.signal })
            .then((result) => result.json())
            .catch(() => ({})),
        ]);
        const data = (await response.json().catch(() => ({}))) as {
          listing?: EditRecord;
          error?: string;
        };
        if (response.status === 401) {
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(
            mode === "commercial"
              ? `/comercial/login?returnTo=${returnTo}`
              : mode === "admin"
                ? `/admin/login?returnTo=${returnTo}`
                : `/entrar?returnTo=${returnTo}`,
          );
          return;
        }
        if (!response.ok || !data.listing) {
          throw new Error(data.error || "Não foi possível carregar o anúncio.");
        }
        const item = data.listing;
        const latitude = item.latitude == null ? null : Number(item.latitude);
        const longitude = item.longitude == null ? null : Number(item.longitude);
        const coordinates =
          Number.isFinite(latitude) && Number.isFinite(longitude)
            ? { lat: latitude as number, lng: longitude as number }
            : null;
        setCategories(validCategories((settings as { categories?: unknown }).categories));
        setListing(item);
        setImages(Array.isArray(item.images) ? item.images : []);
        setFormValue({
          category: item.category,
          subcategory: item.subcategory,
          negotiationType: item.negotiationType || "Venda",
          title: item.title,
          description: item.description,
          videoUrl: typeof item.attributes?.videoUrl === "string" ? item.attributes.videoUrl : "",
          price: showMoney(item.priceCents),
          rent: showMoney(item.monthlyRentCents),
          iptu: showMoney(item.iptuCents),
          condo: showMoney(item.condoCents),
          negotiable: Boolean(item.negotiable),
          address: item.address,
          coordinates,
          attributes: item.attributes || {},
          features: Array.isArray(item.features) ? item.features : [],
        });
        setMessage("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar o anúncio.");
      }
    }
    void load();
    return () => controller.abort();
  }, [listingUrl, mode]);

  async function uploadFiles(files: FileList | null) {
    if (!listing) return;
    const selected = Array.from(files || []).slice(0, Math.max(0, 12 - images.length));
    if (!selected.length) return;
    setBusy(true);
    setMessage("Enviando fotos…");
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const body = new FormData();
        body.set("file", file);
        const uploadUrl =
          mode === "commercial"
            ? "/api/commercial/upload"
            : mode === "admin"
              ? `/api/listing-images?adminUserId=${encodeURIComponent(listing.userId)}`
              : "/api/listing-images";
        const response = await fetch(uploadUrl, {
          method: "POST",
          credentials: "include",
          body,
        });
        const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
        if (response.status === 401) {
          throw new Error("Sua sessão não é mais válida. Entre novamente para continuar.");
        }
        if (!response.ok || !data.url) {
          throw new Error(data.error || "Falha ao enviar a imagem.");
        }
        uploaded.push(data.url);
      }
      setImages((current) => [...new Set([...current, ...uploaded])].slice(0, 12));
      setMessage("Fotos carregadas. Salve as alterações para concluir.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao enviar as fotos.");
    } finally {
      setBusy(false);
    }
  }

  function promoteImage(index: number) {
    setImages((current) => [
      current[index],
      ...current.filter((_, itemIndex) => itemIndex !== index),
    ]);
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(listingUrl, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formValue.title,
          description: formValue.description,
          negotiationType: formValue.negotiationType,
          category: formValue.category,
          subcategory: formValue.subcategory,
          priceCents: formValue.negotiable ? null : listingMoneyToCents(formValue.price),
          monthlyRentCents: formValue.negotiable ? null : listingMoneyToCents(formValue.rent),
          iptuCents: listingMoneyToCents(formValue.iptu),
          condoCents: listingMoneyToCents(formValue.condo),
          negotiable: formValue.negotiable,
          address: formValue.address,
          latitude: formValue.coordinates?.lat ?? null,
          longitude: formValue.coordinates?.lng ?? null,
          displayName: form.get("displayName"),
          whatsapp: form.get("whatsapp"),
          attributes: {
            ...formValue.attributes,
            videoUrl: formValue.videoUrl.trim(),
          },
          features: formValue.features,
          images,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (response.status === 401) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(
          mode === "commercial"
            ? `/comercial/login?returnTo=${returnTo}`
            : mode === "admin"
              ? `/admin/login?returnTo=${returnTo}`
              : `/entrar?returnTo=${returnTo}`,
        );
        return;
      }
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o anúncio.");
      const feedback = data.message || (intent === "review" ? "Revisão salva." : "Anúncio salvo.");
      setMessage(feedback);
      window.setTimeout(() => {
        if (mode === "commercial") onSaved?.(feedback);
        else window.location.assign(mode === "admin" ? "/admin?section=anuncios" : "/minha-conta/anuncios");
      }, 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar. Confira a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (!listing) {
    return (
      <Root>
        {mode !== "commercial" ? <PortalHeader /> : null}
        <section className="edit-listing-shell">
          <p role="status">{message}</p>
          {mode === "commercial" ? <button className="secondary-button" type="button" onClick={onCancel}>Voltar aos anúncios</button> : null}
        </section>
      </Root>
    );
  }

  const title = intent === "review" ? "Revisar anúncio" : "Editar anúncio";
  return (
    <Root>
      {mode !== "commercial" ? <PortalHeader /> : null}
      <section className="edit-listing-shell">
        <header>
          <span>{mode === "commercial" ? (intent === "review" ? "Fila de aprovação" : "Anúncios do site") : mode === "admin" ? "Painel administrativo" : "Meus anúncios"}</span>
          <h1>{title}</h1>
          <p>{intent === "review" ? "Confira todos os campos, imagens e a localização antes de salvar a revisão." : "O formulário foi carregado com todos os dados atuais do anúncio."}</p>
        </header>
        <form className="single-listing-form" onSubmit={save}>
          <ListingFormCore mode={intent} categories={categories} value={formValue} onChange={setFormValue} />

          <section className="listing-section">
            <h2>Fotos do anúncio</h2>
            <p>Mantenha, remova, reorganize ou adicione imagens. O limite é de 12 fotos.</p>
            <div className="listing-photo-grid">
              {images.map((image, index) => (
                <article key={`${image}-${index}`}>
                  <img src={image} alt={`Foto ${index + 1}`} />
                  {index === 0 ? <em>Foto de destaque</em> : <button type="button" onClick={() => promoteImage(index)}>Definir destaque</button>}
                  <button className="photo-remove" type="button" onClick={() => removeImage(index)} aria-label={`Remover foto ${index + 1}`}>×</button>
                </article>
              ))}
            </div>
            <label className="listing-photo-upload">
              ＋<strong>Adicionar fotos</strong>
              <span>{images.length}/12 imagens · JPG, PNG, WebP ou AVIF</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={busy || images.length >= 12} onChange={(event) => void uploadFiles(event.target.files)} />
            </label>
          </section>

          <section className="listing-section">
            <h2>Dados do anunciante</h2>
            <div className="listing-fields two">
              <label>Nome de exibição<input name="displayName" defaultValue={listing.displayName} required minLength={2} /></label>
              <label>WhatsApp<input name="whatsapp" defaultValue={listing.whatsapp} required inputMode="tel" /></label>
            </div>
          </section>

          {message ? <div className="listing-error" role="status">{message}</div> : null}
          <footer className="listing-submit">
            {isStaff ? (
              <button className="secondary-button" type="button" onClick={onCancel || (() => window.location.assign(mode === "admin" ? "/admin?section=anuncios" : "/comercial"))}>Voltar aos anúncios</button>
            ) : (
              <a className="secondary-button" href="/minha-conta/anuncios">Cancelar</a>
            )}
            <button className="primary-button" disabled={busy || !images.length}>
              {busy ? "Salvando…" : intent === "review" ? "Salvar revisão" : "Salvar e enviar para aprovação"}
            </button>
          </footer>
        </form>
      </section>
    </Root>
  );
}
