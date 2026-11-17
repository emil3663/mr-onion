import { useEffect, useRef, useState } from "react";
import { advanceProjection, formatRemaining, shownRemainingMs, type Projection } from "@/app/_lib/projection";
import type { RunProgressSnapshot } from "@/app/_lib/types";

/**
 * Phase 46 (TFP-296): the run overlay's "remaining" figure, once a second. It counts down between estimates, is
 * estimated again as tests finish, and moves only past 10 s or 10% (src/app/_lib/projection.ts). The latest progress
 * is read on each tick, so the state is set only in the timer's callback.
 */
export function useProjectedRemaining(progress: RunProgressSnapshot | null, durationMs: number, isCancelling: boolean): string {
    const [label, setLabel] = useState(isCancelling ? "Stopping..." : "Estimating...");
    const latest = useRef({ progress, durationMs, isCancelling });
    useEffect(() => {
        latest.current = { progress, durationMs, isCancelling };
    }, [progress, durationMs, isCancelling]);

    useEffect(() => {
        let projection: Projection | null = null;
        const tick = () => {
            const { progress: current, durationMs: duration, isCancelling: cancelling } = latest.current;
            const now = Date.now();
            projection = advanceProjection(projection, { completed: current?.completedTests ?? 0, total: current?.totalTests ?? 0, durationMs: duration }, now);
            const left = projection ? shownRemainingMs(projection, now) : null;
            // At zero with tests still going (an estimate that was too short): finishing, not "0s" for a long while.
            setLabel(cancelling ? "Stopping..." : left === null ? "Estimating..." : left === 0 ? "Finishing..." : formatRemaining(left));
        };
        const first = window.setTimeout(tick, 0);
        const every = window.setInterval(tick, 1000);
        return () => {
            window.clearTimeout(first);
            window.clearInterval(every);
        };
    }, []);

    return label;
}
