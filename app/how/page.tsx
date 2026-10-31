import type { Metadata } from "next";

import { heroTitle } from "@/components/ui";

export const metadata: Metadata = { title: "How it's checked" };

export default function HowPage() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto mt-2 max-w-[720px]">
      <h1 id="how-heading" className={`${heroTitle} mb-4 text-[34px] leading-[1.12]`}>
        How guides are checked
      </h1>
      <p className="mb-7 max-w-[520px] text-[16px] text-text-2">
        Each step carries one of three evidence levels. &quot;Tested&quot; means we created the OAuth app ourselves and
        followed the step. &quot;From docs&quot; means it comes from the provider&apos;s own documentation, linked in
        Sources. &quot;Not confirmed&quot; means the agent couldn&apos;t find a reliable answer — usually approval
        timelines — so treat it as a range, not a promise.
      </p>
    </section>
  );
}
