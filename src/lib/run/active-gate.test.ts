/**
 * Phase 43 (TFP-219; Acceptance Criteria 2, 5 and 6; Decisions 4, 7, 8, 10 and 11): the active gate's decision, what
 * a run's tests are told, and what the report says. The same rules in a real run, through the executor:
 * active-gate.run.test.ts.
 *
 * ISTQB technique: decision table. Conditions: the run's switch (off; on), the host (local; remote) and the site's
 * confirmation (missing; expired; withdrawn; not covering the host; without the active tick; valid with it). Columns:
 *   switch off, any confirmation          -> closed, "didn't turn active tests on"
 *   switch on, local host, none           -> open (Decision 7)
 *   switch on, remote, missing            -> closed, its own reason
 *   switch on, remote, expired            -> closed, its own reason, with the date
 *   switch on, remote, withdrawn          -> closed, its own reason, with the date
 *   switch on, remote, host not covered   -> closed, its own reason, naming the host
 *   switch on, remote, no active tick     -> closed, its own reason
 *   switch on, remote, valid with tick    -> open
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/run/active-gate.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import type { OwnershipConfirmation } from "../ownership/confirmation.ts";

const { activeGateEnv, confirmationCoversHost, decideActiveGate, describeActiveGate, ownershipCopy } = await import("./active-gate.ts");
const { ACTIVE_GATE_SKIP, closedGates, MODEL_ACTIVE_SKIP } = await import("./test-gates.ts");
const { runEnv } = await import("./child-env.ts");
const { ownershipSection, buildOwnershipHtmlSection } = await import("../report/ownership.ts");
const { findTypeErrors } = await import("../generate/validate.ts");
const { scenarioSkip } = await import("../generate/comprehensive.ts");

const NOW = new Date("2026-11-15T12:00:00.000Z");
const SITE = "https://shop.example.com";
const EMAIL = "tess.private@example.com";
const confirmation = (overrides: Partial<OwnershipConfirmation> = {}): OwnershipConfirmation => ({
    hosts: ["shop.example.com"],
    basis: "owner",
    wording: "the owner wording",
    name: "Tess Tester",
    contactEmail: EMAIL,
    confirmedAt: "2026-11-01T09:00:00.000Z",
    expiresAt: "2027-01-30T09:00:00.000Z",
    scopes: { active: true, load: false },
    ...overrides,
});

test("the decision table: the switch, the host and the confirmation, each closed column with its own reason", () => {
    const columns: Array<[string, boolean | "ci", string, OwnershipConfirmation | null, boolean, string | null]> = [
        ["switch off, a valid confirmation", false, SITE, confirmation(), false, "active test: this run didn't turn active tests on"],
        // TFP-220 (review item 3): a CLI run can't ask yet, whatever the confirmation says.
        ["a CLI run, a valid confirmation", "ci", SITE, confirmation(), false, "active test: not available in CI yet (TFP-249)"],
        ["switch on, a local host, none", true, "http://127.0.0.1:3100", null, true, null],
        ["switch on, missing", true, SITE, null, false, "active test: the site has no ownership confirmation; confirm the site (docs/SITE_OWNERSHIP.md) to run active tests on shop.example.com"],
        ["switch on, expired", true, SITE, confirmation({ expiresAt: "2026-11-10T09:00:00.000Z" }), false, "active test: the site's ownership confirmation expired on 2026-11-10; renew it to run active tests"],
        ["switch on, withdrawn", true, SITE, confirmation({ withdrawnAt: "2026-11-12T09:00:00.000Z" }), false, "active test: the site's ownership confirmation was withdrawn on 2026-11-12; confirm the site again to run active tests"],
        ["switch on, host not covered", true, "https://api.example.com", confirmation(), false, "active test: the site's ownership confirmation doesn't cover api.example.com; add the host to it to run active tests there"],
        ["switch on, no active tick", true, SITE, confirmation({ scopes: { active: false, load: true } }), false, "active test: the site's ownership confirmation doesn't allow active tests; confirm it again with the active tick"],
        ["switch on, valid with the tick", true, SITE, confirmation(), true, null],
    ];
    const reasons = new Set<string>();
    for (const [label, requested, baseUrl, saved, open, reason] of columns) {
        const gate = decideActiveGate(requested, baseUrl, saved, NOW);
        assert.equal(gate.open, open, label);
        assert.equal(gate.reason, reason, label);
        assert.equal(gate.requested, requested === true, label);
        assert.deepEqual(gate.coveredHosts, open ? [new URL(baseUrl).hostname] : [], `${label}: the hosts its active tests may reach`);
        if (reason) reasons.add(reason);
    }
    assert.equal(reasons.size, 7, "each closed column has a reason of its own");
    // TFP-220 (Decision 9): a local target covers itself, plus the hosts of a valid confirmation with the active tick.
    assert.deepEqual(decideActiveGate(true, "http://localhost:4200", confirmation({ hosts: ["localhost", "api.example.com"] }), NOW).coveredHosts, ["localhost", "api.example.com"]);
    assert.deepEqual(decideActiveGate(true, "http://localhost:4200", confirmation({ hosts: ["api.example.com"], scopes: { active: false, load: false } }), NOW).coveredHosts, ["localhost"], "without the tick, only the local host");
    assert.deepEqual(decideActiveGate(true, "http://localhost:4200", confirmation({ hosts: ["api.example.com"], expiresAt: "2026-11-10T09:00:00.000Z" }), NOW).coveredHosts, ["localhost"], "an expired one covers nothing");
    assert.deepEqual(decideActiveGate(true, SITE, confirmation({ hosts: ["shop.example.com", "api.example.com"] }), NOW).coveredHosts, ["shop.example.com", "api.example.com"]);
    // Decision 7: every local host of Phase 39's list opens on the switch alone, and none opens without it.
    for (const local of ["http://localhost:3000", "http://[::1]:8080", "http://shop.localhost", "http://toolshop.test"]) {
        assert.equal(decideActiveGate(true, local, null, NOW).open, true, local);
        assert.equal(decideActiveGate(false, local, null, NOW).open, false, local);
    }
});

test("what a run's tests are told: the switch as asked, and the gate as decided, under both names", () => {
    const open = activeGateEnv(decideActiveGate(true, SITE, confirmation({ hosts: ["shop.example.com", "api.example.com"] }), NOW));
    assert.deepEqual(open, { MRONION_ACTIVE: "1", MRONION_ACTIVE_GATE: "open", MRONION_ACTIVE_HOSTS: "shop.example.com,api.example.com" });
    const closed = activeGateEnv(decideActiveGate(true, SITE, null, NOW));
    assert.equal(closed.MRONION_ACTIVE, "1", "the switch says what the run asked for");
    assert.match(closed.MRONION_ACTIVE_GATE, /^active test: the site has no ownership confirmation/);
    assert.equal(closed.MRONION_ACTIVE_HOSTS, "", "a closed gate covers no host");
    assert.deepEqual(activeGateEnv(decideActiveGate(false, SITE, confirmation(), NOW)).MRONION_ACTIVE, "0");
    assert.deepEqual(activeGateEnv(decideActiveGate("ci", SITE, confirmation(), NOW)), { MRONION_ACTIVE: "0", MRONION_ACTIVE_GATE: "active test: not available in CI yet (TFP-249)", MRONION_ACTIVE_HOSTS: "" }, "review item 3: a CLI run sets MRONION_ACTIVE=0");

    // Review item 2: the run's environment is built from what Mr Onion sets, never from its own. An ambient switch
    // or gate doesn't reach the run; what the executor sets does, under the old names too (Phase 48 Decision 8).
    const env = runEnv({ ...closed }, { PATH: "/bin", MRONION_ACTIVE: "1", MRONION_ACTIVE_GATE: "open", TESTFORGE_ACTIVE_GATE: "open", MRONION_ACTIVE_HOSTS: "elsewhere.example.com" } as unknown as NodeJS.ProcessEnv);
    assert.equal(env.MRONION_ACTIVE_HOSTS, "", "an ambient host list never widens what an active test may reach");
    assert.equal(env.TESTFORGE_ACTIVE_HOSTS, "");
    assert.equal(env.MRONION_ACTIVE_GATE, closed.MRONION_ACTIVE_GATE);
    assert.equal(env.TESTFORGE_ACTIVE_GATE, closed.MRONION_ACTIVE_GATE);
    assert.equal(env.TESTFORGE_ACTIVE, "1");
    const unset = runEnv({}, { PATH: "/bin", MRONION_ACTIVE: "1", MRONION_ACTIVE_GATE: "open" } as unknown as NodeJS.ProcessEnv);
    assert.equal(unset.MRONION_ACTIVE_GATE, undefined, "an ambient gate is never passed on");
    assert.equal(unset.MRONION_ACTIVE, undefined);

    assert.equal(describeActiveGate(decideActiveGate(true, SITE, confirmation(), NOW)), "open (the site's ownership confirmation covers the host, with the active tick)");
    assert.equal(describeActiveGate(decideActiveGate(true, "http://localhost:3000", null, NOW)), "open (a local host, which needs no ownership confirmation)");
});

test("the generated lines: the payload test checks the gate at run time, and type-checks; a model-written active test never runs", () => {
    assert.equal(ACTIVE_GATE_SKIP, "test.skip(process.env.MRONION_ACTIVE_GATE !== 'open', process.env.MRONION_ACTIVE_GATE || 'active test: runs only in a Mr Onion run that turns active tests on, on a host the site\\'s ownership confirmation covers');");
    const suite = `import { test } from '@playwright/test';\n\ntest('an active test', async () => {\n  ${ACTIVE_GATE_SKIP}\n});\n\ntest('a model-written one', async () => {\n  ${MODEL_ACTIVE_SKIP}\n});\n`;
    assert.deepEqual(findTypeErrors(suite), []);
    assert.equal(MODEL_ACTIVE_SKIP, "test.skip(true, 'model-written active test: not run');");
    assert.equal(scenarioSkip({ kind: "comprehensive", area: "security" } as never, "qwen"), MODEL_ACTIVE_SKIP, "Decision 11: the local model's security scenarios");
    assert.match(scenarioSkip({ kind: "comprehensive", area: "functional" } as never, "qwen"), /MRONION_INTERACTIVE !== '1'/, "the others stay at the interactive gate");
});

/**
 * TFP-220 (Decision 3, Acceptance Criterion 4): the caps' row, from the stored confirmation in place of TFP-157's
 * stub. Decision table: a valid confirmation covering the host lifts the caps whatever its ticks; expired, withdrawn,
 * covering another host, none, or no host to check -> not lifted.
 */
