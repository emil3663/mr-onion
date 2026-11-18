"use client";

import { useEffect, useRef, useState } from "react";
import { HOST_NOT_USED } from "@/lib/ownership/messages";
import { CONFIRMATION_FIELDS, refusalField, type ConfirmationField } from "@/lib/ownership/refusal-fields";

/**
 * Phase 46 (TFP-233, Decision 2, Acceptance Criteria 2): the ownership confirmation form, in the site lookup's entry.
 * A new confirmation keeps its friction (a change starts from the current one, below):
 * - the hosts are typed by hand, one per line, never filled from the URL: typing them is naming what's covered;
 * - the basis is chosen, none preselected, and its statement is the API's fixed wording for it (TFP-218's `wording`,
 *   sent back unchanged), with Phase 35 Decision 8's legal note beside it (review item 3). The statement must be ticked;
 * - name and contact email; expiry 90 days unless another date is picked, the picker stopping at 1 year;
 * - the active and load ticks start off, each saying what it allows.
 * TFP-295 (Gate B's walkthrough): "Change or renew" starts from the current confirmation (its hosts, basis, name and
 * ticks; the expiry back to the 90-day default), but the statement tick and the contact email are retyped (the API
 * gives the email masked, and confirming is the act the tick records). Saving makes a new confirmation; the API keeps
 * the old one in the history. A withdrawn confirmation starts the same way (the owner, 2026-11-18), as a new
 * confirmation ("Confirm ownership or permission"), the statement tick and the email again retyped.
 * Refusals come from the API and are shown as returned (Phase 43 Decision 13): the form doesn't repeat the rules, so it
 * sets noValidate and lets the API refuse an invalid email or a date past the picker's limit. A host the site doesn't
 * use yet is refused by the API; the form then says how a host comes to be accepted (review item 4).
 * Gate B R2 (the owner's re-walk, 2026-11-18): the required fields are marked ("*" and "(required)") and the browser's
 * required check runs on save, only that check (noValidate stays, so the API still judges the email and the date):
 * the first required field left empty gets the browser's own message, and nothing is sent. Each API refusal is shown
 * beside the field it is about (`refusalField`) and in a summary above the save button, focus on the first refused
 * field. The save button's hint names only what is still missing.
 */

type Basis = "owner" | "written-permission";

/**
 * R2: a required field's mark, "*" and "(required)". Both are hidden from screen readers, which hear the control's own
 * `required` (the fresh-context review: otherwise "required" is read twice).
 */
function Required() {
    return (
        <span aria-hidden="true">
            <span className="ml-0.5 text-rose-600">*</span>
            <span className="ml-1 text-xs font-normal text-zinc-500">(required)</span>
        </span>
    );
}

/** R2: "a, b and c". */
const inWords = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

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

/** What "Change or renew" starts from: the current confirmation, without its contact email. */
export interface ConfirmationStart {
    hosts: string[];
    basis: Basis;
    name: string;
    scopes: { active: boolean; load: boolean };
}

