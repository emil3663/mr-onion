/**
 * TFP-292 (hardening of the model-written test check): the server reads a run's Base URL as http(s) only. Every route
 * that reads one (generation, a run, site settings, the CLI, inspection and the crawl) goes through normalizeBaseUrl, which
 * refuses any other scheme.
 *
 * ISTQB techniques: equivalence partitioning (http, https, no scheme read as http, a local address with its port,
 * another scheme written with "://", nothing given) and one case per route that reads the address on its own.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/generate/base-url.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";

const { normalizeBaseUrl } = await import("./normalize.ts");
const { normalizeCrawlBaseUrl } = await import("../pipeline/crawl.ts");
const introspect = await import("../../app/api/introspect/route.ts");
const { NextRequest } = await import("next/server");

const accepted: Array<[string, string]> = [
    ["https://fixture.example/one", "https://fixture.example/one"],
    ["http://fixture.example", "http://fixture.example"],
    ["fixture.example/one", "http://fixture.example/one"],
    ["localhost:3000", "http://localhost:3000"],
];
const refused = ["ftp://fixture.example/one", "ws://fixture.example", "file:///fixture/one", "chrome://settings"];

test("TFP-292: normalizeBaseUrl takes http(s), or no scheme read as http, and refuses any other", () => {
    for (const [given, value] of accepted) assert.deepEqual(normalizeBaseUrl(given), { ok: true, value }, given);
    for (const given of refused) {
        const read = normalizeBaseUrl(given);
        assert.equal(read.ok, false, given);
        assert.equal(read.ok ? "" : read.message, "baseUrl must be an http or https address", given);
    }
    assert.equal(normalizeBaseUrl("").ok, true, "nothing given is the default, as before");
});

test("TFP-292: a run's request reads it the same way", async () => {
    const { readRunRequest } = await import("../run/run-request.ts");
    const code = "test('fixture one', async () => {});";
    for (const given of refused) assert.deepEqual(readRunRequest({ code, baseUrl: given }), { error: "baseUrl must be an http or https address" }, given);
    for (const [given] of accepted) assert.ok("options" in readRunRequest({ code, baseUrl: given }), given);
    assert.ok("options" in readRunRequest({ code }), "nothing given, as before");
});

test("TFP-292: the crawl and inspection read it the same way", async () => {
    for (const given of refused) assert.equal(normalizeCrawlBaseUrl(given).ok, false, given);
    for (const [given, value] of accepted) assert.deepEqual(normalizeCrawlBaseUrl(given), { ok: true, value }, given);
    for (const given of refused) {
        const response = await introspect.POST(new NextRequest(new URL("http://localhost/api/introspect"), { method: "POST", body: JSON.stringify({ baseUrl: given }), headers: { "content-type": "application/json" } }));
        assert.equal(response.status, 400, given);
        const body = await response.json();
        assert.match(JSON.stringify(body), /baseUrl must be an http or https address/, given);
    }
});