test("the caps' ownership row: a valid confirmation covering the host, with or without ticks; nothing else", () => {
    const columns: Array<[string, OwnershipConfirmation | null, string | undefined, boolean]> = [
        ["valid, both ticks off", confirmation({ scopes: { active: false, load: false } }), SITE, true],
        ["valid, the active tick", confirmation(), SITE, true],
        ["valid, host in upper case", confirmation(), "https://SHOP.example.com", true],
        ["expired", confirmation({ expiresAt: "2026-11-10T09:00:00.000Z" }), SITE, false],
        ["withdrawn", confirmation({ withdrawnAt: "2026-11-12T09:00:00.000Z" }), SITE, false],
        ["another host", confirmation(), "https://api.example.com", false],
        ["none", null, SITE, false],
        ["no address", confirmation(), undefined, false],
    ];
    for (const [label, saved, baseUrl, lifted] of columns) assert.equal(confirmationCoversHost(saved, baseUrl, NOW), lifted, label);
});

test("the gates a run closes: active only stays open when the run's gate was open", () => {
    assert.deepEqual(closedGates(false), ["interactive", "active"]);
    assert.deepEqual(closedGates(true), ["active"]);
    assert.deepEqual(closedGates(false, true), ["interactive"]);
    assert.deepEqual(closedGates(true, true), []);
});

