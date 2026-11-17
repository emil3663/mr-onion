// Phase 43 (TFP-219): the active gate's setting names and fixed texts, in a module of their own so the UI and the
// report can import them (through test-gates.ts) without the confirmation store, which reads the file system. What
// they mean is in active-gate.ts.

/** What the run asked for: "0" or "1", always set by the executor from the run's request (review item 2). */
export const ACTIVE_ENV_VAR = "MRONION_ACTIVE";

/** The executor's decision, as each active test reads it: "open", or the reason the gate is closed. */
export const ACTIVE_GATE_ENV_VAR = "MRONION_ACTIVE_GATE";
export const ACTIVE_GATE_OPEN = "open";

/** The reason a generated active test gives when it runs outside a Mr Onion run (no gate setting at all). */
export const ACTIVE_GATE_UNSET_REASON = "active test: runs only in a Mr Onion run that turns active tests on, on a host the site's ownership confirmation covers";

/**
 * TFP-220 (Decision 9): the hosts an active test may reach, comma-separated, always set by the executor: with the gate
 * open, the target host when it is local and every host of a valid confirmation with the active tick; otherwise empty.
 */
export const ACTIVE_HOSTS_ENV_VAR = "MRONION_ACTIVE_HOSTS";

/**
 * Phase 46 (TFP-235): whether a suite has active tests, so the run form shows the active switch only where it does
 * something: each generated active test reads the gate's setting (test-gates.ts's ACTIVE_GATE_SKIP).
 */
export function checksActiveGate(code: string): boolean {
    return code.includes(ACTIVE_GATE_ENV_VAR);
}

/**
 * Phase 46 (TFP-297, Gate B's walkthrough): with the gate open, the hosts the site's saved crawl recorded that the
 * confirmation doesn't cover, comma-separated. When the covered-host guard stops a read to one of them, its note says the
 * result may not reflect the page and to add the host to the confirmation; a third-party host stays a plain note.
 */
export const SITE_HOSTS_ENV_VAR = "MRONION_SITE_HOSTS";
