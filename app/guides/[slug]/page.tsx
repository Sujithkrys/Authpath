import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppCardView } from "@/components/app-card-view";
import { GuideView } from "@/components/guide-view";
import { getLibraryGuide, withLogo } from "@/lib/guides";
import { getGeneratedResult } from "@/lib/store";
import { isAppCard } from "@/types/guide";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

// Rendered per request, because a generated result must work the moment it's
// saved, and Next refuses a per-request Redis read on a route with static
// params. Library guides still come from the JSON bundled at build time and
// never touch Redis.
export const dynamic = "force-dynamic";

/** A library guide, else whatever the agent saved under this slug: a guide or a card. */
async function loadResult(slug: string) {
  const fromLibrary = getLibraryGuide(slug);
  if (fromLibrary) return fromLibrary;
  const generated = await getGeneratedResult(slug);
  if (!generated) return null;
  return isAppCard(generated) ? generated : withLogo(generated);
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await loadResult(slug))?.name };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const result = await loadResult(slug);
  if (!result) notFound();

  if (isAppCard(result)) return <AppCardView card={result} />;
  return <GuideView guide={result} />;
}