test("the run's copy and the report name the confirmation, never its contact email, and say what to do when it isn't valid", () => {
    const gate = decideActiveGate(true, SITE, confirmation(), NOW);
    assert.deepEqual(gate.confirmation, { status: "valid", hosts: ["shop.example.com"], basis: "owner", name: "Tess Tester", confirmedAt: "2026-11-01T09:00:00.000Z", expiresAt: "2027-01-30T09:00:00.000Z", scopes: { active: true, load: false } });
    const section = ownershipSection(gate);
    const html = buildOwnershipHtmlSection(section);
    for (const text of [JSON.stringify(gate), JSON.stringify(section), html]) assert.ok(!text.includes(EMAIL) && !text.includes("contactEmail"), text);
    assert.match(html, /Ownership confirmation \(valid\): Tess Tester owns the site\. Hosts: shop\.example\.com\. Confirmed 2026-11-01, expires 2027-01-30\. Ticked: active tests\./);
    assert.match(html, /Active gate: open\./);
    assert.equal(section.fix, null);

    assert.equal(ownershipSection(decideActiveGate(true, SITE, null, NOW)).fix, "This site has no ownership confirmation. Confirm it (docs/SITE_OWNERSHIP.md) to run active tests on it.");
    assert.equal(ownershipSection(decideActiveGate(true, SITE, confirmation({ expiresAt: "2026-11-10T09:00:00.000Z" }), NOW)).fix, "The site's ownership confirmation expired on 2026-11-10. Confirm it again to renew it.");
    assert.equal(ownershipSection(decideActiveGate(false, SITE, confirmation({ withdrawnAt: "2026-11-12T09:00:00.000Z" }), NOW)).fix, "The site's ownership confirmation was withdrawn on 2026-11-12. Confirm it again if you still may test the site.");
    // The switch off and a confirmation that is fine: nothing to fix, and the report still names it.
    const off = ownershipSection(decideActiveGate(false, SITE, confirmation(), NOW));
    assert.equal(off.fix, null);
    assert.match(buildOwnershipHtmlSection(off), /Active gate: closed\. active test: this run didn&#39;t turn active tests on/);
    assert.equal(ownershipCopy(null), null);
    assert.equal(buildOwnershipHtmlSection(undefined), "", "a run from before TFP-219 has no section");
    // A local host needs no confirmation (Decision 7): the report doesn't tell the tester to make one.
    for (const requested of [true, false]) {
        const local = ownershipSection(decideActiveGate(requested, "http://127.0.0.1:3100", null, NOW));
        assert.equal(local.fix, null, `local, switch ${requested ? "on" : "off"}`);
        assert.doesNotMatch(buildOwnershipHtmlSection(local), /Confirm it/);
    }
});

/**
 * TFP-220 (Decision 9), replacing TFP-219's case: an unedited saved active test without the covered-host guard is
 * never reused, so it can't run unguarded with the gate open. TFP-219 upgraded 0.4.0's static skip in place, which
 * made such a test runnable without the guard. Two saved suites: 0.4.0's (the static skip) and TFP-219's (the
 * run-time check alone). In each, the unedited test is replaced by today's fresh one, under the guard; the hand-edited
 * one is kept as the person left it.
 */
for (const [saver, savedSkip] of [["0.4.0", "test.skip(true, 'attack-shaped input: needs the ownership confirmation, not built yet');"], ["TFP-219", "RUNTIME"]] as const) test(`a site suite saved by ${saver}: its unedited active test is replaced by today's, under the covered-host guard; a hand-edited one is left as it is`, async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { applySiteSuite } = await import("../site-suites/reuse.ts");
    const { loadSiteSuite, siteSuiteDir } = await import("../site-suites/store.ts");
    const saved = process.env.MRONION_DATA_DIR;
    const folder = mkdtempSync(join(tmpdir(), "mr-onion-reuse-guard-"));
    process.env.MRONION_DATA_DIR = folder;
    try {
        const skip = savedSkip === "RUNTIME" ? ACTIVE_GATE_SKIP : savedSkip;
        const body = (guarded: boolean) => (guarded ? "    await tfActiveWrap(page);\n    await page.goto('/');\n    await tfActiveGuarded(page, async () => {});" : "    await page.goto('/');");
        const suite = (gate: string, guarded: boolean) => `import { test, expect } from '@playwright/test';\n\ntest.describe('Security', () => {\n  test('TFSC-001: script-shaped input is not executed: Note on /', { annotation: { type: 'gate', description: 'active' } }, async ({ page }) => {\n    ${gate}\n${body(guarded)}\n  });\n\n  test('TFSC-002: another active test', { annotation: { type: 'gate', description: 'active' } }, async ({ page }) => {\n    ${gate}\n${body(guarded)}\n  });\n});\n`;
        const origin = "https://shop.example.com";
        const identity = { runType: "standard" as const, practices: ["security"], auditMode: "fast" };
        await applySiteSuite(suite(skip, false), null, origin, identity);
        // A person edits the second test by hand (its file no longer matches what Mr Onion wrote).
        const store = await loadSiteSuite(origin, identity);
        const second = store!.manifest.units.find((unit) => unit.title.includes("another active test"))!;
        writeFileSync(join(siteSuiteDir(origin, identity), "tests", second.unit), store!.sources.get(second.unit)!.replace("await page.goto('/');", "await page.goto('/'); // checked by hand"));

        // Today's generator writes the guarded test; the page types are unchanged.
        const reused = await applySiteSuite(suite(ACTIVE_GATE_SKIP, true), null, origin, identity);
        const first = reused.code.slice(reused.code.indexOf("TFSC-001"), reused.code.indexOf("TFSC-002"));
        const edited = reused.code.slice(reused.code.indexOf("TFSC-002"));
        assert.ok(first.includes(ACTIVE_GATE_SKIP) && first.includes("await tfActiveGuarded(page"), `the unedited test is today's: ${first}`);
        assert.ok(edited.includes(skip) && edited.includes("// checked by hand") && !edited.includes("tfActiveGuarded"), `the hand-edited test is kept as the person left it: ${edited}`);
        assert.equal(reused.record.reused, 0);
        assert.equal(reused.record.edited, 1);

        // Saved under the guard, it is reused from then on.
        const again = await applySiteSuite(suite(ACTIVE_GATE_SKIP, true), null, origin, identity);
        assert.equal(again.record.reused, 1);
    } finally {
        if (saved === undefined) delete process.env.MRONION_DATA_DIR;
        else process.env.MRONION_DATA_DIR = saved;
        rmSync(folder, { recursive: true, force: true });
    }
});
