/**
 * TFP-292 (hardening of the model-written test check; owner ruling, 2026-11-21): model-written test bodies don't
 * run until Phase 45's sandbox. Through POST /api/generate on the comparison fixture's /types shop, one column for
 * each place one would have run, each refused with the reason, nothing dropped without a word:
 *   a site opted in to a gap writer     -> the writer is never called; the record and report say why
 *   a saved gap test in the site suite  -> kept in the suite, not in the run's code; counted and named
 *   a pool candidate, Standard          -> not bound; the record and report say why
 *   a pool candidate, Comprehensive     -> not bound; the record says why
 *   a promoted library entry            -> not bound; counted and named
 * Template-built tests are generated as before in every column. Claude Code is the stand-in
 * (src/test-support/fake-claude.mjs): nothing here reaches it, and the log proves it.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/gap-writer/model-bodies.test.ts
 */
import assert from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { SiteSuiteRecord } from "../report/types.ts";
import type { SiteSuiteManifest } from "../site-suites/store.ts";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-model-bodies-"));
const savedEnv = Object.fromEntries(["MRONION_DATA_DIR", "MRONION_CLAUDE_COMMAND", "MRONION_LIBRARY_PROMOTED_DIR", "FAKE_CLAUDE_LOG", "FAKE_CLAUDE_MODE", "MRONION_OLLAMA_MODEL", "OPENAI_API_KEY"].map((key) => [key, process.env[key]]));
process.env.MRONION_CLAUDE_COMMAND = JSON.stringify([process.execPath, join(process.cwd(), "src/test-support/fake-claude.mjs")]);
process.env.FAKE_CLAUDE_MODE = "good";
delete process.env.MRONION_OLLAMA_MODEL;
delete process.env.OPENAI_API_KEY;

const { MODEL_BODIES_OFF } = await import("./model-bodies.ts");
const generateRoute = await import("../../app/api/generate/route.ts");
const settingsRoute = await import("../../app/api/site-settings/route.ts");
const { NextRequest } = await import("next/server");
const { startRecordedFixture } = await import("../../test-support/comparison-fixture.ts");
const { chromiumSkipReason } = await import("../../test-support/chromium.ts");
const { candidateId, patternOf } = await import("../candidates/pool.ts");
const { parseTestUnits } = await import("../site-suites/units.ts");
const { describeSiteSuite } = await import("../report/site-suite-text.ts");
const needsChromium = await chromiumSkipReason();

const PATHS = ["types/legal/privacy", "types/help/terms"];
const BODY = "await page.goto('__PAGE__');\nawait expect(__LOCATOR__).toBeAttached();";
let fixture: Awaited<ReturnType<typeof startRecordedFixture>>;
let column = 0;

before(async () => {
    if (!needsChromium) fixture = await startRecordedFixture();
});

after(async () => {
    await fixture?.close();
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
});

const post = (url: string, body: unknown) => new NextRequest(new URL(url), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const calls = () => (existsSync(process.env.FAKE_CLAUDE_LOG!) ? readFileSync(process.env.FAKE_CLAUDE_LOG!, "utf8").trim().split("\n").filter(Boolean) : []);

/** A fresh data folder, Claude Code log and (empty) promoted library for one column. */
function fresh() {
    const id = column++;
    process.env.MRONION_DATA_DIR = join(scratch, `data-${id}`);
    process.env.FAKE_CLAUDE_LOG = join(scratch, `claude-${id}.log`);
    process.env.MRONION_LIBRARY_PROMOTED_DIR = join(scratch, `promoted-empty-${id}`);
}

async function generate(practices: string[], runMode?: unknown) {
    const response = await generateRoute.POST(post("http://localhost/api/generate", { baseUrl: fixture.origin, description: "Check the pages.", selectedPractices: practices, contentRules: { paths: PATHS }, ...(runMode ? { runMode } : {}) }));
    assert.equal(response.status, 200);
    return (await response.json()) as { code: string; siteSuite: SiteSuiteRecord };
}

/** A well-formed pool candidate for the first link on the fixture's pages. */
function seedCandidate() {
    const pattern = patternOf("link", "Home");
    const dir = join(process.env.MRONION_DATA_DIR!, "candidates");
    mkdirSync(dir, { recursive: true });
    const id = candidateId(pattern);
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, pattern, body: BODY, gate: "read-only", technique: "error guessing", writer: "claude-code", sources: [], evidence: [], status: "candidate", costUsd: 0 }));
    return id;
}

const templateUnits = (code: string) => parseTestUnits(code).length;

