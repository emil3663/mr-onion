import type { ActiveGate, RunOwnershipCopy } from "@/lib/run/active-gate";
import { escapeReportHtml } from "./text";

/**
 * Phase 43 (TFP-219, Acceptance Criterion 5; Decisions 1, 5 and 8): what a run's report says about the site's ownership
 * confirmation and its active gate.
 * - A run with a confirmation names it: hosts, basis, name, date, expiry and scopes, as it was when the run started.
 * - The contact email is never in it: the run's copy never held it (src/lib/run/active-gate.ts).
 * - A missing, expired or withdrawn confirmation says so, with what to do.
 */
export interface RunOwnershipSection {
    activeGate: { requested: boolean; open: boolean; reason: string | null; localHost: boolean };
    confirmation: RunOwnershipCopy | null;
    /** What to do about a missing, expired or withdrawn confirmation; null for a valid one. */
    fix: string | null;
}

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "an unknown date");

export function ownershipSection(gate: ActiveGate): RunOwnershipSection {
    const copy = gate.confirmation;
    const status = copy?.status ?? "missing";
    // A local host needs no confirmation (Decision 7), so there is nothing to tell the tester to fix.
    const fix =
        gate.localHost && !copy ? null
        : status === "missing" ?"This site has no ownership confirmation. Confirm it (docs/SITE_OWNERSHIP.md) to run active tests on it."
        : status === "expired" ? `The site's ownership confirmation expired on ${day(copy?.expiresAt)}. Confirm it again to renew it.`
        : status === "withdrawn" ? `The site's ownership confirmation was withdrawn on ${day(copy?.withdrawnAt)}. Confirm it again if you still may test the site.`
        : null;
    return {
        activeGate: { requested: gate.requested, open: gate.open, reason: gate.reason, localHost: gate.localHost },
        confirmation: copy ? { ...copy, hosts: [...copy.hosts], scopes: { ...copy.scopes } } : null,
        fix,
    };
}

/** The section as lines of text: the HTML report's, and anything else that prints it. */
export function describeOwnership(section: RunOwnershipSection): string[] {
    const lines: string[] = [];
    const { activeGate, confirmation } = section;
    lines.push(activeGate.open
        ? `Active gate: open${activeGate.localHost ? " (a local host, which needs no ownership confirmation)" : ""}.`
        : `Active gate: closed. ${activeGate.reason ?? ""}`.trim());
    if (confirmation) {
        const basis = confirmation.basis === "owner" ? "owns the site" : "has written permission to test it";
        const ticks = [confirmation.scopes.active ? "active tests" : "", confirmation.scopes.load ? "load testing" : ""].filter(Boolean);
        lines.push(`Ownership confirmation (${confirmation.status}): ${confirmation.name} ${basis}. Hosts: ${confirmation.hosts.join(", ")}. Confirmed ${day(confirmation.confirmedAt)}, expires ${day(confirmation.expiresAt)}${confirmation.withdrawnAt ? `, withdrawn ${day(confirmation.withdrawnAt)}` : ""}. Ticked: ${ticks.length > 0 ? ticks.join(" and ") : "neither active tests nor load testing"}.`);
    }
    if (section.fix) lines.push(section.fix);
    return lines;
}

export function buildOwnershipHtmlSection(section: RunOwnershipSection | undefined): string {
    if (!section) return "";
    return `<div class="section-heading">Ownership confirmation and the active gate</div>
                <div>${describeOwnership(section).map((line) => `<div class="issue-body">${escapeReportHtml(line)}</div>`).join("")}</div>`;
}
