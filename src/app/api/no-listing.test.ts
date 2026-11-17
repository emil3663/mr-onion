/**
 * Phase 46 (TFP-232, Acceptance Criteria 1, review item 7): no API route lists sites or their confirmations. A site's
 * entry is reached by naming the site (Decision 1).
 *
 * Every route under src/app/api is found on disk, so a route added later is checked too. Two sites are seeded, each
 * with a confirmation, a gap-writer setting, a saved suite and a saved run, in a temporary data folder and runs
 * folder. Each route's GET is then asked with no site named, and with the shapes a "list them all" request might take
 * (an empty address, a wildcard, a flag). No answer may name either site, except:
 *   - /api/candidates, which names the hosts each candidate ran on (Decision 3's choice; review item 7 allows it);
 *   - /api/runs, which lists every saved run with its address. It predates this phase, and the app doesn't call it.
 *     Found while building TFP-232 and put to the owner; until ruled on, this test pins that it still does, so the
 *     ruling changes a test, not a guess.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/app/api/no-listing.test.ts
 */
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-no-listing-"));
const saved = { data: process.env.MRONION_DATA_DIR, runs: process.env.MRONION_RUNS_ROOT };
process.env.MRONION_DATA_DIR = join(scratch, "data");
process.env.MRONION_RUNS_ROOT = join(scratch, "runs");

const { siteFolderName, siteSuiteDir } = await import("../../lib/site-suites/store.ts");
const { CONFIRMATION_WORDING } = await import("../../lib/ownership/confirmation.ts");
const { NextRequest } = await import("next/server");

after(() => {
    for (const [key, value] of [["MRONION_DATA_DIR", saved.data], ["MRONION_RUNS_ROOT", saved.runs]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
});

const SITES = ["https://alpha-listing.example.com", "http://beta-listing.example.net:8080"];
const HOSTS = /alpha-listing|beta-listing/;

for (const origin of SITES) {
    const site = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(origin));
    mkdirSync(site, { recursive: true });
    const host = new URL(origin).hostname;
    writeFileSync(join(site, "ownership.json"), JSON.stringify({
        current: { hosts: [host], basis: "owner", wording: CONFIRMATION_WORDING.owner, name: "Tess", contactEmail: `tess@${host}`, confirmedAt: "2026-11-15T10:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", scopes: { active: true, load: false } },
        history: [],
    }));
    writeFileSync(join(site, "settings.json"), JSON.stringify({ gapWriter: "claude-code" }));
    const identity = { runType: "standard" as const, practices: [], auditMode: "smoke" };
    const dir = siteSuiteDir(origin, identity);
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 1, origin, identity, savedAt: "2026-11-10T08:00:00.000Z", siteTypes: [], types: {}, units: [] }));
    const runId = randomUUID();
    mkdirSync(join(process.env.MRONION_RUNS_ROOT!, runId), { recursive: true });
    writeFileSync(join(process.env.MRONION_RUNS_ROOT!, runId, "run.json"), JSON.stringify({ runId, baseUrl: origin, createdAt: "2026-11-12T09:00:00.000Z", finishedAt: "2026-11-12T09:00:00.000Z", generation: { siteSuite: { store: dir } } }));
}

const API = join(process.cwd(), "src", "app", "api");
function routes(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return routes(path);
        return entry.name === "route.ts" ? [path] : [];
    });
}
const routeOf = (file: string) => `/api/${relative(API, file).split(sep).slice(0, -1).join("/")}`;

const ALLOWED_TO_NAME_SITES = new Set(["/api/candidates"]);
const LISTS_SAVED_RUNS = "/api/runs";
// A partial host is a suggestion request, which Decision 1 forbids (the fresh-context review). Each names only part of
// a seeded host, so an answer naming one in full came from a lookup that isn't exact. Only GET is asked: the other
// methods change data, and a listing behind one would still need a route this test finds.
const QUERIES = ["", "?baseUrl=", "?baseUrl=*", "?baseUrl=%2A.example.com", "?all=1", "?list=sites", "?baseUrl=alpha", "?baseUrl=https%3A%2F%2Falpha", "?q=alpha-listing", "?prefix=beta", "?search=listing.example"];

test("the routes are found on disk, the site-scoped ones among them", () => {
    const found = routes(API).map(routeOf);
    for (const route of ["/api/site-ownership", "/api/site-settings", "/api/site-suites", "/api/runs", "/api/candidates"]) assert.ok(found.includes(route), `${route} in ${found.join(", ")}`);
});

test("no route answers a request that names no site with any site, or a confirmation", async () => {
    const answered: string[] = [];
    for (const file of routes(API)) {
        const route = routeOf(file);
        const handlers = (await import(pathToFileURL(file).href)) as { GET?: (req: InstanceType<typeof NextRequest>) => Promise<Response> };
        if (typeof handlers.GET !== "function") continue;
        for (const query of QUERIES) {
            const response = await handlers.GET(new NextRequest(`http://localhost${route}${query}`));
            const body = await response.text();
            answered.push(`${route}${query} ${response.status}`);
            if (ALLOWED_TO_NAME_SITES.has(route)) continue;
            if (route === LISTS_SAVED_RUNS) {
                assert.match(body, HOSTS, `${route}${query}: still lists saved runs by address, pending the owner's ruling (see the header)`);
                continue;
            }
            assert.doesNotMatch(body, HOSTS, `${route}${query} answered ${response.status} naming a seeded site: ${body.slice(0, 300)}`);
            assert.doesNotMatch(body, /tess@/, `${route}${query} holds a contact email`);
        }
    }
    assert.ok(answered.some((line) => line.startsWith("/api/site-ownership")), answered.join("\n"));
});

test("the seeded sites are there to find, by name: the check above isn't passing on an empty folder", async () => {
    const ownership = await import("./site-ownership/route.ts");
    const suites = await import("./site-suites/route.ts");
    for (const origin of SITES) {
        const named = `?baseUrl=${encodeURIComponent(`${origin}/a/page?q=1`)}`;
        const confirmation = await (await ownership.GET(new NextRequest(`http://localhost/api/site-ownership${named}`))).json();
        assert.equal(confirmation.status, "valid", origin);
        assert.equal(confirmation.confirmation.contactEmail, "t***@" + new URL(origin).hostname, origin);
        const saved = await (await suites.GET(new NextRequest(`http://localhost/api/site-suites${named}`))).json();
        assert.equal(saved.suites.length, 1, origin);
        assert.ok(saved.suites[0].lastRun, origin);
    }
});
