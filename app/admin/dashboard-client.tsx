"use client";
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  migrateCategoryName,
  normalizePortalCategories,
  PortalCategory,
  portalCategories,
} from "../categories";
import {
  defaultBanners,
  PortalBanner,
  PortalListing,
  portalListings,
} from "../shared";
import { defaultDiscoverPages, DiscoverPage } from "../discover-data";
import { createProfilePreview, uploadProfileImage, validateProfileImage } from "../profile-image-client";
import LegalPublicationsManager from "./legal-publications-manager";
import VideosManager from "./videos-manager";
import VimeoSettings from "./vimeo-settings";
import PagesManager from "./pages-manager";
import BannersManager from "./banners-manager";
import LandingPagesManager from "./landing-pages-manager";
import CallCampaignsManager from "./call-campaigns-manager";
import { SITE_URL } from "../../lib/site-url";
import { encryptMercadoPagoCard, MercadoPagoCardFields } from "../mercadopago-card";
import { LISTING_IMAGE_PLACEHOLDER, listingCoverImage, normalizeListingImages } from "../../lib/listing-images";
import { listingPath } from "../../lib/listing-url";
import ListingDescriptionEditor from "../listing-description-editor";

function listingImageFromApi(item: Record<string, unknown>) {
  const images = normalizeListingImages(Array.isArray(item.images) ? item.images : []);
  return listingCoverImage(item.coverImage, images) || LISTING_IMAGE_PLACEHOLDER;
}

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "Administrador" | "Anunciante";
  status: "Ativo" | "Pendente";
  accountType?: "particular" | "empresa";
  taxId?: string;
  whatsapp?: string;
  profileImageUrl?: string | null;
  isAdmin?: boolean;
  systemAdmin?: boolean;
  createdAt?: string;
  activeAds?: number;
  adLimit?: number;
};
type ManagedUserDraft = {
  accountType: "particular" | "empresa";
  taxId: string;
  name: string;
  email: string;
  whatsapp: string;
  password: string;
  profileImageUrl: string;
  isAdmin: boolean;
};
type Section =
  | "painel"
  | "anuncios"
  | "pendentes"
  | "chat-ia"
  | "assinantes"
  | "pagamentos"
  | "analytics"
  | "usuarios"
  | "lojas"
  | "categorias"
  | "veiculos"
  | "noticias"
  | "publicidade-legal"
  | "videos"
  | "descubra"
  | "banners"
  | "landing-pages"
  | "ligacoes"
  | "paginas"
  | "seo"
  | "configuracoes";
type CatalogBrand = {
  code: string;
  name: string;
  models?: { code: string; name: string }[];
};
type VehicleCatalog = Record<"carros" | "motos" | "caminhoes", CatalogBrand[]>;
type ListingImportState = {
  job: null | { id: string; status: string; total: number; processed: number; imported: number; updated: number; failed: number; sourceUrl: string };
  logs: Array<{ listingId: string; title: string; category?: string; subcategory?: string; status: string; message: string; createdAt: string }>;
  sourceUrl?: string;
  importUserEmail?: string;
};
type GoogleMapsTestResult = { ok: boolean; configured?: boolean; keyHint?: string; services: Record<string, { ok: boolean; message: string }>; defaultLocation?: { label: string; latitude: number; longitude: number; source: string }; error?: string };
type AnalyticsDashboard = {
  range: "24h" | "7d" | "30d"; generatedAt: string;
  summary: { activeVisitors: number; pageviews: number; sessions: number; totalPageviews: number; totalSessions: number };
  topPages: Array<{ path: string; pageviews: number; sessions: number }>;
  activePages: Array<{ path: string; visitors: number }>;
  listings: Array<{ id: string; slug: string; title: string; pageviews: number; sessions: number }>;
};
type AssistantConversationSummary = { id: string; ipAddress: string; userAgent: string; customerUserId?: number | null; customerName?: string | null; customerEmail?: string | null; status: string; consentAt: string; lastMessageAt: string; createdAt: string; messageCount: number; lastMessage?: string | null };
type AdminStore={id:string;userId:number;slug:string;name:string;customerName:string;customerEmail:string;email:string;planCode:string;adLimit:number;active:boolean;planStartedAt:string|null;planEndsAt:string|null};
type NewsletterSubscriber={id:string;email:string;status:string;source:string;consentAt:string;welcomeSentAt:string|null;createdAt:string};
type NewsletterCampaign={id:string;subject:string;preheader:string;heading:string;intro:string;html:string;status:string;recipientCount:number;sentCount:number;failedCount:number;createdAt:string;sentAt:string|null};
type AdminNewsPost={id:number;slug:string;title:string;subtitle:string;excerpt:string;content:string;image:string;imageAlt:string;date:string;modified:string;sourceLink:string;link:string};

