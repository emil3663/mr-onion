import { mkdir, readdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { normalizeBaseUrl } from "@/lib/generate/normalize";
import { hostNotUsedReason } from "@/lib/ownership/messages";
import { siteFolderName } from "@/lib/site-suites/store";
import { dataDir } from "@/lib/storage/data-dir";

/**
 * Phase 43 (TFP-218; Decisions 1, 2, 5, 6, 12 and 13, locked 2026-10-19): the ownership confirmation, saved once with
 * the site rather than asked for on every run ("a tester confirms once, not repeatedly", Emil, 2026-10-19).
 *
 *   <data>/site-suites/<site>/ownership.json   { current, history }
 *
 * Beside Phase 42's settings.json, in Mr Onion's local data folder, never the repo. `current` is the latest
 * confirmation, or null; `history` keeps every earlier one, so a replaced or withdrawn confirmation stays as evidence
 * of what was confirmed and when (Decision 6).
 *
 * It is the tester's statement: Mr Onion records it and can't verify it (testing a site without permission is
 * unauthorised security testing, Phase 35 Decision 8). This ticket stores it. What it unlocks is TFP-219 (the active
 * gate) and TFP-220 (the caps); until then nothing reads it but its API.
 *
 * The contact email is kept here and nowhere else. Nothing is sent to it: Mr Onion has no mail code (D25 uses it later).
 */

export const CONFIRMATION_BASES = ["owner", "written-permission"] as const;
export type ConfirmationBasis = (typeof CONFIRMATION_BASES)[number];

/**
 * What the tester confirms, by basis: the text a client shows and sends back unchanged, stored with the
 * confirmation. Decision 12's practice-site rule is part of it, since Mr Onion can't read a site's terms.
 */
export const CONFIRMATION_WORDING: Record<ConfirmationBasis, string> = {
    owner:
        "I own every host listed here. I understand that Mr Onion runs here without its request limits, and, where I tick them, sends attack-shaped input (active tests) and load (load testing) to these hosts.",
    "written-permission":
        "I have the site owner's written permission to test every host listed here, including each kind of testing I tick. I understand that Mr Onion runs here without its request limits, and, where I tick them, sends attack-shaped input (active tests) and load (load testing) to these hosts. A hosted practice site counts only when its published terms explicitly allow attack-shaped or load testing.",
};

/**
 * Phase 35 Decision 8's legal note, shown beside the wording a tester confirms (Phase 46, TFP-233, review item 3). Not
 * part of what is confirmed or stored: it says why the confirmation is asked for.
 */
export const LEGAL_NOTE = "Active testing of a site without permission is unauthorised security testing, which is illegal in most countries, including South Africa.";

/** Decision 5: 90 days unless the tester chooses another expiry, at most 1 year from the date confirmed. */
export const DEFAULT_EXPIRY_DAYS = 90;

export interface OwnershipConfirmation {
    /** Decision 2: full host names, each typed by the tester. */
    hosts: string[];
    basis: ConfirmationBasis;
    /** The exact wording the tester confirmed. */
    wording: string;
    name: string;
    contactEmail: string;
    /** ISO date-times. */
    confirmedAt: string;
    expiresAt: string;
    /** Decision 3: the caps are always lifted on the covered hosts; active tests and load testing each have a tick. */
    scopes: { active: boolean; load: boolean };
    withdrawnAt?: string;
}

export interface OwnershipFile {
    current: OwnershipConfirmation | null;
    history: OwnershipConfirmation[];
}

export type ConfirmationStatus = "missing" | "valid" | "expired" | "withdrawn";

/** The site's origin from a request; a request must name its site (normalizeBaseUrl would put the default one in for none). */
export function originOf(baseUrl: unknown): string | null {
    if (typeof baseUrl !== "string" || !baseUrl.trim()) return null;
    const normalized = normalizeBaseUrl(baseUrl);
    return normalized.ok ? new URL(normalized.value).origin : null;
}

const ownershipFile = (origin: string) => join(dataDir(), "site-suites", siteFolderName(origin), "ownership.json");

const isDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isText = (value: unknown) => typeof value === "string" && value.trim() !== "";

/** A confirmation as this store writes one, every field present and of its type; anything else isn't one. */
function isConfirmation(value: unknown): value is OwnershipConfirmation {
    const entry = value as Partial<OwnershipConfirmation> | null;
    return Boolean(
        entry && typeof entry === "object"
        && Array.isArray(entry.hosts) && entry.hosts.length > 0 && entry.hosts.every(isText)
        && (CONFIRMATION_BASES as readonly unknown[]).includes(entry.basis)
        && isText(entry.wording) && isText(entry.name) && isText(entry.contactEmail)
        && isDate(entry.confirmedAt) && isDate(entry.expiresAt)
        && entry.scopes && typeof entry.scopes.active === "boolean" && typeof entry.scopes.load === "boolean"
        && (entry.withdrawnAt === undefined || isDate(entry.withdrawnAt))
    );
}

/**
 * The site's confirmation file. It fails closed: absent, unreadable, or a confirmation missing a field or holding one
 * of the wrong type (an expiry that isn't a date would otherwise never be reached) reads as no confirmation, and a
 * malformed history entry is dropped.
 */
export async function loadOwnership(origin: string): Promise<OwnershipFile> {
    const text = await readFile(ownershipFile(origin), "utf8").catch(() => null);
    try {
        const parsed = text ? (JSON.parse(text) as { current?: unknown; history?: unknown }) : null;
        return {
            current: isConfirmation(parsed?.current) ? parsed.current : null,
            history: Array.isArray(parsed?.history) ? parsed.history.filter(isConfirmation) : [],
        };
    } catch {
        return { current: null, history: [] };
    }
}

// Writes to one site's file run one after another in this process (the server is one process): two saves at the same
// moment each read the other's result, so none is lost from the history. Each writes its own temporary file.
const writing = new Map<string, Promise<unknown>>();
let writes = 0;

function updateOwnership<T>(origin: string, change: (file: OwnershipFile) => { file: OwnershipFile; result: T } | null): Promise<T | null> {
    const path = ownershipFile(origin);
    const run = (writing.get(path) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const changed = change(await loadOwnership(origin));
        if (!changed) return null;
        await mkdir(join(path, ".."), { recursive: true });
        const temporary = `${path}.${process.pid}.${++writes}.tmp`;
        await writeFile(temporary, JSON.stringify(changed.file, null, 2), "utf8");
        await rename(temporary, path);
        return changed.result;
    });
    writing.set(path, run);
    void run.finally(() => { if (writing.get(path) === run) writing.delete(path); }).catch(() => undefined);
    return run;
}

