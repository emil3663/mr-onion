"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmationForm } from "@/app/_components/ConfirmationForm";
import { SITE_LOOKUP_CLOSED } from "@/app/_components/SiteLookupDialog";
import { LOOKUP_LABELS, withLabels } from "@/app/_lib/field-labels";

/**
 * Phase 46 (TFP-232, Decision 1, Acceptance Criteria 1): the site lookup. The tester names a site by its URL, in any
 * form, and sees that site's entry only: exact match, no suggestions, no list of sites (Decision 1, review item 7).
 * It calls the existing APIs by site and nothing else, so their rules and refusals stay there:
 * - `/api/site-ownership`: the confirmation (none, valid until when, expired or withdrawn), its hosts, basis, name,
 *   scopes and the contact email, which the API already masks (review item 2);
 * - `/api/site-settings`: the gap writer, which can be set here;
 * - `/api/site-suites`: the saved suites, each with when it was last run (review item 6).
 * Withdrawing needs a second click. After any change the entry is read again from the API, in place, as if the site
 * had just been searched. Creating or renewing a confirmation is ConfirmationForm (TFP-233), opened from the entry.
 */

type Status = "missing" | "valid" | "expired" | "withdrawn";
interface Confirmation {
    hosts: string[];
    basis: "owner" | "written-permission";
    name: string;
    contactEmail: string;
    confirmedAt: string;
    expiresAt: string;
    scopes: { active: boolean; load: boolean };
    withdrawnAt?: string;
}
interface Suite {
    runType: "standard" | "comprehensive";
    area?: string;
    practices: string[];
    auditMode: string;
    savedAt: string;
    tests: number;
    lastRun: { runId: string; finishedAt: string } | null;
}
interface Entry {
    origin: string;
    status: Status;
    confirmation: Confirmation | null;
    history: Confirmation[];
    gapWriter: string;
    suites: Suite[];
    /** The API's fixed wording for each basis, and the legal note, for the confirmation form (TFP-233). */
    wording: Partial<Record<Confirmation["basis"], string>>;
    legalNote: string;
}

const GAP_WRITER_LABELS: Record<string, string> = { off: "Off", "claude-code": "Claude Code", "local-model": "The local model" };
const BASIS_LABELS: Record<Confirmation["basis"], string> = { owner: "I own this site", "written-permission": "I have written permission to test it" };

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "?");
const when = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
};

/** An API reply's error, or why there is none: a reply that isn't JSON, or no reply at all, is said so in words. */
async function replyOf(response: Response): Promise<{ data: Record<string, unknown>; error: string }> {
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (data === null) return { data: {}, error: response.ok ? "" : `the server answered ${response.status}, with no reason given` };
    return { data, error: response.ok ? "" : typeof data.error === "string" ? data.error : `refused (${response.status})` };
}

async function readEntry(url: string): Promise<Entry> {
    const query = `?baseUrl=${encodeURIComponent(url)}`;
    const [ownership, settings, suites] = await Promise.all(
        ["/api/site-ownership", "/api/site-settings", "/api/site-suites"].map(async (path) => {
            const reply = await replyOf(await fetch(`${path}${query}`, { cache: "no-store" }));
            if (reply.error) throw new Error(reply.error);
            return reply.data;
        }),
    );
    return {
        origin: String(ownership.origin),
        status: ownership.status as Status,
        confirmation: (ownership.confirmation as Confirmation | null) ?? null,
        history: Array.isArray(ownership.history) ? (ownership.history as Confirmation[]) : [],
        gapWriter: typeof settings.gapWriter === "string" ? settings.gapWriter : "off",
        suites: Array.isArray(suites.suites) ? (suites.suites as Suite[]) : [],
        wording: (ownership.wording && typeof ownership.wording === "object" ? ownership.wording : {}) as Entry["wording"],
        legalNote: typeof ownership.legalNote === "string" ? ownership.legalNote : "",
    };
}

/** The site's port, said even where its address leaves the default out (TFP-294: http://192.168.1.17 is port 80). */
function portOf(origin: string): string {
    try {
        const url = new URL(origin);
        return url.port || (url.protocol === "https:" ? "443" : "80");
    } catch {
        return "?";
    }
}

/** Nothing saved: no confirmation now or before, the gap writer off (its default), and no saved suite. */
const nothingSaved = (entry: Entry) => entry.confirmation === null && entry.history.length === 0 && entry.gapWriter === "off" && entry.suites.length === 0;

