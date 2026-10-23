"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const AiChatWidget = lazy(() => import("./ai-chat-widget"));
const NewsletterExperience = lazy(() => import("./newsletter-experience"));
const AnalyticsTracker = lazy(() => import("./analytics-tracker"));
const AdSenseManualGuard = lazy(() => import("./adsense-manual-guard"));
const PwaRegister = lazy(() => import("./pwa-register"));

const whatsappUrl = "https://wa.me/553133309600?text=Ol%C3%A1%2C%20acessei%20o%20Portal%20Balc%C3%A3o%20e%20preciso%20de%20atendimento.";

function ContactLaunchers({ loading = false, onOpen, aiChatEnabled = true }: { loading?: boolean; onOpen: () => void; aiChatEnabled?: boolean }) {
  return (
    <div className="floating-contact-tools">
      {aiChatEnabled ? <button className="ai-contact-button" type="button" onClick={onOpen} disabled={loading} aria-label="Abrir atendimento com inteligência artificial">
        <span aria-hidden="true">✦</span><b>{loading ? "Carregando…" : "Atendimento IA"}</b>
      </button> : null}
      <a className="whatsapp-contact-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Falar com o Portal Balcão pelo WhatsApp">
        <span aria-hidden="true">☎</span><b>WhatsApp</b>
      </a>
    </div>
  );
}

export default function DeferredGlobalExperience({
  aiChatEnabled = true,
  measurementId = "",
}: {
  aiChatEnabled?: boolean;
  measurementId?: string;
}) {
  const [publicPage, setPublicPage] = useState(false);
  const [newsletterReady, setNewsletterReady] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [chatReady, setChatReady] = useState(false);

  useEffect(() => {
    const enabled = !/^\/(admin|comercial|lojista)(?:\/|$)/.test(window.location.pathname);
    queueMicrotask(() => setPublicPage(enabled));
    if (!enabled) return;

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let fallback: number | undefined;
    const startDeferredRuntime = () => {
      setRuntimeReady(true);
      if (enabled) setNewsletterReady(true);
    };
    const idleId = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(startDeferredRuntime, { timeout: 3000 })
      : (fallback = window.setTimeout(startDeferredRuntime, 1600));

    return () => {
      if (idleWindow.cancelIdleCallback && idleId !== undefined) idleWindow.cancelIdleCallback(idleId);
      if (fallback !== undefined) window.clearTimeout(fallback);
    };
  }, []);

  return (
    <>
      {runtimeReady ? (
        <Suspense fallback={null}>
          <AnalyticsTracker measurementId={measurementId} />
          <PwaRegister />
          {publicPage ? <AdSenseManualGuard /> : null}
        </Suspense>
      ) : null}
      {publicPage && newsletterReady ? <Suspense fallback={null}><NewsletterExperience /></Suspense> : null}
      {publicPage && aiChatEnabled && chatReady
        ? <Suspense fallback={<ContactLaunchers loading onOpen={() => undefined} aiChatEnabled />}><AiChatWidget initialOpen /></Suspense>
        : publicPage ? <ContactLaunchers aiChatEnabled={aiChatEnabled} onOpen={() => setChatReady(true)} /> : null}
    </>
  );
}
