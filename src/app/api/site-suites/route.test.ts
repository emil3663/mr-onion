/**
 * Phase 46 (TFP-232, review item 6, Acceptance Criteria 1): a site's saved suites and when each was last run, read by
 * site only, on a temporary data folder and runs folder, so no test touches the real ones.
 *
 * ISTQB techniques: equivalence partitioning over the site (one with suites; one with none; an invalid or missing
 * address), over a suite's runs (none; several, the latest finished counting; a run of another suite, or another
 * site's, not counting; a run with no suite, or an unreadable store), and the address in any form (path, query,
 * trailing slash) reducing to its site.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/app/api/site-suites/route.test.ts
 */
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-site-suites-route-"));
const saved = { data: process.env.MRONION_DATA_DIR, runs: process.env.MRONION_RUNS_ROOT };
// RUNS_ROOT is read once, when persistence loads: one runs folder for the file, emptied before each test.
const RUNS = join(scratch, "runs");
process.env.MRONION_RUNS_ROOT = RUNS;
let run = 0;

const { GET } = await import("./route.ts");
const { siteSuiteDir } = await import("../../../lib/site-suites/store.ts");
const { NextRequest } = await import("next/server");

const SITE = "https://shop.example.com";
const OTHER = "https://other.example.com";
const STANDARD = { runType: "standard" as const, practices: ["accessibility", "seo"], auditMode: "smoke" };
const COMPREHENSIVE = { runType: "comprehensive" as const, area: "security", practices: [], auditMode: "smoke" };

beforeEach(() => {
    process.env.MRONION_DATA_DIR = join(scratch, `data-${run++}`);
    rmSync(RUNS, { recursive: true, force: true });
    mkdirSync(RUNS, { recursive: true });
});

after(() => {
    for (const [key, value] of [["MRONION_DATA_DIR", saved.data], ["MRONION_RUNS_ROOT", saved.runs]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
});

function suite(origin: string, identity: typeof STANDARD | typeof COMPREHENSIVE, units: number, savedAt = "2026-11-10T08:00:00.000Z") {
    const dir = siteSuiteDir(origin, identity);
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
        version: 1, origin, identity, savedAt, siteTypes: [], types: {},
        units: Array.from({ length: units }, (_, index) => ({ unit: `u${index}.ts`, key: `k${index}`, describe: [], title: `t${index}`, type: "/", writtenHash: "x", writtenAt: savedAt })),
    }));
    return dir;
}

function savedRun(store: string | null, finishedAt: string, baseUrl = SITE) {
    const runId = randomUUID();
    mkdirSync(join(RUNS, runId), { recursive: true });
    const generation = store === null ? null : { siteSuite: { store, firstRun: false, reused: 0, generated: 1, regenerated: 0, retired: 0, edited: 0, changedTypes: [], newTypes: [], goneTypes: [], editedOnChangedPages: [] } };
    writeFileSync(join(RUNS, runId, "run.json"), JSON.stringify({ runId, baseUrl, createdAt: finishedAt, finishedAt, generation }));
    return runId;
}

const read = async (baseUrl: string | null) => {
    const query = baseUrl === null ? "" : `?baseUrl=${encodeURIComponent(baseUrl)}`;
    const response = await GET(new NextRequest(`http://localhost/api/site-suites${query}`));
    return { status: response.status, body: await response.json() };
};

test("a site with no saved suite reads as none, not as an error", async () => {
    const { status, body } = await read(SITE);
    assert.equal(status, 200);
    assert.deepEqual(body, { origin: SITE, suites: [] });
});

test("each saved suite of the site, with its tests and when it was last run: the latest finished run of that suite", async () => {
    const standard = suite(SITE, STANDARD, 3);
    suite(SITE, COMPREHENSIVE, 1, "2026-11-11T08:00:00.000Z");
    savedRun(standard, "2026-11-12T09:00:00.000Z");
    const latest = savedRun(standard, "2026-11-14T09:00:00.000Z");
    savedRun(standard, "2026-11-13T09:00:00.000Z");
    // Not this suite's: another site's suite, a run with no suite, a store that isn't in the data folder.
    savedRun(suite(OTHER, STANDARD, 2), "2026-11-16T09:00:00.000Z", OTHER);
    savedRun(null, "2026-11-16T10:00:00.000Z");
    savedRun(join(scratch, "elsewhere", "standard-smoke"), "2026-11-16T11:00:00.000Z");

    const { status, body } = await read(SITE);
    assert.equal(status, 200);
    assert.equal(body.origin, SITE);
    assert.deepEqual(body.suites, [
        { runType: "comprehensive", area: "security", practices: [], auditMode: "smoke", savedAt: "2026-11-11T08:00:00.000Z", tests: 1, lastRun: null },
        { runType: "standard", practices: ["accessibility", "seo"], auditMode: "smoke", savedAt: "2026-11-10T08:00:00.000Z", tests: 3, lastRun: { runId: latest, finishedAt: "2026-11-14T09:00:00.000Z" } },
    ]);
    assert.doesNotMatch(JSON.stringify(body), /other\.example\.com/, "another site's suites and runs aren't read");
});

