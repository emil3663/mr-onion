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

// Phase 46 Gate B, R10 (b) (C's investigation, 2026-11-18): once the projection reaches zero it stays "Finishing" until
// the run ends, rather than counting down again after each late finish. Run 2's own finishes, as the owner's recording
// showed them (finished count against elapsed time): it reached zero at 52 of 56, then counted down again at 53, 54 and
// 55, so "Finishing..." showed three times.
test("R10: once at zero it is finishing until the run ends, through run 2's late finishes", () => {
    const finishes: Array<[number, number]> = [[10, 1], [27, 4], [40, 8], [54, 12], [78, 23], [102, 28], [126, 31], [180, 38], [216, 45], [252, 52], [300, 53], [312, 54], [390, 55]];
    let projection = null as ReturnType<typeof advanceProjection>;
    const states: string[] = [];
    for (let second = 1; second <= 410; second++) {
        const completed = [...finishes].reverse().find(([at]) => at <= second)?.[1] ?? 0;
        projection = advanceProjection(projection, sample(completed, 56, second * 1000), second * 1000);
        const state = projection === null ? "estimating" : projection.finishing ? "finishing" : shownRemainingMs(projection, second * 1000) === 0 ? "zero" : "counting";
        if (states.at(-1) !== state) states.push(state);
    }
    assert.deepEqual(states, ["estimating", "counting", "finishing"], "it reaches finishing once and stays there");
});

test("R10: a finish that leaves tests to go doesn't start a countdown again; the run's last finish ends it", () => {
    const counting = advanceProjection(null, sample(52, 56, 252_000), 252_000)!; // about 19 s to go
    const zero = advanceProjection(counting, sample(52, 56, 280_000), 280_000)!;
    assert.equal(zero.finishing, true, "at zero it is finishing");
    const late = advanceProjection(zero, sample(53, 56, 300_000), 300_000)!;
    assert.equal(late.finishing, true, "a late finish doesn't re-estimate");
    assert.equal(advanceProjection(late, sample(56, 56, 414_000), 414_000), null, "and all finished ends it");
});

// R10 (the fresh-context review): only the run's tail is "finishing": a zero reached with tests still to start (an
// early estimate that was too short, or the gap before the serial pass) counts down again as before.
test("R10: a zero with tests still to start isn't finishing; with none left to start, it is", () => {
    const early = advanceProjection(null, { completed: 5, total: 56, durationMs: 10_000, running: 3 }, 10_000)!; // ~102 s
    const atZero = advanceProjection(early, { completed: 5, total: 56, durationMs: 120_000, running: 3 }, 120_000)!;
    assert.notEqual(atZero.finishing, true, "48 tests still to start: not finishing");
    const tail = advanceProjection(null, { completed: 52, total: 56, durationMs: 252_000, running: 4 }, 252_000)!;
    const tailZero = advanceProjection(tail, { completed: 52, total: 56, durationMs: 280_000, running: 4 }, 280_000)!;
    assert.equal(tailZero.finishing, true, "all started: finishing");
    // A test that begins after the latch (a second pass) ends it: there was more to start after all.
    const more = advanceProjection(tailZero, { completed: 54, total: 60, durationMs: 300_000, running: 1 }, 300_000)!;
    assert.notEqual(more.finishing, true);
});
