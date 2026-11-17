/**
 * Phase 46 (TFP-296, from Gate B's walkthrough, 2026-11-17): the run's projected remaining time counts down once a
 * second, is estimated again as tests finish, and moves only when the new estimate differs from what is shown by more
 * than 10 seconds or more than 10%.
 *
 * ISTQB techniques: boundary value analysis on both thresholds (10 s and 10%, at and just past each), state transition
 * (no estimate -> counting down -> re-anchored), and equivalence partitioning over a snapshot (a test finished; none).
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/app/_lib/projection.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { advanceProjection, shownRemainingMs } from "./projection.ts";

const sample = (completed: number, total: number, durationMs: number) => ({ completed, total, durationMs });

test("no estimate until a test has finished, and none once all have", () => {
    assert.equal(advanceProjection(null, sample(0, 10, 5_000), 0), null);
    assert.equal(advanceProjection(null, sample(10, 10, 50_000), 0), null);
});

test("it counts down by the clock between estimates, never below zero", () => {
    const first = advanceProjection(null, sample(2, 10, 20_000), 1_000)!; // 10 s a test, 8 to go: 80 s
    assert.equal(shownRemainingMs(first, 1_000), 80_000);
    assert.equal(shownRemainingMs(first, 4_000), 77_000);
    assert.equal(shownRemainingMs(first, 200_000), 0);
});

test("it is estimated again only when a test finishes", () => {
    const first = advanceProjection(null, sample(2, 10, 20_000), 0)!;
    // The same count, a later poll: no new estimate, even though duration grew a lot.
    assert.equal(advanceProjection(first, sample(2, 10, 60_000), 30_000), first);
});

test("a new estimate within 10 s and 10% of what's shown doesn't move it; past either, it does", () => {
    const first = advanceProjection(null, sample(2, 12, 20_000), 0)!; // 100 s
    // 1 s later, shown 99 s. A test finished: 3 done in 21 s, 9 to go: 63 s. 36 s and 36% off: moves.
    const moved = advanceProjection(first, sample(3, 12, 21_000), 1_000)!;
    assert.equal(shownRemainingMs(moved, 1_000), 63_000);

    // Shown 200 s; a new estimate 210 s: 10 s and 5% off, not past either: stays.
    const long = { remainingMs: 200_000, atMs: 0, completed: 4 };
    assert.equal(shownRemainingMs(advanceProjection(long, sample(5, 105, 10_500), 0)!, 0), 200_000, "exactly 10 s: stays");
    // 211 s: 11 s off (5.5%): past 10 s, moves.
    const past10s = advanceProjection(long, sample(5, 105, 10_550), 0)!;
    assert.equal(shownRemainingMs(past10s, 0), 211_000);

    // Shown 50 s; a new estimate 55 s: 5 s and exactly 10% off: stays. 56 s: 12%, moves.
    const short = { remainingMs: 50_000, atMs: 0, completed: 4 };
    assert.equal(shownRemainingMs(advanceProjection(short, sample(5, 16, 25_000), 0)!, 0), 50_000, "exactly 10%: stays");
    const past10pc = advanceProjection(short, sample(5, 19, 20_000), 0)!; // 4 s a test, 14 to go: 56 s
    assert.equal(shownRemainingMs(past10pc, 0), 56_000);
});

test("a finished test that doesn't move the estimate still counts as seen, so the next is measured from it", () => {
    const first = { remainingMs: 200_000, atMs: 0, completed: 4 };
    const kept = advanceProjection(first, sample(5, 105, 10_500), 0)!;
    assert.deepEqual(kept, { remainingMs: 200_000, atMs: 0, completed: 5 }, "the countdown is kept; the finish is seen");
    // A later poll with the same 5 done isn't a new finish.
    assert.equal(advanceProjection(kept, sample(5, 105, 99_000), 5_000), kept);
});

test("the remaining time is shown to the second, so its countdown shows", async () => {
    const { formatRemaining } = await import("./projection.ts");
    assert.equal(formatRemaining(80_000), "1m 20s");
    assert.equal(formatRemaining(79_000), "1m 19s");
    assert.equal(formatRemaining(65_400), "1m 05s");
    assert.equal(formatRemaining(45_000), "45s");
    assert.equal(formatRemaining(0), "0s");
    assert.equal(formatRemaining(-5), "0s");
});
