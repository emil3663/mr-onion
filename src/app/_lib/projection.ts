/**
 * Phase 46 (TFP-296, from Gate B's walkthrough, 2026-11-17): the run's projected remaining time. It counts down by the
 * clock from an estimate, and is estimated again only when a test finishes (time so far per finished test, times the
 * tests to go). A new estimate moves what is shown only when it differs from it by more than 10 seconds or by more
 * than 10%; otherwise the countdown goes on, so the figure doesn't jump about with every finished test.
 */

export interface Projection {
    /** The remaining time at `atMs`, by this browser's clock. */
    remainingMs: number;
    atMs: number;
    /** The finished-test count the estimate was last checked at. */
    completed: number;
}

export interface ProgressSample {
    completed: number;
    total: number;
    /** The run's time so far, as the server reported it with this count. */
    durationMs: number;
}

const MOVE_MS = 10_000;
const MOVE_SHARE = 0.1;

export const shownRemainingMs = (projection: Projection, nowMs: number) => Math.max(0, projection.remainingMs - (nowMs - projection.atMs));

function estimate(sample: ProgressSample): number | null {
    if (sample.total <= 0 || sample.completed <= 0 || sample.completed >= sample.total) return null;
    return Math.max(0, Math.round((sample.durationMs / sample.completed) * (sample.total - sample.completed)));
}

/** The projection after a sample: unchanged unless a test finished and its estimate is far enough from what's shown. */
export function advanceProjection(previous: Projection | null, sample: ProgressSample, nowMs: number): Projection | null {
    const fresh = estimate(sample);
    if (fresh === null) return previous && sample.completed < sample.total ? previous : null;
    if (previous === null) return { remainingMs: fresh, atMs: nowMs, completed: sample.completed };
    if (sample.completed === previous.completed) return previous;
    const shown = shownRemainingMs(previous, nowMs);
    const difference = Math.abs(fresh - shown);
    if (difference > MOVE_MS || difference > MOVE_SHARE * shown) return { remainingMs: fresh, atMs: nowMs, completed: sample.completed };
    // Close enough: the countdown goes on, and this finish counts as seen.
    return { ...previous, completed: sample.completed };
}

/** The remaining time to the second, so it visibly counts down: "1m 20s", "45s", "0s". */
export function formatRemaining(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}
