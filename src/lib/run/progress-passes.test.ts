/**
 * Phase 46 (TFP-296, from Gate B's walkthrough, 2026-11-17): a run in two Playwright passes (the read-only units, then
 * the serial group, TFP-156) has one planned list. On the walkthrough's active-switch run the payload test ran in the
 * second pass: the progress said "55 of 56" while the planned list said "55 total", and the second pass's start then
 * replaced the list with its own 1 test (the saved run kept 1). Each pass's tests are now added to the list.
 *
 * ISTQB techniques: state transition (pass 1 begins, its tests end; pass 2 begins, its test ends), boundary (a pass
 * that names a test already listed adds nothing).
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/run/progress-passes.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { appendProcessOutput } from "./output.ts";
import { createEmptyProgress, plannedPlaceholders, type RunJob } from "./jobs.ts";

const line = (event: unknown) => `MRONION_PROGRESS ${JSON.stringify(event)}\n`;
const job = (total: number) => ({ pendingOutput: "", outputChunks: [], progress: createEmptyProgress(total), activeExecutions: new Map() }) as unknown as RunJob;
const tests = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => ({ id: `t${from + index}`, title: `TFFU-${String(from + index).padStart(3, "0")}: a test` }));

test("two passes make one planned list: the second pass's tests are added, the first's kept with their results", () => {
    const run = job(56);
    appendProcessOutput(run, line({ type: "begin", total: 55, tests: tests(1, 55) }));
    assert.equal(run.progress.plannedExecutions.length, 55);
    for (const planned of tests(1, 55)) appendProcessOutput(run, line({ type: "test-end", id: planned.id, title: planned.title, status: "passed", duration: 10 }));
    assert.equal(run.progress.completedTests, 55);

    appendProcessOutput(run, line({ type: "begin", total: 1, tests: [{ id: "t56", title: "TFSC-006: script-shaped input is not executed" }] }));
    assert.equal(run.progress.plannedExecutions.length, 56, "the list has every test of the run");
    assert.equal(run.progress.totalTests, 56);
    assert.deepEqual(run.progress.plannedExecutions.slice(0, 2).map((entry) => entry.status), ["passed", "passed"], "the first pass's results stay");
    assert.equal(run.progress.plannedExecutions.at(-1)?.status, "not-run");

    appendProcessOutput(run, line({ type: "test-end", id: "t56", title: "TFSC-006: script-shaped input is not executed", status: "passed", duration: 10 }));
    assert.equal(run.progress.completedTests, 56);
    assert.equal(run.progress.plannedExecutions.filter((entry) => entry.status === "passed").length, 56, "56 of 56, the list agreeing");
});

test("a pass that names a test already listed doesn't add it again", () => {
    const run = job(3);
    appendProcessOutput(run, line({ type: "begin", total: 2, tests: tests(1, 2) }));
    appendProcessOutput(run, line({ type: "begin", total: 2, tests: tests(2, 3) }));
    assert.deepEqual(run.progress.plannedExecutions.map((entry) => entry.id), ["t1", "t2", "t3"]);
    assert.equal(run.progress.totalTests, 3);
});

test("seeded from the suite, the list has every test from the start: the serial pass's test is listed while the first pass runs", () => {
    const run = job(56);
    run.progress.plannedExecutions = plannedPlaceholders([...tests(1, 55).map((planned) => planned.title), "TFSC-006: script-shaped input is not executed"], 1);
    assert.equal(run.progress.plannedExecutions.length, 56, "every test, before any pass begins");
    appendProcessOutput(run, line({ type: "begin", total: 55, tests: tests(1, 55) }));
    assert.equal(run.progress.plannedExecutions.length, 56, "the first pass's tests take their places; the serial one waits, listed");
    assert.equal(run.progress.plannedExecutions[0].id, "t1", "a placeholder takes the reporter's id");
    appendProcessOutput(run, line({ type: "test-end", id: "t1", title: tests(1, 1)[0].title, status: "passed", duration: 10 }));
    assert.equal(run.progress.plannedExecutions[0].status, "passed");
    appendProcessOutput(run, line({ type: "begin", total: 1, tests: [{ id: "t56", title: "TFSC-006: script-shaped input is not executed" }] }));
    assert.equal(run.progress.plannedExecutions.length, 56, "the serial test takes its own place, not a new one");
    assert.equal(run.progress.plannedExecutions.at(-1)?.id, "t56");
});

test("the same title in two browsers is two places, each taken once", () => {
    const run = job(2);
    run.progress.plannedExecutions = plannedPlaceholders(["TFFU-001: loads"], 2);
    appendProcessOutput(run, line({ type: "begin", total: 2, tests: [{ id: "c1", title: "TFFU-001: loads" }, { id: "f1", title: "TFFU-001: loads" }] }));
    assert.deepEqual(run.progress.plannedExecutions.map((entry) => entry.id), ["c1", "f1"]);
});

// The fresh-context review: places nothing takes.
test("only plain titles are seeded; `.test(` isn't a test, nor is an escaped or template-built title seeded", async () => {
    const { extractDeclaredTestTitles, extractSeedableTitles } = await import("./selection.ts");
    const code = [
        "test('plain one', async () => {});",
        "expect(/x/.test('abc')).toBe(false);",
        "test('caf\\u00e9', async () => {});",
        "for (const i of [1, 2]) test(`loop ${i}`, async () => {});",
        "test(`plain template`, async () => {});",
    ].join("\n");
    assert.deepEqual(extractSeedableTitles(code), ["plain one", "plain template"]);
    assert.ok(!extractDeclaredTestTitles(code).includes("abc"), "a regex's .test( isn't a declared test");
});

test("at the run's end the places no test took are dropped; a stopped run keeps them, Not run", async () => {
    const { dropUntakenPlaces } = await import("./output.ts");
    const finished = job(3);
    finished.progress.plannedExecutions = plannedPlaceholders(["a", "b", "phantom"], 1);
    appendProcessOutput(finished, line({ type: "begin", total: 2, tests: [{ id: "x1", title: "a" }, { id: "x2", title: "b" }] }));
    dropUntakenPlaces(finished);
    assert.deepEqual(finished.progress.plannedExecutions.map((entry) => entry.id), ["x1", "x2"]);

    const stopped = job(3);
    stopped.progress.plannedExecutions = plannedPlaceholders(["a", "b", "serial"], 1);
    (stopped as unknown as { cancellationRequested: boolean }).cancellationRequested = true;
    appendProcessOutput(stopped, line({ type: "begin", total: 2, tests: [{ id: "x1", title: "a" }, { id: "x2", title: "b" }] }));
    dropUntakenPlaces(stopped);
    assert.deepEqual(stopped.progress.plannedExecutions.map((entry) => entry.status), ["not-run", "not-run", "not-run"], "the tests it didn't get to stay listed");
    assert.equal(stopped.progress.plannedExecutions.length, 3);
});