/**
 * Phase 46 (TFP-232, review item 2, owner decision 2026-11-17): the contact email as the API shows it, its first
 * letter and its domain, `e***@gmail.com`. The local part's length isn't shown. Anything without an @ is shown as
 * `***`.
 */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf("@");
    if (at <= 0) return "***";
    return `${email[0]}***${email.slice(at)}`;
}

/**
 * The confirmation file as every API response carries it: each contact email masked, the current one's and every
 * history entry's. The full address stays in the local file only, and nothing in the app receives it.
 */
export function maskedOwnership(file: OwnershipFile): OwnershipFile {
    const mask = (confirmation: OwnershipConfirmation) => ({ ...confirmation, contactEmail: maskEmail(confirmation.contactEmail) });
    return { current: file.current ? mask(file.current) : null, history: file.history.map(mask) };
}

/** Decisions 5 and 6: an expired or withdrawn confirmation counts as absent. */
export function confirmationStatus(confirmation: OwnershipConfirmation | null, now: Date = new Date()): ConfirmationStatus {
    if (!confirmation) return "missing";
    if (confirmation.withdrawnAt) return "withdrawn";
    const expiry = Date.parse(confirmation.expiresAt);
    return Number.isNaN(expiry) || now.getTime() >= expiry ? "expired" : "valid";
}

/** The hosts the site uses, so a mistyped host is refused (Decision 2): its target address, and every page and request host its saved crawls recorded. */
export async function hostsTheSiteUses(origin: string): Promise<Set<string>> {
    const hosts = new Set<string>([new URL(origin).hostname]);
    const add = (url: unknown) => {
        if (typeof url !== "string") return;
        try {
            const parsed = new URL(url);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") hosts.add(parsed.hostname);
        } catch { /* not an address */ }
    };
    const site = join(dataDir(), "site-suites", siteFolderName(origin));
    for (const entry of await readdir(site, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) continue;
        const text = await readFile(join(site, entry.name, "profile.json"), "utf8").catch(() => null);
        try {
            const profile = text ? (JSON.parse(text) as { pages?: Array<{ url?: unknown }>; dependencyMap?: Array<{ host?: unknown; sampleUrl?: unknown }> }) : null;
            for (const page of profile?.pages ?? []) add(page?.url);
            for (const dependency of profile?.dependencyMap ?? []) {
                add(dependency?.sampleUrl);
                // The entry's own host (with any port), for one recorded without a sample address.
                if (typeof dependency?.host === "string") add(`http://${dependency.host}`);
            }
        } catch { /* an unreadable profile adds nothing */ }
    }
    return hosts;
}

