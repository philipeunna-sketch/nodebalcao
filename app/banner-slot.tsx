"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type BannerPlacement =
  | "home_top"
  | "after_properties"
  | "after_transfer"
  | "before_footer";

type Banner = {
  id: string;
  name: string;
  type: "image" | "script";
  imageUrl: string;
  scriptCode: string;
  targetUrl: string;
};

const bannerRequests = new Map<BannerPlacement, Promise<Banner[]>>();

function sessionId() {
  const createId = () => crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map((value) => value.toString(16).padStart(2, "0")).join("");
  try {
    let id = sessionStorage.getItem("balcao-banner-session");
    if (!id) {
      id = createId();
      sessionStorage.setItem("balcao-banner-session", id);
    }
    return id;
  } catch {
    return createId();
  }
}

function metric(bannerId: string, eventType: "view" | "click") {
  fetch("/api/banners/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bannerId,
      eventType,
      sessionId: sessionId(),
      pagePath: location.pathname,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

function loadBanners(placement: BannerPlacement) {
  const cached = bannerRequests.get(placement);
  if (cached) return cached;
  const request = fetch(`/api/banners?placement=${placement}`)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((data) => (Array.isArray(data.banners) ? data.banners as Banner[] : []))
    .catch(() => []);
  bannerRequests.set(placement, request);
  return request;
}

export default function BannerSlot({
  placement,
  className = "",
  priority = false,
}: {
  placement: BannerPlacement;
  className?: string;
  priority?: boolean;
}) {
  const slotRef = useRef<HTMLElement>(null);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<Banner[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (priority) return;
    const node = slotRef.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setShouldLoad(true));
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "700px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    loadBanners(placement).then((banners) => {
      if (!active) return;
      setItems(banners);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [placement, shouldLoad]);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % items.length),
      10_000,
    );
    return () => window.clearInterval(timer);
  }, [items.length]);

  const banner = items[index % Math.max(items.length, 1)];

  useEffect(() => {
    if (banner) metric(banner.id, "view");
  }, [banner]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.data?.source === "balcao-banner-click" &&
        event.data?.bannerId === banner?.id
      ) metric(banner.id, "click");
    };
    addEventListener("message", listener);
    return () => removeEventListener("message", listener);
  }, [banner]);

  const srcDoc = useMemo(() => banner?.type === "script"
    ? `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden}img,iframe{width:100%;height:100%;max-width:100%;object-fit:contain}</style></head><body><script>document.addEventListener('click',function(){parent.postMessage({source:'balcao-banner-click',bannerId:${JSON.stringify(banner.id)}},'*')},true)<\/script>${banner.scriptCode}</body></html>`
    : "", [banner]);

  const state = banner ? "ready" : loaded ? "empty" : "loading";
  return (
    <aside
      ref={slotRef}
      className={`managed-banner-slot managed-banner-${placement} ${className}`.trim()}
      data-state={state}
      aria-busy={!loaded}
      aria-label={banner ? `Publicidade: ${banner.name}` : "Espaço publicitário"}
    >
      {banner?.type === "image" ? (
        banner.targetUrl ? (
          <a
            href={banner.targetUrl}
            target={banner.targetUrl.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer sponsored"
            onClick={() => metric(banner.id, "click")}
          >
            <img
              src={banner.imageUrl}
              alt={banner.name}
              width="1100"
              height="250"
              loading={placement === "home_top" ? "eager" : "lazy"}
              decoding="async"
            />
          </a>
        ) : (
          <img
            src={banner.imageUrl}
            alt={banner.name}
            width="1100"
            height="250"
            loading={placement === "home_top" ? "eager" : "lazy"}
            decoding="async"
          />
        )
      ) : banner?.type === "script" ? (
        <iframe
          title={banner.name}
          srcDoc={srcDoc}
          loading={priority ? "eager" : "lazy"}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        />
      ) : null}
      {items.length > 1 ? (
        <span className="managed-banner-counter">{index + 1}/{items.length}</span>
      ) : null}
    </aside>
  );
}
