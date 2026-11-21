import type { GenerationRecord } from "./types";

/**
 * Phase 34 (TFP-118): what the local model was asked to fill, and what came of it, for the app's report and the
 * HTML export alike. TFP-292: "held" is not asked, until Phase 45's sandbox; the fallback reason says why.
 */
export function describeGapFill(gapFill: GenerationRecord["gapFill"]): string {
    if (!gapFill || gapFill.gapAreas.length === 0) return "";
    const areas = gapFill.gapAreas.join(", ");
    return gapFill.outcome === "held" ? `; the local model wasn't asked for ${areas}` : `; the local model was asked for ${areas} - ${gapFill.outcome}`;
}
