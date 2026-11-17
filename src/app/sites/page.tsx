import type { Metadata } from "next";
import Link from "next/link";
import { SiteLookup } from "@/app/_components/SiteLookup";

export const metadata: Metadata = { title: "Site lookup" };

// Phase 46 (TFP-232, Decision 1): the site lookup, a page of its own. `?url=` is the run form's target, searched on
// open; the page holds no list of sites to pick from.
export default async function SitesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const { url } = await searchParams;
    const initialUrl = typeof url === "string" ? url : "";
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_32%),linear-gradient(180deg,#f7f8fc_0%,#f4f6fb_52%,#eef3f8_100%)] text-zinc-900">
            <header className="border-b border-white/70 bg-white/80 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
                    <Link href="/" className="text-lg font-semibold tracking-tight">Mr Onion</Link>
                    <span className="text-xs text-zinc-500">Site lookup</span>
                </div>
            </header>
            <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Site lookup</h1>
                <SiteLookup initialUrl={initialUrl} />
            </main>
        </div>
    );
}
