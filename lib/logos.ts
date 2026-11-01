/**
 * Guides with a full-colour logo in public/logos/<id>.svg. Any other guide
 * uses the letter tile.
 *
 * The files come from gilbarbara/logos (CC0). Stripe and HubSpot are built from
 * their simple-icons (CC0) marks, because that set only has their wordmarks.
 * The logos themselves remain trademarks of their owners.
 */
const LOGOS = new Set(["github", "gmail", "google", "hubspot", "linear", "notion", "salesforce", "slack", "stripe", "zoom"]);

/** Single-colour dark marks that vanish on a dark card, so they're shown light there. */
const DARK_MARKS = new Set(["github", "linear"]);

export const isDarkMark = (src: string | null): boolean => Boolean(src && [...DARK_MARKS].some((id) => src === `/logos/${id}.svg`));

export function getLogoSrc(id: string): string | null {
  return LOGOS.has(id) ? `/logos/${id}.svg` : null;
}
