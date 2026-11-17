"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SiteLookup } from "@/app/_components/SiteLookup";

/**
 * Phase 46 (TFP-294, Gate B walkthrough): on the run page the site lookup opens as a modal, searched for the run's
 * target, so the run form stays as it was. A native <dialog>: focus stays inside while it is open, Escape closes it,
 * and focus returns to the opening button. Closing it fires `SITE_LOOKUP_CLOSED`, which the active switch listens for
 * to read the gate again, as a confirmation may have changed. The /sites page stays for direct visits.
 */

export const SITE_LOOKUP_CLOSED = "mronion:site-lookup-closed";

export function SiteLookupDialog({ url, children, className }: { url: string; children: ReactNode; className?: string }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();
    // A fresh lookup each time it opens, searched for the target as it is then.
    const [opened, setOpened] = useState<{ url: string; count: number } | null>(null);

    useEffect(() => {
        if (opened && dialog.current && !dialog.current.open) dialog.current.showModal();
    }, [opened]);

    return (
        <>
            <button type="button" onClick={() => setOpened((previous) => ({ url, count: (previous?.count ?? 0) + 1 }))} className={className}>
                {children}
            </button>
            <dialog
                ref={dialog}
                aria-labelledby={headingId}
                // Escape leaves a half-filled confirmation form open, rather than losing it: Close still closes.
                onCancel={(event) => {
                    if (dialog.current?.querySelector("form[aria-labelledby='confirmation-form-heading']")) event.preventDefault();
                }}
                onClose={() => {
                    setOpened(null);
                    window.dispatchEvent(new Event(SITE_LOOKUP_CLOSED));
                }}
                className="w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-auto rounded-[28px] border border-zinc-200 bg-zinc-50 p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40"
            >
                <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
                    <h2 id={headingId} className="text-lg font-semibold text-zinc-950">Site lookup</h2>
                    <button type="button" onClick={() => dialog.current?.close()} className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-800">
                        Close
                    </button>
                </div>
                <div className="p-6">
                    {opened ? <SiteLookup key={opened.count} initialUrl={opened.url} updateAddress={false} /> : null}
                </div>
            </dialog>
        </>
    );
}
