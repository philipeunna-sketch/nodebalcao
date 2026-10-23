const tags: Record<string, string> = {
  p: "p", div: "p", br: "br", strong: "strong", b: "strong",
  em: "em", i: "em", u: "u", ul: "ul", ol: "ol", li: "li", h3: "h3",
};

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const point = code[1]?.toLowerCase() === "x"
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point)
      : entity;
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Accept only text and the small set of formatting tags offered by the listing editor. */
export function formatListingDescription(value: string) {
  const source = value.replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  if (!/<\/?(?:p|div|br|strong|b|em|i|u|ul|ol|li|h3)\b/i.test(source)) {
    return source.split(/\n\s*\n/).map((paragraph) =>
      `<p>${escapeHtml(decodeEntities(paragraph)).replace(/\n/g, "<br>")}</p>`,
    ).join("");
  }

  const cleaned = source.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const stack: string[] = [];
  let output = "";
  const closeTo = (index: number) => {
    while (stack.length > index) output += `</${stack.pop()}>`;
  };
  for (const token of cleaned.match(/<[^>]*>|[^<]+|</g) || []) {
    if (!token.startsWith("<")) {
      output += escapeHtml(decodeEntities(token)).replace(/\n/g, "<br>");
      continue;
    }
    const match = /^<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>$/i.exec(token);
    if (!match) {
      if (token === "<") output += "&lt;";
      continue;
    }
    const tag = tags[match[2].toLowerCase()];
    if (!tag) continue;
    if (tag === "br") {
      if (!match[1]) output += "<br>";
      continue;
    }
    if (match[1]) {
      const index = stack.lastIndexOf(tag);
      if (index >= 0) closeTo(index);
      continue;
    }
    if (tag === "p" || tag === "h3" || tag === "ul" || tag === "ol") {
      const paragraph = Math.max(stack.lastIndexOf("p"), stack.lastIndexOf("h3"));
      if (paragraph >= 0) closeTo(paragraph);
    }
    if (tag === "li" && !stack.includes("ul") && !stack.includes("ol")) continue;
    output += `<${tag}>`;
    stack.push(tag);
  }
  closeTo(0);
  return output;
}

export function plainListingDescription(value: string) {
  return decodeEntities(formatListingDescription(value)
    .replace(/<br>/g, "\n")
    .replace(/<\/li>/g, "\n")
    .replace(/<\/(?:p|h3)>/g, "\n\n")
    .replace(/<\/(?:ul|ol)>/g, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
