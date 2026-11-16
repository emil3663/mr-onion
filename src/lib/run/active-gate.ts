import { isLocalDevelopmentHost } from "@/lib/comprehensive/run-mode";
import { confirmationStatus, loadOwnership, originOf, type ConfirmationStatus, type OwnershipConfirmation } from "@/lib/ownership/confirmation";
import { ACTIVE_ENV_VAR, ACTIVE_GATE_ENV_VAR, ACTIVE_GATE_OPEN } from "@/lib/run/active-gate-names";

/**
 * Phase 43 (TFP-219; Decisions 3, 4, 7, 8 and 11; review item 2): whether a run's active gate is open.
 *
 * Two things must both be true (Decision 4):
 * - the run asked for active tests: `MRONION_ACTIVE`, which the executor always sets to "0" or "1" from the run's
 *   request, never from the environment Mr Onion runs in (review item 2, as `MRONION_INTERACTIVE` is set);
 * - the target host is a local host (Decision 7), or is covered by the site's valid confirmation with the active tick.
 *
 * The decision reaches the run's tests as `MRONION_ACTIVE_GATE`: "open", or the reason it is closed. An active-gate
 * test checks only that, so a shell or CI setting `MRONION_ACTIVE=1` opens nothing.
 *
 * When the gate is closed the run still runs (Decision 8): each active test is Not run with the reason, which says what
 * to do. Nothing prompts mid-run.
 */
export { ACTIVE_ENV_VAR, ACTIVE_GATE_ENV_VAR, ACTIVE_GATE_OPEN, ACTIVE_GATE_UNSET_REASON } from "@/lib/run/active-gate-names";

export type ActiveGateClosedBy = "not-asked" | ConfirmationStatus | "host-not-covered" | "no-active-tick" | "no-host";

/**
 * The run's copy of the confirmation as it was when the run started (Decision 1), so a later withdrawal doesn't
 * rewrite an old run's history. The contact email is left out: it stays in the local confirmation file only, never in
 * a run record or a report (Acceptance Criterion 5).
 */
export interface RunOwnershipCopy {
    status: ConfirmationStatus;
    hosts: string[];
    basis: OwnershipConfirmation["basis"];
    name: string;
    confirmedAt: string;
    expiresAt: string;
    scopes: OwnershipConfirmation["scopes"];
    withdrawnAt?: string;
}

export interface ActiveGate {
    /** What the run asked for (MRONION_ACTIVE). */
    requested: boolean;
    open: boolean;
    /** Why it is closed; null when open. */
    closedBy: ActiveGateClosedBy | null;
    /** The closed reason, as each active test gives it; null when open. */
    reason: string | null;
    /** The target host was a local host, which needs no confirmation (Decision 7). */
    localHost: boolean;
    /** The site's confirmation as the run started, without its contact email; null when it has none. */
    confirmation: RunOwnershipCopy | null;
}

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "an unknown date");

export function ownershipCopy(confirmation: OwnershipConfirmation | null, now: Date = new Date()): RunOwnershipCopy | null {
    if (!confirmation) return null;
    return {
        status: confirmationStatus(confirmation, now),
        hosts: [...confirmation.hosts],
        basis: confirmation.basis,
        name: confirmation.name,
        confirmedAt: confirmation.confirmedAt,
        expiresAt: confirmation.expiresAt,
        scopes: { ...confirmation.scopes },
        ...(confirmation.withdrawnAt ? { withdrawnAt: confirmation.withdrawnAt } : {}),
    };
}

/**
 * Decision 8's reasons, one per way the gate is closed, each saying what to do. The wording starts "active test:" so
 * the report groups them with each other.
 */
export function closedReason(closedBy: ActiveGateClosedBy, host: string, confirmation: RunOwnershipCopy | null): string {
    switch (closedBy) {
        case "not-asked":
            return "active test: this run didn't turn active tests on";
        case "missing":
            return `active test: the site has no ownership confirmation; confirm the site (docs/SITE_OWNERSHIP.md) to run active tests on ${host}`;
        case "expired":
            return `active test: the site's ownership confirmation expired on ${day(confirmation?.expiresAt)}; renew it to run active tests`;
        case "withdrawn":
            return `active test: the site's ownership confirmation was withdrawn on ${day(confirmation?.withdrawnAt)}; confirm the site again to run active tests`;
        case "host-not-covered":
            return `active test: the site's ownership confirmation doesn't cover ${host}; add the host to it to run active tests there`;
        case "no-active-tick":
            return "active test: the site's ownership confirmation doesn't allow active tests; confirm it again with the active tick";
        case "no-host":
            return "active test: the run has no target address to check against an ownership confirmation";
        default:
            return "active test: the active gate is closed";
    }
}

/** The gate for a run, from what it asked for and its target host's confirmation, as read when it starts. */
export function decideActiveGate(requested: boolean, baseUrl: string | undefined, confirmation: OwnershipConfirmation | null, now: Date = new Date()): ActiveGate {
    const copy = ownershipCopy(confirmation, now);
    let host = "";
    try {
        host = new URL(baseUrl ?? "").hostname.toLowerCase();
    } catch { /* no host */ }
    const localHost = Boolean(host) && isLocalDevelopmentHost(baseUrl);
    const closed = (closedBy: ActiveGateClosedBy): ActiveGate => ({ requested, open: false, closedBy, reason: closedReason(closedBy, host, copy), localHost, confirmation: copy });
    if (!requested) return closed("not-asked");
    if (!host) return closed("no-host");
    if (localHost) return { requested, open: true, closedBy: null, reason: null, localHost, confirmation: copy };
    if (!copy || copy.status !== "valid") return closed(copy?.status ?? "missing");
    if (!copy.hosts.includes(host)) return closed("host-not-covered");
    if (!copy.scopes.active) return closed("no-active-tick");
    return { requested, open: true, closedBy: null, reason: null, localHost, confirmation: copy };
}

/** The site's confirmation for a run's target address, read from the data folder; null with no address or none saved. */
export async function confirmationForRun(baseUrl: string | undefined): Promise<OwnershipConfirmation | null> {
    const origin = originOf(baseUrl);
    return origin ? (await loadOwnership(origin)).current : null;
}

/** The gate in one line, as the run's output and its report say it. */
export function describeActiveGate(gate: ActiveGate): string {
    if (gate.open) return gate.localHost ? "open (a local host, which needs no ownership confirmation)" : "open (the site's ownership confirmation covers the host, with the active tick)";
    return `closed (${gate.reason})`;
}

/** The two settings the run's tests get (each also under its old name, by runEnv). */
export function activeGateEnv(gate: ActiveGate): Record<string, string> {
    return { [ACTIVE_ENV_VAR]: gate.requested ? "1" : "0", [ACTIVE_GATE_ENV_VAR]: gate.open ? ACTIVE_GATE_OPEN : gate.reason ?? "closed" };
}
