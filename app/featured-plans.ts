export type FeaturedPlanCode = "monthly" | "quarterly" | "semiannual";

export type FeaturedPlan = {
  code: FeaturedPlanCode;
  label: string;
  durationLabel: string;
  durationDays: number;
  amountCents: number;
};

const categoryPrices = {
  property: { monthly: 4_990, quarterly: 9_990, semiannual: 24_990 },
  vehicle: { monthly: 2_990, quarterly: 6_990, semiannual: 14_990 },
  general: { monthly: 1_990, quarterly: 4_990, semiannual: 9_990 },
} as const;

function normalizedLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function isToysCategory(category: string, subcategory: string) {
  return normalizedLabel(category) === "bebes e criancas" &&
    normalizedLabel(subcategory) === "brinquedos";
}

export const featuredBenefits = [
  "Destaque na home do site",
  "Tag diferenciada",
  "Prioridade na busca e na pesquisa de anúncios",
  "Prioridade na exibição da categoria",
];

export function getFeaturedPlans(category: string, subcategory = ""): FeaturedPlan[] {
  const prices = category === "Imóveis"
    ? categoryPrices.property
    : category === "Veículos"
      ? categoryPrices.vehicle
      : categoryPrices.general;
  const monthlyAmount = isToysCategory(category, subcategory)
    ? 199
    : prices.monthly;

  return [
    { code: "monthly", label: "Mensal", durationLabel: "Duração de 30 dias", durationDays: 30, amountCents: monthlyAmount },
    { code: "quarterly", label: "Trimestral", durationLabel: "Duração de 90 dias", durationDays: 90, amountCents: prices.quarterly },
    { code: "semiannual", label: "Semestral", durationLabel: "Duração de 180 dias", durationDays: 180, amountCents: prices.semiannual },
  ];
}

export function getFeaturedPlan(category: string, code: string, subcategory = "") {
  return getFeaturedPlans(category, subcategory).find((plan) => plan.code === code);
}

export function formatPlanPrice(amountCents: number) {
  return (amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