test("TFP-292: a site opted in to a gap writer: the writer is never called, and the report says why", { skip: needsChromium }, async () => {
    fresh();
    assert.equal((await settingsRoute.POST(post("http://localhost/api/site-settings", { baseUrl: fixture.origin, gapWriter: "claude-code" }))).status, 200);
    const body = await generate(["seo/content"]);
    assert.deepEqual(calls(), [], "nothing was asked of the writer");
    assert.equal(body.siteSuite.gapTests?.note, MODEL_BODIES_OFF);
    assert.equal(body.siteSuite.gapTests?.asked, 0);
    assert.ok(!body.code.includes("gap test:"));
    assert.ok(templateUnits(body.code) > 0, "the template's tests are generated as before");
    assert.ok(describeSiteSuite(body.siteSuite).includes(`Gap tests: none written, as ${MODEL_BODIES_OFF}.`), describeSiteSuite(body.siteSuite));
});

test("TFP-292: a saved gap test stays in the site suite but isn't in the run's code, and the report counts it", { skip: needsChromium }, async () => {
    fresh();
    const first = await generate(["seo/content"]);
    const manifestFile = join(first.siteSuite.store, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as SiteSuiteManifest;
    const model = manifest.units[0];
    const title = "gap test: neutral fixture link";
    const source = `test('${title}', async ({ page }) => {\n  await page.goto('/');\n});\n`;
    writeFileSync(join(first.siteSuite.store, "tests", "gap-neutral.ts"), source);
    manifest.units.push({ unit: "gap-neutral.ts", key: "gap-neutral", describe: model.describe, title, type: model.type, writtenHash: createHash("sha256").update(source).digest("hex"), writtenAt: manifest.savedAt, origin: "gap-writer", covers: "neutral", writer: "claude-code" });
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

    const again = await generate(["seo/content"]);
    assert.ok(!again.code.includes(title), "not in the run's code");
    assert.equal(again.siteSuite.modelWritten?.held, 1);
    assert.equal(again.siteSuite.modelWritten?.note, MODEL_BODIES_OFF);
    const kept = JSON.parse(readFileSync(join(again.siteSuite.store, "manifest.json"), "utf8")) as SiteSuiteManifest;
    assert.ok(kept.units.some((unit) => unit.key === "gap-neutral" && unit.origin === "gap-writer"), "kept in the suite for when the sandbox runs it");
    assert.ok(describeSiteSuite(again.siteSuite).includes(`Model-written tests: 1 saved gap test kept but not run, as ${MODEL_BODIES_OFF}.`), describeSiteSuite(again.siteSuite));
});

test("TFP-292: a pool candidate isn't bound on Standard or Comprehensive, and the record says why", { skip: needsChromium }, async () => {
    fresh();
    const id = seedCandidate();
    const standard = await generate(["seo/content"]);
    assert.ok(!standard.code.includes(`candidate ${id}`));
    assert.equal(standard.siteSuite.candidateTests?.note, MODEL_BODIES_OFF);
    assert.ok(describeSiteSuite(standard.siteSuite).includes(`Pool candidates: none bound, as ${MODEL_BODIES_OFF}.`), describeSiteSuite(standard.siteSuite));

    const comprehensive = await generate(["seo/content"], { kind: "comprehensive", area: "accessibility" });
    assert.ok(!parseTestUnits(comprehensive.code).some((unit) => unit.describe[0] === "Candidate tests"), "no candidates' section");
    assert.ok(templateUnits(comprehensive.code) > 0);
    assert.equal(comprehensive.siteSuite.candidateTests?.note, MODEL_BODIES_OFF);
});

test("TFP-292: a promoted library entry isn't bound on Standard functional, and the report counts it", { skip: needsChromium }, async () => {
    fresh();
    const dir = join(scratch, "promoted");
    mkdirSync(dir, { recursive: true });
    const pattern = patternOf("link", "Home");
    const id = candidateId(pattern);
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, pattern, body: BODY, gate: "read-only", technique: "error guessing", writer: "claude-code", sources: [], evidence: [], approved: { by: "owner", at: "2026-10-14T00:00:00.000Z" }, caught: [] }));
    process.env.MRONION_LIBRARY_PROMOTED_DIR = dir;
    const body = await generate(["functional"]);
    assert.ok(!parseTestUnits(body.code).some((unit) => unit.title.startsWith("library promoted.")), "not bound");
    assert.equal(body.siteSuite.modelWritten?.promoted, 1);
    assert.ok(describeSiteSuite(body.siteSuite).includes(`Model-written tests: 1 promoted library entry not bound, as ${MODEL_BODIES_OFF}.`), describeSiteSuite(body.siteSuite));
});
