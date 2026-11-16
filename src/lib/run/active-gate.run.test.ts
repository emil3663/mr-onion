/**
 * Phase 43 (TFP-219, Acceptance Criterion 2): the active gate in real runs, through the executor, on a small site.
 * The site is bound to this machine's LAN address, a host the gate treats as remote (as Phase 39's cap tests do), and
 * to 127.0.0.1 for the local-host column. Its one page has a form, so the Standard security suite generated from it
 * holds the script-payload test (Phase 38), which is what each run runs.
 *
 * ISTQB technique: decision table, as active-gate.test.ts, here end to end. Each column is one run:
 *   switch on, a valid confirmation with the active tick -> the payload test runs (Passed: the site escapes the input)
 *   switch off, the same confirmation                    -> Not run, "didn't turn active tests on"
 *   switch on, missing / expired / withdrawn / host not covered / no active tick -> Not run, each with its own reason
 *   switch on, a local host, no confirmation             -> runs (Decision 7)
 * Every run starts with MRONION_ACTIVE=1 and MRONION_ACTIVE_GATE=open in Mr Onion's own environment, which must open
 * nothing (review item 2). In the open column a model-written active test is Not run (Decision 11), and the report
 * names the confirmation, never its contact email (Acceptance Criterion 5).
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/run/active-gate.run.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { ExecutionRecord } from "../report/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-active-gate-"));
process.env.MRONION_RUNS_ROOT = join(scratch, "runs");
process.env.MRONION_DATA_DIR = join(scratch, "data");
// Review item 2: Mr Onion's own environment says "active, gate open", and every closed column below must still be
// closed. The executor sets both settings for every run, so its values win here; that a run's environment never
// inherits either at all is active-gate.test.ts's (runEnv's allowlist).
const ambient = { MRONION_ACTIVE: process.env.MRONION_ACTIVE, MRONION_ACTIVE_GATE: process.env.MRONION_ACTIVE_GATE };
process.env.MRONION_ACTIVE = "1";
process.env.MRONION_ACTIVE_GATE = "open";

const { startRunJob } = await import("./executor.ts");
const { STANDARD_RUN } = await import("../comprehensive/run-mode.ts");
const { MODEL_ACTIVE_SKIP } = await import("./test-gates.ts");
const { mockGenerate } = await import("../generate/mock/index.ts");
const { normalizeContentProfile, normalizeContentRules, normalizeTestAuditMode } = await import("../generate/normalize.ts");
const { inspectPages } = await import("../introspect/inspector.ts");
const { parseTestUnits } = await import("../site-suites/units.ts");
const { siteFolderName } = await import("../site-suites/store.ts");
const { buildReportHtmlDocument } = await import("../report/html.ts");
const { runJsonPath } = await import("./persistence.ts");
const { waitForSavedRun } = await import("../../test-support/saved-run.ts");
const { lanAddress } = await import("../../test-support/recording-site.ts");
const { chromiumSkipReason } = await import("../../test-support/chromium.ts");
const needsChromium = await chromiumSkipReason();
const skip = needsChromium || (lanAddress ? false : "this machine has no LAN IPv4 address to serve a remote-looking host from");

const EMAIL = "tess.private@example.com";
const html = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title></head><body><main>${body}</main></body></html>`;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const servers: Server[] = [];

/** A site with one form, which shows what was posted, escaped: the payload test passes on it. */
async function site(host: string) {
    const server = createServer((req, res) => {
        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => res.writeHead(200, { "content-type": "text/html" }).end(html(`<h1>Saved</h1><p>${escape(new URLSearchParams(body).get("note") ?? "")}</p>`)));
            return;
        }
        res.writeHead(200, { "content-type": "text/html" }).end(html(`<h1>Notes</h1><form method="post" action="/"><label for="note">Note</label><input id="note" name="note" type="text"><button type="submit">Save</button></form>`));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    return `http://${host}:${(server.address() as AddressInfo).port}`;
}

let remote = "";
let local = "";
before(async () => {
    if (skip) return;
    remote = await site(lanAddress!);
    local = await site("127.0.0.1");
});

after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(ambient)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
});

