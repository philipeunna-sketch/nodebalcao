import assert from "node:assert/strict";
import test from "node:test";
import { categoryPath, legacyListingIdFromSegment, listingPath, listingTitleSlug } from "../lib/listing-url.ts";

test("public listing URLs contain only a title-derived slug", () => {
  const slug = listingTitleSlug("Casa à Venda – Bairro São Pedro / Belo Horizonte");
  assert.equal(slug, "casa-a-venda-bairro-sao-pedro-belo-horizonte");
  assert.equal(listingPath(slug), "/anuncio/casa-a-venda-bairro-sao-pedro-belo-horizonte");
  assert.equal(categoryPath("Imóveis"), "/categoria/imoveis");
  assert.equal(categoryPath("Imóveis", "Casas e apartamentos"), "/categoria/imoveis/casas-e-apartamentos");
});

test("legacy URL segments identify the original record for a 301", () => {
  assert.equal(legacyListingIdFromSegment("apartamento-buritis--id-784"), "784");
  assert.equal(legacyListingIdFromSegment("apartamento-buritis-784"), "784");
  assert.equal(legacyListingIdFromSegment("784"), "784");
  assert.equal(legacyListingIdFromSegment("apartamento-buritis-2"), "2");
});
