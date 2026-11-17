/**
 * POST /api/run's request, read into the run's options (TFP-235, at its verification, 2026-11-17): the route's own
 * step, which Phase 43's real-run test (src/lib/run/active-gate.run.test.ts) passes by, since it starts runs through
 * the executor. Only `true` itself asks for active tests (Phase 43 Decision 4): a truthy look-alike asks for nothing.
 *
 * ISTQB techniques: equivalence partitioning over enableActive (true; truthy look-alikes "true", 1, "yes", {}; false;
 * missing), the same for enableInteractive, and the request's refusals (no code, nothing to run), kept as they were.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/run/run-request.test.ts
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readRunRequest } from "./run-request.ts";

const CODE = "import { test, expect } from '@playwright/test';\ntest('loads', async ({ page }) => { await page.goto('/'); });\n";
const optionsOf = (body: Record<string, unknown>) => {
    const read = readRunRequest({ code: CODE, baseUrl: "https://shop.example.com", ...body });
    assert.ok("options" in read, JSON.stringify(read));
    return read.options;
};

test("only enableActive: true asks for active tests; \"true\", 1, missing and false don't", () => {
    assert.equal(optionsOf({ enableActive: true }).enableActive, true);
    for (const [label, body] of [
        ['"true"', { enableActive: "true" }],
        ["1", { enableActive: 1 }],
        ["missing", {}],
        ["false", { enableActive: false }],
        ['"yes"', { enableActive: "yes" }],
        ["{}", { enableActive: {} }],
    ] as const) {
        assert.equal(optionsOf(body).enableActive, false, label);
    }
});

test("only enableInteractive: true asks for interactive tests, the same way", () => {
    assert.equal(optionsOf({ enableInteractive: true }).enableInteractive, true);
    for (const value of ["true", 1, undefined, false]) assert.equal(optionsOf({ enableInteractive: value }).enableInteractive, false, String(value));
});

test("the request's refusals are kept: no code, a body that isn't an object, nothing left to run", () => {
    assert.deepEqual(readRunRequest({}), { error: "code is required" });
    assert.deepEqual(readRunRequest(null), { error: "code is required" });
    assert.deepEqual(readRunRequest({ code: 42 }), { error: "code is required" });
    assert.deepEqual(readRunRequest({ code: CODE, includeTestTitles: ["not a test"] }), { error: "No selected tests are available to rerun." });
});

test("the route passes the request through this step, not its own reading of the body", () => {
    const route = readFileSync(join(process.cwd(), "src", "app", "api", "run", "route.ts"), "utf8");
    assert.match(route, /readRunRequest\(await req\.json\(\)/);
    assert.match(route, /options\.enableActive\s*\)/);
    assert.doesNotMatch(route, /enableActive\s*===/, "the route doesn't decide enableActive itself");
});
