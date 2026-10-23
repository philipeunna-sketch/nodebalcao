"use client";

type MercadoPagoCardToken = { id?: string };
type MercadoPagoPaymentMethod = {
  id: string;
  issuer?: { id?: string | number };
};

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => {
      createCardToken: (
        input: Record<string, string>,
      ) => Promise<MercadoPagoCardToken>;
      getPaymentMethods: (input: {
        bin: string;
      }) => Promise<{ results?: MercadoPagoPaymentMethod[] }>;
    };
  }
}

let sdkPromise: Promise<void> | null = null;

function digits(value: FormDataEntryValue | null) {
  return String(value || "").replace(/\D/g, "");
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-mercadopago-sdk="true"]',
    );
    const script = existing || document.createElement("script");
    script.dataset.mercadopagoSdk = "true";
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.addEventListener(
      "load",
      () =>
        window.MercadoPago
          ? resolve()
          : reject(new Error("SDK do Mercado Pago indisponível.")),
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error("Não foi possível carregar o Mercado Pago.")),
      { once: true },
    );
    if (!existing) document.head.appendChild(script);
  });

  return sdkPromise;
}

export async function encryptMercadoPagoCard(form: FormData) {
  const holder = String(form.get("cardHolder") || "").trim();
  const number = digits(form.get("cardNumber"));
  const expMonth = digits(form.get("cardExpMonth"));
  const expYear = digits(form.get("cardExpYear"));
  const securityCode = digits(form.get("cardSecurityCode"));
  const taxId = digits(form.get("cardTaxId"));
  const installments = Number(form.get("cardInstallments") || 1);

  if (
    holder.length < 3 ||
    number.length < 13 ||
    number.length > 19 ||
    !/^(0?[1-9]|1[0-2])$/.test(expMonth) ||
    expYear.length !== 4 ||
    securityCode.length < 3 ||
    ![11, 14].includes(taxId.length) ||
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > 3
  ) {
    throw new Error(
      "Confira o nome, número, validade, código de segurança e CPF ou CNPJ do titular.",
    );
  }

  const response = await fetch("/api/payments/mercadopago/public-key", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => ({}))) as {
    publicKey?: string;
    error?: string;
  };
  if (!response.ok || !data.publicKey) {
    throw new Error(
      data.error || "Não foi possível iniciar o pagamento com cartão.",
    );
  }

  await loadMercadoPagoSdk();
  if (!window.MercadoPago) {
    throw new Error("SDK do Mercado Pago indisponível.");
  }

  const sdk = new window.MercadoPago(data.publicKey, { locale: "pt-BR" });
  const methods = await sdk.getPaymentMethods({ bin: number.slice(0, 6) });
  const method = methods.results?.[0];
  if (!method?.id) throw new Error("Bandeira do cartão não identificada.");

  const token = await sdk.createCardToken({
    cardNumber: number,
    cardholderName: holder,
    cardExpirationMonth: expMonth.padStart(2, "0"),
    cardExpirationYear: expYear,
    securityCode,
    identificationType: taxId.length === 14 ? "CNPJ" : "CPF",
    identificationNumber: taxId,
  });
  if (!token.id) {
    throw new Error(
      "Os dados do cartão não foram aceitos pelo Mercado Pago.",
    );
  }

  return {
    encryptedCard: token.id,
    cardHolderName: holder,
    cardInstallments: installments,
    mpPaymentMethodId: method.id,
    mpIssuerId: method.issuer?.id ? String(method.issuer.id) : undefined,
  };
}

export function MercadoPagoCardFields() {
  return (
    <div className="inline-card-fields">
      <div className="listing-fields two">
        <label className="full">
          Nome impresso no cartão
          <input
            name="cardHolder"
            autoComplete="cc-name"
            required
            placeholder="Nome completo"
          />
        </label>
        <label className="full">
          Número do cartão
          <input
            name="cardNumber"
            inputMode="numeric"
            autoComplete="cc-number"
            required
            maxLength={23}
            onInput={(event) => {
              const input = event.currentTarget;
              input.value = input.value
                .replace(/\D/g, "")
                .slice(0, 19)
                .replace(/(.{4})/g, "$1 ")
                .trim();
            }}
            placeholder="0000 0000 0000 0000"
          />
        </label>
        <label>
          Mês
          <input
            name="cardExpMonth"
            inputMode="numeric"
            autoComplete="cc-exp-month"
            required
            maxLength={2}
            placeholder="MM"
          />
        </label>
        <label>
          Ano
          <input
            name="cardExpYear"
            inputMode="numeric"
            autoComplete="cc-exp-year"
            required
            maxLength={4}
            placeholder="AAAA"
          />
        </label>
        <label>
          CVV
          <input
            name="cardSecurityCode"
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            required
            maxLength={4}
            placeholder="CVV"
          />
        </label>
        <label>
          Parcelamento
          <select name="cardInstallments" defaultValue="1">
            <option value="1">1x sem juros</option>
            <option value="2">2x</option>
            <option value="3">3x</option>
          </select>
        </label>
        <label className="full">
          CPF ou CNPJ do titular
          <input
            name="cardTaxId"
            inputMode="numeric"
            required
            minLength={11}
            maxLength={18}
            placeholder="Somente números"
          />
        </label>
      </div>
      <p className="card-privacy-note">
        Os dados são tokenizados pelo Mercado Pago. O Portal Balcão não armazena
        o número completo do cartão nem o CVV.
      </p>
    </div>
  );
}