export function ConfirmationForm({
    origin,
    wording,
    legalNote,
    renewing,
    start,
    onSending,
    onSaved,
    onCancel,
}: {
    origin: string;
    wording: Partial<Record<Basis, string>>;
    legalNote: string;
    renewing: boolean;
    /** TFP-295: the confirmation a change starts from; none for a new one. */
    start?: ConfirmationStart | null;
    /** The lookup's other actions wait while the confirmation is with the API (the fresh-context review). */
    onSending: (sending: boolean) => void;
    onSaved: () => void;
    onCancel: () => void;
}) {
    // When the form was opened, or its date last focused: a form left open for a day gets today's limits again.
    const [now, setNow] = useState(() => new Date());
    const [hosts, setHosts] = useState(() => (start ? start.hosts.join("\n") : ""));
    const [basis, setBasis] = useState<Basis | null>(() => start?.basis ?? null);
    const [ticked, setTicked] = useState(false);
    const [name, setName] = useState(() => start?.name ?? "");
    const [email, setEmail] = useState("");
    const [expires, setExpires] = useState(() => defaultExpiry(now));
    const [active, setActive] = useState(() => start?.scopes.active ?? false);
    const [load, setLoad] = useState(() => start?.scopes.load ?? false);
    const [reasons, setReasons] = useState<string[]>([]);
    // R2: counts the saves the API refused, so focus moves after a refusal, not when a corrected field clears its own.
    const [refusedSaves, setRefusedSaves] = useState(0);
    const [sending, setSending] = useState(false);
    const hostsField = useRef<HTMLTextAreaElement>(null);
    const refusals = useRef<HTMLDivElement>(null);
    // R2: each field's control, to focus the first refused one.
    const basisField = useRef<HTMLInputElement>(null);
    const tickField = useRef<HTMLInputElement>(null);
    const nameField = useRef<HTMLInputElement>(null);
    const emailField = useRef<HTMLInputElement>(null);
    const expiresField = useRef<HTMLInputElement>(null);
    const activeField = useRef<HTMLInputElement>(null);
    // A reply that arrives after the form closed is ignored: the lookup has moved on.
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        hostsField.current?.focus();
        return () => {
            mounted.current = false;
        };
    }, []);
    // R2: the refusals by the field each is about; one about no field is in the summary only.
    const refusedFields = new Map<ConfirmationField, string[]>();
    for (const reason of reasons) {
        const field = refusalField(reason);
        if (field) refusedFields.set(field, [...(refusedFields.get(field) ?? []), reason]);
    }
    const controlOf: Record<ConfirmationField, { current: HTMLElement | null }> = {
        hosts: hostsField, basis: basisField, wording: tickField, name: nameField, contactEmail: emailField, expiresAt: expiresField, scopes: activeField,
    };
    const errorId = (field: ConfirmationField) => `confirmation-${field}-error`;
    const describedBy = (field: ConfirmationField, ...others: string[]) => [...others, ...(refusedFields.has(field) ? [errorId(field)] : [])].join(" ") || undefined;
    const fieldError = (field: ConfirmationField) => (refusedFields.has(field)
        ? <p id={errorId(field)} className="mt-1 text-xs font-medium text-rose-700">{refusedFields.get(field)!.join(" ")}</p>
        : null);

    // Focus moves to the first refused field once the refusals are in the page, or to the summary when none has a field.
    useEffect(() => {
        if (refusedSaves === 0 || reasons.length === 0) return;
        const first = CONFIRMATION_FIELDS.find((field) => reasons.some((reason) => refusalField(reason) === field));
        (first ? controlOf[first].current : refusals.current)?.focus();
        // Only after a refused save: reasons also change when a corrected field drops its own, and focus stays then.
        // controlOf holds refs, stable across renders.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refusedSaves]);
    // R2 (the fresh-context review): a field changed loses its refusals, beside it and in the summary.
    const corrected = (field: ConfirmationField) => {
        if (refusedFields.has(field)) setReasons((current) => current.filter((reason) => refusalField(reason) !== field));
    };

    const statement = basis ? wording[basis] ?? "" : "";
    const canTick = Boolean(basis && statement);

    // R2: what is still missing to save, in the form's order.
    const missing = [
        ...(hosts.trim() ? [] : ["the hosts"]),
        ...(basis ? [] : ["a basis"]),
        ...(ticked ? [] : ["the statement's tick"]),
        ...(name.trim() ? [] : ["your name"]),
        ...(email.trim() ? [] : ["the contact email"]),
    ];

    const submit = async (form: HTMLFormElement) => {
        if (!ticked || !canTick || sending) return;
        // R2: the browser's required check, only that: the first required field left empty gets its own message.
        const empty = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[required]")).find((control) => control.validity.valueMissing);
        if (empty) {
            // The API's earlier refusals no longer describe this save.
            setReasons([]);
            empty.focus();
            empty.reportValidity();
            return;
        }
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
        setRefusedSaves((count) => count + 1);
    };

    return (
        <form
            noValidate
            aria-labelledby="confirmation-form-heading"
            onSubmit={(event) => {
                event.preventDefault();
                void submit(event.currentTarget);
            }}
            className="mt-4 space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4"
        >
            <h4 id="confirmation-form-heading" className="text-sm font-semibold text-zinc-900">{renewing ? "Change or renew the confirmation" : "Confirm ownership or permission"}</h4>
            {renewing ? (
                <p className="text-sm text-zinc-600">
                    It starts from the current confirmation. Tick the statement and type the contact email again: saving makes a new confirmation, and the current one is kept in the site&apos;s history.
                </p>
            ) : start ? (
                <p className="text-sm text-zinc-600">
                    It starts from the withdrawn confirmation. Tick the statement and type the contact email again: saving makes a new confirmation, and the withdrawn one is kept in the site&apos;s history.
                </p>
            ) : null}

            <label className="block text-sm font-medium text-zinc-700">
                Hosts, one per line<Required />
                <textarea
                    ref={hostsField}
                    required
                    aria-invalid={refusedFields.has("hosts") || undefined}
                    aria-describedby={describedBy("hosts", "confirmation-hosts-help")}
                    value={hosts}
                    onChange={(event) => { setHosts(event.target.value); corrected("hosts"); }}
                    rows={3}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-sm"
                />
            </label>
            <p id="confirmation-hosts-help" className="-mt-3 text-xs text-zinc-600">Type each host in full, as shop.example.com: no scheme, port, path or wildcard.</p>
            {refusedFields.has("hosts") ? <div className="-mt-3">{fieldError("hosts")}</div> : null}

            <fieldset aria-describedby={describedBy("basis")}>
                <legend className="text-sm font-medium text-zinc-700">Basis: choose one<Required /></legend>
                <div className="mt-1 flex flex-wrap gap-4">
                    {BASES.map((option, index) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-zinc-800">
                            <input
                                // A refused basis focuses the chosen one, or the first.
                                ref={(basis ? basis === option.value : index === 0) ? basisField : undefined}
                                type="radio"
                                required
                                name="confirmation-basis"
                                value={option.value}
                                checked={basis === option.value}
                                onChange={() => {
                                    setBasis(option.value);
                                    corrected("basis");
                                    corrected("wording");
                                    // The statement changed, so what was ticked no longer stands.
                                    setTicked(false);
                                }}
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
                {fieldError("basis")}
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
                        ref={tickField}
                        type="checkbox"
                        required
                        checked={ticked}
                        disabled={!canTick}
                        aria-invalid={refusedFields.has("wording") || undefined}
                        aria-describedby={describedBy("wording", "confirmation-statement", "confirmation-legal-note")}
                        onChange={(event) => { setTicked(event.target.checked); corrected("wording"); }}
                        className="mt-1"
                    />
                    <span>I confirm the statement above<Required /></span>
                </label>
                {fieldError("wording")}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="block text-sm font-medium text-zinc-700">
                        Your name<Required />
                        <input ref={nameField} required value={name} onChange={(event) => { setName(event.target.value); corrected("name"); }} aria-invalid={refusedFields.has("name") || undefined} aria-describedby={describedBy("name")} autoComplete="name" className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                    </label>
                    {fieldError("name")}
                </div>
                <div>
                    <label className="block text-sm font-medium text-zinc-700">
                        Contact email<Required />
                        <input ref={emailField} required type="email" value={email} onChange={(event) => { setEmail(event.target.value); corrected("contactEmail"); }} aria-invalid={refusedFields.has("contactEmail") || undefined} aria-describedby={describedBy("contactEmail")} autoComplete="email" className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm" />
                    </label>
                    {fieldError("contactEmail")}
                </div>
            </div>

            <label className="block text-sm font-medium text-zinc-700">
                Expires on
                <input
                    ref={expiresField}
                    type="date"
                    value={expires}
                    min={isoDay(new Date(now.getTime() + DAY))}
                    max={isoDay(oneYearOn(now))}
                    aria-invalid={refusedFields.has("expiresAt") || undefined}
                    aria-describedby={describedBy("expiresAt", "confirmation-expiry-help")}
                    onFocus={() => {
                        const today = new Date();
                        if (isoDay(today) !== isoDay(now)) setNow(today);
                    }}
                    onChange={(event) => { setExpires(event.target.value); corrected("expiresAt"); }}
                    className="mt-1 block rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                />
            </label>
            <p id="confirmation-expiry-help" className="-mt-3 text-xs text-zinc-600">90 days from now unless you pick another date, which then expires at its start (00:00 UTC); at most 1 year.</p>
            {refusedFields.has("expiresAt") ? <div className="-mt-3">{fieldError("expiresAt")}</div> : null}

            <fieldset className="space-y-2" aria-describedby={describedBy("scopes")}>
                <legend className="text-sm font-medium text-zinc-700">What it allows beyond runs without the request limits</legend>
                <label className="flex items-start gap-2 text-sm text-zinc-800">
                    <input ref={activeField} type="checkbox" checked={active} onChange={(event) => { setActive(event.target.checked); corrected("scopes"); }} className="mt-1" />
                    {/* Owner ruling at Gate A (2026-11-17): the category the stored statement names, with today's example. */}
                    <span><strong>Active tests:</strong> attack-shaped input (today: script-shaped input in forms), on a run that asks for active tests.</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-zinc-800">
                    <input type="checkbox" checked={load} onChange={(event) => { setLoad(event.target.checked); corrected("scopes"); }} className="mt-1" />
                    <span><strong>Load testing:</strong> sends load to these hosts, once Mr Onion has load testing. Nothing uses it yet.</span>
                </label>
                {fieldError("scopes")}
            </fieldset>

            {/* R2 (the fresh-context review): a live region always in the page, so the summary is heard when it appears,
                though focus goes to the first refused field. */}
            <div aria-live="polite">
            {reasons.length > 0 ? (
                // R2: the summary, above the save button. Named by its heading; focused when no refusal has a field.
                <div ref={refusals} tabIndex={-1} role="group" aria-labelledby="confirmation-refused" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 focus:outline-none">
                    <p id="confirmation-refused" className="font-medium">Mr Onion refused the confirmation:</p>
                    <ul aria-label="Why it was refused" className="mt-1 list-disc pl-5">
                        {reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
                    </ul>
                    {reasons.some((reason) => reason.includes(HOST_NOT_USED)) ? (
                        <p className="mt-2">A host is accepted once a Standard run on this site has recorded it: run one, then confirm.</p>
                    ) : null}
                    {/* TFP-295: a host the change started with, that the site no longer records, wasn't mistyped. */}
                    {start && reasons.some((reason) => start.hosts.some((host) => reason.startsWith(`"${host}" ${HOST_NOT_USED}`))) ? (
                        <p className="mt-2">A host from the current confirmation is one this site no longer records: remove it from the list, or run a Standard run that reaches it.</p>
                    ) : null}
                </div>
            ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={!ticked || !canTick || sending} aria-describedby="confirmation-save-hint" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {renewing ? "Save the change" : "Save the confirmation"}
                </button>
                <button type="button" disabled={sending} onClick={onCancel} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50">
                    Cancel
                </button>
                <span id="confirmation-save-hint" className="self-center text-xs text-zinc-600">{missing.length > 0 ? `Still needed to save: ${inWords(missing)}.` : ""}</span>
            </div>
        </form>
    );
}