/** The site's saved confirmation, written as the store writes it (TFP-218), or removed. */
function confirm(origin: string, current: Record<string, unknown> | null) {
    const dir = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(origin));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ownership.json"), JSON.stringify({ current, history: [] }));
}
const valid = (overrides: Record<string, unknown> = {}) => ({
    hosts: [lanAddress],
    basis: "owner",
    wording: "the owner wording",
    name: "Tess Tester",
    contactEmail: EMAIL,
    confirmedAt: new Date(Date.now() - 86_400_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    scopes: { active: true, load: false },
    ...overrides,
});

const MODEL_TITLE = "a model-written security scenario";

/** The Standard security suite for the site, generated from its inspected page, plus a model-written active test. */
async function suiteFor(origin: string) {
    const profile = normalizeContentProfile({ scannedAt: new Date().toISOString(), baseUrl: origin, ...(await inspectPages(origin, ["/"])) });
    const generated = mockGenerate(origin, "Check the site.", ["security"], profile, normalizeContentRules({ paths: ["/"] }), normalizeTestAuditMode("fast"));
    const payload = parseTestUnits(generated).map((unit) => unit.title).find((title) => title.includes("script-shaped input is not executed"));
    assert.ok(payload, "the suite holds the payload test");
    const code = `${generated}\n\ntest('${MODEL_TITLE}', { annotation: [{ type: 'gate', description: 'active' }] }, async () => {\n  ${MODEL_ACTIVE_SKIP}\n});\n`;
    return { code, profile, titles: [payload!, MODEL_TITLE] };
}

async function run(origin: string, enableActive: boolean) {
    const { code, profile, titles } = await suiteFor(origin);
    const snapshot = await startRunJob(code, ["security"], "fast", origin, [], titles, "Check the site.", profile, false, null, null, STANDARD_RUN, enableActive);
    const job = await waitForSavedRun(snapshot.runId, 300_000);
    const report = job.result?.report;
    assert.ok(report, job.result?.output);
    const payload = report.execution.find((record: ExecutionRecord) => record.title.includes("script-shaped input is not executed"));
    const model = report.execution.find((record: ExecutionRecord) => record.title.endsWith(MODEL_TITLE));
    assert.ok(payload && model, JSON.stringify(report.execution.map((record: ExecutionRecord) => record.title)));
    return { job, report, payload, model, runId: snapshot.runId };
}

test("in real runs: the payload test runs only with the switch on and the host covered by a valid confirmation with the active tick, or local; each closed column gives its own reason", { skip, timeout: 900_000 }, async () => {
    // Open: the switch, and a valid confirmation with the active tick covering the LAN host.
    confirm(remote, valid());
    const open = await run(remote, true);
    assert.equal(open.payload.status, "Passed", `${open.payload.status}: ${open.payload.skipReason ?? open.payload.rawMessage}`);
    assert.equal(open.model.status, "Not run");
    assert.equal(open.model.skipReason, "model-written active test: not run", "Decision 11: open or not");
    assert.match(open.job.outputChunks.join(""), /Active gate: open \(the site's ownership confirmation covers the host, with the active tick\)\.\n/);
    // Acceptance Criterion 5: the report and its export name the confirmation, the run record keeps its copy, and
    // none of them holds the contact email.
    assert.equal(open.report.ownership?.confirmation?.name, "Tess Tester");
    assert.deepEqual(open.report.ownership?.confirmation?.hosts, [lanAddress]);
    const exported = buildReportHtmlDocument(open.report, open.runId);
    assert.match(exported, /Ownership confirmation \(valid\): Tess Tester owns the site\./);
    const record = readFileSync(runJsonPath(open.runId), "utf8");
    assert.equal(JSON.parse(record).activeGate.confirmation.name, "Tess Tester", "the run record keeps the copy");
    for (const [what, text] of [["report", JSON.stringify(open.report)], ["HTML export", exported], ["run record", record]]) {
        assert.ok(!text.includes(EMAIL), `${what} holds the contact email`);
    }
    const closed: Array<[string, Record<string, unknown> | null, boolean, RegExp]> = [
        ["switch off", valid(), false, /^active test: this run didn't turn active tests on$/],
        ["missing", null, true, /^active test: the site has no ownership confirmation; confirm the site/],
        ["expired", valid({ expiresAt: new Date(Date.now() - 3_600_000).toISOString() }), true, /^active test: the site's ownership confirmation expired on \d{4}-\d{2}-\d{2}; renew it/],
        ["withdrawn", valid({ withdrawnAt: new Date(Date.now() - 3_600_000).toISOString() }), true, /^active test: the site's ownership confirmation was withdrawn on \d{4}-\d{2}-\d{2}; confirm the site again/],
        ["host not covered", valid({ hosts: ["shop.example.com"] }), true, new RegExp(`^active test: the site's ownership confirmation doesn't cover ${lanAddress!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}; add the host`)],
        ["no active tick", valid({ scopes: { active: false, load: true } }), true, /^active test: the site's ownership confirmation doesn't allow active tests; confirm it again with the active tick$/],
    ];
    for (const [label, saved, enableActive, reason] of closed) {
        confirm(remote, saved);
        const result = await run(remote, enableActive);
        assert.equal(result.payload.status, "Not run", `${label}: ${result.payload.status}`);
        assert.match(result.payload.skipReason ?? "", reason, label);
        assert.match(result.job.outputChunks.join(""), /Active gate: closed \(active test: /, label);
        assert.equal(result.report.ownership?.activeGate.open, false, label);
    }

    // Decision 7: a local host opens on the switch alone, with no confirmation.
    const localRun = await run(local, true);
    assert.equal(localRun.payload.status, "Passed", `${localRun.payload.status}: ${localRun.payload.skipReason ?? localRun.payload.rawMessage}`);
    assert.match(localRun.job.outputChunks.join(""), /Active gate: open \(a local host, which needs no ownership confirmation\)\.\n/);
    const localOff = await run(local, false);
    assert.equal(localOff.payload.status, "Not run");
    assert.match(localOff.payload.skipReason ?? "", /^active test: this run didn't turn active tests on$/);
});

/**
 * TFP-220 (Decision 9, Acceptance Criterion 3): the generated payload test, in real runs through the executor with the
 * gate open on a local host (127.0.0.1), on a site whose form sends its input to an uncovered host (localhost, on this
 * machine, recording what it gets): by the form's action, and by a 307 from the covered host. Each run's payload test
 * fails as a covered-host guard breach naming the host, and the uncovered host gets nothing.
 */
test("in real runs: the payload test's submit to an uncovered host, by a form's action or a redirect, fails as a covered-host guard breach naming the host, and nothing reaches it (TFP-220)", { skip: needsChromium, timeout: 600_000 }, async () => {
    const reached: string[] = [];
    const elsewhere = createServer((req, res) => {
        reached.push(`${req.method} ${req.url}`);
        res.writeHead(200, { "content-type": "text/html" }).end(html("<h1>Collected</h1>"));
    });
    servers.push(elsewhere);
    await new Promise<void>((resolve) => elsewhere.listen(0, "localhost", resolve));
    const uncovered = `http://localhost:${(elsewhere.address() as AddressInfo).port}`;
    const leaky = async (action: string, redirect: boolean) => {
        const server = createServer((req, res) => {
            if (req.method === "POST" && redirect) return res.writeHead(307, { location: `${uncovered}/collect` }).end();
            res.writeHead(200, { "content-type": "text/html" }).end(html(`<h1>Notes</h1><form method="post" action="${action}"><label for="note">Note</label><input id="note" name="note" type="text"><button type="submit">Save</button></form>`));
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    };
    for (const [label, origin] of [["the form's action", await leaky(`${uncovered}/collect`, false)], ["a 307", await leaky("/", true)]] as const) {
        const result = await run(origin, true);
        assert.match(result.job.outputChunks.join(""), /Active gate: open \(a local host/, label);
        assert.equal(result.payload.status, "Failed", `${label}: ${result.payload.status} ${result.payload.skipReason ?? ""}`);
        assert.match(result.payload.rawMessage ?? "", /covered-host guard breach, stopped: .*to localhost.*\(an active test reaches only the hosts the site's ownership confirmation covers: 127\.0\.0\.1\)/, label);
    }
    assert.deepEqual(reached, [], "no request reached the uncovered host");
});
