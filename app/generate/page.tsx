import type { Metadata } from "next";

import { GenerateView } from "@/components/generate-view";

export const metadata: Metadata = { title: "Generate guide" };

export default function GeneratePage() {
  return <GenerateView />;
}
