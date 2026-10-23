import assert from "node:assert/strict";
import test from "node:test";
import { formatListingDescription, plainListingDescription } from "../lib/listing-description.ts";

test("existing descriptions keep paragraphs and line breaks", () => {
  const text = "Primeiro parágrafo.\nSegunda linha.\n\nOutro parágrafo.";
  assert.equal(formatListingDescription(text),
    "<p>Primeiro parágrafo.<br>Segunda linha.</p><p>Outro parágrafo.</p>");
  assert.equal(plainListingDescription(text), text);
});

test("editor formatting survives without unsafe attributes or content", () => {
  const html = '<div>Casa <b onclick="alert(1)">ampla</b></div><ul><li>Garagem</li><li><em>Jardim</em></li></ul><script>alert(1)</script>';
  assert.equal(formatListingDescription(html),
    "<p>Casa <strong>ampla</strong></p><ul><li>Garagem</li><li><em>Jardim</em></li></ul>");
  assert.equal(plainListingDescription(html), "Casa ampla\n\nGaragem\nJardim");
});

test("text that looks like HTML stays text", () => {
  assert.equal(formatListingDescription("Motor < 1.0 & ótimo"), "<p>Motor &lt; 1.0 &amp; ótimo</p>");
  assert.equal(formatListingDescription('<p><img src=x onerror="alert(1)">Seguro</p>'), "<p>Seguro</p>");
});
