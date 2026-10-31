import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuideView } from "@/components/guide-view";
import { getLibraryGuide, withLogo } from "@/lib/guides";
import { getGeneratedGuide } from "@/lib/store";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

// Rendered per request, because a generated guide must work the moment it's
// saved, and Next refuses a per-request Redis read on a route with static
// params. Library guides still come from the JSON bundled at build time and
// never touch Redis.
export const dynamic = "force-dynamic";

async function loadGuide(slug: string) {
  const fromLibrary = getLibraryGuide(slug);
  if (fromLibrary) return fromLibrary;

  const generated = await getGeneratedGuide(slug);
  return generated ? withLogo(generated) : undefined;
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await loadGuide(slug))?.name };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = await loadGuide(slug);
  if (!guide) notFound();

  return <GuideView guide={guide} />;
}
