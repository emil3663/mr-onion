/**
 * TFP-292 (hardening of the model-written test check; owner ruling, 2026-11-21): the local model's and OpenAI's
 * whole-suite generation are model-written bodies too, and don't run until Phase 45's sandbox. Playwright runs a
 * file's describe bodies when it loads it, skipped tests or not, so the output must not reach the code that runs at
 * all. One column per path, each with a model output holding a statement at describe level (a neutral marker):
 *   the local model, a Standard gap fill   -> the template's code alone, labelled; the model isn't asked
 *   the local model, Comprehensive         -> the template's code alone, labelled; the model isn't asked
 *   OpenAI, Standard                       -> the template's code alone, labelled; OpenAI isn't asked
 * The label is the fallback reason the record, the app's report, the saved run and the HTML export already carry.
 * The fake server (route-test-helpers.ts) stands in for both models: nothing leaves the machine.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/app/api/generate/route.held.test.ts
 */
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { chatBodies, completion, fakeBaseUrl, fakeOpenAi, installFakeServer, json, useFake } from "./route-test-helpers.ts";

const scratchRoot = mkdtempSync(join(tmpdir(), "mr-onion-held-route-test-"));
process.env.MRONION_RUNS_ROOT = join(scratchRoot, "runs");
after(() => rmSync(scratchRoot, { recursive: true, force: true }));

const { POST } = await import("./route.ts");
const { NextRequest } = await import("next/server");
const { MODEL_BODIES_OFF } = await import("../../../lib/gap-writer/model-bodies.ts");
const { OPENAI_MODEL_CANDIDATES } = await import("../../../lib/generate/models.ts");

installFakeServer();

const LOCAL_MODEL = "testforge-qwen7b";
const CATALOG_ID = `${LOCAL_MODEL}:latest`;
const MARKER = "neutral-describe-level-fixture";

/** A model's suite with one statement in a describe body, outside every test. */
const OUTPUT = [
    "import { test, expect } from '@playwright/test';",
    "test.describe('Database', () => {",
    `  const fixtureMarker = '${MARKER}';`,
    "  test('a saved note is still shown after a reload', async ({ page }) => {",
    "    await page.goto('/notes');",
    "    await expect(page.locator('body')).toContainText(fixtureMarker);",
    "  });",
    "});",
].join("\n");

function post(body: unknown) {
    return new NextRequest(new URL("http://localhost/api/generate"), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

const ORIGIN = "https://site.test";
const PROFILE = {
    scannedAt: "2026-09-30T00:00:00.000Z",
    baseUrl: ORIGIN,
    pages: ["/", "/login"].map((path) => ({ path, url: `${ORIGIN}${path}`, title: "", metaDescription: "", headings: [], buttons: [], links: [], visibleTextSnippets: [] })),
};

/** The template's answer for the same request, with no model configured. */
async function templateOnly(body: unknown) {
    const saved = { local: process.env.MRONION_OLLAMA_MODEL, key: process.env.OPENAI_API_KEY };
    delete process.env.MRONION_OLLAMA_MODEL;
    delete process.env.OPENAI_API_KEY;
    const answer = await (await POST(post(body))).json();
    if (saved.local !== undefined) process.env.MRONION_OLLAMA_MODEL = saved.local;
    if (saved.key !== undefined) process.env.OPENAI_API_KEY = saved.key;
    return answer as { code: string };
}

function useOllama() {
    process.env.MRONION_OLLAMA_MODEL = LOCAL_MODEL;
    process.env.MRONION_OLLAMA_BASE_URL = fakeBaseUrl();
}

function assertHeld(body: { code: string; generatedBy: string; fallbackReason?: string }, template: string) {
    assert.ok(!body.code.includes(MARKER), "the model's output isn't in the code that runs");
    assert.equal(body.code, template, "the template's code alone");
    assert.equal(body.generatedBy, "fallback");
    assert.equal(body.fallbackReason, MODEL_BODIES_OFF);
    assert.equal(chatBodies.length, 0, "the model wasn't asked");
}

test("TFP-292: the local model's gap fill isn't put in the code that runs, and the record says why", async () => {
    const request = { baseUrl: "http://localhost:3000", description: "Check the notes page.", selectedPractices: ["database"], autoInspect: false };
    fakeOpenAi([CATALOG_ID], (_req, res) => json(res, 200, completion("```typescript\n" + OUTPUT + "\n```")));
    useOllama();
    const template = (await templateOnly(request)).code;
    const body = await (await POST(post(request))).json();
    assertHeld(body, template);
    assert.deepEqual(body.gapFill, { gapAreas: ["database"], outcome: "held", notApplicableAreas: [] });
});

test("TFP-292: the local model's Comprehensive scenarios aren't put in the code that runs, and the record says why", async () => {
    const request = { baseUrl: ORIGIN, description: "Check the site.", selectedPractices: ["accessibility"], contentProfile: PROFILE, autoInspect: false, runMode: { kind: "comprehensive", area: "accessibility" } };
    fakeOpenAi([CATALOG_ID], (_req, res) => json(res, 200, completion(OUTPUT)));
    useOllama();
    const template = (await templateOnly(request)).code;
    assertHeld(await (await POST(post(request))).json(), template);
});

test("TFP-292: OpenAI's suite isn't put in the code that runs, and the record says why", async () => {
    const request = { baseUrl: "http://localhost:3000", description: "Check the notes page.", selectedPractices: ["database"], autoInspect: false };
    delete process.env.MRONION_OLLAMA_MODEL;
    fakeOpenAi([OPENAI_MODEL_CANDIDATES[0]], (_req, res) => json(res, 200, completion(OUTPUT)));
    useFake();
    const template = (await templateOnly(request)).code;
    assertHeld(await (await POST(post(request))).json(), template);
});
