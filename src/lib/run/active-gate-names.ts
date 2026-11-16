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