// The fresh-context review's defect A: a run's store comes from the client (the generation record), so a run on
// another site can name this site's suite. Its own address decides whose run it is.
test("a run on another site that names this site's suite is not its last run", async () => {
    const standard = suite(SITE, STANDARD, 3);
    const own = savedRun(standard, "2026-11-12T09:00:00.000Z");
    savedRun(standard, "2026-11-15T09:00:00.000Z", `${OTHER}/page`);
    const { body } = await read(SITE);
    assert.deepEqual(body.suites[0].lastRun, { runId: own, finishedAt: "2026-11-12T09:00:00.000Z" });
});

// Defect B: the site folder's name maps every character outside [a-z0-9.-] to "_", so two origins can share a folder
// (https://a.b:8080 and https://a.b_8080). A suite saved for the other one is not this site's.
test("a suite in the site's folder saved for another origin is not this site's", async () => {
    suite(SITE, STANDARD, 3);
    const foreign = suite(SITE, COMPREHENSIVE, 1);
    writeFileSync(join(foreign, "manifest.json"), JSON.stringify({ version: 1, origin: "https://elsewhere.example.com", identity: COMPREHENSIVE, savedAt: "2026-11-11T08:00:00.000Z", siteTypes: [], types: {}, units: [] }));
    const { body } = await read(SITE);
    assert.deepEqual(body.suites.map((entry: { runType: string }) => entry.runType), ["standard"]);
});

test("on Windows, a run's store that differs from the suite's folder only in case is the same folder", { skip: process.platform !== "win32" ? "Windows paths only: elsewhere a folder's case is part of its name" : false }, async () => {
    const standard = suite(SITE, STANDARD, 3);
    const runId = savedRun(standard.toUpperCase(), "2026-11-12T09:00:00.000Z");
    const { body } = await read(SITE);
    assert.equal(body.suites[0].lastRun?.runId, runId);
});

test("the address in any form finds the site's suites: a path, a query, a trailing slash", async () => {
    suite(SITE, STANDARD, 2);
    for (const form of [SITE, `${SITE}/`, `${SITE}/cart?item=3`, "HTTPS://Shop.Example.com/cart/"]) {
        const { body } = await read(form);
        assert.equal(body.origin, SITE, form);
        assert.equal(body.suites.length, 1, form);
    }
});

test("exact match only: a partial host, or another site, finds nothing", async () => {
    suite(SITE, STANDARD, 2);
    for (const form of ["shop", "https://shop.example", "https://example.com", "http://shop.example.com", "https://shop.example.com:8443"]) {
        const { body } = await read(form);
        assert.deepEqual(body.suites, [], form);
    }
});

test("a site must be named: no address, or one that isn't http(s), is refused, never all sites", async () => {
    suite(SITE, STANDARD, 2);
    for (const baseUrl of [null, "", "   ", "not a url at all ::"]) {
        const { status, body } = await read(baseUrl);
        assert.equal(status, 400, String(baseUrl));
        assert.equal(body.suites, undefined, String(baseUrl));
    }
});

test("a suite folder without a readable manifest is not a suite", async () => {
    suite(SITE, STANDARD, 2);
    const broken = siteSuiteDir(SITE, COMPREHENSIVE);
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "manifest.json"), "{ not json");
    // Files the site's folder keeps beside its suites (Phase 42's settings, Phase 43's confirmation) aren't suites.
    writeFileSync(join(broken, "..", "settings.json"), JSON.stringify({ gapWriter: "off" }));
    const { body } = await read(SITE);
    assert.equal(body.suites.length, 1);
    assert.equal(body.suites[0].runType, "standard");
});