export interface ConfirmationRequest {
    hosts?: unknown;
    basis?: unknown;
    wording?: unknown;
    name?: unknown;
    contactEmail?: unknown;
    expiresAt?: unknown;
    scopes?: unknown;
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Decision 5's limit: the same date a year on, or 28 February for a confirmation made on 29 February. */
function oneYearOn(now: Date): Date {
    const latest = new Date(now);
    latest.setUTCFullYear(latest.getUTCFullYear() + 1);
    if (latest.getUTCMonth() !== now.getUTCMonth()) latest.setUTCDate(0);
    return latest;
}
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** A host as a tester must type it: a host name, lower case, with no scheme, port, path or wildcard. */
function hostRefusal(host: unknown): string | null {
    if (typeof host !== "string") return `each host must be typed as text: ${JSON.stringify(host)} isn't`;
    if (!host.trim()) return "each host must be typed: an empty one was given";
    const typed = host.trim();
    if (typed.includes("*")) return `"${typed}" is a wildcard: type each host in full (Decision 2)`;
    let parsed: URL | null = null;
    try {
        parsed = new URL(`http://${typed}`);
    } catch { /* refused below */ }
    if (!parsed || parsed.hostname !== typed.toLowerCase() || typed.includes("/")) return `"${typed}" isn't a host name: type it as shop.example.com, with no scheme, port or path`;
    return null;
}

/**
 * Decision 13's refusals, each with its reason: a missing field, an untyped or wildcard host, a host the site doesn't
 * use, wording that isn't the text for its basis, an invalid contact email, and an expiry beyond 1 year. Returns the
 * confirmation to save, or the reasons it is refused.
 */
export async function validateConfirmation(origin: string, request: ConfirmationRequest, now: Date = new Date()): Promise<{ confirmation: OwnershipConfirmation } | { refused: string[] }> {
    const refused: string[] = [];
    const hosts = Array.isArray(request.hosts) ? request.hosts : [];
    if (hosts.length === 0) refused.push("hosts is missing: type each host the confirmation covers");
    const typed: string[] = [];
    for (const host of hosts) {
        const reason = hostRefusal(host);
        if (reason) refused.push(reason);
        else typed.push((host as string).trim().toLowerCase());
    }
    if (typed.length > 0) {
        const used = await hostsTheSiteUses(origin);
        for (const host of typed) if (!used.has(host)) refused.push(hostNotUsedReason(host));
    }
    const basis = request.basis as ConfirmationBasis;
    if (!(CONFIRMATION_BASES as readonly unknown[]).includes(request.basis)) refused.push(`basis is missing or unknown: it must be one of ${CONFIRMATION_BASES.join(", ")}`);
    const wording = typeof request.wording === "string" ? request.wording : "";
    if (!wording.trim()) refused.push("wording is missing: send the confirmation text the tester confirmed");
    else if (CONFIRMATION_WORDING[basis] && wording !== CONFIRMATION_WORDING[basis]) refused.push("wording isn't the confirmation text for this basis: show the current text and send it back unchanged");
    const name = text(request.name);
    if (!name) refused.push("name is missing: the name of the person who confirms");
    const contactEmail = text(request.contactEmail);
    if (!contactEmail) refused.push("contactEmail is missing: how to reach the person who confirms");
    else if (!EMAIL.test(contactEmail)) refused.push(`contactEmail "${contactEmail}" isn't a valid email address`);
    const latest = oneYearOn(now);
    let expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const chosen = request.expiresAt;
    if (chosen !== undefined && chosen !== null) {
        // Only an unambiguous date: a date alone (midnight UTC) or a date-time with its zone. A date-time with no zone
        // would be read in the server's local time, and Date accepts free text such as "Nov 20 2026".
        if (typeof chosen !== "string" || Number.isNaN(Date.parse(chosen))) refused.push("expiresAt isn't a date");
        else if (!ISO_DATE.test(chosen)) refused.push("expiresAt must be an ISO 8601 date (2027-02-13) or a date-time with its zone (2027-02-13T09:00:00Z)");
        else if (Date.parse(chosen) <= now.getTime()) refused.push("expiresAt is not after the date confirmed");
        else if (Date.parse(chosen) > latest.getTime()) refused.push(`expiresAt is beyond 1 year from the date confirmed (at most ${latest.toISOString()})`);
        else expiresAt = new Date(chosen);
    }
    const scopes = (request.scopes ?? {}) as { active?: unknown; load?: unknown };
    if (typeof scopes !== "object" || ["active", "load"].some((key) => (scopes as Record<string, unknown>)[key] !== undefined && typeof (scopes as Record<string, unknown>)[key] !== "boolean")) {
        refused.push("scopes must be { active: true|false, load: true|false }");
    }
    if (refused.length > 0) return { refused };
    return {
        confirmation: {
            hosts: [...new Set(typed)],
            basis,
            wording,
            name,
            contactEmail,
            confirmedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            scopes: { active: scopes.active === true, load: scopes.load === true },
        },
    };
}

/** Create or replace the site's confirmation. The one it replaces, if any, moves to the history. */
export async function saveConfirmation(origin: string, confirmation: OwnershipConfirmation): Promise<OwnershipFile> {
    const saved = await updateOwnership(origin, (file) => {
        const next = { current: confirmation, history: file.current ? [...file.history, file.current] : file.history };
        return { file: next, result: next };
    });
    return saved!;
}

/**
 * Decision 6: withdraw it, at any time, an expired one too. It is kept, with its withdrawal date; the next run treats
 * it as absent. Null when the site has none, or it is already withdrawn.
 */
export async function withdrawConfirmation(origin: string, now: Date = new Date()): Promise<OwnershipFile | null> {
    return updateOwnership(origin, (file) => {
        if (!file.current || file.current.withdrawnAt) return null;
        const next = { current: { ...file.current, withdrawnAt: now.toISOString() }, history: file.history };
        return { file: next, result: next };
    });
}
