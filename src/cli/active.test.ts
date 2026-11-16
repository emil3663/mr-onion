/**
 * Phase 43 (TFP-220, review item 3): a CLI run reads the site's confirmation from its data folder, as the app does.
 * Against a confirmed remote-looking host (this machine's LAN address, as Phase 39's cap tests use), the run is
 * uncapped, and its active tests are Not run, "not available in CI yet (TFP-249)", although the confirmation has the
 * active tick: the CLI can't ask for active tests until TFP-249. Without the confirmation the same host is capped.
 *
 * Its own file, with the data folder and runs folder set before anything is imported, so no run reaches the real
 * data folder (run.test.ts imports the CLI statically).
 *
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/cli/active.test.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-cli-active-"));
process.env.MRONION_RUNS_ROOT = join(scratch, "runs");
process.env.MRONION_DATA_DIR = join(scratch, "data");
after(() => rmSync(scratch, { recursive: true, force: true }));

const { buildConfig } = await import("./config.ts");
const { runTarget } = await import("./run.ts");
const { saveConfirmation, validConfirmation } = await import("../test-support/ownership.ts");
const { lanAddress } = await import("../test-support/recording-site.ts");
const { chromiumSkipReason } = await import("../test-support/chromium.ts");
const needsChromium = await chromiumSkipReason();
const skip = needsChromium || (lanAddress ? false : "this machine has no LAN IPv4 address to serve a remote-looking host from");

const html = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title></head><body><main>${body}</main></body></html>`;

test("a CLI run: a confirmation in its data folder lifts the caps on the host it covers, and the active tests are Not run, not available in CI yet (review item 3, TFP-220)", { skip, timeout: 600_000 }, async () => {
    const server: Server = createServer((req, res) => {
        if (req.method === "POST") return res.writeHead(200, { "content-type": "text/html" }).end(html("<h1>Saved</h1>"));
        res.writeHead(200, { "content-type": "text/html" }).end(html(`<h1>Notes</h1><form method="post" action="/"><label for="note">Note</label><input id="note" name="note" type="text"><button type="submit">Save</button></form>`));
    });
    await new Promise<void>((resolve) => server.listen(0, lanAddress!, resolve));
    const origin = `http://${lanAddress}:${(server.address() as AddressInfo).port}`;
    try {
        const cliRun = async (label: string) => {
            const out = join(scratch, `out-${label}`);
            const lines: string[] = [];
            await runTarget(buildConfig({}, { url: origin, practices: ["security"], pages: ["/"], out, dataDir: process.env.MRONION_DATA_DIR }, scratch), (line) => lines.push(line));
            const { report } = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
            assert.ok(report, `${label}: ${lines.join("\n")}`);
            const payload = report.execution.find((record: { title: string }) => record.title.includes("script-shaped input is not executed"));
            assert.ok(payload, `${label}: the suite holds the payload test`);
            return { report, payload };
        };

        saveConfirmation(origin, validConfirmation([lanAddress!]));
        const confirmed = await cliRun("confirmed");
        assert.deepEqual([confirmed.report.hostLimits.row, confirmed.report.hostLimits.requestsPerSecond, confirmed.report.hostLimits.ownershipConfirmed], ["confirmed", null, true], "uncapped");
        assert.equal(confirmed.payload.status, "Not run");
        assert.equal(confirmed.payload.skipReason, "active test: not available in CI yet (TFP-249)");
        assert.equal(confirmed.report.ownership.activeGate.requested, false, "a CLI run sets MRONION_ACTIVE=0");

        saveConfirmation(origin, null);
        const none = await cliRun("none");
        assert.deepEqual([none.report.hostLimits.row, none.report.hostLimits.requestsPerSecond], ["capped", 5], "without it, capped");
        assert.equal(none.payload.skipReason, "active test: not available in CI yet (TFP-249)");
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