function describeSuite(suite: Suite) {
    const kind = suite.runType === "comprehensive" ? `Comprehensive, ${suite.area ?? "unknown area"}` : `Standard, ${suite.auditMode}`;
    return suite.practices.length > 0 ? `${kind}: ${suite.practices.join(", ")}` : kind;
}

function statusLine(entry: Entry) {
    const confirmation = entry.confirmation;
    switch (entry.status) {
        case "valid":
            // To the minute: a picked date expires at its start, 00:00 UTC (TFP-233, the fresh-context review).
            return `Valid until ${confirmation ? when(confirmation.expiresAt) : "?"}`;
        case "expired":
            return `Expired on ${confirmation ? when(confirmation.expiresAt) : "?"}`;
        case "withdrawn":
            return `Withdrawn on ${day(confirmation?.withdrawnAt)}`;
        default:
            return "None";
    }
}

/** `updateAddress`: the /sites page puts the searched site in its address; the run page's modal doesn't (TFP-294). */
export function SiteLookup({ initialUrl = "", updateAddress = true }: { initialUrl?: string; updateAddress?: boolean }) {
    const [url, setUrl] = useState(initialUrl);
    const [searched, setSearched] = useState("");
    const [entry, setEntry] = useState<Entry | null>(null);
    const [error, setError] = useState("");
    // Opened from the run form, the page starts looking its target up.
    const [busy, setBusy] = useState(Boolean(initialUrl.trim()));
    const [actionError, setActionError] = useState("");
    const [armedWithdraw, setArmedWithdraw] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [gapWriter, setGapWriter] = useState("off");
    const [saved, setSaved] = useState("");
    // Only the latest search is shown: an earlier one answering late is dropped.
    const latest = useRef(0);
    // Focus follows the withdrawal (the fresh-context review): to its confirming button when it appears, and to the
    // status once the API has answered, since the button that had focus is gone.
    const confirmWithdraw = useRef<HTMLButtonElement>(null);
    const statusRef = useRef<HTMLParagraphElement>(null);
    // Cancel returns focus to the button that opened the form (the fresh-context review).
    const openForm = useRef<HTMLButtonElement>(null);
    const refocusOpen = useRef(false);
    useEffect(() => {
        if (!formOpen && refocusOpen.current) {
            refocusOpen.current = false;
            openForm.current?.focus();
        }
    }, [formOpen]);
    useEffect(() => {
        if (armedWithdraw) confirmWithdraw.current?.focus();
    }, [armedWithdraw]);

    /** Reads the site's entry and shows it. State is set only in the read's callbacks, once it answers. */
    const show = useCallback((target: string, note: string) => {
        const ticket = ++latest.current;
        return readEntry(target).then(
            (read) => {
                if (ticket !== latest.current) return;
                setEntry(read);
                setGapWriter(read.gapWriter);
                setSearched(target);
                setSaved(note);
                setError("");
                setBusy(false);
                // The address names the site searched, so a reload shows the same entry (AC1, the fresh-context
                // review). Not a navigation: the page isn't rendered again, and nothing is searched twice.
                if (updateAddress) window.history.replaceState(null, "", `/sites?url=${encodeURIComponent(target)}`);
            },
            (caught: unknown) => {
                if (ticket !== latest.current) return;
                setEntry(null);
                setSaved("");
                setError(caught instanceof TypeError ? "Mr Onion didn't answer." : `This site couldn't be looked up: ${caught instanceof Error ? withLabels(caught.message, LOOKUP_LABELS) : "no reason given"}.`);
                setBusy(false);
            },
        );
    }, [updateAddress]);

    const search = async (target: string, note = "") => {
        setBusy(true);
        setError("");
        setActionError("");
        setArmedWithdraw(false);
        setFormOpen(false);
        await show(target, note);
    };

    // Decision 1: the run form opens the lookup with its target already searched.
    useEffect(() => {
        const target = initialUrl.trim();
        if (target) void show(target, "");
    }, [initialUrl, show]);

    const act = async (path: string, body: Record<string, unknown>, note: string) => {
        if (!entry || busy) return;
        setBusy(true);
        setActionError("");
        let refusal = "";
        try {
            const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: entry.origin, ...body }) });
            // Refusals come from the API, shown as returned: the screen doesn't repeat the rules.
            refusal = (await replyOf(response)).error;
        } catch {
            refusal = "Mr Onion didn't answer, so nothing was changed. Try again.";
        }
        // Read back from the API after every answer, refused or not: the entry shown is the one saved.
        await search(searched || entry.origin, refusal ? "" : note);
        // TFP-294: a change here may open or close the run form's gate; the switch reads it again.
        if (!refusal) window.dispatchEvent(new Event(SITE_LOOKUP_CLOSED));
        // R3: shown with the lookup's labels for the API's field names.
        if (refusal) setActionError(withLabels(refusal, LOOKUP_LABELS));
        statusRef.current?.focus();
    };

    const confirmation = entry?.confirmation ?? null;
    const canWithdraw = entry?.status === "valid" || entry?.status === "expired";
    // An expired one is renewed too: the run's closed reason says "renew it" (the fresh-context review).
    const canRenew = entry?.status === "valid" || entry?.status === "expired";
    // The owner (2026-11-18): a withdrawn one is confirmed again from what it was too, as a new confirmation.
    const startsFrom = confirmation && (canRenew || entry?.status === "withdrawn") ? confirmation : null;

    return (
        <div className="space-y-6">
            <form
                role="search"
                aria-label="Site lookup"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (url.trim()) void search(url.trim());
                }}
                className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm"
            >
                <label htmlFor="site-lookup-url" className="block text-sm font-medium text-zinc-700">Site URL</label>
                <p id="site-lookup-help" className="mt-1 text-sm text-zinc-600">
                    Type or paste the site&apos;s address. Mr Onion finds that exact site (its scheme, host and port), never a list of sites.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                    <input
                        id="site-lookup-url"
                        aria-describedby="site-lookup-help"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <button type="submit" disabled={busy || !url.trim()} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        Look up
                    </button>
                </div>
            </form>

            {/* One status line, always in the page, only its text changing, so a screen reader announces each change
                once (the fresh-context review); the entry itself isn't a live region. Errors are alerts outside the
                entry, so a refusal still shows when the read-back fails. */}
            <p ref={statusRef} tabIndex={-1} role="status" className={`text-sm ${busy ? "text-zinc-500" : "text-emerald-700"} focus:outline-none`}>
                {busy ? "Looking up the site..." : saved}
            </p>
            {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p> : null}
            {actionError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{actionError}</p> : null}

            <section aria-label="Results">
                {entry ? (
                    <div className={`space-y-6 rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm transition-opacity ${busy ? "opacity-60" : ""}`}>
                        <div>
                            <h2 className="font-mono text-lg font-semibold text-zinc-950">{entry.origin}</h2>
                            {nothingSaved(entry) ? <p className="mt-1 text-sm text-zinc-600">Nothing saved for {entry.origin} (port {portOf(entry.origin)})</p> : null}
                        </div>

                        <section aria-labelledby="confirmation-heading">
                            <h3 id="confirmation-heading" className="text-base font-semibold text-zinc-900">Ownership confirmation</h3>
                            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                                <dt className="text-zinc-500">Status</dt>
                                <dd data-testid="confirmation-status" className="text-zinc-900">{statusLine(entry)}</dd>
                                {confirmation ? (
                                    <>
                                        <dt className="text-zinc-500">Hosts</dt>
                                        <dd className="font-mono text-zinc-900">{confirmation.hosts.join(", ")}</dd>
                                        <dt className="text-zinc-500">Basis</dt>
                                        <dd className="text-zinc-900">{BASIS_LABELS[confirmation.basis] ?? confirmation.basis}</dd>
                                        <dt className="text-zinc-500">Confirmed by</dt>
                                        <dd className="text-zinc-900">{confirmation.name}, on {day(confirmation.confirmedAt)}</dd>
                                        <dt className="text-zinc-500">Contact email</dt>
                                        <dd className="font-mono text-zinc-900">{confirmation.contactEmail}</dd>
                                        {/* R4 (the owner's re-walk, 2026-11-18): a withdrawn confirmation allows nothing now. */}
                                        <dt className="text-zinc-500">{entry.status === "withdrawn" ? "Allowed, until withdrawn" : "Allows"}</dt>
                                        <dd className="text-zinc-900">
                                            Runs without the request limits
                                            {confirmation.scopes.active ? "; active tests (attack-shaped input)" : ""}
                                            {confirmation.scopes.load ? "; load testing" : ""}
                                        </dd>
                                    </>
                                ) : null}
                            </dl>
                            {canWithdraw ? (
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    {armedWithdraw ? (
                                        <>
                                            <button
                                                ref={confirmWithdraw}
                                                type="button"
                                                disabled={busy}
                                                aria-describedby="withdraw-effect"
                                                onClick={() => void act("/api/site-ownership/withdraw", {}, "The confirmation was withdrawn.")}
                                                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                            >
                                                Withdraw: yes, withdraw it
                                            </button>
                                            {/* Disabled while the withdrawal is with the API: clicking it then would look like a cancel. */}
                                            <button type="button" disabled={busy} onClick={() => setArmedWithdraw(false)} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50">
                                                Keep it
                                            </button>
                                            <span id="withdraw-effect" className="text-sm text-zinc-600">From the next run on, this site counts as unconfirmed.</span>
                                        </>
                                    ) : (
                                        <button type="button" disabled={busy} onClick={() => { setFormOpen(false); setArmedWithdraw(true); }} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">
                                            Withdraw
                                        </button>
                                    )}
                                </div>
                            ) : null}
                            {/* TFP-233: create, or renew (which replaces the current one, kept in the history). */}
                            {formOpen ? (
                                <ConfirmationForm
                                    // A change starts from this confirmation: another one read meanwhile starts it afresh.
                                    key={startsFrom ? `${startsFrom.confirmedAt}:${entry.status}` : "new"}
                                    origin={entry.origin}
                                    wording={entry.wording}
                                    legalNote={entry.legalNote}
                                    renewing={canRenew}
                                    start={startsFrom ? { hosts: startsFrom.hosts, basis: startsFrom.basis, name: startsFrom.name, scopes: startsFrom.scopes } : null}
                                    onSending={setBusy}
                                    onSaved={() => {
                                        window.dispatchEvent(new Event(SITE_LOOKUP_CLOSED));
                                        void search(searched || entry.origin, "The confirmation was saved.").then(() => statusRef.current?.focus());
                                    }}
                                    onCancel={() => {
                                        refocusOpen.current = true;
                                        setFormOpen(false);
                                    }}
                                />
                            ) : (
                                <button ref={openForm} type="button" disabled={busy} onClick={() => { setArmedWithdraw(false); setFormOpen(true); }} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                    {canRenew ? "Change or renew" : "Confirm ownership"}
                                </button>
                            )}
                        </section>

                        <section aria-labelledby="gap-writer-heading">
                            <h3 id="gap-writer-heading" className="text-base font-semibold text-zinc-900">Gap writer</h3>
                            <p className="mt-1 text-sm text-zinc-600">
                                Who writes tests for this site&apos;s uncovered elements. Turning it on sends the site&apos;s page structure to the writer on later generations.
                            </p>
                            <p className="mt-2 text-sm text-zinc-900">Now: <strong data-testid="gap-writer-now">{GAP_WRITER_LABELS[entry.gapWriter] ?? entry.gapWriter}</strong></p>
                            <div className="mt-2 flex flex-wrap items-end gap-3">
                                <label className="text-sm text-zinc-700">
                                    Who writes gap tests
                                    <select value={gapWriter} onChange={(event) => setGapWriter(event.target.value)} className="mt-1 block rounded-xl border border-zinc-300 px-3 py-2 text-sm">
                                        {Object.entries(GAP_WRITER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    disabled={busy || gapWriter === entry.gapWriter}
                                    onClick={() => void act("/api/site-settings", { gapWriter }, "The gap writer was saved.")}
                                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                                >
                                    Save gap writer
                                </button>
                            </div>
                        </section>

                        <section aria-labelledby="suites-heading">
                            <h3 id="suites-heading" className="text-base font-semibold text-zinc-900">Saved suites</h3>
                            {entry.suites.length === 0 ? <p className="mt-1 text-sm text-zinc-600">No saved suite for this site.</p> : (
                                <ul aria-label="Saved suites" className="mt-2 space-y-2 text-sm text-zinc-800">
                                    {entry.suites.map((suite) => (
                                        <li key={`${suite.runType}-${suite.area ?? ""}-${suite.auditMode}-${suite.practices.join(",")}`} className="rounded-xl border border-zinc-200 px-3 py-2">
                                            <strong>{describeSuite(suite)}</strong>
                                            <span className="text-zinc-600">: {suite.tests} {suite.tests === 1 ? "test" : "tests"}, saved {when(suite.savedAt)}; </span>
                                            <span className="text-zinc-600">{suite.lastRun ? `last run ${when(suite.lastRun.finishedAt)}` : "not run yet"}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
