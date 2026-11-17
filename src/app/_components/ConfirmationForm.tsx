"use client";

import { useEffect, useRef, useState } from "react";
import { HOST_NOT_USED } from "@/lib/ownership/messages";

/**
 * Phase 46 (TFP-233, Decision 2, Acceptance Criteria 2): the ownership confirmation form, in the site lookup's entry.
 * It keeps its friction:
 * - the hosts are typed by hand, one per line, never filled from the URL: typing them is naming what's covered;
 * - the basis is chosen, none preselected, and its statement is the API's fixed wording for it (TFP-218's `wording`,
 *   sent back unchanged), with Phase 35 Decision 8's legal note beside it (review item 3). The statement must be ticked;
 * - name and contact email; expiry 90 days unless another date is picked, the picker stopping at 1 year;
 * - the active and load ticks start off, each saying what it allows.
 * Refusals come from the API and are shown as returned (Phase 43 Decision 13): the form doesn't repeat the rules, so it
 * sets noValidate and lets the API refuse an invalid email or a date past the picker's limit. A host the site doesn't
 * use yet is refused by the API; the form then says how a host comes to be accepted (review item 4).
 */

type Basis = "owner" | "written-permission";

const BASES: Array<{ value: Basis; label: string }> = [
    { value: "owner", label: "I own this site" },
    { value: "written-permission", label: "I have written permission to test it" },
];

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Decision 5's limit, as the API reads it: the same date a year on, or 28 February for one made on 29 February. */
function oneYearOn(now: Date): Date {
    const latest = new Date(now);
    latest.setUTCFullYear(latest.getUTCFullYear() + 1);
    if (latest.getUTCMonth() !== now.getUTCMonth()) latest.setUTCDate(0);
    return latest;
}

const defaultExpiry = (now: Date) => isoDay(new Date(now.getTime() + 90 * DAY));

