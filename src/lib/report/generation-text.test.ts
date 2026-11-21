/**
 * TFP-292 (hardening of the model-written test check): how a run's generation names the local model's gap fill, in
 * the app's report and the HTML export alike: asked and what came of it, or not asked, held back until Phase 45.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/report/generation-text.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";

const { describeGapFill } = await import("./generation-text.ts");

test("TFP-292: the gap fill: asked and its outcome, held back as not asked, nothing when there was no gap", () => {
    assert.equal(describeGapFill({ gapAreas: ["database", "security"], outcome: "added" }), "; the local model was asked for database, security - added");
    assert.equal(describeGapFill({ gapAreas: ["database"], outcome: "rejected" }), "; the local model was asked for database - rejected");
    assert.equal(describeGapFill({ gapAreas: ["database"], outcome: "held" }), "; the local model wasn't asked for database");
    assert.equal(describeGapFill({ gapAreas: [], outcome: "no-gaps" }), "");
    assert.equal(describeGapFill(undefined), "");
});
