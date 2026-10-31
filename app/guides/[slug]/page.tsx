import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuideView } from "@/components/guide-view";
import { getAllGuides, getGuide } from "@/lib/guides";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

// Every guide is known at build time, so anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllGuides().map((guide) => ({ slug: guide.id }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  return { title: getGuide(slug)?.name };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return <GuideView guide={guide} />;
}
