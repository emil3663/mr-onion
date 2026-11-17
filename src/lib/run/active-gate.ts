import { isLocalDevelopmentHost } from "@/lib/comprehensive/run-mode";
import { confirmationStatus, loadOwnership, originOf, type ConfirmationStatus, type OwnershipConfirmation } from "@/lib/ownership/confirmation";
import { ACTIVE_ENV_VAR, ACTIVE_GATE_ENV_VAR, ACTIVE_GATE_OPEN, ACTIVE_HOSTS_ENV_VAR } from "@/lib/run/active-gate-names";

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
 *
 * TFP-220 (Decision 9): with the gate open, the run's tests also get `MRONION_ACTIVE_HOSTS`, the hosts an active test
 * may reach; the covered-host guard (src/lib/generate/active-guard.ts) stops anything else. A CLI run never asks for
 * active tests (review item 3), and says why: not in CI until TFP-249.
 */

export type ActiveGateClosedBy = "not-asked" | "ci" | ConfirmationStatus | "host-not-covered" | "no-active-tick" | "no-host";

/** What a run asked for: active tests or not, or "ci" for a CLI run, which can't ask yet (review item 3, TFP-249). */
export type ActiveRequest = boolean | "ci";

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
    /**
     * TFP-220 (Decision 9): the hosts an active test may reach, with the gate open: the target host when it is local,
     * and every host of a valid confirmation with the active tick. Empty when closed.
     */
    coveredHosts: string[];
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
        case "ci":
            return "active test: not available in CI yet (TFP-249)";
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

/**
 * Phase 46 (TFP-295, Gate B's walkthrough): the same reasons as the app shows them, beside the run form's switch. The
 * tester fixes each in the site lookup, so they point there; a run's report keeps closedReason's, with the docs path.
 */
export function closedReasonInApp(closedBy: ActiveGateClosedBy, host: string, confirmation: RunOwnershipCopy | null): string {
    switch (closedBy) {
        case "missing":
            return `active test: the site has no ownership confirmation; confirm it in the site lookup to run active tests on ${host}`;
        case "expired":
            return `active test: the site's ownership confirmation expired on ${day(confirmation?.expiresAt)}; renew it in the site lookup to run active tests`;
        case "withdrawn":
            return `active test: the site's ownership confirmation was withdrawn on ${day(confirmation?.withdrawnAt)}; confirm the site again in the site lookup to run active tests`;
        case "host-not-covered":
            return `active test: the site's ownership confirmation doesn't cover ${host}; add the host to it in the site lookup to run active tests there`;
        case "no-active-tick":
            return "active test: the site's ownership confirmation doesn't allow active tests; change it in the site lookup to tick active tests";
        default:
            return closedReason(closedBy, host, confirmation);
    }
}

/** The gate for a run, from what it asked for and its target host's confirmation, as read when it starts. */
export function decideActiveGate(request: ActiveRequest, baseUrl: string | undefined, confirmation: OwnershipConfirmation | null, now: Date = new Date()): ActiveGate {
    const requested = request === true;
    const copy = ownershipCopy(confirmation, now);
    const host = hostOf(baseUrl);
    const localHost = Boolean(host) && isLocalDevelopmentHost(baseUrl);
    const closed = (closedBy: ActiveGateClosedBy): ActiveGate => ({ requested, open: false, closedBy, reason: closedReason(closedBy, host, copy), localHost, coveredHosts: [], confirmation: copy });
    // TFP-220 (Decision 9): a valid confirmation with the active tick covers its hosts; a local target covers itself.
    const confirmed = copy?.status === "valid" && copy.scopes.active ? copy.hosts : [];
    const open = (): ActiveGate => ({ requested, open: true, closedBy: null, reason: null, localHost, coveredHosts: [...new Set([...(localHost ? [host] : []), ...confirmed])], confirmation: copy });
    if (request === "ci") return closed("ci");
    if (!requested) return closed("not-asked");
    if (!host) return closed("no-host");
    if (localHost) return open();
    if (!copy || copy.status !== "valid") return closed(copy?.status ?? "missing");
    if (!copy.hosts.includes(host)) return closed("host-not-covered");
    if (!copy.scopes.active) return closed("no-active-tick");
    return open();
}

/** A run's target host as the gate and the caps compare it with a confirmation's hosts: lower case, "" with none. */
export function hostOf(baseUrl: string | undefined): string {
    try {
        return new URL(baseUrl ?? "").hostname.toLowerCase();
    } catch {
        return "";
    }
}

/**
 * Phase 39 Decision 10's ownership row, as TFP-220 builds it on the stored confirmation (Decision 3): the caps are
 * lifted on a host a valid confirmation covers, whatever its ticks. It replaces TFP-157's stub.
 */
export function confirmationCoversHost(confirmation: OwnershipConfirmation | null, baseUrl: string | undefined, now: Date = new Date()): boolean {
    const host = hostOf(baseUrl);
    return Boolean(host) && confirmation !== null && confirmationStatus(confirmation, now) === "valid" && confirmation.hosts.includes(host);
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

/** The three settings the run's tests get (each also under its old name, by runEnv), always set, never inherited. */
export function activeGateEnv(gate: ActiveGate): Record<string, string> {
    return {
        [ACTIVE_ENV_VAR]: gate.requested ? "1" : "0",
        [ACTIVE_GATE_ENV_VAR]: gate.open ? ACTIVE_GATE_OPEN : gate.reason ?? "closed",
        [ACTIVE_HOSTS_ENV_VAR]: gate.open ? gate.coveredHosts.join(",") : "",
    };
}
