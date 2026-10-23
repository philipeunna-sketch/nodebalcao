"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState } from "react";
import { categoryPath, listingPath } from "../../lib/listing-url";
import {
  CompactCard,
  OptimizedImage,
  PortalFooter,
  PortalHeader,
  useImportedListings,
  VehicleCategoryBanner,
  PropertyCategoryBanner,
} from "../shared";
import { portalCategories } from "../categories";
import { itatiaiaVideoListings } from "../itatiaia-videos";
import VehicleCombobox from "../vehicle-combobox";

const emptyPropertyFilter = {
  transaction: "",
  state: "MG",
  city: "Belo Horizonte",
  type: "",
  minPrice: "",
  maxPrice: "",
  query: "",
  features: [] as string[],
};
const propertyFeatures = [
  "Piscina",
  "Portaria 24 horas",
  "Elevador",
  "Garagem",
  "Área de lazer",
  "Academia",
  "Varanda",
  "Churrasqueira",
  "Condomínio fechado",
  "Aceita pets",
];
const propertyTypes = [
  "Apartamento",
  "Casa",
  "Cobertura",
  "Kitnet",
  "Terreno",
  "Sítio ou chácara",
  "Loja ou sala comercial",
  "Galpão",
  "Imóvel rural",
];
const states = [
  { uf: "MG", name: "Minas Gerais" },
  { uf: "SP", name: "São Paulo" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "ES", name: "Espírito Santo" },
];
const citiesByState: Record<string, string[]> = {
  MG: [
    "Belo Horizonte",
    "Betim",
    "Contagem",
    "Nova Lima",
    "Ribeirão das Neves",
    "Sabará",
  ],
  SP: ["São Paulo", "Campinas", "Santos"],
  RJ: ["Rio de Janeiro", "Niterói", "Petrópolis"],
  ES: ["Vitória", "Vila Velha", "Serra"],
};
const priceOptions = [
  100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 50000, 100000, 250000,
  500000, 1000000,
];
const priceLabel = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const listingState = (location: string) =>
  location
    .match(/\b(MG|SP|RJ|ES|BA|PR|SC|RS|GO|DF|PE|CE)\b/i)?.[1]
    ?.toUpperCase() || "";
const listingCity = (location: string) =>
  location.split(/[,\-]/)[0]?.trim() || "";
const normalizedSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const INITIAL_RESULTS_SIZE = 18;
const MORE_RESULTS_SIZE = 10;

const emptyVehicleFilter = {
  type: "",
  brand: "",
  model: "",
  transmission: "",
  fuel: "",
  yearFrom: "",
  yearTo: "",
  minPrice: "",
  maxPrice: "",
  features: [] as string[],
};
const featureOptions = [
  "Ar-condicionado",
  "Direção hidráulica",
  "Vidros elétricos",
  "Travas elétricas",
  "Airbag",
  "ABS",
  "Câmera de ré",
  "Sensor de estacionamento",
  "Banco de couro",
  "Multimídia",
  "Controle de estabilidade",
  "Único dono",
];
type CatalogBrand = {
  code: string;
  name: string;
  models: { code: string; name: string }[];
};
type VehicleCatalog = Record<"carros" | "motos" | "caminhoes", CatalogBrand[]>;
type VehicleType = "" | "carro" | "moto" | "caminhao" | "utilitario";

const vehicleTypeFromSubcategory = (subcategory: string): VehicleType => {
  if (/moto/i.test(subcategory)) return "moto";
  if (/caminh/i.test(subcategory)) return "caminhao";
  if (/utilit|van/i.test(subcategory)) return "utilitario";
  if (/carro/i.test(subcategory)) return "carro";
  return "";
};

type ResultsPageProps = {
  categoryPage?: boolean;
  initialParams?: {
    search?: string;
    videoOnly?: boolean;
    category?: string;
    subcategory?: string;
  };
};