export function ConfirmationForm({
    origin,
    wording,
    legalNote,
    renewing,
    onSending,
    onSaved,
    onCancel,
}: {
    origin: string;
    wording: Partial<Record<Basis, string>>;
    legalNote: string;
    renewing: boolean;
    /** The lookup's other actions wait while the confirmation is with the API (the fresh-context review). */
    onSending: (sending: boolean) => void;
    onSaved: () => void;
    onCancel: () => void;
}) {
    // When the form was opened, or its date last focused: a form left open for a day gets today's limits again.
    const [now, setNow] = useState(() => new Date());
    const [hosts, setHosts] = useState("");
    const [basis, setBasis] = useState<Basis | null>(null);
    const [ticked, setTicked] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [expires, setExpires] = useState(() => defaultExpiry(now));
    const [active, setActive] = useState(false);
    const [load, setLoad] = useState(false);
    const [reasons, setReasons] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const hostsField = useRef<HTMLTextAreaElement>(null);
    const refusals = useRef<HTMLDivElement>(null);
    // A reply that arrives after the form closed is ignored: the lookup has moved on.
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        hostsField.current?.focus();
        return () => {
            mounted.current = false;
        };
    }, []);
    // Focus moves to the refusals once they are in the page: the first time, the box isn't there until this render.
    useEffect(() => {
        if (reasons.length > 0) refusals.current?.focus();
    }, [reasons]);

    const statement = basis ? wording[basis] ?? "" : "";
    const canTick = Boolean(basis && statement);

    const submit = async () => {
        if (!ticked || !canTick || sending) return;
        setSending(true);
        onSending(true);
        let refused: string[] = [];
        try {
            const response = await fetch("/api/site-ownership", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    baseUrl: origin,
                    hosts: hosts.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
                    basis,
                    wording: statement,
                    name,
                    contactEmail: email,
                    // The default left as it is: the API's own 90 days from now, to the minute (the fresh-context
                    // review). A picked date is that date, from 00:00 UTC.
                    ...(expires && expires !== defaultExpiry(now) ? { expiresAt: expires } : {}),
                    scopes: { active, load },
                }),
            });
            const data = (await response.json().catch(() => null)) as { reasons?: unknown; error?: unknown } | null;
            if (!response.ok) {
                refused = Array.isArray(data?.reasons) && data.reasons.length > 0
                    ? data.reasons.map(String)
                    : [typeof data?.error === "string" ? data.error : `the server answered ${response.status}, with no reason given`];
            }
        } catch {
            refused = ["Mr Onion didn't answer, so nothing was saved. Try again."];
        }
        if (!mounted.current) return;
        setSending(false);
        onSending(false);
        if (refused.length === 0) {
            onSaved();
            return;
        }
        setReasons(refused);
    };

    return (
        <form
            noValidate
            aria-labelledby="confirmation-form-heading"
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
            className="mt-4 space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"
        >
            <h4 id="confirmation-form-heading" className="text-sm font-semibold text-zinc-900">{renewing ? "Renew the confirmation" : "Confirm ownership or permission"}</h4>
            {renewing ? <p className="text-sm text-zinc-600">A renewal replaces the current confirmation, which is kept in the site&apos;s history.</p> : null}

            {reasons.length > 0 ? (
                // Focused, and named by its heading, so it is read once when it appears.
                <div ref={refusals} tabIndex={-1} role="group" aria-labelledby="confirmation-refused" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 focus:outline-none">
                    <p id="confirmation-refused" className="font-medium">Mr Onion refused the confirmation:</p>
                    <ul aria-label="Why it was refused" className="mt-1 list-disc pl-5">
                        {reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
                    </ul>
                    {reasons.some((reason) => reason.includes(HOST_NOT_USED)) ? (
                        <p className="mt-2">A host is accepted once a Standard run on this site has recorded it: run one, then confirm.</p>
                    ) : null}
                </div>
            ) : null}

            <label className="block text-sm font-medium text-zinc-700">
                Hosts, one per line
                <textarea
                    ref={hostsField}
                    aria-describedby="confirmation-hosts-help"
                    value={hosts}
                    onChange={(event) => setHosts(event.target.value)}
                    rows={3}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-sm"
                />
            </label>
            <p id="confirmation-hosts-help" className="-mt-3 text-xs text-zinc-600">Type each host in full, as shop.example.com: no scheme, port, path or wildcard.</p>

            <fieldset>
                <legend className="text-sm font-medium text-zinc-700">Basis: choose one</legend>
                <div className="mt-1 flex flex-wrap gap-4">
                    {BASES.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-zinc-800">
                            <input
                                type="radio"
                                name="confirmation-basis"
                                value={option.value}
                                checked={basis === option.value}
                                onChange={() => {
                                    setBasis(option.value);
                                    // The statement changed, so what was ticked no longer stands.
                                    setTicked(false);
                                }}
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                {!basis ? (
                    <p id="confirmation-statement" className="text-zinc-600">Choose a basis to see what you confirm.</p>
                ) : statement ? (
                    <p id="confirmation-statement" className="text-zinc-900">{statement}</p>
                ) : (
                    <p id="confirmation-statement" role="alert" className="text-rose-700">Mr Onion didn&apos;t send the statement for this basis, so it can&apos;t be confirmed. Look the site up again.</p>
                )}
                <p id="confirmation-legal-note" className="mt-2 text-zinc-600">{legalNote}</p>
                <label className="mt-3 flex items-start gap-2 font-medium text-zinc-900">
                    <input
                        type="checkbox"
                        checked={ticked}
                        disabled={!canTick}
                        aria-describedby="confirmation-statement confirmation-legal-note"
                        onChange={(event) => setTicked(event.target.checked)}
                        className="mt-1"
                    />
                    I confirm the statement above
                </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-zinc-700">
                    Your name
                    <input value={name} onChange={(event) => setName(event.target.value)} aria-required="true" autoComplete="name" className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium text-zinc-700">
                    Contact email
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-required="true" autoComplete="email" className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                </label>
            </div>

            <label className="block text-sm font-medium text-zinc-700">
                Expires on
                <input
                    type="date"
                    value={expires}
                    min={isoDay(new Date(now.getTime() + DAY))}
                    max={isoDay(oneYearOn(now))}
                    aria-describedby="confirmation-expiry-help"
                    onFocus={() => {
                        const today = new Date();
                        if (isoDay(today) !== isoDay(now)) setNow(today);
                    }}
                    onChange={(event) => setExpires(event.target.value)}
                    className="mt-1 block rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                />
            </label>
            <p id="confirmation-expiry-help" className="-mt-3 text-xs text-zinc-600">90 days from now unless you pick another date, which then expires at its start (00:00 UTC); at most 1 year.</p>

            <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-zinc-700">What it allows beyond runs without the request limits</legend>
                <label className="flex items-start gap-2 text-sm text-zinc-800">
                    <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="mt-1" />
                    {/* Owner ruling at Gate A (2026-11-17): the category the stored statement names, with today's example. */}
                    <span><strong>Active tests:</strong> attack-shaped input (today: script-shaped input in forms), on a run that asks for active tests.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-zinc-800">
                    <input type="checkbox" checked={load} onChange={(event) => setLoad(event.target.checked)} className="mt-1" />
                    <span><strong>Load testing:</strong> sends load to these hosts, once Mr Onion has load testing. Nothing uses it yet.</span>
                </label>
            </fieldset>

            <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={!ticked || !canTick || sending} aria-describedby="confirmation-save-hint" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {renewing ? "Save the renewal" : "Save the confirmation"}
                </button>
                <button type="button" disabled={sending} onClick={onCancel} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50">
                    Cancel
                </button>
                <span id="confirmation-save-hint" className="self-center text-xs text-zinc-600">{ticked ? "" : "Choose a basis and tick the statement to save."}</span>
            </div>
        </form>
    );
}
