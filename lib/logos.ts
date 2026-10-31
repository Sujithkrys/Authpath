import { siGithub, siGoogle, siHubspot, siLinear, siNotion, siStripe, siZoom } from "simple-icons";

/**
 * simple-icons paths by guide id. Slack and Salesforce are absent because
 * simple-icons doesn't carry them; those guides use the letter tile.
 *
 * Only import this from server code: it keeps the simple-icons package, which
 * is several megabytes, out of the client bundle.
 */
const LOGOS: Record<string, { path: string }> = {
  github: siGithub,
  google: siGoogle,
  hubspot: siHubspot,
  linear: siLinear,
  notion: siNotion,
  stripe: siStripe,
  zoom: siZoom,
};

export function getLogoPath(id: string): string | null {
  return LOGOS[id]?.path ?? null;
}
