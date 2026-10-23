"use client";

import { useEffect } from "react";

declare global {
  interface Window { fbq?: (...args: unknown[]) => void; _fbq?: unknown; }
}

export default function CampaignTracking({ pixelId, campaign }: { pixelId: string; campaign: string }) {
  useEffect(() => {
    if (!/^\d{6,30}$/.test(pixelId) || window.fbq) return;
    const fbq = function (...args: unknown[]) {
      const state = fbq as unknown as { callMethod?: (...values: unknown[]) => void; queue?: unknown[][] };
      if (state.callMethod) state.callMethod(...args);
      else (state.queue ||= []).push(args);
    };
    window.fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/pt_BR/fbevents.js";
    document.head.appendChild(script);
    fbq("init", pixelId);
    fbq("track", "PageView");
    fbq("trackCustom", "CampaignLandingView", { campaign });
    return () => script.remove();
  }, [campaign, pixelId]);
  return null;
}

export function CampaignCta({ href, label, campaign, className = "" }: { href: string; label: string; campaign: string; className?: string }) {
  return <a className={`campaign-cta ${className}`.trim()} href={href} onClick={() => window.fbq?.("track", "Lead", { content_name: campaign })}>{label}<span aria-hidden="true">→</span></a>;
}
