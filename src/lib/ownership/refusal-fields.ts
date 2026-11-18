/**
 * Phase 46 Gate B, R2 (the owner's re-walk, 2026-11-18): which field of the confirmation form an API refusal is about,
 * so the form can show it beside that field. The API's refusals (`validateConfirmation`, Phase 43 Decision 13) each
 * begin with the request field they are about, or, for a host, with the host itself in quotes or "each host". No
 * file-system imports: the form is a client component.
 */

export type ConfirmationField = "hosts" | "basis" | "wording" | "name" | "contactEmail" | "expiresAt" | "scopes";

/** The form's order, for focusing the first refused field. */
export const CONFIRMATION_FIELDS: readonly ConfirmationField[] = ["hosts", "basis", "wording", "name", "contactEmail", "expiresAt", "scopes"];

/** The field a refusal is about, or null for one about no field (the server's own failure, say). */
export function refusalField(reason: string): ConfirmationField | null {
    if (reason.startsWith("\"") || reason.startsWith("each host")) return "hosts";
    const first = /^(\w+)\s/.exec(reason)?.[1];
    return first && (CONFIRMATION_FIELDS as readonly string[]).includes(first) ? (first as ConfirmationField) : null;
}
