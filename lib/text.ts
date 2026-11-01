const EM_DASH = /\s*\u2014\s*/g;
const NUMBER_RANGE = /(\d)\s*\u2013\s*(\d)/g;
const WORD_RANGE = /\s*\u2013\s*/g;

/**
 * Text for display without long dashes. A long dash between words becomes a
 * comma, one between numbers becomes a hyphen, and one between words in a range
 * becomes "to". Quotes copied word for word from a provider's page (they start
 * with a curly quote) are left as they are.
 */
export function withoutLongDashes(text: string): string {
  if (text.startsWith("“")) return text;
  return text.replace(EM_DASH, ", ").replace(NUMBER_RANGE, "$1-$2").replace(WORD_RANGE, " to ");
}

/** The same, for every string in a saved guide or card. */
export function withoutLongDashesDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item) => (typeof item === "string" ? withoutLongDashes(item) : item));
}

/** A page title without the site name tacked on: "Installing with OAuth | Slack Developer Docs" reads "Installing with OAuth". */
export function pageTitle(title: string): string {
  const trimmed = title.replace(/\s+[\u2014\u2013|·]\s+[^\u2014\u2013|·]+$/, "").trim();
  return withoutLongDashes(trimmed || title);
}
