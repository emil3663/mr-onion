import { LOGIN_FIELD_LABELS } from "@/lib/run/login-fields";

/**
 * Phase 46 Gate B, R3 (the owner's re-walk, 2026-11-18): an API message naming one of the API's own fields
 * (`contactEmail is missing: ...`, `baseUrl must be ...`, `Login config: "usernameEnv" is required.`) is shown with the
 * screen's label for that field. A leading name, matched whole, is replaced; with `quoted`, so is a field name in
 * double quotes anywhere in the message (the run's login refusals quote theirs). The rest of the message is the API's,
 * unchanged. What a refusal is about is still read from the API's own text (`refusalField`, R2).
 */

export type FieldLabels = Readonly<Record<string, string>>;

/** The confirmation form's labels for the API's request fields, as the form shows them (checked against it, RUN-82). */
export const CONFIRMATION_LABELS: FieldLabels = {
    hosts: "Hosts",
    basis: "Basis",
    wording: "The statement",
    name: "Your name",
    contactEmail: "Contact email",
    expiresAt: "Expires on",
    scopes: "What it allows",
    baseUrl: "The site's address",
};

/** The site lookup's labels for the fields its routes name. */
export const LOOKUP_LABELS: FieldLabels = {
    baseUrl: "Site URL",
    gapWriter: "Who writes gap tests",
};

/** The run form's: its Base URL, and the login section's fields (TFP-097's labels). */
export const RUN_FORM_LABELS: FieldLabels = {
    baseUrl: "Base URL",
    ...LOGIN_FIELD_LABELS,
};

export function withLabels(message: string, labels: FieldLabels, options: { quoted?: boolean } = {}): string {
    const has = (name: string) => Object.hasOwn(labels, name);
    let shown = message;
    const name = /^([A-Za-z]+)(?![\w-])/.exec(shown)?.[1];
    if (name && has(name)) shown = labels[name] + shown.slice(name.length);
    if (options.quoted) shown = shown.replace(/"([A-Za-z]+)"/g, (whole, quoted: string) => (has(quoted) ? `"${labels[quoted]}"` : whole));
    return shown;
}