function testGoogleMapsInBrowser() {
  return new Promise<GoogleMapsTestResult>((resolve) => {
    const frame = document.createElement("iframe");
    frame.title = "Teste da integração do Google Maps";
    frame.style.cssText = "position:fixed;left:-20px;bottom:-20px;width:4px;height:4px;opacity:0;pointer-events:none;border:0";
    let finished = false;
    const cleanup = () => { window.removeEventListener("message", receive); frame.remove(); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.source !== "balcao-google-maps-test") return;
      finished = true; cleanup(); resolve(event.data as GoogleMapsTestResult);
    };
    window.addEventListener("message", receive);
    frame.src = `/api/admin/google-maps-browser-test?t=${Date.now()}`;
    document.body.appendChild(frame);
    window.setTimeout(() => {
      if (finished) return;
      cleanup();
      resolve({ ok: false, services: { mapsJavascript: { ok: false, message: "O teste no domínio excedeu o tempo limite." }, places: { ok: false, message: "Places não pôde ser testada." }, geocoding: { ok: false, message: "Geocodificação não pôde ser testada." } } });
    }, 18000);
  });
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function userDigits(value: string) { return value.replace(/\D/g, ""); }
function maskUserCpf(value: string) {
  return userDigits(value).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskUserCnpj(value: string) {
  return userDigits(value).slice(0, 14).replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
function maskUserPhone(value: string) {
  const raw = userDigits(value);
  const number = (raw.startsWith("55") && raw.length >= 12 ? raw.slice(2) : raw).slice(0, 11);
  if (number.length <= 10) return number.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}${ddd.length === 2 ? ") " : ""}${first}${last ? `-${last}` : ""}`);
  return number.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, ddd, first, last) => `(${ddd}) ${first}${last ? `-${last}` : ""}`);
}

const emptyManagedUser: ManagedUserDraft = { accountType: "particular", taxId: "", name: "", email: "", whatsapp: "", password: "", profileImageUrl: "", isAdmin: false };

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [section, setSection] = useState<Section>("painel");
  const fullListingsLoaded = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [listings, setListings] = useState<PortalListing[]>(portalListings);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stores,setStores]=useState<AdminStore[]>([]);const [storeBusy,setStoreBusy]=useState(false);const [storeStatus,setStoreStatus]=useState("");
  const [subscribers,setSubscribers]=useState<NewsletterSubscriber[]>([]);const [campaigns,setCampaigns]=useState<NewsletterCampaign[]>([]);const [newsletterBusy,setNewsletterBusy]=useState(false);const [newsletterStatus,setNewsletterStatus]=useState("");const [subscriberEmail,setSubscriberEmail]=useState("");const [manualEmail,setManualEmail]=useState({email:"",subject:"",message:""});const [campaignPreview,setCampaignPreview]=useState<NewsletterCampaign|null>(null);
  const [taskText, setTaskText] = useState("");
  const [tasks, setTasks] = useState<Array<{ id: string; text: string; done: boolean }>>(() => readLocal("balcao-admin-tasks", []));
  const [storeDraft,setStoreDraft]=useState({userId:"",email:"",planCode:"store-pro",adLimit:"200",planStartedAt:new Date().toISOString().slice(0,10),planEndsAt:new Date(Date.now()+30*86400000).toISOString().slice(0,10),active:true});
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const userEditorRef = useRef<HTMLElement>(null);
  const [userDraft, setUserDraft] = useState<ManagedUserDraft>(emptyManagedUser);
  const [userBusy, setUserBusy] = useState(false);
  const [userError, setUserError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [userPhotoFile, setUserPhotoFile] = useState<File | null>(null);
  const [userPhotoPreview, setUserPhotoPreview] = useState("");
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [sendUserWelcome, setSendUserWelcome] = useState(true);
  useEffect(() => {
    if (section !== "usuarios" || !userFormOpen) return;
    const frame = requestAnimationFrame(() => {
      userEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      userEditorRef.current?.querySelector<HTMLElement>("#user-form-title")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [section, userFormOpen, editingUser]);
  const [notice, setNotice] = useState("");
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PortalListing | null>(null);
  const [adminListingQuery, setAdminListingQuery] = useState("");
  const [adminListingCategory, setAdminListingCategory] = useState("");
  const [adminListingStatus, setAdminListingStatus] = useState("");
  const [adminListingFrom, setAdminListingFrom] = useState("");
  const [adminListingTo, setAdminListingTo] = useState("");
  const [adminListingPage, setAdminListingPage] = useState(1);
  const [adminListingRows, setAdminListingRows] = useState<PortalListing[]>([]);
  const [adminListingTotal, setAdminListingTotal] = useState(0);
  const [adminPendingCount, setAdminPendingCount] = useState(0);
  const [adminListingLoading, setAdminListingLoading] = useState(true);
  const [adminListingError, setAdminListingError] = useState("");
  const [adminListingRefresh, setAdminListingRefresh] = useState(0);
  const [logo] = useState("/logo-balcao.jpg");
  const [siteName, setSiteName] = useState("Portal Balcão");
  const [loginImageUrl, setLoginImageUrl] = useState("/banner-home-classificados.webp");
  const [adminLoginImageUrl, setAdminLoginImageUrl] = useState("/banner-home-classificados.webp");
  const [loginImageBusy, setLoginImageBusy] = useState(false);
  const [banners, setBanners] = useState<PortalBanner[]>(defaultBanners);
  const [bannerType, setBannerType] = useState<PortalBanner["type"]>("image");
  const [bannerImage, setBannerImage] = useState("");
  const [wordpressApi, setWordpressApi] = useState("");
  const [newsBusy, setNewsBusy] = useState(false);
  const [newsPosts, setNewsPosts] = useState<AdminNewsPost[]>([]);
  const [editingNews, setEditingNews] = useState<AdminNewsPost | null>(null);
  const [mapProvider, setMapProvider] = useState<"google" | "mapbox">("google");
  const [googleMapsApi, setGoogleMapsApi] = useState("");
  const [hasGoogleMapsApi, setHasGoogleMapsApi] = useState(false);
  const [googleMapsKeyHint, setGoogleMapsKeyHint] = useState("");
  const [mapboxAccessToken, setMapboxAccessToken] = useState("");
  const [hasMapboxApi, setHasMapboxApi] = useState(false);
  const [mapboxKeyHint, setMapboxKeyHint] = useState("");
  const [googleMapsStatus, setGoogleMapsStatus] = useState("");
  const [googleMapsBusy, setGoogleMapsBusy] = useState(false);
  const [googleMapsTest, setGoogleMapsTest] = useState<GoogleMapsTestResult | null>(null);
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [hasOpenAiApiKey, setHasOpenAiApiKey] = useState(false);
  const [openAiStatus, setOpenAiStatus] = useState("");
  const [openAiBusy, setOpenAiBusy] = useState(false);
  const [aiChatEnabled, setAiChatEnabled] = useState(true);
  const [aiChatPrompt, setAiChatPrompt] = useState("");
  const [assistantConversations, setAssistantConversations] = useState<AssistantConversationSummary[]>([]);
  const [assistantConversationsBusy, setAssistantConversationsBusy] = useState(false);
  const [listingImportUrl, setListingImportUrl] = useState("");
  const [listingImport, setListingImport] = useState<ListingImportState>({ job: null, logs: [] });
  const [listingImportBusy, setListingImportBusy] = useState(false);
  const [mercadoPago, setMercadoPago] = useState<{
    accessToken: string;
    publicKey: string;
    configured: boolean;
    enabled: boolean;
    pixEnabled: boolean;
    cardEnabled: boolean;
    publicKeyHint: string;
    mode: "test" | "production";
    testConfigured: boolean;
    productionConfigured: boolean;
    publicKeyHints: { test: string; production: string };
  }>({ accessToken: "", publicKey: "", configured: false, enabled: false, pixEnabled: true, cardEnabled: true, publicKeyHint: "", mode: "production", testConfigured: false, productionConfigured: false, publicKeyHints: { test: "", production: "" } });
  const [mercadoPagoBusy, setMercadoPagoBusy] = useState(false);
  const [mercadoPagoStatus, setMercadoPagoStatus] = useState("");
  const [mercadoPagoTestMethod, setMercadoPagoTestMethod] = useState<"pix" | "card">("pix");
  const [mercadoPagoTestBusy, setMercadoPagoTestBusy] = useState(false);
  const [mercadoPagoTestResult, setMercadoPagoTestResult] = useState<{
    ok: boolean;
    message: string;
    providerReference?: string;
    qrCodeText?: string;
    qrCodeImage?: string;
  } | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"24h" | "7d" | "30d">("24h");
  const [analyticsDashboard, setAnalyticsDashboard] = useState<AnalyticsDashboard | null>(null);
  const [verificationSettings, setVerificationSettings] = useState({
    resend_api_key: "",
    verification_email_from: "",
    wapi_token: "",
    wapi_instance_id: "",
    wapi_test_whatsapp: "",
  });
  const [configuredVerification, setConfiguredVerification] = useState<Record<string, boolean>>({});
  const [registrationCodeEnabled, setRegistrationCodeEnabled] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("");
  const [seoSettings, setSeoSettings] = useState({
    analyticsCode: "",
    analyticsConfigured: false,
    analyticsHint: "",
    adsenseCode: "",
    adsenseSlot: "",
    adsenseConfigured: false,
    adsenseEnabled: false,
    adsenseHint: "",
    adsenseSlotHint: "",
    siteTitle: "Portal Balcão — Classificados em Belo Horizonte",
    description: "Anúncios classificados de imóveis, veículos, celulares, eletrônicos, serviços e empregos em Belo Horizonte.",
    keywords: "classificados, anúncios, Belo Horizonte, imóveis, veículos, empregos, serviços",
    googleVerification: "",
    schemaEnabled: true,
    sitemapUrl: `${SITE_URL}/sitemap.xml`,
    robotsUrl: `${SITE_URL}/robots.txt`,
  });
  const [googleSearch, setGoogleSearch] = useState({ credentials: "", enabled: false, configured: false, credentialHint: "", siteUrl: SITE_URL, sitemapUrl: `${SITE_URL}/sitemap.xml`, lastSubmittedAt: "" });
  const [googleSearchBusy, setGoogleSearchBusy] = useState(false);
  const [googleSearchStatus, setGoogleSearchStatus] = useState("");
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoStatus, setSeoStatus] = useState("");
  const [cloudflareSettings, setCloudflareSettings] = useState({ apiToken: "", configured: false, tokenHint: "", zoneId: "", zoneName: "", zoneStatus: "", lastTestAt: "", lastPurgeAt: "" });
  const [cloudflareBusy, setCloudflareBusy] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState("");
  const [discoverPages, setDiscoverPages] = useState<DiscoverPage[]>(defaultDiscoverPages);
  const [discoverBusy, setDiscoverBusy] = useState<string | null>(null);
  const [categories, setCategories] =
    useState<PortalCategory[]>(portalCategories);
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [fipeType, setFipeType] = useState("carros");
  const [fipeBrands, setFipeBrands] = useState<CatalogBrand[]>([]);
  const [fipeModels, setFipeModels] = useState<
    Record<string, { code: string; name: string }[]>
  >({});
  const [fipeStatus, setFipeStatus] = useState("");
  const [fipeBusy,setFipeBusy]=useState(false);
  const [fipeProgress,setFipeProgress]=useState({processed:0,total:0,models:0,errors:0});
  const [fipeStats,setFipeStats]=useState<{brands:Record<string,number>;models:Record<string,number>;last?:{finishedAt?:string;errors?:string[]}|null}>({brands:{},models:{}});
  const [vehicleCatalog, setVehicleCatalog] = useState<VehicleCatalog>({
    carros: [],
    motos: [],
    caminhoes: [],
  });

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get("section");
    if (requestedSection === "anuncios" || requestedSection === "pendentes") {
      setSection(requestedSection);
    }
    queueMicrotask(() => {
      void loadStores().then(() => loadUsers());
      setSiteName(localStorage.getItem("balcao-site-name") || "Portal Balcão");
      setBanners(readLocal("balcao-banners", defaultBanners));
      setWordpressApi(localStorage.getItem("balcao-wordpress-api") || "");
      fetch("/api/settings").then((response) => response.json()).then((data) => {
        if (Array.isArray(data.banners)) setBanners(data.banners);
        if (Array.isArray(data.discover_pages) && data.discover_pages.length) setDiscoverPages(data.discover_pages);
        if (Array.isArray(data.categories) && data.categories.length) setCategories(normalizePortalCategories(data.categories));
        if (typeof data.login_image_url === "string" && data.login_image_url) setLoginImageUrl(data.login_image_url);
        if (typeof data.admin_login_image_url === "string" && data.admin_login_image_url) setAdminLoginImageUrl(data.admin_login_image_url);
        setHasOpenAiApiKey(Boolean(data.has_openai_api_key));
      }).catch(() => undefined);
      fetch("/api/admin/ai-settings").then((response) => response.json()).then((data) => { setHasOpenAiApiKey(Boolean(data.configured)); setAiChatEnabled(data.chatEnabled !== false); if (typeof data.chatPrompt === "string") setAiChatPrompt(data.chatPrompt); }).catch(() => undefined);
      fetch("/api/admin/map-settings").then((response) => response.json()).then((data) => {
        setMapProvider(data.provider === "mapbox" ? "mapbox" : "google");
        setHasGoogleMapsApi(Boolean(data.googleConfigured)); setHasMapboxApi(Boolean(data.mapboxConfigured));
        if (typeof data.googleKeyHint === "string") setGoogleMapsKeyHint(data.googleKeyHint);
        if (typeof data.mapboxKeyHint === "string") setMapboxKeyHint(data.mapboxKeyHint);
      }).catch(() => undefined);
      fetch("/api/admin/listing-import").then((response) => response.json()).then((data) => { if (data && "job" in data) { setListingImport(data); if (typeof data.sourceUrl === "string") setListingImportUrl(data.sourceUrl); } }).catch(() => undefined);
      fetch("/api/admin/mercadopago-settings").then((response) => response.json()).then((data) => setMercadoPago((current) => ({
        ...current,
        configured: data.configured === true,
        enabled: data.enabled === true,
        pixEnabled: data.pixEnabled !== false,
        cardEnabled: data.cardEnabled !== false,
        publicKeyHint: typeof data.publicKeyHint === "string" ? data.publicKeyHint : "",
        mode: data.mode === "test" ? "test" : "production",
        testConfigured: data.testConfigured === true,
        productionConfigured: data.productionConfigured === true,
        publicKeyHints: {
          test: typeof data.publicKeyHints?.test === "string" ? data.publicKeyHints.test : "",
          production: typeof data.publicKeyHints?.production === "string" ? data.publicKeyHints.production : "",
        },
      }))).catch(() => undefined);
      fetch("/api/admin/news-settings").then((response) => response.json()).then((data) => { if (typeof data.wordpressApi === "string" && data.wordpressApi) setWordpressApi(data.wordpressApi); if (Array.isArray(data.posts)) setNewsPosts(data.posts); }).catch(() => undefined);
      fetch("/api/admin/fipe-sync").then(response=>response.json()).then(data=>{if(data?.brands)setFipeStats(data);}).catch(()=>undefined);
      fetch("/api/admin/verification-settings").then((response) => response.json()).then((data) => {
        if (data.configured && typeof data.configured === "object") setConfiguredVerification(data.configured);
        setRegistrationCodeEnabled(data.enabled === true);
        setVerificationSettings((current) => ({
          ...current,
          wapi_instance_id: typeof data.instanceId === "string" ? data.instanceId : "",
          wapi_test_whatsapp: typeof data.testWhatsapp === "string" ? maskUserPhone(data.testWhatsapp) : "",
        }));
      }).catch(() => undefined);
      fetch("/api/admin/seo-settings").then((response) => response.json()).then((data) => {
        setSeoSettings((current) => ({ ...current,
          analyticsConfigured: data.analyticsConfigured === true,
          analyticsHint: typeof data.analyticsHint === "string" ? data.analyticsHint : "",
          adsenseConfigured: data.adsenseConfigured === true,
          adsenseEnabled: data.adsenseEnabled === true,
          adsenseHint: typeof data.adsenseHint === "string" ? data.adsenseHint : "",
          adsenseSlotHint: typeof data.adsenseSlotHint === "string" ? data.adsenseSlotHint : "",
          siteTitle: typeof data.siteTitle === "string" ? data.siteTitle : current.siteTitle,
          description: typeof data.description === "string" ? data.description : current.description,
          keywords: typeof data.keywords === "string" ? data.keywords : current.keywords,
          googleVerification: typeof data.googleVerification === "string" ? data.googleVerification : "",
          schemaEnabled: data.schemaEnabled !== false,
          sitemapUrl: typeof data.sitemapUrl === "string" ? data.sitemapUrl : current.sitemapUrl,
          robotsUrl: typeof data.robotsUrl === "string" ? data.robotsUrl : current.robotsUrl,
        }));
      }).catch(() => undefined);
      fetch("/api/admin/google-search-settings").then((response) => response.json()).then((data) => { setGoogleSearch((current) => ({ ...current, enabled: data.enabled === true, configured: data.configured === true, credentialHint: typeof data.credentialHint === "string" ? data.credentialHint : "", siteUrl: typeof data.siteUrl === "string" ? data.siteUrl : current.siteUrl, sitemapUrl: typeof data.sitemapUrl === "string" ? data.sitemapUrl : current.sitemapUrl, lastSubmittedAt: typeof data.lastSubmittedAt === "string" ? data.lastSubmittedAt : "" })); }).catch(() => undefined);
      fetch("/api/admin/cloudflare-settings").then((response) => response.json()).then((data) => {
        setCloudflareSettings((current) => ({ ...current,
          configured: data.configured === true,
          tokenHint: typeof data.tokenHint === "string" ? data.tokenHint : "",
          zoneId: typeof data.zoneId === "string" ? data.zoneId : "",
          zoneName: typeof data.zoneName === "string" ? data.zoneName : "",
          zoneStatus: typeof data.zoneStatus === "string" ? data.zoneStatus : "",
          lastTestAt: typeof data.lastTestAt === "string" ? data.lastTestAt : "",
          lastPurgeAt: typeof data.lastPurgeAt === "string" ? data.lastPurgeAt : "",
        }));
      }).catch(() => undefined);
      const savedCategories = normalizePortalCategories(readLocal(
        "balcao-categories",
        portalCategories,
      ));
      setCategories(savedCategories);
      localStorage.setItem(
        "balcao-categories",
        JSON.stringify(savedCategories),
      );
    });
    fetch("/data/vehicle-catalog.json")
      .then((response) => response.json())
      .then((catalog: VehicleCatalog) => {
        setVehicleCatalog(catalog);
        localStorage.setItem("balcao-vehicle-catalog", JSON.stringify(catalog));
      })
      .catch(() => undefined);
  }, [adminEmail]);

  useEffect(() => {
    if (section === "anuncios" || section === "pendentes" || fullListingsLoaded.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/listings?fresh=1", { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => {
          if (!Array.isArray(payload.data)) return;
          fullListingsLoaded.current = true;
          setListings(payload.data.map((item: Record<string, unknown>) => ({
            id: String(item.id),
            title: String(item.title),
            category: migrateCategoryName(String(item.category)),
            subcategory: typeof item.subcategory === "string" ? item.subcategory : "",
            location: String(item.locationLabel),
            price: Number(item.price || 0),
            priceLabel: String(item.formattedPrice),
            image: listingImageFromApi(item),
            age: "Importado",
            description: String(item.description || ""),
            negotiationType: typeof item.negotiationType === "string" ? item.negotiationType : "Venda",
            createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
            images: Array.isArray(item.images) ? item.images.filter((value): value is string => typeof value === "string") : [],
            sellerName: item.seller && typeof item.seller === "object" ? String((item.seller as Record<string, unknown>).name || "") : "",
            sellerEmail: item.seller && typeof item.seller === "object" ? String((item.seller as Record<string, unknown>).email || "") : "",
            analytics: item.analytics && typeof item.analytics === "object" ? { views: Number((item.analytics as Record<string, unknown>).views || 0), pageViews: Number((item.analytics as Record<string, unknown>).pageViews || 0), sessions: Number((item.analytics as Record<string, unknown>).sessions || 0), phoneClicks: Number((item.analytics as Record<string, unknown>).phoneClicks || 0), whatsappClicks: Number((item.analytics as Record<string, unknown>).whatsappClicks || 0) } : undefined,
            status: typeof item.status === "string" ? item.status : undefined,
            publicationType: typeof item.publicationType === "string" ? item.publicationType : undefined,
            featuredPlan: typeof item.featuredPlan === "string" ? item.featuredPlan : null,
            paymentStatus: typeof item.paymentStatus === "string" ? item.paymentStatus : null,
            paymentMethod: typeof item.paymentMethod === "string" ? item.paymentMethod : null,
            paymentAmountCents: typeof item.paymentAmountCents === "number" ? item.paymentAmountCents : null,
            paymentExpiresAt: typeof item.paymentExpiresAt === "string" ? item.paymentExpiresAt : null,
          })));
        })
        .catch(() => undefined);
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [section]);

  useEffect(() => {
    if (section !== "anuncios" && section !== "pendentes") return;
    const controller = new AbortController();
    setAdminListingLoading(true);
    setAdminListingError("");
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(adminListingPage) });
        if (adminListingQuery.trim()) params.set("query", adminListingQuery.trim());
        if (adminListingCategory) params.set("category", adminListingCategory);
        if (section === "pendentes" || adminListingStatus) params.set("status", section === "pendentes" ? "pending_review" : adminListingStatus);
        if (adminListingFrom) params.set("from", new Date(`${adminListingFrom}T00:00:00`).toISOString());
        if (adminListingTo) {
          const end = new Date(`${adminListingTo}T00:00:00`);
          end.setDate(end.getDate() + 1);
          params.set("to", end.toISOString());
        }
        const response = await fetch(`/api/admin/catalog?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível carregar os anúncios.");
        const data = await response.json() as { data?: PortalListing[]; total?: number; pendingCount?: number };
        if (!Array.isArray(data.data)) throw new Error("Não foi possível carregar os anúncios.");
        const total = Number(data.total || 0);
        if (adminListingPage > 1 && adminListingPage > Math.ceil(total / 30)) {
          setAdminListingPage(Math.max(1, Math.ceil(total / 30)));
          return;
        }
        setAdminListingRows(data.data);
        setAdminListingTotal(total);
        setAdminPendingCount(Number(data.pendingCount || 0));
      } catch (error) {
        if (controller.signal.aborted) return;
        setAdminListingError(error instanceof Error ? error.message : "Não foi possível carregar os anúncios.");
      } finally {
        if (!controller.signal.aborted) setAdminListingLoading(false);
      }
    }, adminListingQuery ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [section, adminListingPage, adminListingQuery, adminListingCategory, adminListingStatus, adminListingFrom, adminListingTo, adminListingRefresh]);

  useEffect(() => {
    if (section !== "analytics" && section !== "painel") return;
    const load = () => fetch(`/api/admin/analytics?range=${analyticsRange}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data: AnalyticsDashboard) => setAnalyticsDashboard(data)).catch(() => undefined);
    void load(); const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [section, analyticsRange]);

  function saveTasks(next: Array<{ id: string; text: string; done: boolean }>) {
    setTasks(next);
    localStorage.setItem("balcao-admin-tasks", JSON.stringify(next));
  }
  useEffect(() => {
    if (section !== "chat-ia") return;
    const load = () => { setAssistantConversationsBusy(true); fetch("/api/admin/assistant-conversations", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setAssistantConversations(Array.isArray(data.conversations) ? data.conversations : [])).catch(() => undefined).finally(() => setAssistantConversationsBusy(false)); };
    void load(); const timer = window.setInterval(load, 20_000); return () => window.clearInterval(timer);
  }, [section]);

  useEffect(()=>{if(section!=="assinantes")return;void loadNewsletter();},[section]);

  const counts = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        count: listings.filter((item) => item.category === category.name)
          .length,
      })),
    [listings, categories],
  );
  const filteredAdminUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR").includes(adminUserQuery.trim().toLocaleLowerCase("pt-BR"))), [users, adminUserQuery]);

  const availableMercadoPagoTestMethod = !mercadoPago.pixEnabled && mercadoPago.cardEnabled
    ? "card"
    : mercadoPago.pixEnabled && !mercadoPago.cardEnabled
      ? "pix"
      : mercadoPagoTestMethod;

  function saveCategories(next: PortalCategory[]) {
    setCategories(next);
    localStorage.setItem("balcao-categories", JSON.stringify(next));
    window.dispatchEvent(new Event("balcao-categories-updated"));
    void fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categories: next }) });
  }

  function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const type = String(data.get("type"));
    const parent = Number(data.get("parent"));
    const showInMenu = data.get("showInMenu") === "on";
    const order = Number(data.get("order") || 0);
    if (!name) return;
    if (type === "child") {
      if (!Number.isInteger(parent) || !categories[parent])
        return flash("Selecione uma categoria mãe.");
      const next = categories.map((item, index) =>
        index === parent && !item.subs.includes(name)
          ? { ...item, subs: [...item.subs, name] }
          : item,
      );
      saveCategories(next);
      flash("Subcategoria adicionada com sucesso.");
    } else {
      saveCategories([
        ...categories,
        {
          name,
          icon: "▦",
          aliases: [name.toLowerCase()],
          subs: [],
          showInMenu,
          order,
        },
      ]);
      flash("Categoria principal adicionada com sucesso.");
    }
    event.currentTarget.reset();
  }

  function updateCategory(event: FormEvent<HTMLFormElement>, index: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const subs = String(data.get("subs") || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const showInMenu = data.get("showInMenu") === "on";
    const order = Number(data.get("order") || 0);
    saveCategories(
      categories.map((item, itemIndex) =>
        itemIndex === index ? { ...item, name, subs, showInMenu, order } : item,
      ),
    );
    setEditingCategory(null);
    flash("Categoria e subcategorias atualizadas.");
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 2600);
  }

  async function moderateAdminListing(item: PortalListing, action: "approve" | "reject") {
    setModeratingId(item.id);
    try {
      const response = await fetch(`/api/admin/listings/${encodeURIComponent(item.id)}/moderation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string; status?: string };
      if (!response.ok || !data.status) throw new Error(data.error || "Não foi possível atualizar o anúncio.");
      setListings((current) => current.map((listing) => listing.id === item.id ? { ...listing, status: data.status } : listing));
      setAdminListingRefresh((current) => current + 1);
      flash(data.message || (action === "approve" ? "Anúncio aprovado e publicado." : "Anúncio rejeitado."));
    } catch (error) {
      flash(error instanceof Error ? error.message : "Não foi possível atualizar o anúncio.");
    } finally {
      setModeratingId(null);
    }
  }

  async function loadUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok && Array.isArray(data.users)) setUsers(data.users);
  }

  async function loadStores(){const response=await fetch("/api/admin/stores",{cache:"no-store"}).catch(()=>null);const data=response?await response.json().catch(()=>({})):{};if(response?.ok&&Array.isArray(data.stores))setStores(data.stores);}
  async function loadNewsletter(){const response=await fetch("/api/admin/newsletter",{cache:"no-store"}).catch(()=>null);const data=response?await response.json().catch(()=>({})):{};if(response?.ok){setSubscribers(Array.isArray(data.subscribers)?data.subscribers:[]);setCampaigns(Array.isArray(data.campaigns)?data.campaigns:[]);}}

  async function saveStoreAccess(event:FormEvent<HTMLFormElement>){event.preventDefault();setStoreBusy(true);setStoreStatus("");const response=await fetch("/api/admin/stores",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...storeDraft,userId:Number(storeDraft.userId),adLimit:Number(storeDraft.adLimit),planStartedAt:storeDraft.planStartedAt?`${storeDraft.planStartedAt}T00:00:00`:null,planEndsAt:storeDraft.planEndsAt?`${storeDraft.planEndsAt}T23:59:59`:null})});const data=await response.json().catch(()=>({}));setStoreBusy(false);setStoreStatus(response.ok?"Loja habilitada e painel do lojista liberado.":data.error||"Não foi possível salvar a loja.");if(response.ok)void loadStores();}

  function openNewUser() {
    setEditingUser(null);
    setUserDraft(emptyManagedUser);
    setUserError("");
    setUserPhotoFile(null);
    setUserPhotoPreview("");
    setSendUserWelcome(true);
    setUserFormOpen(true);
  }

  function openUserEditor(user: AdminUser) {
    if (user.systemAdmin) return;
    setEditingUser(user);
    setUserDraft({
      accountType: user.accountType === "empresa" ? "empresa" : "particular",
      taxId: user.accountType === "empresa" ? maskUserCnpj(user.taxId || "") : maskUserCpf(user.taxId || ""),
      name: user.name,
      email: user.email,
      whatsapp: maskUserPhone(user.whatsapp || ""),
      password: "",
      profileImageUrl: user.profileImageUrl || "",
      isAdmin: Boolean(user.isAdmin),
    });
    setUserError("");
    setUserPhotoFile(null);
    setUserPhotoPreview(user.profileImageUrl || "");
    setSendUserWelcome(false);
    setUserFormOpen(true);
  }

  function selectUserProfile(file?: File) {
    if (!file) return;
    const validationError = validateProfileImage(file);
    if (validationError) return setUserError(validationError);
    setUserError("");
    if (userPhotoPreview.startsWith("blob:")) URL.revokeObjectURL(userPhotoPreview);
    setUserPhotoFile(file);
    setUserPhotoPreview(createProfilePreview(file));
  }

  async function saveManagedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserBusy(true);
    setUserError("");
    try {
      let profileImageUrl = userDraft.profileImageUrl;
      if (userPhotoFile) {
        setProfileBusy(true);
        profileImageUrl = await uploadProfileImage(userPhotoFile);
        setUserDraft((current) => ({ ...current, profileImageUrl }));
      }
      const customerId = editingUser?.id.startsWith("customer-") ? Number(editingUser.id.replace("customer-", "")) : undefined;
      const response = await fetch("/api/admin/users", {
        method: customerId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...userDraft, profileImageUrl, id: customerId, sendWelcomeEmail: !customerId && sendUserWelcome }),
      }).catch(() => null);
      const result = response ? await response.json().catch(() => ({})) as { error?: string } : {};
      if (!response?.ok) throw new Error(result.error || "Não foi possível salvar o usuário.");
      await loadUsers();
      setUserFormOpen(false);
      setUserPhotoFile(null);
      flash(customerId ? "Usuário atualizado com sucesso." : "Usuário cadastrado com sucesso.");
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Não foi possível salvar o usuário.");
    } finally {
      setProfileBusy(false);
      setUserBusy(false);
    }
  }

  async function continueListingImport(jobId: string) {
    setListingImportBusy(true);
    try {
      let running = true;
      while (running) {
        const response = await fetch("/api/admin/listing-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "process", jobId }) });
        const data = await response.json() as ListingImportState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Falha no processamento da importação.");
        setListingImport(data); running = data.job?.status === "running";
      }
      const listingsResponse = await fetch("/api/listings"); const listingsPayload = await listingsResponse.json();
      if (Array.isArray(listingsPayload.data)) setListings(listingsPayload.data.map((item: Record<string, unknown>) => ({ id: String(item.id), title: String(item.title), category: migrateCategoryName(String(item.category)), location: String(item.locationLabel), price: Number(item.price || 0), priceLabel: String(item.formattedPrice), image: listingImageFromApi(item), age: "Importado", description: String(item.description || "") })));
      setOpenAiStatus("Importação concluída. Os anúncios foram classificados e publicados.");
    } catch (error) { setOpenAiStatus(error instanceof Error ? error.message : "Não foi possível concluir a importação."); }
    finally { setListingImportBusy(false); }
  }

  async function startListingImport() {
    if (!listingImportUrl.trim()) return setOpenAiStatus("Informe o endereço JSON dos anúncios.");
    setListingImportBusy(true); setOpenAiStatus("Lendo o endereço e preparando os anúncios…");
    try {
      const response = await fetch("/api/admin/listing-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", sourceUrl: listingImportUrl.trim() }) });
      const data = await response.json() as ListingImportState & { error?: string };
      if (!response.ok || !data.job) throw new Error(data.error || "Não foi possível iniciar a importação.");
      setListingImport(data); await continueListingImport(data.job.id);
    } catch (error) { setOpenAiStatus(error instanceof Error ? error.message : "Não foi possível iniciar a importação."); setListingImportBusy(false); }
  }

  async function synchronizeImportedListings() {
    setListingImportBusy(true);
    setOpenAiStatus("Sincronizando e publicando os anúncios importados…");
    try {
      const response = await fetch("/api/admin/listing-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "synchronize" }) });
      const data = await response.json() as { synchronized?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível sincronizar os anúncios.");
      setOpenAiStatus(`${data.synchronized || 0} anúncios importados classificados e publicados.`);
      const listingsResponse = await fetch("/api/listings?fresh=1");
      const listingsPayload = await listingsResponse.json();
      if (Array.isArray(listingsPayload.data)) setListings(listingsPayload.data.map((item: Record<string, unknown>) => ({ id: String(item.id), title: String(item.title), category: migrateCategoryName(String(item.category)), location: String(item.locationLabel), price: Number(item.price || 0), priceLabel: String(item.formattedPrice), image: listingImageFromApi(item), age: "Sincronizado", description: String(item.description || "") })));
    } catch (error) {
      setOpenAiStatus(error instanceof Error ? error.message : "Não foi possível sincronizar os anúncios.");
    } finally {
      setListingImportBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login_image_url: loginImageUrl, admin_login_image_url: adminLoginImageUrl }) });
    if (!response.ok) return flash("Não foi possível salvar a imagem da tela de login.");
    localStorage.setItem("balcao-site-name", siteName);
    window.dispatchEvent(new Event("balcao-settings-updated"));
    flash("Configurações salvas.");
  }

  async function synchronizeFipe(types:string[]){setFipeBusy(true);setFipeProgress({processed:0,total:0,models:0,errors:0});try{for(const type of types){setFipeStatus(`Sincronizando ${type==="cars"?"carros":type==="motorcycles"?"motos":"caminhões"}…`);const start=await fetch("/api/admin/fipe-sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start",type})});const started=await start.json() as {jobId?:string;total?:number;error?:string};if(!start.ok||!started.jobId)throw new Error(started.error||"Não foi possível iniciar a sincronização.");let done=false;while(!done){const response=await fetch("/api/admin/fipe-sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"continue",jobId:started.jobId})});const data=await response.json() as {processed?:number;total?:number;modelsFound?:number;errors?:string[];done?:boolean;error?:string};if(!response.ok)throw new Error(data.error||"Falha durante a sincronização.");setFipeProgress({processed:Number(data.processed||0),total:Number(data.total||started.total||0),models:Number(data.modelsFound||0),errors:data.errors?.length||0});done=Boolean(data.done);}}const statsResponse=await fetch("/api/admin/fipe-sync");const stats=await statsResponse.json();if(statsResponse.ok)setFipeStats(stats);setFipeStatus("Sincronização FIPE concluída.");}catch(error){setFipeStatus(error instanceof Error?error.message:"Falha na sincronização FIPE.");}finally{setFipeBusy(false);}}

  function saveBanners(next: PortalBanner[]) {
    setBanners(next);
    localStorage.setItem("balcao-banners", JSON.stringify(next));
    window.dispatchEvent(new Event("balcao-banners-updated"));
    fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ banners: next }) }).catch(() => undefined);
  }

  function addBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const type = String(data.get("type")) as PortalBanner["type"];
    const banner: PortalBanner = {
      id: Date.now(),
      name: String(data.get("name") || "Banner"),
      type,
      image: type === "image" ? bannerImage : undefined,
      link: type === "image" ? String(data.get("link") || "") : undefined,
      script: type !== "image" ? String(data.get("script") || "") : undefined,
      placement: String(
        data.get("placement") || "home",
      ) as PortalBanner["placement"],
      startDate: String(data.get("startDate") || ""),
      endDate: String(data.get("endDate") || ""),
      active: true,
    };
    if (type === "image" && !banner.image)
      return flash("Informe a imagem do banner.");
    if (type !== "image" && !banner.script)
      return flash("Cole o script do banner ou do AdSense.");
    saveBanners([...banners, banner]);
    event.currentTarget.reset();
    setBannerImage("");
    flash("Banner cadastrado com sucesso.");
  }

  function updateDiscoverPage(index: number, changes: Partial<DiscoverPage>) {
    setDiscoverPages((current) => current.map((page, itemIndex) => itemIndex === index ? { ...page, ...changes } : page));
  }

  async function saveDiscoverPages() {
    const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ discover_pages: discoverPages.slice(0, 10) }) });
    flash(response.ok ? "Páginas Descubra salvas e publicadas." : "Não foi possível salvar as páginas.");
  }

  async function uploadDiscoverImage(index: number, file?: File) {
    if (!file) return;
    setDiscoverBusy(`upload-${index}`);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const data = await response.json() as { url?: string; error?: string };
    if (response.ok && data.url) updateDiscoverPage(index, { image: data.url });
    else flash(data.error || "Não foi possível enviar a imagem.");
    setDiscoverBusy(null);
  }

  async function generateDiscoverText(index: number) {
    const page = discoverPages[index];
    setDiscoverBusy(`ai-${index}`);
    const response = await fetch("/api/discover/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: page.title, summary: page.summary }) });
    const data = await response.json() as { content?: string; error?: string };
    if (response.ok && data.content) updateDiscoverPage(index, { content: data.content });
    else flash(data.error || "Não foi possível gerar o texto.");
    setDiscoverBusy(null);
  }

  const nav: { id: Section; label: string; icon: string }[] = [
    { id: "painel", label: "Painel", icon: "⌂" },
    { id: "usuarios", label: "Usuários", icon: "♙" },
    { id: "ligacoes", label: "Ligações com Gemini", icon: "☎" },
    { id: "categorias", label: "Categorias", icon: "▦" },
    { id: "anuncios", label: "Anúncios", icon: "▤" },
    { id: "landing-pages", label: "Landing pages", icon: "◫" },
    { id: "pendentes", label: "Anúncios pendentes", icon: "◷" },
    { id: "chat-ia", label: "Atendimento com IA", icon: "◉" },
    { id: "assinantes", label: "Assinantes e campanhas", icon: "✉" },
    { id: "pagamentos", label: "Anúncios pagos", icon: "R$" },
    { id: "veiculos", label: "Marcas e modelos FIPE", icon: "◆" },
    { id: "noticias", label: "Últimas notícias", icon: "▤" },
    { id: "videos", label: "Vídeos", icon: "▶" },
    { id: "publicidade-legal", label: "Publicidade Legal", icon: "▧" },
    { id: "descubra", label: "Páginas Descubra", icon: "▧" },
    { id: "banners", label: "Banners", icon: "▣" },
    { id: "paginas", label: "Páginas institucionais", icon: "▤" },
    { id: "seo", label: "SEO, Analytics e Cloudflare", icon: "◎" },
    { id: "configuracoes", label: "Configurações", icon: "⚙" },
  ];

  return (
    <main className="dashboard-layout admin-layout">
      <aside
        id="admin-navigation"
        className={`dash-nav admin-sidebar ${mobileMenuOpen ? "open" : ""}`}
      >
        <a className="admin-brand" href="/">
          {logo ? (
            <img src={logo} alt="Logo" />
          ) : (
            <>
              <b>BALCÃO</b>
              <small>ADMINISTRAÇÃO</small>
            </>
          )}
        </a>
        <div className="profile-dot">AD</div>
        <strong>Administrador</strong>
        <span>Controle completo do portal</span>
        <nav>
          {nav.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              onClick={() => {
                setSection(item.id);
                setMobileMenuOpen(false);
              }}
              key={item.id}
            >
              <i>{item.icon}</i>
              {item.label}
            </button>
          ))}
        </nav>
        <a
          className="logout"
          href="/admin/login"
          onClick={(event) => {
            event.preventDefault();
            fetch("/api/admin/logout", { method: "POST" }).finally(() => {
              location.href = "/admin/login";
            });
          }}
        >
          ↪ Sair
        </a>
      </aside>
      {mobileMenuOpen ? (
        <button
          className="admin-sidebar-backdrop"
          type="button"
          aria-label="Fechar menu administrativo"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <section className="dash-main" id="conteudo">
        <header className="dash-top">
          <button
            className="admin-mobile-menu-toggle"
            type="button"
            aria-label="Abrir menu administrativo"
            aria-controls="admin-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <div>
            <strong>{siteName}</strong>
            <span>Central administrativa</span>
          </div>
          <a href="/" target="_blank">
            Ver site ↗
          </a>
        </header>
        <div className="dash-content">
          {notice && <div className="admin-notice">✓ {notice}</div>}
          {section === "publicidade-legal" && <LegalPublicationsManager />}
          {section === "videos" && <VideosManager />}
          {section === "veiculos" && (
            <section className="admin-section vehicle-admin">
              <div className="admin-section-head">
                <div>
                  <span className="hero-kicker">Catálogo automotivo</span>
                  <h1>Marcas e modelos de veículos</h1>
                  <p>
                    Catálogo importado dos arquivos enviados, com atualização
                    opcional pela tabela FIPE.
                  </p>
                </div>
              </div>
              <div className="admin-two-columns">
                <form
                  className="panel-card admin-form"
                  onSubmit={(event) => {event.preventDefault();void synchronizeFipe([fipeType==="carros"?"cars":fipeType==="motos"?"motorcycles":"trucks"]);}}
                >
                  <h2>Catálogo configurado</h2>
                  <label>
                    Tipo de veículo
                    <select
                      value={fipeType}
                      onChange={(event) => {
                        setFipeType(event.target.value);
                        setFipeBrands([]);
                        setFipeModels({});
                      }}
                    >
                      <option value="carros">Carros e utilitários</option>
                      <option value="motos">Motos</option>
                      <option value="caminhoes">Caminhões</option>
                    </select>
                  </label>
                  <div className="catalog-summary">
                    <b>
                      {fipeStats.brands[fipeType==="carros"?"cars":fipeType==="motos"?"motorcycles":"trucks"]||0}{" "}
                      marcas
                    </b>
                    <span>
                      {fipeStats.models[fipeType==="carros"?"cars":fipeType==="motos"?"motorcycles":"trucks"]||0}{" "}
                      modelos importados
                    </span>
                  </div>
                  <button className="primary-button" disabled={fipeBusy}>{fipeBusy?"Sincronizando…":"Sincronizar tipo selecionado"}</button>
                  <div className="integration-actions"><button type="button" className="soft-button" disabled={fipeBusy} onClick={()=>void synchronizeFipe(["cars"])}>Sincronizar Carros</button><button type="button" className="soft-button" disabled={fipeBusy} onClick={()=>void synchronizeFipe(["motorcycles"])}>Sincronizar Motos</button><button type="button" className="soft-button" disabled={fipeBusy} onClick={()=>void synchronizeFipe(["trucks"])}>Sincronizar Caminhões</button><button type="button" className="soft-button" disabled={fipeBusy} onClick={()=>void synchronizeFipe(["cars","motorcycles","trucks"])}>Sincronizar FIPE</button></div>
                  {fipeBusy||fipeProgress.total?<div className="ai-review-progress"><div><span style={{width:`${fipeProgress.total?Math.round(fipeProgress.processed/fipeProgress.total*100):0}%`}}/></div><small>{fipeProgress.processed} de {fipeProgress.total} marcas · {fipeProgress.models} modelos · {fipeProgress.errors} erros</small></div>:null}
                  {fipeStats.last?.finishedAt?<small>Última sincronização: {new Date(fipeStats.last.finishedAt).toLocaleString("pt-BR")}</small>:null}
                  {fipeStatus && <p className="fipe-status">{fipeStatus}</p>}
                </form>
                <section className="panel-card fipe-list">
                  <h2>Marcas cadastradas</h2>
                  {(fipeBrands.length
                    ? fipeBrands
                    : vehicleCatalog[fipeType as keyof VehicleCatalog] || []
                  ).map((brand) => (
                    <article key={brand.code}>
                      <div>
                        <b>{brand.name}</b>
                        <span>
                          {brand.models?.length ||
                            fipeModels[brand.code]?.length ||
                            0}{" "}
                          modelos cadastrados
                        </span>
                      </div>
                      {fipeBrands.length > 0 && (
                        <button
                          onClick={async () => {
                            setFipeStatus(`Carregando modelos ${brand.name}…`);
                            try {
                              const response = await fetch(
                                `/api/fipe?type=${fipeType}&brand=${brand.code}`,
                              );
                              const data = await response.json();
                              const models = Array.isArray(data.models)
                                ? data.models
                                : [];
                              const next = {
                                ...fipeModels,
                                [brand.code]: models,
                              };
                              setFipeModels(next);
                              localStorage.setItem(
                                `balcao-fipe-${fipeType}`,
                                JSON.stringify({
                                  brands: fipeBrands,
                                  models: next,
                                }),
                              );
                              setFipeStatus(
                                `${models.length} modelos de ${brand.name} importados.`,
                              );
                            } catch {
                              setFipeStatus("Erro ao importar os modelos.");
                            }
                          }}
                        >
                          Atualizar modelos
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              </div>
            </section>
          )}
          {section === "painel" && (
            <>
              <span className="hero-kicker">Visão geral da plataforma</span>
              <h1>Olá, seja bem-vindo, {adminEmail.split("@")[0].split(/[._-]/)[0].replace(/^./, (letter) => letter.toUpperCase())}.</h1>
              <p>Acompanhe o portal e acesse rapidamente as tarefas administrativas.</p>
              <div className="stats-grid admin-stats">
                <article>
                  <i>▤</i>
                  <span>
                    Total de anúncios<strong>{listings.length}</strong>
                    <small>Publicados e cadastrados</small>
                  </span>
                </article>
                <article>
                  <i>●</i>
                  <span>
                    Visitantes agora<strong>{analyticsDashboard?.summary.activeVisitors ?? "—"}</strong>
                    <small>Atualização em tempo real</small>
                  </span>
                </article>
                <article role="button" tabIndex={0} onClick={() => setSection("pendentes")} onKeyDown={(event) => event.key === "Enter" && setSection("pendentes")}>
                  <i>◷</i>
                  <span>
                    Anúncios pendentes<strong>{listings.filter((item) => item.status === "pending_review").length}</strong>
                    <small>Clique para revisar e aprovar</small>
                  </span>
                </article>
                <article>
                  <i>R$</i>
                  <span>
                    Pagamentos pendentes<strong>{listings.filter((item) => item.status === "awaiting_payment" || item.paymentStatus === "pending").length}</strong>
                    <small>Aguardando confirmação</small>
                  </span>
                </article>
                <article>
                  <i>▦</i>
                  <span>
                    Lojas ativas<strong>{stores.filter((store) => store.active).length}</strong>
                    <small>Lojas virtuais publicadas</small>
                  </span>
                </article>
              </div>
              <div className="admin-grid">
                <section className="panel-card">
                  <div className="panel-head">
                    <h2>Minhas tarefas</h2>
                  </div>
                  <form className="admin-task-form" onSubmit={(event) => { event.preventDefault(); const text = taskText.trim(); if (!text) return; saveTasks([{ id: crypto.randomUUID(), text, done: false }, ...tasks]); setTaskText(""); }}>
                    <input value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="Cadastrar uma nova tarefa" aria-label="Nova tarefa" />
                    <button className="primary-button">Adicionar</button>
                  </form>
                  <div className="admin-task-list">{tasks.map((task) => <label key={task.id}><input type="checkbox" checked={task.done} onChange={() => saveTasks(tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} /><span>{task.text}</span><button type="button" aria-label="Excluir tarefa" onClick={() => saveTasks(tasks.filter((item) => item.id !== task.id))}>×</button></label>)}</div>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><h2>Ações rápidas</h2></div>
                  <div className="quick-actions">
                    <button className="quick-highlight" onClick={() => setSection("usuarios")}><b>♙</b> Incluir novo cliente</button>
                    <button onClick={() => setSection("categorias")}><b>▦</b> Incluir nova categoria</button>
                    <button onClick={() => setSection("pagamentos")}><b>R$</b> Incluir novo pagamento</button>
                    <button className="quick-highlight" onClick={() => window.location.assign("/anunciar?admin=1")}><b>＋</b> Incluir novo anúncio</button>
                    <button onClick={() => setSection("banners")}><b>▤</b> Incluir novo material</button>
                    <button onClick={() => setSection("videos")}><b>▶</b> Incluir novo vídeo</button>
                    <button onClick={() => setSection("lojas")}><b>▣</b> Incluir nova loja virtual</button>
                  </div>
                </section>
                <section className="panel-card category-chart">
                  <h2>Maiores categorias</h2>
                  <ul>
                    {counts
                      .filter((item) => item.count)
                      .slice(0, 6)
                      .map((item, index) => (
                        <li key={item.name}>
                          <i className={`dot-${index}`} />
                          {item.name}
                          <strong>{item.count}</strong>
                        </li>
                      ))}
                  </ul>
                </section>
              </div>
            </>
          )}
          {(section === "anuncios" || section === "pendentes") && (
            <section className="admin-section">
              <div className="admin-section-head">
                <div>
                  <span className="hero-kicker">Catálogo</span>
                  <h1>{section === "pendentes" ? "Anúncios pendentes" : "Todos os anúncios"}</h1>
                  <p>Filtre, edite, destaque, publique ou reprove anúncios do catálogo.</p>
                  <strong className="moderation-summary">{adminPendingCount} pendente(s) de aprovação</strong>
                </div>
                <a className="primary-button" href="/anunciar?admin=1">
                  ＋ Novo anúncio
                </a>
              </div>
              <div className="panel-card admin-listing-filters">
                <label>Palavra-chave ou e-mail<input value={adminListingQuery} onChange={(event) => { setAdminListingPage(1); setAdminListingQuery(event.target.value); }} placeholder="Título, descrição ou e-mail" /></label>
                <label>Categoria<select value={adminListingCategory} onChange={(event) => { setAdminListingPage(1); setAdminListingCategory(event.target.value); }}><option value="">Todas</option>{categories.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
                <label>Status<select value={adminListingStatus} onChange={(event) => { setAdminListingPage(1); setAdminListingStatus(event.target.value); }}><option value="">Todos</option><option value="active">Publicado</option><option value="pending_review">Pendente</option><option value="awaiting_payment">Aguardando pagamento</option><option value="rejected">Recusado</option></select></label>
                <label>Data inicial<input type="date" value={adminListingFrom} max={adminListingTo || undefined} onChange={(event) => { setAdminListingPage(1); setAdminListingFrom(event.target.value); }} /></label>
                <label>Data final<input type="date" value={adminListingTo} min={adminListingFrom || undefined} onChange={(event) => { setAdminListingPage(1); setAdminListingTo(event.target.value); }} /></label>
                <button type="button" onClick={() => { setAdminListingPage(1); setAdminListingQuery(""); setAdminListingCategory(""); setAdminListingStatus(""); setAdminListingFrom(""); setAdminListingTo(""); }}>Limpar</button>
              </div>
              <div className="panel-card admin-list" aria-busy={adminListingLoading}>
                {adminListingLoading ? <p role="status">Carregando anúncios…</p> : null}
                {adminListingError ? <p role="alert">{adminListingError} <button type="button" onClick={() => setAdminListingRefresh((current) => current + 1)}>Tentar novamente</button></p> : null}
                {!adminListingLoading && !adminListingError && adminListingRows.map((item) => (
                  <article key={item.id}>
                    <img src={item.image} alt="" loading="lazy" />
                    <div>
                      <b>{item.title}</b>
                      <span>
                        {item.category}{item.subcategory ? ` / ${item.subcategory}` : ""} · {item.sellerEmail || item.sellerName || item.location}
                      </span>
                      <strong>{item.priceLabel} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString("pt-BR") : "sem data"} · {item.publicationType === "featured" ? item.featuredPlan === "super" ? "Super destaque" : "Destacado" : "Grátis"}</strong><small>{item.analytics?.pageViews || item.analytics?.views || 0} page views · {item.analytics?.sessions || 0} acessos/sessões · {(item.analytics?.phoneClicks || 0) + (item.analytics?.whatsappClicks || 0)} cliques · {item.analytics?.phoneClicks || 0} telefone · {item.analytics?.whatsappClicks || 0} WhatsApp</small>
                    </div>
                    <i className={`status-pill ${item.status || "active"}`}>{item.status === "pending_review" ? "Pendente de aprovação" : item.status === "awaiting_payment" ? "Aguardando pagamento" : item.status === "rejected" ? "Rejeitado" : "Ativo"}</i>
                    <div className="admin-list-actions">
                      {item.status === "pending_review" ? <div className="admin-moderation-actions">
                        <button className="approve" type="button" disabled={moderatingId === item.id} onClick={() => void moderateAdminListing(item, "approve")}>{moderatingId === item.id ? "Processando…" : "Aprovar e publicar"}</button>
                        <button className="reject" type="button" disabled={moderatingId === item.id} onClick={() => void moderateAdminListing(item, "reject")}>Rejeitar</button>
                      </div> : null}
                      {item.status === "awaiting_payment" ? <button className="approve" type="button" onClick={async () => { const response = await fetch(`/api/admin/listings/${encodeURIComponent(item.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirm-payment" }) }); if (response.ok) { setListings((current) => current.map((listing) => listing.id === item.id ? { ...listing, status: "pending_review", paymentStatus: "paid", publicationType: "featured" } : listing)); setAdminListingRefresh((current) => current + 1); flash("Pagamento confirmado. Anúncio encaminhado para revisão."); } else flash("Não foi possível confirmar este pagamento."); }}>Confirmar pagamento Pix</button> : null}
                      <div className="admin-list-actions-primary">
                      <a className="admin-listing-action" href={`/editar-anuncio/${encodeURIComponent(item.id)}?admin=1`} title="Abrir o formulário completo para editar o anúncio">Editar</a>
                      <a className="admin-listing-action review" href={`/editar-anuncio/${encodeURIComponent(item.id)}?admin=1&intent=review`} title="Abrir o formulário completo para revisar o anúncio">Revisar</a>
                      <button type="button" title="Destacar anúncio" aria-label="Destacar anúncio" onClick={async () => { const response = await fetch(`/api/admin/listings/${encodeURIComponent(item.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "feature" }) }); if (response.ok) { setListings((current) => current.map((listing) => listing.id === item.id ? { ...listing, publicationType: "featured", featuredPlan: "monthly", status: "active", paymentStatus: "paid" } : listing)); setAdminListingRefresh((current) => current + 1); flash("Anúncio destacado por 30 dias."); } }}>★</button>
                      <button
                        className="danger"
                        type="button"
                        onClick={async () => { if (!window.confirm(`Excluir “${item.title}” definitivamente?`)) return; const response = await fetch(`/api/admin/listings/${encodeURIComponent(item.id)}`, { method: "DELETE" }); if (response.ok) { setListings((current) => current.filter((listing) => listing.id !== item.id)); setAdminListingRefresh((current) => current + 1); flash("Anúncio excluído."); } else flash("Não foi possível excluir o anúncio."); }}
                      >
                        <span aria-hidden="true">⌫</span><span className="sr-only">Excluir anúncio</span>
                      </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!adminListingLoading && !adminListingError && !adminListingRows.length ? <p>Nenhum anúncio corresponde aos filtros.</p> : null}
              </div>
              {!adminListingLoading && !adminListingError && adminListingTotal > 0 ? <nav className="admin-list-pagination" aria-label="Páginas de anúncios">
                <span>Exibindo {(adminListingPage - 1) * 30 + 1}–{Math.min(adminListingPage * 30, adminListingTotal)} de {adminListingTotal} anúncios · Mais recentes primeiro</span>
                <div><button type="button" disabled={adminListingPage === 1} onClick={() => setAdminListingPage((page) => page - 1)}>Anterior</button><span>Página {adminListingPage} de {Math.ceil(adminListingTotal / 30)}</span><button type="button" disabled={adminListingPage * 30 >= adminListingTotal} onClick={() => setAdminListingPage((page) => page + 1)}>Próxima</button></div>
              </nav> : null}
            </section>
          )}
          {section === "pagamentos" && (
            <section className="admin-section">
              <div className="admin-section-head"><div><span className="hero-kicker">Financeiro</span><h1>Anúncios pagos</h1><p>Pagamentos dos anúncios com destaque, incluindo valores, método e situação.</p></div></div>
              <div className="panel-card admin-payment-list">
                {listings.filter((item) => item.publicationType === "featured").length ? listings.filter((item) => item.publicationType === "featured").map((item) => <article key={item.id}><img src={item.image} alt="" /><div><b>{item.title}</b><span>{item.category} · {item.featuredPlan === "monthly" ? "Mensal" : item.featuredPlan === "quarterly" ? "Trimestral" : "Semestral"}</span><small>{item.paymentMethod === "PIX" ? "Pix" : "Cartão de crédito"}</small></div><strong>{((item.paymentAmountCents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong><i className={`status-pill ${item.paymentStatus === "paid" ? "paid" : item.paymentStatus === "declined" || item.paymentStatus === "failed" ? "rejected" : ""}`}>{item.paymentStatus === "paid" ? "Pago" : item.paymentStatus === "declined" ? "Não aprovado" : item.paymentStatus === "failed" ? "Falha" : "Pendente"}</i></article>) : <p>Nenhum anúncio com destaque cadastrado.</p>}
              </div>
            </section>
          )}
          {section === "analytics" && (
            <section className="admin-section admin-analytics">
              <div className="admin-section-head"><div><span className="hero-kicker">Acompanhamento</span><h1>Analytics em tempo real</h1><p>Visitantes ativos nos últimos cinco minutos, sessões, page views e desempenho de cada anúncio.</p></div><label>Período<select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value as "24h" | "7d" | "30d")}><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select></label></div>
              <div className="stats-grid admin-stats analytics-summary">
                <article><i>●</i><span>Ativos agora<strong>{analyticsDashboard?.summary.activeVisitors ?? "—"}</strong><small>últimos 5 minutos</small></span></article>
                <article><i>▤</i><span>Page views<strong>{analyticsDashboard?.summary.pageviews ?? "—"}</strong><small>no período</small></span></article>
                <article><i>◎</i><span>Sessões<strong>{analyticsDashboard?.summary.sessions ?? "—"}</strong><small>visitantes no período</small></span></article>
                <article><i>Σ</i><span>Total histórico<strong>{analyticsDashboard?.summary.totalPageviews ?? "—"}</strong><small>{analyticsDashboard?.summary.totalSessions ?? 0} sessões</small></span></article>
              </div>
              <div className="admin-grid analytics-grid">
                <section className="panel-card"><div className="panel-head"><h2>Páginas mais acessadas</h2><small>Atualização a cada 15 segundos</small></div><div className="analytics-table">{analyticsDashboard?.topPages.map((item) => <article key={item.path}><code>{item.path}</code><span><b>{item.pageviews}</b> views</span><span><b>{item.sessions}</b> sessões</span></article>)}{!analyticsDashboard?.topPages.length ? <p>Aguardando os primeiros acessos.</p> : null}</div></section>
                <section className="panel-card"><div className="panel-head"><h2>Visitantes por página agora</h2></div><div className="analytics-table compact">{analyticsDashboard?.activePages.map((item) => <article key={item.path}><code>{item.path}</code><span><b>{item.visitors}</b> online</span></article>)}{!analyticsDashboard?.activePages.length ? <p>Nenhum visitante ativo nos últimos cinco minutos.</p> : null}</div></section>
              </div>
              <section className="panel-card"><div className="panel-head"><h2>Acessos por anúncio</h2></div><div className="analytics-table listings">{analyticsDashboard?.listings.map((item) => <article key={item.id}><a href={listingPath(item.slug || "")} target="_blank" rel="noreferrer">{item.title}</a><span><b>{item.pageviews}</b> page views</span><span><b>{item.sessions}</b> sessões</span></article>)}{!analyticsDashboard?.listings.length ? <p>Nenhum anúncio cadastrado.</p> : null}</div></section>
              {analyticsDashboard ? <p className="analytics-updated">Atualizado às {new Date(analyticsDashboard.generatedAt).toLocaleTimeString("pt-BR")} · métricas próprias sem armazenamento do endereço IP.</p> : null}
            </section>
          )}
          {section === "chat-ia" && (
            <section className="admin-section assistant-conversations-page">
              <div className="admin-section-head"><div><span className="hero-kicker">Atendimento digital</span><h1>Conversas do Assistente com IA</h1><p>Histórico autorizado pelos visitantes, com endereço IP, identificação da conta e mensagens registradas.</p></div><span className={`ai-api-indicator ${hasOpenAiApiKey && aiChatEnabled ? "connected" : ""}`}>{hasOpenAiApiKey && aiChatEnabled ? "● Atendimento ativo" : "○ Atendimento desativado"}</span></div>
              <div className="panel-card assistant-conversation-list"><header><strong>{assistantConversations.length} conversa{assistantConversations.length === 1 ? "" : "s"}</strong><small>Atualização automática a cada 20 segundos</small></header>{assistantConversationsBusy && !assistantConversations.length ? <p>Carregando conversas…</p> : assistantConversations.map((conversation) => <article key={conversation.id}><div><span className="assistant-conversation-avatar">{conversation.customerName ? conversation.customerName.charAt(0).toUpperCase() : "IA"}</span><span><b>{conversation.customerName || "Visitante não identificado"}</b><small>{conversation.customerEmail || `IP: ${conversation.ipAddress}`}</small></span></div><p>{conversation.lastMessage || "Conversa iniciada"}</p><aside><b>{Number(conversation.messageCount || 0)} mensagens</b><small>{new Date(conversation.lastMessageAt).toLocaleString("pt-BR")}</small><a href={`/admin/conversas-ia/${encodeURIComponent(conversation.id)}`} target="_blank" rel="noreferrer">Abrir conversa ↗</a></aside></article>)}{!assistantConversationsBusy && !assistantConversations.length ? <p>Nenhuma conversa iniciada.</p> : null}</div>
            </section>
          )}
          {section === "assinantes" && (
            <section className="admin-section newsletter-admin-page">
              <div className="admin-section-head"><div><span className="hero-kicker">E-mail marketing</span><h1>Assinantes e campanhas</h1><p>Gerencie a lista, envie mensagens individuais e crie campanhas com os 20 anúncios mais recentes.</p></div><button className="primary-button" type="button" disabled={newsletterBusy} onClick={async()=>{setNewsletterBusy(true);setNewsletterStatus("Gerando a campanha com inteligência artificial…");const response=await fetch("/api/admin/newsletter/campaigns",{method:"POST"});const data=await response.json().catch(()=>({})) as {campaign?:NewsletterCampaign;error?:string};setNewsletterBusy(false);if(!response.ok||!data.campaign)return setNewsletterStatus(data.error||"Não foi possível gerar a campanha.");setCampaignPreview(data.campaign);setNewsletterStatus("Campanha criada. Revise a prévia antes de enviar.");void loadNewsletter();}}>✦ Gerar campanha com IA</button></div>
              {newsletterStatus?<p className="integration-status" role="status">{newsletterStatus}</p>:null}
              <div className="newsletter-summary-grid"><article><span>Assinantes ativos</span><strong>{subscribers.filter(item=>item.status==="active").length}</strong></article><article><span>Campanhas enviadas</span><strong>{campaigns.filter(item=>item.status==="sent"||item.status==="partial").length}</strong></article><article><span>E-mails entregues</span><strong>{campaigns.reduce((total,item)=>total+Number(item.sentCount||0),0)}</strong></article></div>
              <div className="newsletter-admin-grid">
                <section className="panel-card newsletter-subscribers"><header><div><h2>Assinantes da lista</h2><small>{subscribers.length} e-mails cadastrados</small></div><form onSubmit={async(event)=>{event.preventDefault();setNewsletterBusy(true);const response=await fetch("/api/admin/newsletter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:subscriberEmail})});const data=await response.json().catch(()=>({})) as {error?:string};setNewsletterBusy(false);if(!response.ok)return setNewsletterStatus(data.error||"Não foi possível adicionar.");setSubscriberEmail("");setNewsletterStatus("Assinante adicionado à lista.");void loadNewsletter();}}><input type="email" value={subscriberEmail} onChange={event=>setSubscriberEmail(event.target.value)} placeholder="novo@assinante.com.br" required/><button className="soft-button" disabled={newsletterBusy}>+ Adicionar</button></form></header><div className="newsletter-subscriber-list">{subscribers.map(item=><article key={item.id}><div><b>{item.email}</b><small>{item.source==="admin"?"Adicionado pelo administrador":"Cadastro pelo site"} · {new Date(item.createdAt).toLocaleDateString("pt-BR")}</small></div><em className={item.status}>{item.status==="active"?"Ativo":"Descadastrado"}</em><button type="button" onClick={()=>setManualEmail(current=>({...current,email:item.email}))}>Enviar e-mail</button><button className="danger" type="button" onClick={async()=>{if(!confirm(`Excluir ${item.email} da lista?`))return;await fetch(`/api/admin/newsletter?id=${encodeURIComponent(item.id)}`,{method:"DELETE"});void loadNewsletter();}}>Excluir</button></article>)}{!subscribers.length?<p>Nenhum assinante cadastrado.</p>:null}</div></section>
                <form className="panel-card admin-form newsletter-manual" onSubmit={async(event)=>{event.preventDefault();setNewsletterBusy(true);setNewsletterStatus("Enviando e-mail…");const response=await fetch("/api/admin/newsletter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"send-email",...manualEmail})});const data=await response.json().catch(()=>({})) as {error?:string};setNewsletterBusy(false);if(!response.ok)return setNewsletterStatus(data.error||"Não foi possível enviar.");setManualEmail(current=>({...current,subject:"",message:""}));setNewsletterStatus("E-mail enviado pelo SMTP configurado.");}}><h2>Enviar e-mail individual</h2><label>Assinante<input type="email" list="newsletter-emails" value={manualEmail.email} onChange={event=>setManualEmail(current=>({...current,email:event.target.value}))} required/><datalist id="newsletter-emails">{subscribers.filter(item=>item.status==="active").map(item=><option value={item.email} key={item.id}/>)}</datalist></label><label>Assunto<input value={manualEmail.subject} onChange={event=>setManualEmail(current=>({...current,subject:event.target.value}))} maxLength={120} required/></label><label>Mensagem<textarea rows={8} value={manualEmail.message} onChange={event=>setManualEmail(current=>({...current,message:event.target.value}))} required/></label><button className="primary-button" disabled={newsletterBusy}>Enviar e-mail</button></form>
              </div>
              <section className="panel-card newsletter-campaigns"><header><div><h2>Campanhas</h2><small>Histórico e prévias geradas pela IA</small></div></header>{(campaignPreview?[campaignPreview,...campaigns.filter(item=>item.id!==campaignPreview.id)]:campaigns).map(item=><article key={item.id}><div><b>{item.subject}</b><small>{new Date(item.createdAt).toLocaleString("pt-BR")} · {item.status==="draft"?"Rascunho":item.status==="sent"?"Enviada":item.status==="partial"?"Envio parcial":"Falha"}</small></div><span>{item.sentCount||0} enviados · {item.failedCount||0} falhas</span><button type="button" onClick={()=>setCampaignPreview(item)}>Visualizar</button>{item.status==="draft"?<button className="primary-button" type="button" disabled={newsletterBusy} onClick={async()=>{if(!confirm(`Enviar esta campanha para ${subscribers.filter(subscriber=>subscriber.status==="active").length} assinantes?`))return;setNewsletterBusy(true);setNewsletterStatus("Enviando campanha para os assinantes…");const response=await fetch("/api/admin/newsletter/campaigns",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id})});const data=await response.json().catch(()=>({})) as {error?:string;sent?:number;failed?:number};setNewsletterBusy(false);setNewsletterStatus(response.ok?`Campanha concluída: ${data.sent||0} enviados e ${data.failed||0} falhas.`:data.error||"Não foi possível enviar a campanha.");void loadNewsletter();}}>Enviar campanha</button>:null}</article>)}{!campaigns.length&&!campaignPreview?<p>Nenhuma campanha criada.</p>:null}</section>
              {campaignPreview?<div className="admin-modal newsletter-preview-modal" role="dialog" aria-modal="true"><section><header><div><span className="hero-kicker">Prévia da campanha</span><h2>{campaignPreview.subject}</h2></div><button type="button" onClick={()=>setCampaignPreview(null)}>×</button></header><iframe title={`Prévia: ${campaignPreview.subject}`} srcDoc={campaignPreview.html}/><footer><button className="soft-button" type="button" onClick={()=>setCampaignPreview(null)}>Fechar</button>{campaignPreview.status==="draft"?<button className="primary-button" type="button" disabled={newsletterBusy} onClick={async()=>{if(!confirm("Enviar esta campanha para todos os assinantes ativos?"))return;setNewsletterBusy(true);const response=await fetch("/api/admin/newsletter/campaigns",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:campaignPreview.id})});const data=await response.json().catch(()=>({})) as {error?:string;sent?:number;failed?:number};setNewsletterBusy(false);setNewsletterStatus(response.ok?`Campanha concluída: ${data.sent||0} enviados e ${data.failed||0} falhas.`:data.error||"Não foi possível enviar.");setCampaignPreview(null);void loadNewsletter();}}>Enviar para todos</button>:null}</footer></section></div>:null}
            </section>
          )}
          {section === "usuarios" && (
            <section className="admin-section">
              <div className="admin-section-head"><div><span className="hero-kicker">Acessos</span><h1>Usuários e anunciantes</h1><p>Cadastre anunciantes, edite dados e controle o acesso ao painel administrativo.</p></div><button className="primary-button" type="button" onClick={openNewUser}>+ Cadastrar anunciante</button></div>
              {userFormOpen ? <section ref={userEditorRef} className="panel-card admin-user-editor-card" role="region" aria-labelledby="user-form-title">
                <form onSubmit={saveManagedUser}>
                  <header><div><span className="hero-kicker">Cadastro de acesso</span><h2 id="user-form-title" tabIndex={-1}>{editingUser ? "Editar usuário" : "Novo anunciante"}</h2><p>Preencha os dados da conta e defina as permissões de acesso.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setUserFormOpen(false)}>×</button></header>
                  <div className="admin-user-editor-body">
                    <aside>
                      <label className="admin-profile-upload compact">Foto do perfil<span>{userPhotoPreview || userDraft.profileImageUrl ? <img src={userPhotoPreview || userDraft.profileImageUrl} alt="Prévia da foto do perfil" /> : <i>{userDraft.name ? userDraft.name.slice(0, 2).toUpperCase() : "Foto"}</i>}<b>{userPhotoFile ? "Imagem selecionada" : profileBusy ? "Enviando…" : "Escolher foto"}</b><input type="file" accept="image/jpeg,image/png,image/webp" disabled={profileBusy} onChange={(event) => selectUserProfile(event.target.files?.[0])} /></span></label>
                      <small>Use uma imagem quadrada em JPG, PNG ou WebP. Ela será exibida no perfil do anunciante.</small>
                    </aside>
                    <div className="admin-user-editor-fields">
                      <div className="admin-user-form-grid">
                        <label>Tipo de usuário<select value={userDraft.accountType} onChange={(event) => setUserDraft((current) => ({ ...current, accountType: event.target.value as "particular" | "empresa", taxId: "" }))}><option value="particular">Pessoa física</option><option value="empresa">Pessoa jurídica</option></select></label>
                        <label>{userDraft.accountType === "empresa" ? "CNPJ" : "CPF"}<input value={userDraft.taxId} onChange={(event) => setUserDraft((current) => ({ ...current, taxId: current.accountType === "empresa" ? maskUserCnpj(event.target.value) : maskUserCpf(event.target.value) }))} inputMode="numeric" placeholder={userDraft.accountType === "empresa" ? "00.000.000/0000-00" : "000.000.000-00"} required /></label>
                        <label className="user-name-field">{userDraft.accountType === "empresa" ? "Nome da empresa" : "Nome completo"}<input value={userDraft.name} onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))} maxLength={120} autoComplete="name" required /></label>
                        <label>E-mail<input type="email" value={userDraft.email} onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))} autoComplete="email" required /></label>
                        <label>WhatsApp<input type="tel" value={userDraft.whatsapp} onChange={(event) => setUserDraft((current) => ({ ...current, whatsapp: maskUserPhone(event.target.value) }))} inputMode="tel" autoComplete="tel" placeholder="(31) 99999-9999" required /></label>
                        <label className="user-password-field">Senha<input type="password" value={userDraft.password} onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" minLength={8} required={!editingUser} placeholder={editingUser ? "Deixe vazio para manter a senha atual" : "Mínimo de 8 caracteres"} /><small>{editingUser ? "Preencha somente para alterar a senha." : "A senha será usada no acesso do anunciante."}</small></label>
                        {editingUser?.createdAt ? <label>Data do cadastro<input value={new Date(editingUser.createdAt).toLocaleDateString("pt-BR")} readOnly aria-readonly="true" /></label> : null}
                      </div>
                      <div className="admin-user-access-options">
                        <label className="admin-access-checkbox"><input type="checkbox" checked={userDraft.isAdmin} onChange={(event) => setUserDraft((current) => ({ ...current, isAdmin: event.target.checked }))} /><span><strong>Administrador do site</strong><small>Permitir acesso à dashboard administrativa com este e-mail e senha.</small></span></label>
                        {!editingUser?<label className="admin-access-checkbox"><input type="checkbox" checked={sendUserWelcome} onChange={(event)=>setSendUserWelcome(event.target.checked)} /><span><strong>Enviar e-mail de boas-vindas</strong><small>Envia ao anunciante o link para acessar a conta depois do cadastro.</small></span></label>:null}
                      </div>
                    </div>
                  </div>
                  {userError ? <p className="register-error" role="alert">{userError}</p> : null}
                  <footer><button className="soft-button" type="button" onClick={() => setUserFormOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={userBusy || profileBusy}>{userBusy ? "Salvando…" : editingUser ? "Salvar alterações" : "Cadastrar anunciante"}</button></footer>
                </form>
              </section> : null}
              <div>
                <section className="panel-card admin-users admin-user-manager">
                  <div className="admin-user-list-head"><h2>Usuários cadastrados</h2><label className="admin-user-search">Pesquisar<input value={adminUserQuery} onChange={(event)=>setAdminUserQuery(event.target.value)} placeholder="Nome ou e-mail" /></label><span>{filteredAdminUsers.length} registro{filteredAdminUsers.length === 1 ? "" : "s"}</span></div>
                  {!users.length ? <p>Nenhum usuário cadastrado.</p> : null}
                  {filteredAdminUsers.map((user) => (
                    <article key={user.id}>
                      {user.profileImageUrl ? <img className="admin-user-avatar" src={user.profileImageUrl} alt={`Foto de ${user.name}`} /> : <div className="profile-dot">{user.name.slice(0, 2).toUpperCase()}</div>}
                      <div>
                        <b>{user.name}</b>
                        <span>{user.email}{user.whatsapp ? ` · ${maskUserPhone(user.whatsapp)}` : ""}</span>
                        {user.accountType ? <small>{user.accountType === "empresa" ? "Empresa" : "Particular"} · {user.accountType === "empresa" ? maskUserCnpj(user.taxId || "") : maskUserCpf(user.taxId || "")}{user.createdAt ? ` · Cadastrado em ${new Date(user.createdAt).toLocaleDateString("pt-BR")}` : ""}</small> : <small>Administrador principal do sistema</small>}
                      </div>
                      <em>{user.role}</em>
                      <span className="status-pill">{user.status}</span>
                      <div className="admin-user-row-actions"><button type="button" disabled={user.systemAdmin} title={user.systemAdmin ? "Administrador principal protegido" : "Editar usuário"} onClick={() => openUserEditor(user)}>Editar</button>{!user.systemAdmin?<><button type="button" onClick={()=>{setAdminListingQuery(user.email);setSection("anuncios")}}>Anúncios ({user.activeAds||0})</button><button type="button" onClick={()=>setSection("pagamentos")}>Faturas</button><a href={`/anunciar?adminUserId=${encodeURIComponent(user.id.replace("customer-",""))}`}>+ Anúncio</a></>:null}</div>
                    </article>
                  ))}
                </section>
              </div>
            </section>
          )}
          {section === "lojas" && (
            <section className="admin-section admin-stores-page">
              <div className="admin-section-head"><div><span className="hero-kicker">Acesso lojista</span><h1>Lojas virtuais e vigências</h1><p>Selecione um anunciante, defina período mensal, quantidade de anúncios e libere o painel da loja.</p></div><a className="soft-button" href="/lojista/login" target="_blank">Abrir acesso lojista ↗</a></div>
              <div className="admin-store-layout"><form className="panel-card admin-form" onSubmit={saveStoreAccess}><h2>Incluir ou renovar loja</h2><label>Anunciante<select value={storeDraft.userId} onChange={event=>{const user=users.find(item=>item.id===event.target.value);setStoreDraft(current=>({...current,userId:event.target.value,email:user?.email||current.email}));}} required><option value="">Selecione</option>{users.filter(user=>!user.systemAdmin&&user.accountType).map(user=><option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><label>E-mail de acesso<input type="email" value={storeDraft.email} onChange={event=>setStoreDraft(current=>({...current,email:event.target.value}))} required/></label><label>Plano<select value={storeDraft.planCode} onChange={event=>{const code=event.target.value;setStoreDraft(current=>({...current,planCode:code,adLimit:code==="store-unlimited"?"999999":code==="store-pro"?"200":"50"}));}}><option value="store-free">Loja Essencial</option><option value="store-pro">Loja Profissional</option><option value="store-unlimited">Loja Ilimitada</option></select></label><label>Quantidade de anúncios<input type="number" min="1" max="1000000" value={storeDraft.adLimit} onChange={event=>setStoreDraft(current=>({...current,adLimit:event.target.value}))}/></label><div className="admin-store-dates"><label>Data de início<input type="date" value={storeDraft.planStartedAt} onChange={event=>setStoreDraft(current=>({...current,planStartedAt:event.target.value}))}/></label><label>Data de fim<input type="date" value={storeDraft.planEndsAt} onChange={event=>setStoreDraft(current=>({...current,planEndsAt:event.target.value}))}/></label></div><label className="admin-access-checkbox"><input type="checkbox" checked={storeDraft.active} onChange={event=>setStoreDraft(current=>({...current,active:event.target.checked}))}/><span><strong>Habilitar loja</strong><small>Libera o dashboard e a página pública durante o período.</small></span></label>{storeStatus?<p className="integration-status">{storeStatus}</p>:null}<button className="primary-button" disabled={storeBusy}>{storeBusy?"Salvando…":"Salvar e liberar painel"}</button></form><section className="panel-card admin-store-list"><header><h2>Lojas cadastradas</h2><span>{stores.length} loja{stores.length===1?"":"s"}</span></header>{stores.map(store=><article key={store.id}><div><b>{store.name}</b><span>{store.customerName} · {store.email||store.customerEmail}</span><small>{store.planStartedAt?new Date(store.planStartedAt).toLocaleDateString("pt-BR"):"início imediato"} até {store.planEndsAt?new Date(store.planEndsAt).toLocaleDateString("pt-BR"):"sem data final"} · limite {store.adLimit}</small></div><em className={store.active?"active":"inactive"}>{store.active?"Habilitada":"Desabilitada"}</em><button type="button" onClick={()=>setStoreDraft({userId:String(store.userId),email:store.email||store.customerEmail,planCode:store.planCode,adLimit:String(store.adLimit),planStartedAt:store.planStartedAt?.slice(0,10)||"",planEndsAt:store.planEndsAt?.slice(0,10)||"",active:store.active})}>Editar</button><a href={`/loja/${store.slug}`} target="_blank" rel="noreferrer">Ver loja ↗</a></article>)}{!stores.length?<p>Nenhuma loja configurada.</p>:null}</section></div>
            </section>
          )}
          {section === "categorias" && (
            <section className="admin-section category-manager">
              <div className="admin-section-head">
                <div>
                  <span className="hero-kicker">Estrutura do portal</span>
                  <h1>Categorias e subcategorias</h1>
                  <p>
                    Cadastre categorias mães ou vincule novas categorias filhas.
                  </p>
                </div>
              </div>
              <form
                className="panel-card admin-form category-create-form"
                onSubmit={saveCategory}
              >
                <h2>Adicionar categoria</h2>
                <div className="category-form-grid">
                  <label>
                    Nome
                    <input
                      name="name"
                      required
                      placeholder="Nome da categoria"
                    />
                  </label>
                  <label>
                    Tipo
                    <select name="type" defaultValue="parent">
                      <option value="parent">Categoria mãe</option>
                      <option value="child">Categoria filha</option>
                    </select>
                  </label>
                  <label>
                    Categoria mãe
                    <select name="parent" defaultValue="">
                      <option value="">Selecione para categoria filha</option>
                      {categories.map((item, index) => (
                        <option value={index} key={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ordem no menu
                    <input
                      name="order"
                      type="number"
                      min="0"
                      defaultValue={categories.length}
                    />
                  </label>
                  <label className="checkbox-field">
                    <input name="showInMenu" type="checkbox" defaultChecked />{" "}
                    Exibir no menu do topo
                  </label>
                  <button className="primary-button">Adicionar</button>
                </div>
              </form>
              <div className="category-admin-list">
                {counts.map((category, index) => (
                  <article
                    className="panel-card"
                    key={`${category.name}-${index}`}
                  >
                    {editingCategory === index ? (
                      <form
                        className="category-edit-form"
                        onSubmit={(event) => updateCategory(event, index)}
                      >
                        <label>
                          Nome da categoria mãe
                          <input
                            name="name"
                            defaultValue={category.name}
                            required
                          />
                        </label>
                        <div className="category-menu-options">
                          <label>
                            Ordem no menu
                            <input
                              name="order"
                              type="number"
                              min="0"
                              defaultValue={category.order ?? index}
                            />
                          </label>
                          <label className="checkbox-field">
                            <input
                              name="showInMenu"
                              type="checkbox"
                              defaultChecked={category.showInMenu !== false}
                            />{" "}
                            Exibir no menu do topo
                          </label>
                        </div>
                        <label>
                          Subcategorias — uma por linha
                          <textarea
                            name="subs"
                            defaultValue={category.subs.join("\n")}
                            rows={Math.max(5, category.subs.length + 1)}
                          />
                        </label>
                        <div>
                          <button
                            type="button"
                            className="soft-button"
                            onClick={() => setEditingCategory(null)}
                          >
                            Cancelar
                          </button>
                          <button className="primary-button">
                            Salvar alterações
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <header>
                          <i>{category.icon}</i>
                          <div>
                            <b>{category.name}</b>
                            <span>
                              {category.count} anúncios · {category.subs.length}{" "}
                              subcategorias ·{" "}
                              {category.showInMenu !== false
                                ? `visível no topo · ordem ${category.order ?? index}`
                                : "oculta no topo"}
                            </span>
                          </div>
                          <button onClick={() => setEditingCategory(index)}>
                            Editar
                          </button>
                        </header>
                        <div className="subcategory-list">
                          {category.subs.length ? (
                            category.subs.map((sub) => (
                              <span key={sub}>{sub}</span>
                            ))
                          ) : (
                            <em>Nenhuma subcategoria cadastrada</em>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {section === "noticias" && (
            <section className="admin-section">
              <span className="hero-kicker">Conteúdo editorial</span>
              <h1>Últimas notícias</h1>
              <p>
                Conecte a API REST do WordPress. As dez matérias mais recentes
                serão atualizadas automaticamente a cada duas horas.
              </p>
              <form
                className="panel-card admin-form news-settings"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setNewsBusy(true);
                  try {
                    const response = await fetch("/api/admin/news-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wordpressApi }) });
                    const data = await response.json() as { error?: string; posts?: AdminNewsPost[] };
                    if (!response.ok) throw new Error(data.error || "Não foi possível salvar a API do WordPress.");
                    localStorage.setItem("balcao-wordpress-api", wordpressApi);
                    localStorage.removeItem("balcao-news-cache");
                    if (Array.isArray(data.posts)) setNewsPosts(data.posts);
                    flash(`${data.posts?.length || 0} matérias importadas e publicadas em /noticias.`);
                  } catch (error) {
                    flash(error instanceof Error ? error.message : "Não foi possível salvar a API do WordPress.");
                  } finally {
                    setNewsBusy(false);
                  }
                }}
              >
                <label>
                  URL do WordPress ou endpoint da API
                  <input
                    type="url"
                    value={wordpressApi}
                    onChange={(event) => setWordpressApi(event.target.value)}
                    placeholder="https://seusite.com.br"
                    required
                  />
                </label>
                <button className="primary-button" disabled={newsBusy}>
                  {newsBusy ? "Salvando…" : "Salvar e importar matérias"}
                </button>
              </form>
              {editingNews ? <form className="panel-card admin-form news-editor" onSubmit={async (event) => { event.preventDefault(); setNewsBusy(true); const response = await fetch("/api/admin/news-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ post: editingNews }) }); const data = await response.json().catch(() => ({})) as { error?: string; posts?: AdminNewsPost[] }; setNewsBusy(false); if (!response.ok) return flash(data.error || "Não foi possível salvar a matéria."); if (Array.isArray(data.posts)) setNewsPosts(data.posts); setEditingNews(null); flash("Matéria atualizada."); }}><h2>Editar matéria</h2><label>Título<input value={editingNews.title.replace(/<[^>]+>/g, "")} onChange={(event) => setEditingNews({ ...editingNews, title: event.target.value })} /></label><label>Subtítulo<textarea rows={3} value={editingNews.subtitle} onChange={(event) => setEditingNews({ ...editingNews, subtitle: event.target.value })} /></label><label>Imagem destacada<input type="url" value={editingNews.image} onChange={(event) => setEditingNews({ ...editingNews, image: event.target.value })} /></label><label>Conteúdo HTML<textarea rows={14} value={editingNews.content} onChange={(event) => setEditingNews({ ...editingNews, content: event.target.value })} /></label><div className="integration-actions"><button className="primary-button" disabled={newsBusy}>Salvar matéria</button><button className="soft-button" type="button" onClick={() => setEditingNews(null)}>Cancelar</button></div></form> : null}
              {newsPosts.length ? <div className="panel-card imported-news-list"><header><h2>Matérias importadas</h2><span>{newsPosts.length} matérias</span></header>{newsPosts.map((post) => <article key={post.id}><img src={post.image} alt="" /><div><strong dangerouslySetInnerHTML={{ __html: post.title }} /><small>{post.date ? new Date(post.date).toLocaleDateString("pt-BR") : "Sem data"}</small></div><a href={post.link} target="_blank" rel="noreferrer">Ver matéria</a><button type="button" onClick={() => setEditingNews(post)}>Editar</button></article>)}</div> : null}
            </section>
          )}
          {section === "descubra" && (
            <section className="admin-section discover-manager">
              <span className="hero-kicker">Conteúdo institucional</span>
              <h1>Páginas Descubra</h1>
              <p>Edite as dez imagens exibidas em duas linhas de cinco itens e o conteúdo completo de cada página.</p>
              <div className="discover-admin-grid">
                {discoverPages.slice(0, 10).map((page, index) => <article className="panel-card" key={page.id}>
                  <img src={page.image} alt="" />
                  <label>Título<input value={page.title} onChange={(event) => updateDiscoverPage(index, { title: event.target.value })} /></label>
                  <label>Endereço da página<input value={page.slug} onChange={(event) => updateDiscoverPage(index, { slug: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /></label>
                  <label>Resumo<input value={page.summary} onChange={(event) => updateDiscoverPage(index, { summary: event.target.value })} /></label>
                  <label>Imagem por URL<input value={page.image} onChange={(event) => updateDiscoverPage(index, { image: event.target.value })} /></label>
                  <label>Enviar imagem<input type="file" accept="image/*" onChange={(event) => uploadDiscoverImage(index, event.target.files?.[0])} disabled={discoverBusy === `upload-${index}`} /></label>
                  <label>Texto da página<textarea rows={7} value={page.content} onChange={(event) => updateDiscoverPage(index, { content: event.target.value })} /></label>
                  <div className="discover-admin-actions">
                    <label className="checkbox-field"><input type="checkbox" checked={page.active} onChange={(event) => updateDiscoverPage(index, { active: event.target.checked })} /> Exibir</label>
                    <button type="button" className="soft-button" onClick={() => generateDiscoverText(index)} disabled={discoverBusy === `ai-${index}`}>{discoverBusy === `ai-${index}` ? "Gerando…" : "Gerar texto com IA"}</button>
                  </div>
                </article>)}
              </div>
              <button type="button" className="primary-button discover-save" onClick={saveDiscoverPages}>Salvar as 10 páginas</button>
            </section>
          )}
          {section === "banners" && <BannersManager />}
          {section === "landing-pages" && <LandingPagesManager />}
          {section === "ligacoes" && <CallCampaignsManager users={users.filter((user) => user.id.startsWith("customer-")).map((user) => ({ id: user.id, name: user.name, email: user.email, whatsapp: user.whatsapp }))} />}
          {false && section === "banners" && (
            <section className="admin-section">
              <span className="hero-kicker">Publicidade</span>
              <h1>Banners e publicidade</h1>
              <p>
                Cadastre banners para a página inicial ou para a categoria
                Veículos ou Imóveis.
              </p>
              <div className="admin-two-columns">
                <form className="panel-card admin-form" onSubmit={addBanner}>
                  <h2>Novo banner</h2>
                  <label>
                    Nome
                    <input
                      name="name"
                      required
                      placeholder="Campanha de julho"
                    />
                  </label>
                  <label>
                    Local de exibição
                    <select name="placement" defaultValue="home">
                      <option value="home">Página inicial</option>
                      <option value="vehicle-category">
                        Categoria Veículos — 1.100 × 90
                      </option>
                      <option value="property-category">
                        Categoria Imóveis — 1.100 × 90
                      </option>
                    </select>
                  </label>
                  <label>
                    Tipo
                    <select
                      name="type"
                      value={bannerType}
                      onChange={(event) =>
                        setBannerType(
                          event.target.value as PortalBanner["type"],
                        )
                      }
                    >
                      <option value="image">Imagem</option>
                      <option value="script">Script</option>
                      <option value="adsense">Google AdSense</option>
                    </select>
                  </label>
                  {bannerType === "image" ? (
                    <>
                      <label className="logo-upload">
                        Arquivo da imagem
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () =>
                              setBannerImage(String(reader.result));
                            reader.readAsDataURL(file);
                          }}
                          required={!bannerImage}
                        />
                        <span>
                          {bannerImage ? (
                            <img src={bannerImage} alt="Prévia" />
                          ) : (
                            "Clique para enviar a imagem"
                          )}
                        </span>
                      </label>
                      <label>
                        Link ao clicar
                        <input
                          name="link"
                          placeholder="https://... ou /anuncios"
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      Código do{" "}
                      {bannerType === "adsense" ? "Google AdSense" : "script"}
                      <textarea
                        name="script"
                        placeholder="<script>...</script> ou código completo do anúncio"
                        required
                      />
                    </label>
                  )}
                  <div className="field-grid">
                    <label>
                      Data de início
                      <input name="startDate" type="date" />
                    </label>
                    <label>
                      Data de fim
                      <input name="endDate" type="date" />
                    </label>
                  </div>
                  <button className="primary-button">Salvar banner</button>
                </form>
                <section className="panel-card banner-admin-list">
                  <h2>Banners cadastrados</h2>
                  {banners.map((banner, index) => (
                    <article key={banner.id}>
                      {banner.type === "image" ? (
                        <img src={banner.image} alt="" />
                      ) : (
                        <div className="script-preview">&lt;/&gt;</div>
                      )}
                      <div>
                        <b>{banner.name || `Banner ${index + 1}`}</b>
                        <span>
                          {banner.placement === "vehicle-category" ? "Categoria Veículos · 1.100 × 90" : banner.placement === "property-category" ? "Categoria Imóveis · 1.100 × 90" : "Página inicial"}{" "}
                          ·{" "}
                          {banner.type === "image"
                            ? "Imagem"
                            : banner.type === "adsense"
                              ? "Google AdSense"
                              : "Script"}{" "}
                          · {banner.startDate || "início imediato"} até{" "}
                          {banner.endDate || "sem data final"}
                        </span>
                      </div>
                      <label className="switch-row">
                        <input
                          type="checkbox"
                          checked={banner.active}
                          onChange={() =>
                            saveBanners(
                              banners.map((item) =>
                                item.id === banner.id
                                  ? { ...item, active: !item.active }
                                  : item,
                              ),
                            )
                          }
                        />{" "}
                        Ativo
                      </label>
                      <button
                        className="danger"
                        onClick={() =>
                          saveBanners(
                            banners.filter((item) => item.id !== banner.id),
                          )
                        }
                      >
                        Excluir
                      </button>
                    </article>
                  ))}
                </section>
              </div>
            </section>
          )}
          {section === "seo" && (
            <section className="admin-section seo-admin-section">
              <span className="hero-kicker">Indexação, métricas e cache</span>
              <h1>SEO, Google Analytics e Cloudflare</h1>
              <p>Configurações globais aplicadas automaticamente às páginas públicas, anúncios, vídeos, categorias e lojas.</p>
              <div className="seo-admin-grid">
                <form className="panel-card admin-form seo-main-form" onSubmit={async (event) => {
                  event.preventDefault(); setSeoBusy(true); setSeoStatus("");
                  const response = await fetch("/api/admin/seo-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(seoSettings) });
                  const payload = await response.json().catch(() => ({})) as { error?: string; analyticsConfigured?: boolean; analyticsHint?: string; adsenseConfigured?: boolean; adsenseEnabled?: boolean; adsenseHint?: string; adsenseSlotHint?: string };
                  setSeoBusy(false);
                  if (!response.ok) return setSeoStatus(payload.error || "Não foi possível salvar as configurações de SEO.");
                  setSeoSettings((current) => ({ ...current, analyticsCode: "", adsenseCode: "", adsenseSlot: "", analyticsConfigured: payload.analyticsConfigured === true, analyticsHint: payload.analyticsHint || current.analyticsHint, adsenseConfigured: payload.adsenseConfigured === true, adsenseEnabled: payload.adsenseEnabled === true, adsenseHint: payload.adsenseHint || current.adsenseHint, adsenseSlotHint: payload.adsenseSlotHint || current.adsenseSlotHint }));
                  setSeoStatus("Configurações salvas e aplicadas globalmente no portal.");
                }}>
                  <h2>SEO global</h2>
                  <p className="settings-help">Título, descrição e termos usados como padrão nas páginas que não possuem conteúdo específico.</p>
                  <label>Título padrão do site<input value={seoSettings.siteTitle} maxLength={80} onChange={(event) => setSeoSettings((current) => ({ ...current, siteTitle: event.target.value }))} required /></label>
                  <label>Descrição padrão<textarea rows={4} value={seoSettings.description} maxLength={180} onChange={(event) => setSeoSettings((current) => ({ ...current, description: event.target.value }))} required /><small>{seoSettings.description.length}/180 caracteres</small></label>
                  <label>Palavras-chave separadas por vírgula<textarea rows={3} value={seoSettings.keywords} maxLength={500} onChange={(event) => setSeoSettings((current) => ({ ...current, keywords: event.target.value }))} /></label>
                  <label>Código de verificação do Google Search Console<input value={seoSettings.googleVerification} onChange={(event) => setSeoSettings((current) => ({ ...current, googleVerification: event.target.value }))} placeholder="Conteúdo da meta tag google-site-verification" /></label>
                  <label className="admin-access-checkbox"><input type="checkbox" checked={seoSettings.schemaEnabled} onChange={(event) => setSeoSettings((current) => ({ ...current, schemaEnabled: event.target.checked }))} /><span><strong>Gerar dados estruturados Schema.org</strong><small>Organization, WebSite, SearchAction, Product/Offer, VideoObject, Store e ItemList.</small></span></label>
                  <h2>Google Analytics 4</h2>
                  <p className={`integration-config-state ${seoSettings.analyticsConfigured ? "configured" : "missing"}`}>{seoSettings.analyticsConfigured ? `Google Analytics configurado ${seoSettings.analyticsHint}` : "Google Analytics ainda não configurado"}</p>
                  <label>ID ou script do Google Analytics<textarea rows={6} value={seoSettings.analyticsCode} onChange={(event) => setSeoSettings((current) => ({ ...current, analyticsCode: event.target.value }))} placeholder={seoSettings.analyticsConfigured ? "Cole um novo ID G-XXXXXXXXXX ou script para substituir" : "G-XXXXXXXXXX ou o script completo fornecido pelo Google Analytics"} autoComplete="off" /><small>O painel extrai o ID G- e instala o código oficial do Google em todas as páginas públicas.</small></label>
                  <div className="integration-actions"><button className="primary-button" disabled={seoBusy}>{seoBusy ? "Salvando…" : "Salvar SEO, Analytics e AdSense"}</button>{seoSettings.analyticsConfigured ? <button type="button" className="soft-button" disabled={seoBusy} onClick={async () => { if (!window.confirm("Remover o Google Analytics de todas as páginas?")) return; setSeoBusy(true); const response = await fetch("/api/admin/seo-settings", { method: "DELETE" }); setSeoBusy(false); if (response.ok) { setSeoSettings((current) => ({ ...current, analyticsConfigured: false, analyticsHint: "", analyticsCode: "" })); setSeoStatus("Google Analytics removido das páginas."); } }}>Remover Analytics</button> : null}</div>
                  <h2>Google AdSense</h2>
                  <p className={`integration-config-state ${seoSettings.adsenseConfigured ? "configured" : "missing"}`}>{seoSettings.adsenseConfigured ? `AdSense configurado ${seoSettings.adsenseHint} · bloco ${seoSettings.adsenseSlotHint}` : "Google AdSense ainda não configurado"}</p>
                  <label>Código do Google AdSense<textarea rows={7} value={seoSettings.adsenseCode} onChange={(event) => setSeoSettings((current) => ({ ...current, adsenseCode: event.target.value }))} placeholder={seoSettings.adsenseConfigured ? "Cole um novo código AdSense para substituir" : "Cole o código completo fornecido pelo Google AdSense"} autoComplete="off" /><small>O painel extrai somente o identificador público ca-pub e instala o carregador oficial nas páginas.</small></label>
                  <label>ID do bloco de anúncio responsivo<input inputMode="numeric" value={seoSettings.adsenseSlot} onChange={(event) => setSeoSettings((current) => ({ ...current, adsenseSlot: event.target.value.replace(/\D/g, "") }))} placeholder={seoSettings.adsenseSlotHint || "Ex.: 1234567890"} /><small>Use o valor data-ad-slot do bloco criado no AdSense.</small></label>
                  <label className="admin-access-checkbox"><input type="checkbox" checked={seoSettings.adsenseEnabled} onChange={(event) => setSeoSettings((current) => ({ ...current, adsenseEnabled: event.target.checked }))} /><span><strong>Exibir anúncios do Google AdSense</strong><small>Insere blocos manuais entre as linhas da home, nos lotes de anúncios e na lateral do detalhe. Não insere publicidade após o rodapé.</small></span></label>
                  {seoSettings.adsenseConfigured ? <button type="button" className="soft-button" disabled={seoBusy} onClick={async () => { if (!window.confirm("Remover o Google AdSense de todas as páginas?")) return; setSeoBusy(true); const response = await fetch("/api/admin/seo-settings", { method: "PUT" }); setSeoBusy(false); if (response.ok) { setSeoSettings((current) => ({ ...current, adsenseCode: "", adsenseSlot: "", adsenseConfigured: false, adsenseEnabled: false, adsenseHint: "", adsenseSlotHint: "" })); setSeoStatus("Google AdSense removido das páginas."); } }}>Remover AdSense</button> : null}
                  {seoStatus ? <p className="integration-status" role="status">{seoStatus}</p> : null}
                </form>

                <div className="seo-admin-side">
                  <section className="panel-card seo-index-card">
                    <h2>Indexação do Google</h2>
                    <p>Arquivos gerados automaticamente e atualizados com os anúncios publicados.</p>
                    <a href={seoSettings.sitemapUrl} target="_blank"><span>Mapa do site</span><strong>/sitemap.xml ↗</strong></a>
                    <a href={seoSettings.robotsUrl} target="_blank"><span>Diretrizes dos robôs</span><strong>/robots.txt ↗</strong></a>
                    <ul><li>✓ URLs canônicas</li><li>✓ Open Graph e Twitter Cards</li><li>✓ Metadados específicos por anúncio</li><li>✓ Categorias e subcategorias no sitemap</li><li>✓ Páginas administrativas bloqueadas</li><li>✓ Imagens e vídeos descritos nos schemas</li></ul>
                  </section>

                  <form className="panel-card admin-form" onSubmit={async (event) => { event.preventDefault(); setGoogleSearchBusy(true); setGoogleSearchStatus(""); const response = await fetch("/api/admin/google-search-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentials: googleSearch.credentials, enabled: googleSearch.enabled }) }); const payload = await response.json().catch(() => ({})) as { error?: string; configured?: boolean; credentialHint?: string; enabled?: boolean; lastSubmittedAt?: string }; setGoogleSearchBusy(false); if (!response.ok) return setGoogleSearchStatus(payload.error || "Não foi possível salvar a integração."); setGoogleSearch((current) => ({ ...current, credentials: "", configured: payload.configured === true, credentialHint: payload.credentialHint || current.credentialHint, enabled: payload.enabled === true, lastSubmittedAt: payload.lastSubmittedAt || current.lastSubmittedAt })); setGoogleSearchStatus("Integração do Google Search Console salva."); }}><h2>Google Search Console</h2><p className="settings-help">Envia o sitemap do domínio jornalbalcao.com.br ao Google após a importação das matérias.</p><p className={`integration-config-state ${googleSearch.configured ? "configured" : "missing"}`}>{googleSearch.configured ? googleSearch.credentialHint : "Conta de serviço ainda não configurada"}</p><label>JSON da conta de serviço<textarea rows={7} value={googleSearch.credentials} onChange={(event) => setGoogleSearch((current) => ({ ...current, credentials: event.target.value }))} placeholder={googleSearch.configured ? "Credencial configurada — cole outra para substituir" : "Cole o JSON da conta de serviço do Google Cloud"} autoComplete="off" /></label><label className="admin-access-checkbox"><input type="checkbox" checked={googleSearch.enabled} onChange={(event) => setGoogleSearch((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong>Ativar envio automático ao Google</strong><small>Envia {googleSearch.sitemapUrl} depois de cada importação de notícias.</small></span></label><div className="integration-actions"><button className="primary-button" disabled={googleSearchBusy}>{googleSearchBusy ? "Salvando…" : "Salvar integração"}</button><button className="soft-button" type="button" disabled={googleSearchBusy || (!googleSearch.configured && !googleSearch.credentials.trim())} onClick={async () => { setGoogleSearchBusy(true); setGoogleSearchStatus("Enviando sitemap ao Google…"); const response = await fetch("/api/admin/google-search-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credentials: googleSearch.credentials, enabled: googleSearch.enabled, test: true }) }); const payload = await response.json().catch(() => ({})) as { error?: string; lastSubmittedAt?: string; configured?: boolean }; setGoogleSearchBusy(false); if (!response.ok) return setGoogleSearchStatus(payload.error || "Falha no teste."); setGoogleSearch((current) => ({ ...current, credentials: "", configured: payload.configured === true, lastSubmittedAt: payload.lastSubmittedAt || current.lastSubmittedAt })); setGoogleSearchStatus("Sitemap enviado ao Google com sucesso."); }}>Testar e enviar sitemap</button></div>{googleSearch.lastSubmittedAt ? <small>Último envio: {new Date(googleSearch.lastSubmittedAt).toLocaleString("pt-BR")}</small> : null}{googleSearchStatus ? <p className="integration-status" role="status">{googleSearchStatus}</p> : null}</form>

                  <form className="panel-card admin-form cloudflare-admin-form" onSubmit={async (event) => {
                    event.preventDefault(); setCloudflareBusy(true); setCloudflareStatus("");
                    const response = await fetch("/api/admin/cloudflare-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cloudflareSettings) });
                    const payload = await response.json().catch(() => ({})) as { error?: string; configured?: boolean; tokenHint?: string; zoneId?: string };
                    setCloudflareBusy(false); if (!response.ok) return setCloudflareStatus(payload.error || "Não foi possível salvar a integração Cloudflare.");
                    setCloudflareSettings((current) => ({ ...current, apiToken: "", configured: true, tokenHint: payload.tokenHint || current.tokenHint, zoneId: payload.zoneId || current.zoneId }));
                    setCloudflareStatus("Credenciais salvas. Execute o teste para confirmar a zona e as permissões.");
                  }}>
                    <h2>Cloudflare</h2>
                    <p className="settings-help">Integração segura para validar a zona e sincronizar a camada de cache do domínio.</p>
                    <p className={`integration-config-state ${cloudflareSettings.configured ? "configured" : "missing"}`}>{cloudflareSettings.configured ? `Integração configurada ${cloudflareSettings.tokenHint}` : "Cloudflare ainda não configurada"}</p>
                    <label>API Token<input type="password" value={cloudflareSettings.apiToken} onChange={(event) => setCloudflareSettings((current) => ({ ...current, apiToken: event.target.value }))} placeholder={cloudflareSettings.configured ? "Token configurado — informe outro para substituir" : "Token com Zone Read e Cache Purge"} autoComplete="off" /></label>
                    <label>Zone ID<input value={cloudflareSettings.zoneId} maxLength={32} onChange={(event) => setCloudflareSettings((current) => ({ ...current, zoneId: event.target.value.trim() }))} placeholder="32 caracteres" required /></label>
                    <small className="settings-help">Permissões mínimas recomendadas: Zone Read e Cache Purge para a zona do domínio.</small>
                    {cloudflareSettings.zoneName ? <div className="cloudflare-zone-state"><strong>{cloudflareSettings.zoneName}</strong><span>Zona {cloudflareSettings.zoneStatus || "verificada"}</span>{cloudflareSettings.lastTestAt ? <small>Último teste: {new Date(cloudflareSettings.lastTestAt).toLocaleString("pt-BR")}</small> : null}{cloudflareSettings.lastPurgeAt ? <small>Última sincronização de cache: {new Date(cloudflareSettings.lastPurgeAt).toLocaleString("pt-BR")}</small> : null}</div> : null}
                    <div className="integration-actions">
                      <button className="primary-button" disabled={cloudflareBusy}>{cloudflareBusy ? "Salvando…" : "Salvar Cloudflare"}</button>
                      <button type="button" className="soft-button" disabled={cloudflareBusy || (!cloudflareSettings.apiToken.trim() && !cloudflareSettings.configured)} onClick={async () => {
                        setCloudflareBusy(true); setCloudflareStatus("Validando token, zona e permissões…");
                        const response = await fetch("/api/admin/cloudflare-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cloudflareSettings) });
                        const payload = await response.json().catch(() => ({})) as { error?: string; zoneName?: string; zoneStatus?: string; testedAt?: string };
                        setCloudflareBusy(false); if (!response.ok) return setCloudflareStatus(payload.error || "Falha ao testar a Cloudflare.");
                        setCloudflareSettings((current) => ({ ...current, apiToken: "", configured: true, zoneName: payload.zoneName || current.zoneName, zoneStatus: payload.zoneStatus || current.zoneStatus, lastTestAt: payload.testedAt || current.lastTestAt }));
                        setCloudflareStatus(`Integração validada para ${payload.zoneName || "a zona informada"}.`);
                      }}>Testar integração</button>
                    </div>
                    <button type="button" className="cloudflare-purge-button" disabled={cloudflareBusy || !cloudflareSettings.configured} onClick={async () => {
                      if (!window.confirm("Limpar todo o cache da zona Cloudflare? Os arquivos serão recarregados nos próximos acessos.")) return;
                      setCloudflareBusy(true); setCloudflareStatus("Sincronizando a camada de cache…");
                      const response = await fetch("/api/admin/cloudflare-settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "purge-cache" }) });
                      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; purgedAt?: string };
                      setCloudflareBusy(false); if (!response.ok) return setCloudflareStatus(payload.error || "Falha ao limpar o cache.");
                      setCloudflareSettings((current) => ({ ...current, lastPurgeAt: payload.purgedAt || current.lastPurgeAt })); setCloudflareStatus(payload.message || "Cache sincronizado.");
                    }}>Sincronizar projeto e limpar cache</button>
                    {cloudflareStatus ? <p className="integration-status" role="status">{cloudflareStatus}</p> : null}
                  </form>
                </div>
              </div>
            </section>
          )}
          {section === "configuracoes" && (
            <section className="admin-section">
              <span className="hero-kicker">Personalização</span>
              <h1>Configurações do projeto</h1>
              <div className="admin-two-columns">
                <form className="panel-card admin-form" onSubmit={saveSettings}>
                  <h2>Identidade visual</h2>
                  <label>
                    Nome do portal
                    <input
                      value={siteName}
                      onChange={(event) => setSiteName(event.target.value)}
                    />
                  </label>
                  <label className="logo-upload">
                    Logomarca oficial
                    <span>
                      <img src={logo} alt="Prévia da logo oficial" />
                    </span>
                  </label>
                  <p className="settings-help">
                    Esta é a logomarca permanente utilizada no desktop, no
                    celular, no rodapé e na administração.
                  </p>
                  <label className="logo-upload">
                    Imagem da tela de login
                    <span>
                      <img src={loginImageUrl} alt="Prévia da imagem da tela de login" />
                      <b>{loginImageBusy ? "Enviando imagem…" : "Selecionar nova imagem"}</b>
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={loginImageBusy} onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setLoginImageBusy(true);
                        const form = new FormData(); form.set("file", file);
                        const response = await fetch("/api/uploads", { method: "POST", body: form });
                        const data = await response.json().catch(() => ({})) as { url?: string; error?: string };
                        setLoginImageBusy(false);
                        if (!response.ok || !data.url) return flash(data.error || "Não foi possível enviar a imagem.");
                        setLoginImageUrl(data.url);
                        flash("Imagem enviada. Clique em Salvar configurações para aplicar.");
                      }} />
                    </span>
                  </label>
                  <p className="settings-help">Formatos JPG, PNG ou WebP, com até 5 MB. A imagem será ajustada automaticamente ao espaço lateral da página /entrar.</p>
                  <label className="logo-upload">Imagem do login administrativo<span><img src={adminLoginImageUrl} alt="Prévia do login administrativo" /><b>{loginImageBusy ? "Enviando imagem…" : "Selecionar nova imagem"}</b><input type="file" accept="image/jpeg,image/png,image/webp" disabled={loginImageBusy} onChange={async(event)=>{const file=event.target.files?.[0];if(!file)return;setLoginImageBusy(true);const form=new FormData();form.set("file",file);const response=await fetch("/api/uploads",{method:"POST",body:form});const data=await response.json().catch(()=>({})) as {url?:string;error?:string};setLoginImageBusy(false);if(!response.ok||!data.url)return flash(data.error||"Não foi possível enviar a imagem.");setAdminLoginImageUrl(data.url);flash("Imagem enviada. Clique em Salvar configurações para aplicar.");}} /></span></label>
                  <p className="settings-help">Imagem exibida exclusivamente na lateral da tela /admin/login.</p>
                  <label>
                    Cor principal
                    <input type="color" defaultValue="#ed111a" />
                  </label>
                  <button className="primary-button">
                    Salvar configurações
                  </button>
                </form>
                <form className="panel-card admin-form" onSubmit={async (event) => {
                  event.preventDefault();
                  const configured = mapProvider === "mapbox" ? hasMapboxApi : hasGoogleMapsApi;
                  const credential = mapProvider === "mapbox" ? mapboxAccessToken.trim() : googleMapsApi.trim();
                  if (!credential && !configured) return setGoogleMapsStatus(`Informe ${mapProvider === "mapbox" ? "o token público do Mapbox" : "a chave da API do Google Maps"}.`);
                  setGoogleMapsBusy(true);
                  const response = await fetch("/api/admin/map-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: mapProvider, google_maps_api: googleMapsApi.trim() || undefined, mapbox_access_token: mapboxAccessToken.trim() || undefined }) });
                  const data = await response.json().catch(() => ({})) as { error?: string; googleConfigured?: boolean; mapboxConfigured?: boolean; googleKeyHint?: string; mapboxKeyHint?: string };
                  setGoogleMapsBusy(false); if (!response.ok) return setGoogleMapsStatus(data.error || "Não foi possível salvar a integração de mapas.");
                  setHasGoogleMapsApi(Boolean(data.googleConfigured)); setHasMapboxApi(Boolean(data.mapboxConfigured)); setGoogleMapsKeyHint(data.googleKeyHint || googleMapsKeyHint); setMapboxKeyHint(data.mapboxKeyHint || mapboxKeyHint); setGoogleMapsApi(""); setMapboxAccessToken(""); setGoogleMapsTest(null); window.dispatchEvent(new Event("balcao-maps-updated"));
                  setGoogleMapsStatus(`${mapProvider === "mapbox" ? "Mapbox" : "Google Maps"} salvo e definido como provedor ativo.`);
                }}>
                  <h2>Mapas e endereços</h2>
                  <p className="settings-help">Escolha o provedor usado na pesquisa do cadastro e na exibição do mapa no detalhe do anúncio.</p>
                  <label>Provedor ativo<select value={mapProvider} onChange={(event) => { setMapProvider(event.target.value === "mapbox" ? "mapbox" : "google"); setGoogleMapsStatus(""); setGoogleMapsTest(null); }}><option value="google">Google Maps API</option><option value="mapbox">Mapbox API</option></select></label>
                  {mapProvider === "google" ? <>
                    <p className={`integration-config-state ${hasGoogleMapsApi ? "configured" : "missing"}`}>{hasGoogleMapsApi ? `Google Maps configurado ${googleMapsKeyHint}` : "Google Maps ainda não configurado"}</p>
                    <label>Chave da API do Google Maps<input type="password" value={googleMapsApi} onChange={(event) => setGoogleMapsApi(event.target.value)} placeholder={hasGoogleMapsApi ? "Chave configurada — informe outra para substituir" : "AIza..."} autoComplete="off" /></label>
                    <small className="settings-help">Ative Maps JavaScript API, Places API (New) e Geocoding API e autorize o domínio do portal.</small>
                  </> : <>
                    <p className={`integration-config-state ${hasMapboxApi ? "configured" : "missing"}`}>{hasMapboxApi ? `Mapbox configurado ${mapboxKeyHint}` : "Mapbox ainda não configurado"}</p>
                    <label>Token público do Mapbox<input type="password" value={mapboxAccessToken} onChange={(event) => setMapboxAccessToken(event.target.value)} placeholder={hasMapboxApi ? "Token configurado — informe outro para substituir" : "pk.ey..."} autoComplete="off" /></label>
                    <small className="settings-help">Use um token público iniciado por pk. com acesso aos mapas, estilos e geocodificação.</small>
                  </>}
                  <div className="integration-actions">
                    <button className="primary-button" disabled={googleMapsBusy}>{googleMapsBusy ? "Salvando…" : "Salvar provedor"}</button>
                    <button type="button" className="soft-button" disabled={googleMapsBusy || (!(mapProvider === "mapbox" ? mapboxAccessToken.trim() : googleMapsApi.trim()) && !(mapProvider === "mapbox" ? hasMapboxApi : hasGoogleMapsApi))} onClick={async () => {
                      setGoogleMapsBusy(true); setGoogleMapsStatus(`Testando ${mapProvider === "mapbox" ? "Mapbox" : "Google Maps"}…`); setGoogleMapsTest(null);
                      const response = await fetch("/api/admin/map-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: mapProvider, google_maps_api: googleMapsApi.trim() || undefined, mapbox_access_token: mapboxAccessToken.trim() || undefined }) });
                      const data = await response.json().catch(() => ({})) as Partial<GoogleMapsTestResult> & { googleConfigured?: boolean; mapboxConfigured?: boolean; googleKeyHint?: string; mapboxKeyHint?: string };
                      if (!response.ok) { setGoogleMapsStatus(data.error || "Não foi possível validar a integração."); setGoogleMapsTest(data.services ? data as GoogleMapsTestResult : null); setGoogleMapsBusy(false); return; }
                      setHasGoogleMapsApi(Boolean(data.googleConfigured)); setHasMapboxApi(Boolean(data.mapboxConfigured)); setGoogleMapsKeyHint(data.googleKeyHint || googleMapsKeyHint); setMapboxKeyHint(data.mapboxKeyHint || mapboxKeyHint); setGoogleMapsApi(""); setMapboxAccessToken(""); window.dispatchEvent(new Event("balcao-maps-updated"));
                      const completeTest = mapProvider === "google" ? await testGoogleMapsInBrowser() : data as GoogleMapsTestResult;
                      setGoogleMapsTest(completeTest); setGoogleMapsStatus(completeTest.ok ? `Integração ${mapProvider === "mapbox" ? "Mapbox" : "Google Maps"} validada: busca, coordenadas e mapa operacionais.` : "Teste concluído. Consulte abaixo qual serviço precisa ser ativado ou liberado."); setGoogleMapsBusy(false);
                    }}>Testar integração</button>
                  </div>
                  {googleMapsStatus ? <p className="integration-status" role="status">{googleMapsStatus}</p> : null}
                  {googleMapsTest ? <div className="integration-check-list">{Object.entries(googleMapsTest.services).map(([key, service]) => <p key={key} className={service.ok ? "ok" : "failed"}><b>{service.ok ? "✓" : "×"}</b>{service.message}</p>)}{googleMapsTest.defaultLocation ? <p className="ok"><b>✓</b>Local de teste: {googleMapsTest.defaultLocation.label} ({googleMapsTest.defaultLocation.latitude.toFixed(6)}, {googleMapsTest.defaultLocation.longitude.toFixed(6)})</p> : null}</div> : null}
                </form>
                <form className="panel-card admin-form" onSubmit={async (event) => {
                  event.preventDefault();
                  if (mercadoPago.enabled && (!mercadoPago.accessToken.trim() || !mercadoPago.publicKey.trim()) && !mercadoPago.configured) return flash("Informe o Access Token e a Public Key antes de ativar o Mercado Pago.");
                  if (mercadoPago.enabled && !mercadoPago.pixEnabled && !mercadoPago.cardEnabled) return flash("Ative Pix ou cartão antes de ativar o Mercado Pago.");
                  setMercadoPagoBusy(true); setMercadoPagoStatus("");
                  const response = await fetch("/api/admin/mercadopago-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: mercadoPago.mode, accessToken: mercadoPago.accessToken.trim() || undefined, publicKey: mercadoPago.publicKey.trim() || undefined, enabled: mercadoPago.enabled, pixEnabled: mercadoPago.pixEnabled, cardEnabled: mercadoPago.cardEnabled }) });
                  const data = await response.json().catch(() => ({})) as { error?: string; configured?: boolean; enabled?: boolean; pixEnabled?: boolean; cardEnabled?: boolean; publicKeyHint?: string; mode?: "test" | "production"; testConfigured?: boolean; productionConfigured?: boolean; publicKeyHints?: { test?: string; production?: string } };
                  setMercadoPagoBusy(false);
                  if (!response.ok) return setMercadoPagoStatus(data.error || "Não foi possível salvar o Mercado Pago.");
                  setMercadoPago((current) => ({ ...current, accessToken: "", publicKey: "", configured: data.configured === true, enabled: data.enabled === true, pixEnabled: data.pixEnabled === true, cardEnabled: data.cardEnabled === true, publicKeyHint: data.publicKeyHint || current.publicKeyHint, mode: data.mode === "test" ? "test" : "production", testConfigured: data.testConfigured === true, productionConfigured: data.productionConfigured === true, publicKeyHints: { test: data.publicKeyHints?.test || current.publicKeyHints.test, production: data.publicKeyHints?.production || current.publicKeyHints.production } }));
                  setMercadoPagoStatus(data.enabled ? `Mercado Pago ativado no ambiente de ${data.mode === "test" ? "teste" : "produção"}.` : "Módulo de pagamentos desativado. Os anúncios gratuitos continuam disponíveis.");
                }}>
                  <h2>Mercado Pago</h2>
                  <p className="settings-help">Único módulo de pagamento do portal, com recebimento por Pix e cartão. O Access Token permanece somente no servidor.</p>
                  <p className={`integration-config-state ${mercadoPago.enabled ? "configured" : "missing"}`}>{mercadoPago.enabled ? "Módulo de pagamentos ativo" : "Módulo de pagamentos desativado"}</p>
                  <label>Ambiente do Mercado Pago<select value={mercadoPago.mode} onChange={(event) => { const mode = event.target.value === "test" ? "test" : "production"; setMercadoPago((current) => ({ ...current, mode, accessToken: "", publicKey: "", configured: mode === "test" ? current.testConfigured : current.productionConfigured, publicKeyHint: current.publicKeyHints[mode] })); setMercadoPagoStatus(""); }}><option value="test">Teste — sem cobranças reais</option><option value="production">Produção — pagamentos reais</option></select></label>
                  <p className={`payment-environment-note ${mercadoPago.mode}`}>{mercadoPago.mode === "test" ? "Ambiente de teste selecionado. Use as credenciais de teste antes de validar o fluxo." : "Ambiente de produção selecionado. As cobranças realizadas serão reais."}</p>
                  <label className="admin-access-checkbox"><input type="checkbox" checked={mercadoPago.enabled} onChange={(event) => { setMercadoPago((current) => ({ ...current, enabled: event.target.checked })); setMercadoPagoStatus(""); }} /><span><strong>Ativar pagamentos pelo Mercado Pago</strong><small>Quando desativado, nenhuma cobrança é criada e somente as opções gratuitas ficam disponíveis.</small></span></label>
                  <label>Access Token de {mercadoPago.mode === "test" ? "teste" : "produção"}<input type="password" value={mercadoPago.accessToken} onChange={(event) => setMercadoPago((current) => ({ ...current, accessToken: event.target.value }))} placeholder={mercadoPago.configured ? "Token configurado — informe outro para substituir" : "APP_USR-…"} autoComplete="new-password" /></label>
                  <label>Public Key de {mercadoPago.mode === "test" ? "teste" : "produção"}<input type="password" value={mercadoPago.publicKey} onChange={(event) => setMercadoPago((current) => ({ ...current, publicKey: event.target.value }))} placeholder={mercadoPago.publicKeyHint || "APP_USR-…"} autoComplete="off" /></label>
                  <div className="integration-options">
                    <label><input type="checkbox" checked={mercadoPago.pixEnabled} onChange={(event) => setMercadoPago((current) => ({ ...current, pixEnabled: event.target.checked }))} /> Disponibilizar Pix</label>
                    <label><input type="checkbox" checked={mercadoPago.cardEnabled} onChange={(event) => setMercadoPago((current) => ({ ...current, cardEnabled: event.target.checked }))} /> Disponibilizar cartão</label>
                  </div>
                  <div className="integration-actions">
                    <button className="primary-button" disabled={mercadoPagoBusy}>{mercadoPagoBusy ? "Salvando…" : mercadoPago.enabled ? "Ativar e salvar Mercado Pago" : "Desativar pagamentos"}</button>
                    <button type="button" className="soft-button" disabled={mercadoPagoBusy || (!mercadoPago.configured && !mercadoPago.accessToken.trim())} onClick={async () => { setMercadoPagoBusy(true); setMercadoPagoStatus("Testando conexão…"); const response = await fetch("/api/admin/mercadopago-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: mercadoPago.mode, accessToken: mercadoPago.accessToken.trim() || undefined }) }); const data = await response.json().catch(() => ({})) as { error?: string }; setMercadoPagoStatus(response.ok ? `Integração de ${mercadoPago.mode === "test" ? "teste" : "produção"} validada com sucesso.` : data.error || "Falha ao testar o Mercado Pago."); setMercadoPagoBusy(false); }}>Testar integração</button>
                  </div>
                  {mercadoPagoStatus ? <p className="integration-status" role="status">{mercadoPagoStatus}</p> : null}
                </form>
                {mercadoPago.mode === "test" && mercadoPago.enabled && mercadoPago.configured ? <form className="panel-card admin-form mercado-pago-transaction-test" onSubmit={async (event) => {
                  event.preventDefault();
                  setMercadoPagoTestBusy(true);
                  setMercadoPagoTestResult(null);
                  try {
                    const form = new FormData(event.currentTarget);
                    const amountValue = String(form.get("testAmount") || "").trim();
                    const normalizedAmount = amountValue.includes(",") ? amountValue.replace(/\./g, "").replace(",", ".") : amountValue;
                    const amountCents = Math.round(Number(normalizedAmount) * 100);
                    const card = availableMercadoPagoTestMethod === "card" ? await encryptMercadoPagoCard(form) : {};
                    const response = await fetch("/api/admin/mercadopago-test-payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: availableMercadoPagoTestMethod, amountCents, name: form.get("testPayerName"), email: form.get("testPayerEmail"), taxId: form.get("testPayerTaxId"), ...card }) });
                    const data = await response.json().catch(() => ({})) as { error?: string; status?: string; providerStatus?: string; providerReference?: string; qrCodeText?: string; qrCodeImage?: string; paid?: boolean };
                    setMercadoPagoTestResult(response.ok ? { ok: true, providerReference: data.providerReference, qrCodeText: data.qrCodeText, qrCodeImage: data.qrCodeImage, message: availableMercadoPagoTestMethod === "pix" ? "Pix de teste gerado. O QR Code abaixo pertence ao ambiente sandbox." : data.paid ? "Pagamento de teste aprovado pelo Mercado Pago." : `Pagamento de teste processado com status ${data.providerStatus || data.status || "pendente"}.` } : { ok: false, message: data.error || "Não foi possível processar a cobrança de teste." });
                  } catch (error) {
                    setMercadoPagoTestResult({ ok: false, message: error instanceof Error ? error.message : "Não foi possível processar a cobrança de teste." });
                  }
                  setMercadoPagoTestBusy(false);
                }}>
                  <h2>Testar cobrança transparente</h2>
                  <p className="settings-help">Gere uma cobrança sandbox por Pix ou cartão para validar o fluxo completo. Este formulário só aparece no ambiente de teste.</p>
                  <div className="listing-fields two">
                    <label>Valor do teste<input name="testAmount" inputMode="decimal" defaultValue="1,00" required /></label>
                    <label>Forma de pagamento<select value={availableMercadoPagoTestMethod} onChange={(event) => { setMercadoPagoTestMethod(event.target.value === "card" ? "card" : "pix"); setMercadoPagoTestResult(null); }}><option value="pix" disabled={!mercadoPago.pixEnabled}>Pix</option><option value="card" disabled={!mercadoPago.cardEnabled}>Cartão de crédito</option></select></label>
                    <label>Nome do pagador<input name="testPayerName" required minLength={2} autoComplete="name" /></label>
                    <label>E-mail da conta de teste<input name="testPayerEmail" type="email" defaultValue={adminEmail} required autoComplete="email" /></label>
                    <label className="full">CPF ou CNPJ da conta de teste<input name="testPayerTaxId" inputMode="numeric" required minLength={11} maxLength={18} /></label>
                  </div>
                  {availableMercadoPagoTestMethod === "card" ? <MercadoPagoCardFields /> : <p className="payment-security-note">O QR Code será emitido pelo Mercado Pago no ambiente sandbox e não criará anúncio no portal.</p>}
                  <button className="primary-button" disabled={mercadoPagoTestBusy}>{mercadoPagoTestBusy ? "Processando teste…" : availableMercadoPagoTestMethod === "pix" ? "Gerar Pix de teste" : "Processar cartão de teste"}</button>
                  {mercadoPagoTestResult ? <div className={`mercado-pago-test-result ${mercadoPagoTestResult.ok ? "success" : "error"}`} role="status"><p>{mercadoPagoTestResult.message}</p>{mercadoPagoTestResult.providerReference ? <small>Referência Mercado Pago: {mercadoPagoTestResult.providerReference}</small> : null}{mercadoPagoTestResult.qrCodeImage ? <img src={mercadoPagoTestResult.qrCodeImage} alt="QR Code Pix do ambiente de teste" /> : null}{mercadoPagoTestResult.qrCodeText ? <label>Pix Copia e Cola<textarea value={mercadoPagoTestResult.qrCodeText} readOnly /></label> : null}</div> : null}
                </form> : null}
                <VimeoSettings />
                <form className="panel-card admin-form" onSubmit={async (event) => {
                  event.preventDefault();
                  if (!openAiApiKey.trim() && !hasOpenAiApiKey) return flash("Informe a chave da OpenAI.");
                  setOpenAiBusy(true);
                  const response = await fetch("/api/admin/ai-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ openai_api_key: openAiApiKey.trim() || undefined, ai_chat_enabled: aiChatEnabled, ai_chat_prompt: aiChatPrompt }) });
                  setOpenAiBusy(false);
                  if (!response.ok) return setOpenAiStatus("Não foi possível salvar a integração de IA.");
                  setHasOpenAiApiKey(true); setOpenAiApiKey("");
                  setOpenAiStatus("Integração salva. Modelo GPT-5.2 configurado.");
                }}>
                  <h2>Inteligência artificial</h2>
                  <p className="settings-help">Integração pela API Responses da OpenAI para o atendimento inteligente aos visitantes do site.</p>
                  <label>Modelo<input value="gpt-5.2" readOnly aria-label="Modelo OpenAI configurado" /></label>
                  <label>Chave da API da OpenAI<input type="password" value={openAiApiKey} onChange={(event) => setOpenAiApiKey(event.target.value)} placeholder={hasOpenAiApiKey ? "Chave já configurada — informe outra para substituir" : "sk-..."} autoComplete="off" /></label>
                  <label className="admin-access-checkbox"><input type="checkbox" checked={aiChatEnabled} onChange={(event) => setAiChatEnabled(event.target.checked)} /><span><strong>Ativar atendimento com IA no site</strong><small>Exibe o botão flutuante, consulta anúncios e grava conversas autorizadas.</small></span></label>
                  <label>Instruções do atendente com IA<textarea rows={5} value={aiChatPrompt} onChange={(event) => setAiChatPrompt(event.target.value)} maxLength={4000} placeholder="Ex.: Atenda de forma objetiva, priorize anúncios de Belo Horizonte e oriente o visitante a criar uma conta." /><small>Estas instruções complementam as regras de segurança do atendimento.</small></label>
                  <div className="integration-actions">
                    <button className="primary-button" disabled={openAiBusy}>{openAiBusy ? "Salvando…" : "Salvar integração de IA"}</button>
                    <button type="button" className="soft-button" disabled={openAiBusy || (!openAiApiKey.trim() && !hasOpenAiApiKey)} onClick={async () => {
                      setOpenAiBusy(true); setOpenAiStatus("Testando conexão com a OpenAI…");
                      const response = await fetch("/api/admin/ai-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ openai_api_key: openAiApiKey.trim() || undefined }) });
                      const payload = await response.json().catch(() => ({})) as { error?: string; model?: string };
                      setOpenAiStatus(response.ok ? `Integração validada com ${payload.model || "gpt-5.2"}.` : payload.error || "Falha ao testar a OpenAI."); setOpenAiBusy(false);
                    }}>Testar integração</button>
                  </div>
                  {openAiStatus ? <p className="integration-status" role="status">{openAiStatus}</p> : null}
                  <section className="ai-import-panel">
                    <div className="ai-review-head"><div><strong>Sincronização rápida de anúncios</strong><span>Classifica por título, descrição e categoria, publica em lote e não depende da API da OpenAI.</span></div></div>
                    <label>Link do endereço para importar os anúncios<input type="url" value={listingImportUrl} onChange={(event) => setListingImportUrl(event.target.value)} placeholder="https://exemplo.com/anuncios.json" autoComplete="url" /></label>
                    <div className="integration-actions"><button type="button" className="soft-button" disabled={listingImportBusy || !listingImportUrl.trim()} onClick={() => listingImport.job?.status === "running" ? continueListingImport(listingImport.job.id) : startListingImport()}>{listingImportBusy ? "Sincronizando…" : listingImport.job?.status === "running" ? "Continuar sincronização" : "Importar e publicar"}</button><button type="button" className="primary-button" disabled={listingImportBusy} onClick={synchronizeImportedListings}>Sincronizar anúncios existentes</button></div>
                    <small className="settings-help">Usuário responsável: {listingImport.importUserEmail || "importacao@balcao.com"}</small>
                    {listingImport.job ? <><div className="ai-review-progress"><div><span style={{ width: `${listingImport.job.total ? Math.round(listingImport.job.processed / listingImport.job.total * 100) : 100}%` }} /></div><small>{listingImport.job.processed} de {listingImport.job.total} · {listingImport.job.imported} importados · {listingImport.job.updated} atualizados · {listingImport.job.failed} falhas</small></div><div className="ai-review-log" aria-live="polite">{listingImport.logs.length ? listingImport.logs.map((log) => <article key={`${log.listingId}-${log.createdAt}`} className={log.status === "failed" ? "failed" : ""}><b>{log.title}</b><span>{log.status === "failed" ? "Falha na importação" : `${log.category || ""}${log.subcategory ? ` / ${log.subcategory}` : ""}`}</span><small>{log.message}</small></article>) : <p>O log aparecerá quando a importação começar.</p>}</div></> : <p className="settings-help">Nenhuma importação executada.</p>}
                  </section>
                </form>
                <form className="panel-card admin-form verification-settings-form" onSubmit={async (event) => {
                  event.preventDefault();
                  if (registrationCodeEnabled && !verificationSettings.wapi_token.trim() && !configuredVerification.wapi_token) return setVerificationStatus("Informe o token da W-API antes de ativar o Send Code.");
                  if (registrationCodeEnabled && !verificationSettings.wapi_instance_id.trim()) return setVerificationStatus("Informe o ID da instância da W-API antes de ativar o Send Code.");
                  setVerificationBusy(true); setVerificationStatus("");
                  const response = await fetch("/api/admin/verification-settings", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ...verificationSettings, registration_code_enabled: registrationCodeEnabled }),
                  });
                  const payload = await response.json().catch(() => ({})) as { error?: string };
                  setVerificationBusy(false);
                  if (!response.ok) return setVerificationStatus(payload.error || "Não foi possível salvar a integração Send Code.");
                  setConfiguredVerification((current) => ({
                    ...current,
                    resend_api_key: current.resend_api_key || Boolean(verificationSettings.resend_api_key.trim()),
                    verification_email_from: current.verification_email_from || Boolean(verificationSettings.verification_email_from.trim()),
                    wapi_token: current.wapi_token || Boolean(verificationSettings.wapi_token.trim()),
                  }));
                  setVerificationSettings((current) => ({ ...current, resend_api_key: "", verification_email_from: "", wapi_token: "" }));
                  setVerificationStatus(registrationCodeEnabled ? "Integração salva e geração de códigos ativada." : "Integração salva. A geração de códigos está desativada.");
                }}>
                  <h2>Send Code · W-API</h2>
                  <p className="settings-help">Gera um código aleatório de quatro números no cadastro e envia pelo WhatsApp informado pelo usuário.</p>
                  <label className="admin-access-checkbox">
                    <input type="checkbox" checked={registrationCodeEnabled} onChange={(event) => setRegistrationCodeEnabled(event.target.checked)} />
                    <span><strong>Ativar Send Code</strong><small>Quando desativado, o cadastro é concluído sem solicitar código de ativação.</small></span>
                  </label>
                  <label>Token da W-API<input type="password" value={verificationSettings.wapi_token} onChange={(event) => setVerificationSettings((current) => ({ ...current, wapi_token: event.target.value }))} placeholder={configuredVerification.wapi_token ? "Token configurado — informe outro para substituir" : "Token da instância"} autoComplete="off" /></label>
                  <label>ID da instância W-API<input type="text" value={verificationSettings.wapi_instance_id} onChange={(event) => setVerificationSettings((current) => ({ ...current, wapi_instance_id: event.target.value }))} placeholder="Ex.: T34398-VYR3QD-MS29SL" autoComplete="off" /></label>
                  <label>WhatsApp para teste<input type="tel" value={verificationSettings.wapi_test_whatsapp} onChange={(event) => setVerificationSettings((current) => ({ ...current, wapi_test_whatsapp: maskUserPhone(event.target.value) }))} placeholder="(31) 99999-9999" inputMode="tel" autoComplete="tel" /><small className="settings-help">O botão Testar enviará uma mensagem real para este número.</small></label>
                  <div className="integration-actions">
                    <button className="primary-button" disabled={verificationBusy}>{verificationBusy ? "Salvando…" : "Salvar Send Code"}</button>
                    <button type="button" className="soft-button" disabled={verificationBusy || (!verificationSettings.wapi_token.trim() && !configuredVerification.wapi_token) || !verificationSettings.wapi_instance_id.trim() || !verificationSettings.wapi_test_whatsapp.trim()} onClick={async () => {
                      setVerificationBusy(true); setVerificationStatus("Enviando mensagem de teste pela W-API…");
                      const response = await fetch("/api/admin/verification-settings", {
                        method: "PUT",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ wapi_token: verificationSettings.wapi_token.trim() || undefined, wapi_instance_id: verificationSettings.wapi_instance_id.trim(), wapi_test_whatsapp: verificationSettings.wapi_test_whatsapp }),
                      });
                      const payload = await response.json().catch(() => ({})) as { error?: string };
                      setVerificationStatus(response.ok ? "Teste concluído: a mensagem foi aceita pela W-API." : payload.error || "Falha ao testar a W-API."); setVerificationBusy(false);
                    }}>Testar envio</button>
                  </div>
                  {verificationStatus ? <p className="integration-status" role="status">{verificationStatus}</p> : null}
                  <details className="verification-email-options">
                    <summary>Canal adicional por e-mail (opcional)</summary>
                    <label>Chave da API Resend<input type="password" value={verificationSettings.resend_api_key} onChange={(event) => setVerificationSettings((current) => ({ ...current, resend_api_key: event.target.value }))} placeholder={configuredVerification.resend_api_key ? "Configurada — informe outra para substituir" : "re_..."} autoComplete="off" /></label>
                    <label>Remetente verificado<input type="text" value={verificationSettings.verification_email_from} onChange={(event) => setVerificationSettings((current) => ({ ...current, verification_email_from: event.target.value }))} placeholder={configuredVerification.verification_email_from ? "Configurado — informe outro para substituir" : "Portal Balcão <cadastro@seudominio.com.br>"} autoComplete="off" /></label>
                  </details>
                </form>
                <form
                  className="panel-card admin-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = new FormData(form);
                    if (data.get("password") !== data.get("confirm"))
                      return flash("As senhas precisam ser iguais.");
                    const response = await fetch("/api/admin/password", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ password: data.get("password") }),
                    });
                    const payload = await response.json().catch(() => ({})) as { error?: string };
                    if (!response.ok) return flash(payload.error || "Não foi possível atualizar a senha.");
                    form.reset();
                    location.href = "/admin/login";
                  }}
                >
                  <h2>Segurança administrativa</h2>
                  <label>
                    E-mail do administrador
                    <input value={adminEmail} readOnly />
                  </label>
                  <label>
                    Nova senha
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      required
                    />
                  </label>
                  <label>
                    Confirmar nova senha
                    <input
                      name="confirm"
                      type="password"
                      minLength={8}
                      required
                    />
                  </label>
                  <button className="soft-button">Atualizar senha</button>
                </form>
              </div>
            </section>
          )}
          {section === "paginas" && <PagesManager />}
        </div>
      </section>
      {editing && (
        <div className="admin-modal">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const price = Number(data.get("price"));
              const saved = {
                ...editing,
                title: String(data.get("title")),
                category: String(data.get("category")),
                subcategory: String(data.get("subcategory")),
                negotiationType: String(data.get("negotiationType")),
                location: String(data.get("location")),
                price,
                priceLabel:
                  price > 0
                    ? price.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })
                    : "Valor a combinar",
                description: String(data.get("description")),
                status: String(data.get("status")),
              };
              const response = await fetch(`/api/admin/listings/${encodeURIComponent(editing.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: saved.title, description: saved.description, category: saved.category, subcategory: saved.subcategory, negotiationType: saved.negotiationType, address: saved.location, priceCents: Math.round(price * 100), status: saved.status, images: editing.images?.length ? editing.images : [editing.image] }) });
              if (!response.ok) return flash("Não foi possível salvar o anúncio no banco de dados.");
              setListings([saved, ...listings.filter((item) => item.id !== saved.id)]);
              setEditing(null);
              flash("Anúncio atualizado no banco de dados.");
            }}
          >
            <header>
              <h2>Editar anúncio</h2>
              <button type="button" onClick={() => setEditing(null)}>
                ×
              </button>
            </header>
            <label>
              Título
              <input name="title" defaultValue={editing.title} required />
            </label>
            <div className="field-grid">
              <label>
                Categoria
                <select name="category" defaultValue={editing.category}>
                  {portalCategories.map((item) => (
                    <option key={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>Subcategoria<input name="subcategory" defaultValue={editing.subcategory || "Outros"} required /></label>
              <label>Transação<select name="negotiationType" defaultValue={editing.negotiationType || "Venda"}><option>Compra</option><option>Venda</option><option>Troca</option><option>Aluguel</option><option>Serviço</option><option>Outra</option></select></label>
              <label>Status<select name="status" defaultValue={editing.status || "active"}><option value="active">Publicado</option><option value="pending_review">Pendente</option><option value="rejected">Recusado</option><option value="closed">Retirado</option></select></label>
              <label>
                Preço
                <input
                  name="price"
                  type="number"
                  defaultValue={editing.price}
                />
              </label>
            </div>
            <label>
              Localização
              <input name="location" defaultValue={editing.location} />
            </label>
            <ListingDescriptionEditor value={editing.description} onChange={(description) =>
              setEditing((current) => current ? { ...current, description } : current)
            } />
            <label className="admin-listing-photo-upload">Fotos do anúncio<input type="file" accept="image/*" multiple onChange={async (event) => { const files = Array.from(event.target.files || []).slice(0, 12 - (editing.images?.length || 1)); const urls: string[] = []; for (const file of files) { const body = new FormData(); body.set("file", file); const response = await fetch("/api/uploads", { method: "POST", body }); const data = await response.json() as { url?: string }; if (response.ok && data.url) urls.push(data.url); } if (urls.length) setEditing((current) => current ? { ...current, images: [...(current.images?.length ? current.images : [current.image]), ...urls].slice(0, 12), image: current.images?.[0] || current.image } : current); }} /></label>
            <div className="admin-edit-photo-grid">{(editing.images?.length ? editing.images : [editing.image]).map((image, index) => <article key={`${image}-${index}`}><img src={image} alt="" /><button type="button" onClick={() => setEditing((current) => { if (!current) return current; const next = (current.images?.length ? current.images : [current.image]).filter((_, itemIndex) => itemIndex !== index); return { ...current, images: next, image: next[0] || "/favicon.svg" }; })}>×</button></article>)}</div>
            <footer>
              <button
                type="button"
                className="soft-button"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button className="primary-button">Salvar anúncio</button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
