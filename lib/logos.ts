/**
 * Guides with a full-colour logo in public/logos/<id>.svg. Any other guide
 * uses the letter tile.
 *
 * The files come from gilbarbara/logos (CC0). Stripe and HubSpot are built from
 * their simple-icons (CC0) marks, because that set only has their wordmarks.
 * The logos themselves remain trademarks of their owners.
 */
const LOGOS = new Set(["github", "google", "hubspot", "linear", "notion", "salesforce", "slack", "stripe", "zoom"]);

export function getLogoSrc(id: string): string | null {
  return LOGOS.has(id) ? `/logos/${id}.svg` : null;
}
