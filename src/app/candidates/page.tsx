import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { PromotionScreen } from "@/app/_components/PromotionScreen";

// A title of its own (WCAG 2.4.2; found by the fresh-context review): "Candidate tests | Mr Onion", by the layout's
// template.
export const metadata: Metadata = { title: "Candidate tests" };

// Phase 46 (TFP-234, Decision 3): the promotion screen, a page of its own. Candidates aren't per site, and promotion
// is the owner's decision on a candidate, not a browse of sites, so it isn't a section of the run page.
export default function CandidatesPage() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_32%),linear-gradient(180deg,#f7f8fc_0%,#f4f6fb_52%,#eef3f8_100%)] text-zinc-900">
            <SiteHeader />
            <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Candidate tests</h1>
                <PromotionScreen />
            </main>
        </div>
    );
}
