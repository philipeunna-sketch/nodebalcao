"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortalCategory } from "./categories";
import { MapPlaceSearch } from "./google-place-search";
import VehicleCombobox from "./vehicle-combobox";
import ListingDescriptionEditor from "./listing-description-editor";

export type ListingCoordinates = { lat: number; lng: number };
export type ListingAttributes = Record<string, string | number | boolean>;

export type ListingFormValue = {
  category: string;
  subcategory: string;
  negotiationType: string;
  title: string;
  description: string;
  videoUrl: string;
  price: string;
  rent: string;
  iptu: string;
  condo: string;
  negotiable: boolean;
  address: string;
  coordinates: ListingCoordinates | null;
  attributes: ListingAttributes;
  features: string[];
};

export function emptyListingFormValue(): ListingFormValue {
  return {
    category: "",
    subcategory: "",
    negotiationType: "Venda",
    title: "",
    description: "",
    videoUrl: "",
    price: "",
    rent: "",
    iptu: "",
    condo: "",
    negotiable: false,
    address: "",
    coordinates: null,
    attributes: {},
    features: [],
  };
}

export function listingMoneyToCents(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function formatListingMoney(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  return digits
    ? (Number(digits) / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "";
}

const negotiations = [
  "Compra",
  "Venda",
  "Troca",
  "Aluguel",
  "Temporada",
  "Serviço",
  "Outra",
];

const propertyTypes = [
  "Casa",
  "Apartamento",
  "Cobertura",
  "Lote/Terreno",
  "Sítio",
  "Fazenda",
  "Imóvel rural",
  "Loja",
  "Sala comercial",
  "Galpão",
  "Outro",
];

const propertyFeatures = [
  "Piscina",
  "Varanda",
  "Área gourmet",
  "Elevador",
  "Portaria 24h",
  "Mobiliado",
  "Aceita animais",
  "Ar-condicionado",
  "Armários planejados",
  "Acessibilidade",
];

const vehicleFeatures = [
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

const genericFeatures = [
  "Novo",
  "Usado",
  "Com garantia",
  "Entrega disponível",
  "Nota fiscal",
  "Aceita troca",
  "Único dono",
  "Pronta entrega",
  "Personalizável",
  "Atendimento online",
];

type VehicleItem = { code: string; name: string };
type VehicleType = "carros" | "motos" | "caminhoes" | "utilitarios";

function vehicleType(value: unknown): VehicleType {
  return value === "motos" || value === "caminhoes" || value === "utilitarios"
    ? value
    : "carros";
}

function vehicleTypeFromSubcategory(subcategory: string): VehicleType {
  if (/moto/i.test(subcategory)) return "motos";
  if (/caminh|ônibus|onibus/i.test(subcategory)) return "caminhoes";
  if (/utilit|van/i.test(subcategory)) return "utilitarios";
  return "carros";
}

function SectionTitle({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="listing-section-title">
      <b>{number}</b>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function ListingFormCore({
  mode,
  categories,
  value,
  onChange,
}: {
  mode: "create" | "edit" | "review";
  categories: PortalCategory[];
  value: ListingFormValue;
  onChange: (value: ListingFormValue) => void;
}) {
  const isProperty = value.category === "Imóveis";
  const isVehicle = value.category === "Veículos";
  const selectedCategory = categories.find((item) => item.name === value.category);
  const selectedVehicleType = vehicleType(value.attributes.vehicleType);
  const [brands, setBrands] = useState<VehicleItem[]>([]);
  const [models, setModels] = useState<VehicleItem[]>([]);
  const [mapProvider, setMapProvider] = useState<"google" | "mapbox">("google");

  const featureOptions = useMemo(
    () => [...new Set([...(isProperty ? propertyFeatures : isVehicle ? vehicleFeatures : genericFeatures), ...value.features])],
    [isProperty, isVehicle, value.features],
  );

  const mapSrc = useMemo(
    () => value.coordinates
      ? `/api/maps/embed?lat=${value.coordinates.lat}&lng=${value.coordinates.lng}&label=${encodeURIComponent(value.address || "Local do anúncio")}&editable=1`
      : "",
    [value.address, value.coordinates],
  );

  function patch(next: Partial<ListingFormValue>) {
    onChange({ ...value, ...next });
  }

  function setAttribute(key: string, nextValue: string | number | boolean) {
    patch({ attributes: { ...value.attributes, [key]: nextValue } });
  }

  function changeCategory(category: string) {
    setBrands([]);
    setModels([]);
    onChange({
      ...value,
      category,
      subcategory: "",
      attributes: category === "Veículos" ? { vehicleType: "carros" } : {},
      features: [],
    });
  }

  function toggleFeature(feature: string) {
    patch({
      features: value.features.includes(feature)
        ? value.features.filter((item) => item !== feature)
        : [...value.features, feature],
    });
  }

  useEffect(() => {
    fetch("/api/maps/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setMapProvider(data.provider === "mapbox" ? "mapbox" : "google"))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isVehicle) return;
    const controller = new AbortController();
    const catalogType = selectedVehicleType === "utilitarios" ? "carros" : selectedVehicleType;
    fetch(`/api/fipe?type=${catalogType}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setBrands(Array.isArray(data.brands) ? data.brands : []))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBrands([]);
      });
    return () => controller.abort();
  }, [isVehicle, selectedVehicleType]);

  useEffect(() => {
    const brand = String(value.attributes.brand || "");
    if (!isVehicle || !brand || !brands.length) return;
    const selected = brands.find((item) => item.name === brand);
    if (!selected) return;
    const controller = new AbortController();
    const catalogType = selectedVehicleType === "utilitarios" ? "carros" : selectedVehicleType;
    fetch(`/api/fipe?type=${catalogType}&brand=${encodeURIComponent(selected.code)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setModels(Array.isArray(data.models) ? data.models : []))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setModels([]);
      });
    return () => controller.abort();
  }, [brands, isVehicle, selectedVehicleType, value.attributes.brand]);

  useEffect(() => {
    function receiveMapPosition(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; lat?: unknown; lng?: unknown } | null;
      if (data?.type !== "balcao-map-location") return;
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      patch({ coordinates: { lat, lng } });
    }
    window.addEventListener("message", receiveMapPosition);
    return () => window.removeEventListener("message", receiveMapPosition);
  });

  const hasSpecificSection = isProperty || isVehicle;
  const locationStep = hasSpecificSection ? 3 : 2;
  const contentStep = locationStep + 1;
  const optionsStep = contentStep + 1;

  return (
    <>
      <section className="listing-section">
        <SectionTitle number={1} title="Categoria e negociação" description="Escolha a categoria para carregar todos os campos correspondentes." />
        <div className="listing-fields three">
          <label>
            Categoria principal
            <select value={value.category} onChange={(event) => changeCategory(event.target.value)} required>
              <option value="">Selecione</option>
              {categories.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Subcategoria
            <select value={value.subcategory} onChange={(event) => {
              const subcategory = event.target.value;
              if (value.category === "Veículos") { setBrands([]); setModels([]); }
              patch({
                subcategory,
                ...(value.category === "Veículos" ? { attributes: { ...value.attributes, vehicleType: vehicleTypeFromSubcategory(subcategory), brand: "", model: "" } } : {}),
              });
            }} required disabled={!selectedCategory}>
              <option value="">Selecione</option>
              {selectedCategory?.subs.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Tipo de negociação
            <select value={value.negotiationType} onChange={(event) => patch({ negotiationType: event.target.value })} required>
              {negotiations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </section>

      {isProperty ? (
        <section className="listing-section">
          <SectionTitle number={2} title="Dados do imóvel" description="Informe os dados usados na busca e nos filtros de imóveis." />
          <div className="listing-fields four">
            <label>Tipo do imóvel<select value={String(value.attributes.propertyType || "")} onChange={(event) => setAttribute("propertyType", event.target.value)} required><option value="">Selecione</option>{propertyTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Quartos<select value={String(value.attributes.bedrooms || "")} onChange={(event) => setAttribute("bedrooms", event.target.value)}><option value="">Selecione</option>{["Studio", "1", "2", "3", "4", "5+"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Suítes<select value={String(value.attributes.suites || "")} onChange={(event) => setAttribute("suites", event.target.value)}><option value="">Selecione</option>{["0", "1", "2", "3", "4", "5+"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Banheiros<select value={String(value.attributes.bathrooms || "")} onChange={(event) => setAttribute("bathrooms", event.target.value)}><option value="">Selecione</option>{["1", "2", "3", "4", "5", "6+"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Vagas de garagem<select value={String(value.attributes.parkingSpaces || "")} onChange={(event) => setAttribute("parkingSpaces", event.target.value)}><option value="">Selecione</option>{["0", "1", "2", "3", "4", "5+"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Área útil (m²)<input type="number" min="0" value={String(value.attributes.area || "")} onChange={(event) => setAttribute("area", event.target.value)} /></label>
            <label>Área total (m²)<input type="number" min="0" value={String(value.attributes.totalArea || "")} onChange={(event) => setAttribute("totalArea", event.target.value)} /></label>
            <label>Área construída (m²)<input type="number" min="0" value={String(value.attributes.builtArea || "")} onChange={(event) => setAttribute("builtArea", event.target.value)} /></label>
            <label>Condição<select value={String(value.attributes.condition || "")} onChange={(event) => setAttribute("condition", event.target.value)}><option value="">Selecione</option><option>Novo</option><option>Usado</option><option>Em construção</option></select></label>
          </div>
        </section>
      ) : null}

      {isVehicle ? (
        <section className="listing-section">
          <SectionTitle number={2} title="Dados do veículo" description="A marca atualiza automaticamente a lista de modelos." />
          <div className="listing-fields four">
            <label>Tipo do veículo<select value={selectedVehicleType} onChange={(event) => { setBrands([]); setModels([]); patch({ attributes: { vehicleType: event.target.value, brand: "", model: "" } }); }}><option value="carros">Carro</option><option value="motos">Moto</option><option value="caminhoes">Caminhão</option><option value="utilitarios">Utilitário</option></select></label>
            <VehicleCombobox label="Marca" items={brands} value={String(value.attributes.brand || "")} placeholder="Selecione uma marca" onChange={(brand) => { setModels([]); patch({ attributes: { ...value.attributes, brand, model: "" } }); }} />
            <VehicleCombobox label="Modelo" items={models} value={String(value.attributes.model || "")} placeholder={value.attributes.brand ? "Selecione um modelo" : "Selecione uma marca primeiro"} disabled={!value.attributes.brand} onChange={(model) => setAttribute("model", model)} />
            <label>Versão<input value={String(value.attributes.version || "")} onChange={(event) => setAttribute("version", event.target.value)} maxLength={80} /></label>
            <label>Ano fabricação<input type="number" min="1900" max="2100" value={String(value.attributes.year || "")} onChange={(event) => setAttribute("year", event.target.value)} /></label>
            <label>Ano modelo<input type="number" min="1900" max="2101" value={String(value.attributes.modelYear || "")} onChange={(event) => setAttribute("modelYear", event.target.value)} /></label>
            <label>Quilometragem<input type="number" min="0" value={String(value.attributes.mileage || "")} onChange={(event) => setAttribute("mileage", event.target.value)} /></label>
            <label>Câmbio<select value={String(value.attributes.transmission || "")} onChange={(event) => setAttribute("transmission", event.target.value)}><option value="">Selecione</option><option>Manual</option><option>Automático</option><option>Automatizado</option><option>CVT</option></select></label>
            <label>Combustível<select value={String(value.attributes.fuel || "")} onChange={(event) => setAttribute("fuel", event.target.value)}><option value="">Selecione</option><option>Flex</option><option>Gasolina</option><option>Etanol</option><option>Diesel</option><option>Elétrico</option><option>Híbrido</option><option>GNV</option></select></label>
            <label>Cor<select value={String(value.attributes.color || "")} onChange={(event) => setAttribute("color", event.target.value)}><option value="">Selecione</option>{["Branco", "Preto", "Prata", "Cinza", "Vermelho", "Azul", "Verde", "Amarelo", "Marrom", "Outro"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Portas<select value={String(value.attributes.doors || "")} onChange={(event) => setAttribute("doors", event.target.value)}><option value="">Selecione</option>{["2", "3", "4", "5"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Final da placa<input inputMode="numeric" maxLength={1} pattern="[0-9]?" value={String(value.attributes.plateEnding || "")} onChange={(event) => setAttribute("plateEnding", event.target.value.replace(/\D/g, "").slice(0, 1))} /></label>
            <label>Condição<select value={String(value.attributes.condition || "")} onChange={(event) => setAttribute("condition", event.target.value)}><option value="">Selecione</option><option>Novo</option><option>Seminovo</option><option>Usado</option></select></label>
          </div>
        </section>
      ) : null}

      <section className="listing-section">
        <SectionTitle number={locationStep} title={isProperty ? "Localização do imóvel" : "Endereço e mapa"} description={`Pesquise no ${mapProvider === "mapbox" ? "Mapbox" : "Google Maps"}, confirme o endereço e ajuste o marcador quando necessário.`} />
        <div className="listing-address">
          <label>
            Pesquisar endereço
            <MapPlaceSearch
              initialValue={value.address}
              onSelect={(item) => patch({ address: item.formattedAddress, coordinates: { lat: item.lat, lng: item.lng } })}
            />
          </label>
          {value.address ? <small className="listing-address-selected">{value.address}</small> : null}
          {value.coordinates ? <small className="listing-coordinates">Local selecionado: {value.coordinates.lat.toFixed(6)}, {value.coordinates.lng.toFixed(6)}</small> : null}
          {mapSrc ? (
            <>
              <iframe className="listing-map" title="Mapa ajustável do anúncio" src={mapSrc} loading="lazy" referrerPolicy="same-origin" />
              <small className="listing-map-help">Arraste o marcador ou clique no mapa para ajustar a localização. As coordenadas serão atualizadas automaticamente.</small>
            </>
          ) : <div className="listing-map-placeholder">A prévia do mapa aparecerá após selecionar o endereço.</div>}
        </div>
      </section>

      <section className="listing-section">
        <SectionTitle number={contentStep} title="Conteúdo e valor" description="Use um título claro, descreva o anúncio e informe o valor." />
        <div className="listing-fields two">
          <label className="full">Título do anúncio<input name="title" value={value.title} onChange={(event) => patch({ title: event.target.value })} required minLength={8} maxLength={120} placeholder="Ex.: Apartamento 3 quartos no Buritis" /></label>
          <ListingDescriptionEditor className="full" value={value.description} onChange={(description) => patch({ description })} />
          <label className="full">Link do vídeo (opcional)<input name="videoUrl" type="url" inputMode="url" maxLength={500} value={value.videoUrl} onChange={(event) => patch({ videoUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=... ou https://site.com/video.mp4" /><small>Compatível com YouTube, Vimeo e arquivos MP4/WebM por HTTPS.</small></label>
          {value.negotiationType === "Aluguel" ? <label>Aluguel mensal (R$)<input inputMode="numeric" value={value.rent} onChange={(event) => patch({ rent: formatListingMoney(event.target.value) })} disabled={value.negotiable} placeholder="0,00" /></label> : <label>Valor (R$)<input inputMode="numeric" value={value.price} onChange={(event) => patch({ price: formatListingMoney(event.target.value) })} disabled={value.negotiable} placeholder="0,00" /></label>}
          {isProperty ? <><label>IPTU (R$)<input inputMode="numeric" value={value.iptu} onChange={(event) => patch({ iptu: formatListingMoney(event.target.value) })} placeholder="0,00" /></label><label>Condomínio (R$)<input inputMode="numeric" value={value.condo} onChange={(event) => patch({ condo: formatListingMoney(event.target.value) })} placeholder="0,00" /></label></> : null}
          <label className="check full"><input type="checkbox" checked={value.negotiable} onChange={(event) => patch({ negotiable: event.target.checked })} />Valor a combinar</label>
        </div>
      </section>

      {value.category ? (
        <section className="listing-section">
          <SectionTitle number={optionsStep} title="Opcionais e diferenciais" description="Marque apenas os itens que fazem parte do anúncio." />
          <div className="listing-feature-grid">
            {featureOptions.map((item) => <label key={item}><input type="checkbox" checked={value.features.includes(item)} onChange={() => toggleFeature(item)} />{item}</label>)}
          </div>
        </section>
      ) : null}

      <input type="hidden" name="listingFormMode" value={mode} />
    </>
  );
}
