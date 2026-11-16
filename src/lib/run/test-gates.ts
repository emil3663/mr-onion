// Phase 38 Decision 1 (TFP-146): every generated test runs behind one of
// three gates, declared in a static `gate` annotation.
// - read-only: loading pages and reading what comes back, the axe scan,
//   interactions that send nothing to the server, and one missing-page probe
//   per run. Always on. Phase 41 Decision 3 (TFP-181) widens it: an
//   interaction whose requests are all GETs and that submits no form (a
//   sort, a filter, a stepper, a link followed) is read-only too, run under
//   the request guard (src/lib/generate/read-only-guard.ts), which aborts
//   anything else and fails the test as a guard breach.
// - interactive: submitting forms with valid or harmlessly invalid data. Runs
//   only with MRONION_INTERACTIVE=1 (Phase 19 Decision 2, unchanged).
// - active: attack-shaped input, lockout and rate-limit probing, load testing.
//   Phase 43 (TFP-219, Decision 4): open only when the run asks for active
//   tests and its target host is local or covered by the site's ownership
//   confirmation with the active tick (src/lib/run/active-gate.ts). The
//   executor decides it as the run starts and hands each test the outcome.
// A closed gate makes the test Not run with its reason, never absent and
// never failed. Kept apart from the generator, like interactive.ts, so the
// report and the UI can import it.

import { ACTIVE_GATE_ENV_VAR, ACTIVE_GATE_OPEN, ACTIVE_GATE_UNSET_REASON } from "@/lib/run/active-gate-names";

export const TEST_GATES = ["read-only", "interactive", "active"] as const;
export type TestGate = (typeof TEST_GATES)[number];

/** The static annotation type each generated test declares its gate in. */
export const GATE_ANNOTATION = "gate";

/**
 * TFP-219: an active-gate test's reason when it runs with no gate setting at all, outside a Mr Onion run. In a run, the
 * executor's reason (Decision 8's, one per way the gate is closed) is given instead.
 */
export const ACTIVE_GATE_REASON = ACTIVE_GATE_UNSET_REASON;

/** Decision 11: a model-written test at the active gate is never run, whether the gate is open or not. */
export const MODEL_ACTIVE_REASON = "model-written active test: not run";

export function isTestGate(value: unknown): value is TestGate {
    return typeof value === "string" && (TEST_GATES as readonly string[]).includes(value);
}

/** `{ annotation: { type: 'gate', description: '<gate>' } }`: a test's or describe's details argument. */
export function gateDetails(gate: TestGate) {
    return `{ annotation: ${gateAnnotation(gate)} }`;
}

/** One `{ type: 'gate', ... }` entry, for a details object that carries other annotations too. */
export function gateAnnotation(gate: TestGate) {
    return `{ type: '${GATE_ANNOTATION}', description: '${gate}' }`;
}

/**
 * The gates closed for a run: interactive unless the run turned interactive tests on, and active unless its active
 * gate was open (TFP-219). Read-only never closes.
 */
export function closedGates(interactiveEnabled: boolean, activeOpen = false): TestGate[] {
    return [...(interactiveEnabled ? [] : ["interactive" as const]), ...(activeOpen ? [] : ["active" as const])];
}

/**
 * The first statement of an active-gate test (TFP-219): a check at run time, of the gate the executor decided for the
 * run. Closed, the test is Not run with the executor's reason.
 */
export const ACTIVE_GATE_SKIP = `test.skip(process.env.${ACTIVE_GATE_ENV_VAR} !== '${ACTIVE_GATE_OPEN}', process.env.${ACTIVE_GATE_ENV_VAR} || '${ACTIVE_GATE_REASON.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');`;

/** The first statement of a model-written active-gate test (Decision 11): never run. */
export const MODEL_ACTIVE_SKIP = `test.skip(true, '${MODEL_ACTIVE_REASON}');`;

// A test call with no details argument yet: `test('title', async ...`.
const UNDECLARED_TEST = /^(\s*test\('(?:[^'\\]|\\.)*'),\s*async\b/;

/**
 * Decision 3: every test that is not interactive or active is read-only. The
 * builders of interactive and active tests declare their gate in the test
 * itself; every other Standard test gets read-only here, where suites are
 * rendered, so no builder can leave a test without one.
 */
export function withDefaultGate(testSource: string, gate: TestGate = "read-only") {
    return testSource.replace(UNDECLARED_TEST, (_match, head: string) => `${head}, ${gateDetails(gate)}, async`);
}
