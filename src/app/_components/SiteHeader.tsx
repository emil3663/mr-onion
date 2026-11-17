"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Phase 46 (TFP-294, Gate B walkthrough): one header on every page. "Mr Onion" with a home icon (its accessible name
 * "Mr Onion: home"), and the app's three pages, the current one marked (aria-current="page"). `actions` is for a page's
 * own controls, such as the run page's Help.
 */

const PAGES = [
    { href: "/", label: "Run" },
    { href: "/sites", label: "Site lookup" },
    { href: "/candidates", label: "Candidate tests" },
];

export function SiteHeader({ actions }: { actions?: ReactNode }) {
    const pathname = usePathname();
    return (
        <header className="border-b border-white/70 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
                <Link href="/" aria-label="Mr Onion: home" className="flex items-center gap-3 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 shadow-[0_10px_30px_rgba(79,70,229,0.25)]">
                        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 10.5 12 3l9 7.5" />
                            <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
                        </svg>
                    </span>
                    <span className="text-lg font-semibold tracking-tight text-zinc-950">Mr Onion</span>
                </Link>
                {/* The pages and the page's own controls together, so a narrow screen wraps them as one group. */}
                <div className="ml-auto flex items-center gap-2">
                <nav aria-label="Pages">
                    <ul className="flex flex-wrap items-center gap-1 text-sm font-medium">
                        {PAGES.map((page) => {
                            const current = pathname === page.href || (page.href !== "/" && pathname.startsWith(`${page.href}/`));
                            return (
                                <li key={page.href}>
                                    <Link
                                        href={page.href}
                                        aria-current={current ? "page" : undefined}
                                        className={`rounded-xl px-3 py-1.5 transition ${current ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50"}`}
                                    >
                                        {page.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                {actions}
                </div>
            </div>
        </header>
    );
}
