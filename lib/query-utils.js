function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compactTerms(terms) {
  const stopwords = new Set([
    "and",
    "or",
    "the",
    "for",
    "with",
    "stock",
    "shares",
    "inc",
    "corp",
    "company",
    "price",
    "prices",
    "news",
    "latest",
    "headlines",
    "today",
    "новости",
    "новость",
    "сегодня",
    "срочно",
    "главное"
  ]);

  return [
    ...new Set(
      terms
        .map((term) => cleanText(term).toLowerCase())
        .filter((term) => term.length > 2 && !stopwords.has(term))
    )
  ];
}

export function splitSearchTerms(value) {
  return String(value || "").split(/[^\p{L}\p{N}$.-]+/u);
}

export function matchesNewsTerm(value, term) {
  if (/^[a-z0-9.-]+$/i.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(value);
  }
  return value.includes(term);
}