export default function ResultsPage({
  initialParams = {},
  categoryPage = false,
}: ResultsPageProps) {
  const { items, loading, external } = useImportedListings();
  const initialSearch = initialParams.search || "";
  const initialCategory = initialParams.category || "Todas";
  const initialSubcategory = initialParams.subcategory || "";
  const [search, setSearch] = useState(initialSearch);
  const [videoOnly] = useState(Boolean(initialParams.videoOnly));
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const [sort, setSort] = useState("recentes");
  const [view, setView] = useState<"list" | "grid">(() =>
    initialSearch.trim() ? "list" : "grid",
  );
  const [visibleCount, setVisibleCount] = useState(INITIAL_RESULTS_SIZE);
  const [genericTransaction, setGenericTransaction] = useState("");
  const [genericState, setGenericState] = useState("");
  const [genericCity, setGenericCity] = useState("");
  const [genericMinPrice, setGenericMinPrice] = useState("");
  const [genericMaxPrice, setGenericMaxPrice] = useState("");
  const [propertyDraft, setPropertyDraft] = useState(emptyPropertyFilter);
  const [showMap, setShowMap] = useState(false);
  const [vehicleDraft, setVehicleDraft] = useState(() => ({
    ...emptyVehicleFilter,
    type: vehicleTypeFromSubcategory(initialSubcategory),
  }));
  const [catalog, setCatalog] = useState<VehicleCatalog>({
    carros: [],
    motos: [],
    caminhoes: [],
  });
  const isVehicles =
    /^(autos|veículos|veiculos)$/i.test(category) ||
    /carro|moto|caminh|utilit|ônibus|onibus|barco|aeronave/i.test(subcategory);
  const isProperties =
    /^imóveis|imoveis$/i.test(category) ||
    /apartamento|casa|terreno|imóvel|imovel|temporada/i.test(subcategory);
  const years = Array.from({ length: 37 }, (_, index) => 2026 - index);
  const genericSubcategories = useMemo(() => {
    if (category === "Todas") return [];
    const configured =
      portalCategories.find((item) => item.name === category)?.subs || [];
    return [
      ...new Set([
        ...configured,
        ...items
          .filter((item) => item.category === category)
          .map((item) => item.subcategory || "")
          .filter(Boolean),
      ]),
    ];
  }, [category, items]);
  const genericCities = useMemo(
    () =>
      [
        ...new Set([
          ...(citiesByState[genericState] || []),
          ...items
            .filter(
              (item) =>
                !genericState || listingState(item.location) === genericState,
            )
            .map((item) => listingCity(item.location))
            .filter(Boolean),
        ]),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [genericState, items],
  );
  useEffect(() => {
    Promise.all(
      (["carros", "motos", "caminhoes"] as const).map(async (type) => {
        const response = await fetch(`/api/fipe?type=${type}`);
        if (!response.ok) throw new Error("Catálogo indisponível");
        const data = await response.json();
        return [type, Array.isArray(data.brands) ? data.brands : []] as const;
      }),
    )
      .then((entries) =>
        setCatalog(Object.fromEntries(entries) as VehicleCatalog),
      )
      .catch(() => setCatalog({ carros: [], motos: [], caminhoes: [] }));
  }, []);
  const catalogTypes = useMemo<(keyof VehicleCatalog)[]>(
    () =>
      vehicleDraft.type === "moto"
        ? ["motos"]
        : vehicleDraft.type === "caminhao"
          ? ["caminhoes"]
          : vehicleDraft.type === "carro" || vehicleDraft.type === "utilitario"
            ? ["carros"]
            : ["carros", "motos", "caminhoes"],
    [vehicleDraft.type],
  );
  const brands = useMemo(() => {
    const names = catalogTypes.flatMap((type) =>
      catalog[type as keyof VehicleCatalog].map((brand) => brand.name),
    );
    const listingBrands = items
      .filter(
        (item) =>
          !vehicleDraft.type || item.vehicle?.type === vehicleDraft.type,
      )
      .map((item) => item.vehicle?.brand)
      .filter(Boolean) as string[];
    return [...new Set([...names, ...listingBrands])].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [catalog, catalogTypes, items, vehicleDraft.type]);
  const models = useMemo(() => {
    const normalizedBrand = vehicleDraft.brand.toLocaleLowerCase("pt-BR");
    const catalogModels = catalogTypes
      .flatMap((type) => catalog[type as keyof VehicleCatalog])
      .filter(
        (brand) => brand.name.toLocaleLowerCase("pt-BR") === normalizedBrand,
      )
      .flatMap((brand) => brand.models.map((model) => model.name));
    const listingModels = items
      .filter(
        (item) =>
          (!vehicleDraft.type || item.vehicle?.type === vehicleDraft.type) &&
          item.vehicle?.brand?.toLocaleLowerCase("pt-BR") === normalizedBrand,
      )
      .map((item) => item.vehicle?.model)
      .filter(Boolean) as string[];
    return [...new Set([...catalogModels, ...listingModels])].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [catalog, catalogTypes, items, vehicleDraft.brand, vehicleDraft.type]);
  useEffect(() => {
    if (!vehicleDraft.brand) return;
    const selected = catalogTypes
      .flatMap((type) => catalog[type])
      .find(
        (item) =>
          item.name.toLocaleLowerCase("pt-BR") ===
          vehicleDraft.brand.toLocaleLowerCase("pt-BR"),
      );
    if (!selected || selected.models.length) return;
    const legacyType = catalogTypes.find((type) =>
      catalog[type].some((item) => item.code === selected.code),
    );
    if (!legacyType) return;
    fetch(
      `/api/fipe?type=${legacyType}&brand=${encodeURIComponent(selected.code)}`,
    )
      .then((response) => response.json())
      .then((data) => {
        if (!Array.isArray(data.models)) return;
        setCatalog((current) => ({
          ...current,
          [legacyType]: current[legacyType].map((item) =>
            item.code === selected.code
              ? { ...item, models: data.models }
              : item,
          ),
        }));
      })
      .catch(() => undefined);
  }, [catalog, catalogTypes, vehicleDraft.brand]);
  const moneyNumber = (value: string) =>
    /R\$|,/.test(value)
      ? Number(value.replace(/\D/g, "")) / 100
      : Number(value || 0);
  const toggleFeature = (feature: string) =>
    setVehicleDraft((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  const results = useMemo(() => {
    const sourceItems = videoOnly
      ? [
          ...itatiaiaVideoListings,
          ...items.filter(
            (item) =>
              !itatiaiaVideoListings.some((video) => video.id === item.id) &&
              !item.id.startsWith("video-demo-"),
          ),
        ]
      : items.filter((item) => !item.videoUrl);
    const searchTerms = normalizedSearch(search).split(/\s+/).filter(Boolean);
    const filtered = sourceItems.filter((item) => {
      const searchable = normalizedSearch(
        `${item.title} ${item.description} ${item.category} ${item.subcategory || ""} ${item.location}`,
      );
      return (
        (!videoOnly || Boolean(item.videoUrl)) &&
        (category === "Todas" ||
          item.category === category ||
          (isVehicles && /^(autos|veículos|veiculos)$/i.test(item.category))) &&
        (!subcategory ||
          item.subcategory === subcategory ||
          (isVehicles && Boolean(item.vehicle))) &&
        (isVehicles ||
          isProperties ||
          ((!genericTransaction ||
            item.negotiationType === genericTransaction ||
            item.property?.transaction === genericTransaction) &&
            (!genericState || listingState(item.location) === genericState) &&
            (!genericCity || listingCity(item.location) === genericCity) &&
            (!genericMinPrice || item.price >= Number(genericMinPrice)) &&
            (!genericMaxPrice || item.price <= Number(genericMaxPrice)))) &&
        searchTerms.every((term) => searchable.includes(term)) &&
        (!isVehicles ||
          ((!vehicleDraft.type || item.vehicle?.type === vehicleDraft.type) &&
            (!vehicleDraft.brand ||
              item.vehicle?.brand?.toLocaleLowerCase("pt-BR") ===
                vehicleDraft.brand.toLocaleLowerCase("pt-BR")) &&
            (!vehicleDraft.model ||
              item.vehicle?.model?.toLocaleLowerCase("pt-BR") ===
                vehicleDraft.model.toLocaleLowerCase("pt-BR")) &&
            (!vehicleDraft.transmission ||
              item.vehicle?.transmission === vehicleDraft.transmission) &&
            (!vehicleDraft.fuel || item.vehicle?.fuel === vehicleDraft.fuel) &&
            (!vehicleDraft.yearFrom ||
              (item.vehicle?.year || 0) >= Number(vehicleDraft.yearFrom)) &&
            (!vehicleDraft.yearTo ||
              (item.vehicle?.year || 9999) <= Number(vehicleDraft.yearTo)) &&
            (!vehicleDraft.minPrice ||
              item.price >= moneyNumber(vehicleDraft.minPrice)) &&
            (!vehicleDraft.maxPrice ||
              item.price <= moneyNumber(vehicleDraft.maxPrice)) &&
            vehicleDraft.features.every((feature) =>
              item.vehicle?.features?.includes(feature),
            ))) &&
        (!isProperties ||
          ((!propertyDraft.transaction ||
            item.property?.transaction === propertyDraft.transaction) &&
            (!propertyDraft.state ||
              (item.property?.state || "MG") === propertyDraft.state) &&
            (!propertyDraft.city ||
              (item.property?.city || "Belo Horizonte") ===
                propertyDraft.city) &&
            (!propertyDraft.type ||
              item.property?.type === propertyDraft.type) &&
            (!propertyDraft.minPrice ||
              item.price >= moneyNumber(propertyDraft.minPrice)) &&
            (!propertyDraft.maxPrice ||
              item.price <= moneyNumber(propertyDraft.maxPrice)) &&
            (!propertyDraft.query ||
              `${item.title} ${item.description} ${item.location} ${item.property?.address || ""}`
                .toLocaleLowerCase("pt-BR")
                .includes(propertyDraft.query.toLocaleLowerCase("pt-BR"))) &&
            propertyDraft.features.every((feature) =>
              item.property?.features?.includes(feature),
            )))
      );
    });
    const priority = (item: (typeof filtered)[number]) =>
      /super|ultra/i.test(
        `${item.publicationType || ""} ${item.featuredPlan || ""}`,
      )
        ? 3
        : item.featured ||
            item.publicationType === "featured" ||
            Boolean(item.featuredPlan)
          ? 2
          : item.storeListing
            ? 1
            : 0;
    return [...filtered].sort((a, b) => {
      if (sort === "menor") return a.price - b.price;
      if (sort === "maior") return b.price - a.price;
      const promoted = priority(b) - priority(a);
      return (
        promoted ||
        new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
    });
  }, [
    search,
    category,
    subcategory,
    sort,
    items,
    isVehicles,
    vehicleDraft,
    isProperties,
    propertyDraft,
    genericTransaction,
    genericState,
    genericCity,
    genericMinPrice,
    genericMaxPrice,
    videoOnly,
  ]);
  const categoryVideos = useMemo(() => {
    if (videoOnly || category === "Todas") return [];
    return [...itatiaiaVideoListings, ...items]
      .filter(
        (item, index, source) =>
          source.findIndex((candidate) => candidate.id === item.id) === index,
      )
      .filter(
        (item) =>
          Boolean(item.videoUrl) &&
          item.category === category &&
          (!subcategory || item.subcategory === subcategory),
      );
  }, [items, category, subcategory, videoOnly]);

  const resetVehicles = () => {
    setVehicleDraft({
      ...emptyVehicleFilter,
      type: vehicleTypeFromSubcategory(subcategory),
    });
  };
  const togglePropertyFeature = (feature: string) =>
    setPropertyDraft((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  const resetProperties = () => setPropertyDraft(emptyPropertyFilter);
  useEffect(() => {
    queueMicrotask(() => setVisibleCount(INITIAL_RESULTS_SIZE));
  }, [
    search,
    category,
    subcategory,
    sort,
    view,
    genericTransaction,
    genericState,
    genericCity,
    genericMinPrice,
    genericMaxPrice,
    vehicleDraft,
    propertyDraft,
    videoOnly,
  ]);
  const visibleResults = results.slice(0, visibleCount);

  return (
    <main>
      <PortalHeader />
      <div className="results-shell">
        {!isVehicles && !isProperties && (
          <>
            <div className="breadcrumbs">
              <a href="/">Início</a> › Anúncios
            </div>
            <div className="results-head">
              <div>
                <span className="hero-kicker">
                  {external
                    ? "Anúncios importados e atualizados"
                    : "Encontre perto de você"}
                </span>
                <h1>
                  {videoOnly
                    ? "Anúncios em vídeo"
                    : subcategory ||
                      (category === "Todas" ? "Todos os anúncios" : category)}
                </h1>
                <p aria-live="polite">
                  {loading
                    ? "Carregando anúncios…"
                    : `${results.length} oportunidades encontradas`}
                </p>
              </div>
            </div>
          </>
        )}

        {isVehicles && <VehicleCategoryBanner />}
        {isProperties && <PropertyCategoryBanner />}
        {!isVehicles && !isProperties && category !== "Todas" && (
          <aside
            className="vehicle-category-banner category-top-banner"
            aria-label="Publicidade da categoria"
          >
            <a
              href="https://miartelar.com.br"
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              <OptimizedImage
                src="/banner-miart-lar.jpg"
                alt="Miart Lar Móveis Planejados"
                width="1536"
                height="143"
                loading="lazy"
                decoding="async"
              />
            </a>
          </aside>
        )}

        {isProperties && (
          <form
            className="vehicle-filters property-filters"
            onSubmit={(event) => event.preventDefault()}
          >
            <header>
              <div>
                <span className="vehicle-filter-icon">⌂</span>
                <div>
                  <h2>Filtros especializados de imóveis</h2>
                  <p>
                    Encontre imóveis por negociação, localização, tipo, preço,
                    endereço e diferenciais
                  </p>
                </div>
              </div>
              <button type="button" onClick={resetProperties}>
                ↻ Limpar filtros
              </button>
            </header>
            <fieldset className="vehicle-types">
              <legend>Tipo de negociação</legend>
              {[
                "",
                "Compra",
                "Venda",
                "Troca",
                "Aluguel",
                "Serviço",
                "Temporada",
              ].map((value) => (
                <button
                  type="button"
                  className={
                    propertyDraft.transaction === value ? "active" : ""
                  }
                  onClick={() =>
                    setPropertyDraft({ ...propertyDraft, transaction: value })
                  }
                  key={value || "Todos"}
                >
                  {value || "Todas"}
                </button>
              ))}
            </fieldset>
            <div className="vehicle-fields property-fields">
              <label>
                Estado
                <select
                  value={propertyDraft.state}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      state: event.target.value,
                      city: "",
                    })
                  }
                >
                  {states.map((state) => (
                    <option value={state.uf} key={state.uf}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cidade
                <select
                  value={propertyDraft.city}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      city: event.target.value,
                    })
                  }
                >
                  <option value="">Todas as cidades</option>
                  {(citiesByState[propertyDraft.state] || []).map((city) => (
                    <option key={city}>{city}</option>
                  ))}
                </select>
              </label>
              <label>
                Tipo do imóvel
                <select
                  value={propertyDraft.type}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      type: event.target.value,
                    })
                  }
                >
                  <option value="">Todos os imóveis</option>
                  {propertyTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                Pesquisar
                <input
                  value={propertyDraft.query}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      query: event.target.value,
                    })
                  }
                  placeholder="Palavra-chave ou endereço"
                />
              </label>
              <label>
                Preço mínimo
                <select
                  value={propertyDraft.minPrice}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      minPrice: event.target.value,
                    })
                  }
                >
                  <option value="">Sem mínimo</option>
                  {priceOptions.map((item) => (
                    <option value={item} key={item}>
                      {priceLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preço máximo
                <select
                  value={propertyDraft.maxPrice}
                  onChange={(event) =>
                    setPropertyDraft({
                      ...propertyDraft,
                      maxPrice: event.target.value,
                    })
                  }
                >
                  <option value="">Sem máximo</option>
                  {priceOptions.map((item) => (
                    <option value={item} key={item}>
                      {priceLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="vehicle-features">
              <legend>Diferenciais</legend>
              {propertyFeatures.map((feature) => (
                <label key={feature}>
                  <input
                    type="checkbox"
                    checked={propertyDraft.features.includes(feature)}
                    onChange={() => togglePropertyFeature(feature)}
                  />{" "}
                  {feature}
                </label>
              ))}
            </fieldset>
            <footer>
              <span aria-live="polite">
                {results.length} anúncios encontrados — atualização instantânea
              </span>
            </footer>
          </form>
        )}

        {isVehicles && (
          <form
            className="vehicle-filters"
            onSubmit={(event) => event.preventDefault()}
          >
            <header>
              <div>
                <span className="vehicle-filter-icon">🚗</span>
                <div>
                  <h2>Filtros especializados de veículos</h2>
                  <p>
                    Filtre por tipo, marca, modelo, ano, preço, câmbio e
                    diferenciais
                  </p>
                </div>
              </div>
              <button type="button" onClick={resetVehicles}>
                ↻ Limpar filtros
              </button>
            </header>
            <fieldset className="vehicle-types">
              <legend>Tipo de veículo</legend>
              {[
                ["", "Todos os veículos"],
                ["carro", "Carros"],
                ["moto", "Motos"],
                ["caminhao", "Caminhões"],
                ["utilitario", "Utilitários e vans"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  className={vehicleDraft.type === value ? "active" : ""}
                  onClick={() =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      type: value as VehicleType,
                      brand: "",
                      model: "",
                    })
                  }
                  key={label}
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <div className="vehicle-fields">
              <VehicleCombobox
                label="Marca"
                items={brands.map((name) => ({ code: name, name }))}
                value={vehicleDraft.brand}
                placeholder="Todas as marcas"
                onChange={(value) =>
                  setVehicleDraft({ ...vehicleDraft, brand: value, model: "" })
                }
              />
              <VehicleCombobox
                label="Modelo"
                items={models.map((name) => ({ code: name, name }))}
                value={vehicleDraft.model}
                placeholder={
                  vehicleDraft.brand ? "Todos os modelos" : "Escolha uma marca"
                }
                disabled={!vehicleDraft.brand}
                onChange={(value) =>
                  setVehicleDraft({ ...vehicleDraft, model: value })
                }
              />
              <label>
                Câmbio
                <select
                  value={vehicleDraft.transmission}
                  onChange={(event) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      transmission: event.target.value,
                    })
                  }
                >
                  <option value="">Qualquer câmbio</option>
                  <option>Manual</option>
                  <option>Automático</option>
                  <option>Automatizado</option>
                  <option>CVT</option>
                </select>
              </label>
              <label>
                Combustível
                <select
                  value={vehicleDraft.fuel}
                  onChange={(event) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      fuel: event.target.value,
                    })
                  }
                >
                  <option value="">Qualquer combustível</option>
                  <option>Flex</option>
                  <option>Gasolina</option>
                  <option>Diesel</option>
                  <option>Etanol</option>
                  <option>Elétrico</option>
                  <option>Híbrido</option>
                </select>
              </label>
              <label>
                Ano de
                <select
                  value={vehicleDraft.yearFrom}
                  onChange={(event) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      yearFrom: event.target.value,
                    })
                  }
                >
                  <option value="">Qualquer ano</option>
                  {years.map((year) => (
                    <option key={year}>{year}</option>
                  ))}
                </select>
              </label>
              <label>
                Ano até
                <select
                  value={vehicleDraft.yearTo}
                  onChange={(event) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      yearTo: event.target.value,
                    })
                  }
                >
                  <option value="">Qualquer ano</option>
                  {years.map((year) => (
                    <option key={year}>{year}</option>
                  ))}
                </select>
              </label>
              <label>
                Preço mínimo
                <select
                  value={vehicleDraft.minPrice}
                  onChange={(event) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      minPrice: event.target.value,
                    })
                  }
                >
                  <option value="">Sem mínimo</option>
                  {priceOptions.map((item) => (
                    <option value={item} key={item}>
                      {priceLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preço máximo
                <select
                  value={vehicleDraft.maxPrice}
                  onChange={(event) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      maxPrice: event.target.value,
                    })
                  }
                >
                  <option value="">Sem máximo</option>
                  {priceOptions.map((item) => (
                    <option value={item} key={item}>
                      {priceLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="vehicle-features">
              <legend>Diferenciais</legend>
              {featureOptions.map((feature) => (
                <label key={feature}>
                  <input
                    type="checkbox"
                    checked={vehicleDraft.features.includes(feature)}
                    onChange={() => toggleFeature(feature)}
                  />{" "}
                  {feature}
                </label>
              ))}
            </fieldset>
            <footer>
              <span aria-live="polite">
                {results.length} anúncios encontrados — atualização instantânea
              </span>
            </footer>
          </form>
        )}

        <div className="vehicle-results-toolbar">
          <span aria-live="polite">
            {loading
              ? "Carregando anúncios…"
              : `${results.length} anúncios encontrados`}
          </span>
          <div className="results-controls">
            <select
              aria-label="Ordenar resultados"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recentes">Mais recentes</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
            </select>
            <div className="view-toggle" aria-label="Modo de visualização">
              {isProperties && (
                <button
                  type="button"
                  aria-pressed={showMap}
                  className={showMap ? "active" : ""}
                  onClick={() => setShowMap(!showMap)}
                >
                  ⌖ Mapa
                </button>
              )}
              <button
                type="button"
                aria-pressed={view === "list"}
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                ☷ Lista
              </button>
              <button
                type="button"
                aria-pressed={view === "grid"}
                className={view === "grid" ? "active" : ""}
                onClick={() => setView("grid")}
              >
                ▦ Grade
              </button>
            </div>
          </div>
        </div>

        {categoryVideos.length ? (
          <section
            className="category-video-section"
            aria-labelledby="category-video-title"
          >
            <header>
              <span>Conteúdo audiovisual</span>
              <h2 id="category-video-title">Anúncios em vídeo</h2>
            </header>
            <div className="category-video-rail">
              {categoryVideos.map((video) => (
                <a
                  className="category-video-card"
                  href={video.url || listingPath(video.slug || "")}
                  key={video.id}
                >
                  <div>
                    <OptimizedImage
                      src={video.image}
                      width="480"
                      height="270"
                      alt={`Capa do vídeo ${video.title}`}
                      loading="lazy"
                      decoding="async"
                    />
                    <i aria-hidden="true">▶</i>
                  </div>
                  <small>{video.subcategory || video.category}</small>
                  <h3>{video.title}</h3>
                  <p>{video.description}</p>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <div
          className={`results-layout ${isVehicles || isProperties ? "vehicles-layout" : ""}`}
        >
          {!isVehicles && !isProperties && (
            <aside className="filters">
              <h2>Filtrar anúncios</h2>
              <label>
                Buscar
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    if (event.target.value.trim()) setView("list");
                  }}
                  placeholder="Título ou cidade"
                />
              </label>
              <label>
                Categoria
                <select
                  value={category}
                  onChange={(event) => {
                    if (categoryPage) {
                      window.location.assign(
                        event.target.value === "Todas"
                          ? "/anuncios"
                          : categoryPath(event.target.value),
                      );
                      return;
                    }
                    setCategory(event.target.value);
                    setSubcategory("");
                  }}
                >
                  <option>Todas</option>
                  {[...new Set([
                    initialCategory,
                    ...portalCategories.map((item) => item.name),
                    ...items.map((item) => item.category),
                  ])].filter((item) => item !== "Todas").map(
                    (item) => (
                      <option key={item}>{item}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Subcategoria
                <select
                  value={subcategory}
                  disabled={
                    category === "Todas" || !genericSubcategories.length
                  }
                  onChange={(event) => setSubcategory(event.target.value)}
                >
                  <option value="">Todas as subcategorias</option>
                  {genericSubcategories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Transação
                <select
                  value={genericTransaction}
                  onChange={(event) =>
                    setGenericTransaction(event.target.value)
                  }
                >
                  <option value="">Todas</option>
                  <option>Compra</option>
                  <option>Venda</option>
                  <option>Troca</option>
                  <option>Serviço</option>
                  <option>Aluguel</option>
                </select>
              </label>
              <label>
                Estado
                <select
                  value={genericState}
                  onChange={(event) => {
                    setGenericState(event.target.value);
                    setGenericCity("");
                  }}
                >
                  <option value="">Todos os estados</option>
                  {states.map((item) => (
                    <option value={item.uf} key={item.uf}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cidade
                <select
                  value={genericCity}
                  disabled={!genericState}
                  onChange={(event) => setGenericCity(event.target.value)}
                >
                  <option value="">Todas as cidades</option>
                  {genericCities.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Preço mínimo
                <select
                  value={genericMinPrice}
                  onChange={(event) => setGenericMinPrice(event.target.value)}
                >
                  <option value="">Sem mínimo</option>
                  {priceOptions.map((item) => (
                    <option value={item} key={item}>
                      {priceLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preço máximo
                <select
                  value={genericMaxPrice}
                  onChange={(event) => setGenericMaxPrice(event.target.value)}
                >
                  <option value="">Sem máximo</option>
                  {priceOptions.map((item) => (
                    <option value={item} key={item}>
                      {priceLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  setSearch("");
                  if (categoryPage) {
                    window.location.assign("/anuncios");
                    return;
                  }
                  setCategory("Todas");
                  setSubcategory("");
                  setGenericTransaction("");
                  setGenericState("");
                  setGenericCity("");
                  setGenericMinPrice("");
                  setGenericMaxPrice("");
                }}
              >
                Limpar filtros
              </button>
            </aside>
          )}
          {isProperties && showMap && (
            <section className="property-map">
              <iframe
                title="Mapa dos anúncios de imóveis em Belo Horizonte"
                loading="lazy"
                referrerPolicy="same-origin"
                src="/api/maps/embed?lat=-19.9166813&lng=-43.9344931&label=Belo%20Horizonte%2C%20MG"
                allowFullScreen
              />
              <div className="property-map-list">
                <h2>Anúncios por endereço</h2>
                {results.map((item) => (
                  <a href={item.url || listingPath(item.slug || "")} key={item.id}>
                    <b>{item.title}</b>
                    <span>{item.property?.address || item.location}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {!showMap && (
            <section
              className={`results-grid ${isVehicles || isProperties ? "vehicle-results" : "generic-results"} ${view === "list" ? "list-view" : "grid-view"}`}
            >
              {results.length ? (
                visibleResults.map((item) => (
                  <CompactCard item={item} key={item.id} />
                ))
              ) : (
                <div className="empty-state">
                  <span>⌕</span>
                  <h2>Nenhum anúncio encontrado</h2>
                  <p>Tente remover alguns filtros ou buscar por outro termo.</p>
                </div>
              )}
            </section>
          )}
          {!showMap && visibleCount < results.length ? (
            <button
              className="results-load-more"
              type="button"
              onClick={() =>
                setVisibleCount((current) =>
                  Math.min(current + MORE_RESULTS_SIZE, results.length),
                )
              }
            >
              Carregar mais 10 anúncios
            </button>
          ) : null}
        </div>
      </div>
      <PortalFooter />
    </main>
  );
}
