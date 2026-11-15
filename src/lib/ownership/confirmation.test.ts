/**
 * Phase 43 (TFP-218, Acceptance Criteria 1): the ownership confirmation, stored with the site, through its API, on a
 * temporary data folder (MRONION_DATA_DIR), so no test touches the real one.
 *
 * ISTQB techniques: equivalence partitioning over each field (valid; missing; malformed), boundary value analysis on
 * the expiry (the default 90 days; exactly 1 year; past 1 year; not after the date confirmed), and a state transition
 * for the confirmation's life (missing -> valid -> replaced -> withdrawn; expired by the clock).
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/ownership/confirmation.test.ts
 */
import assert from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-ownership-"));
const savedDataDir = process.env.MRONION_DATA_DIR;
let run = 0;

const route = await import("../../app/api/site-ownership/route.ts");
const withdrawRoute = await import("../../app/api/site-ownership/withdraw/route.ts");
const { CONFIRMATION_WORDING, confirmationStatus, DEFAULT_EXPIRY_DAYS, validateConfirmation } = await import("./confirmation.ts");
const { siteFolderName } = await import("../site-suites/store.ts");
const { NextRequest } = await import("next/server");

const ORIGIN = "https://shop.example.com";
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
    process.env.MRONION_DATA_DIR = join(scratch, `data-${run++}`);
});

after(() => {
    if (savedDataDir === undefined) delete process.env.MRONION_DATA_DIR;
    else process.env.MRONION_DATA_DIR = savedDataDir;
    rmSync(scratch, { recursive: true, force: true });
});

const post = (path: string, body: unknown) => new NextRequest(new URL(`http://localhost${path}`), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const read = async (baseUrl = ORIGIN) => (await route.GET(new NextRequest(new URL(`http://localhost/api/site-ownership?baseUrl=${encodeURIComponent(baseUrl)}`)))).json();
const confirm = (body: Record<string, unknown>) => route.POST(post("/api/site-ownership", body));
const valid = (overrides: Record<string, unknown> = {}) => ({
    baseUrl: `${ORIGIN}/shop`,
    hosts: ["shop.example.com"],
    basis: "owner",
    wording: CONFIRMATION_WORDING.owner,
    name: "Tess Tester",
    contactEmail: "tess@example.com",
    scopes: { active: true, load: false },
    ...overrides,
});

/** A saved crawl for the site, as a site suite keeps its page data (Phase 42): a page and a request on other hosts. */
function savedCrawl() {
    const dir = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(ORIGIN), "standard-suite");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profile.json"), JSON.stringify({
        baseUrl: ORIGIN,
        pages: [{ path: "/", url: `${ORIGIN}/` }, { path: "/help", url: "https://help.example.com/help" }],
        // Read by its sample address here; an entry with only its host is the case below.
        dependencyMap: [{ kind: "fetch", sampleUrl: "https://api.example.com:8443/v1/items" }],
    }));
}

test("no confirmation reads as missing, with the wording for each basis to show", async () => {
    const body = await read();
    assert.equal(body.origin, ORIGIN);
    assert.equal(body.status, "missing");
    assert.equal(body.confirmation, null);
    assert.deepEqual(body.history, []);
    assert.deepEqual(Object.keys(body.wording).sort(), ["owner", "written-permission"]);
    // Decision 12: the practice-site rule is in what a tester with written permission confirms.
    assert.match(body.wording["written-permission"], /practice site counts only when its published terms explicitly allow attack-shaped or load testing/);
});

test("a confirmation is created and read back with every field of Decision 1, in the data folder, never the repo", async () => {
    const before = Date.now();
    const response = await confirm(valid({ hosts: ["Shop.Example.com"] }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const body = await read();
    assert.equal(body.status, "valid");
    const confirmation = body.confirmation;
    assert.deepEqual(confirmation.hosts, ["shop.example.com"], "hosts are kept as host names, lower case");
    assert.equal(confirmation.basis, "owner");
    assert.equal(confirmation.wording, CONFIRMATION_WORDING.owner);
    assert.equal(confirmation.name, "Tess Tester");
    assert.equal(confirmation.contactEmail, "tess@example.com");
    assert.deepEqual(confirmation.scopes, { active: true, load: false });
    assert.equal(confirmation.withdrawnAt, undefined);
    const confirmedAt = Date.parse(confirmation.confirmedAt);
    assert.ok(confirmedAt >= before && confirmedAt <= Date.now(), confirmation.confirmedAt);
    assert.equal(Date.parse(confirmation.expiresAt) - confirmedAt, DEFAULT_EXPIRY_DAYS * DAY, "90 days by default (Decision 5)");

    const file = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(ORIGIN), "ownership.json");
    assert.ok(existsSync(file), file);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).current, confirmation);
    assert.ok(!existsSync(join(process.cwd(), "ownership.json")) && !existsSync(join(process.cwd(), "site-suites")), "nothing is written in the repo");
});

test("a host the site's saved crawl uses can be confirmed, by its page or its request host; one it doesn't is refused", async () => {
    savedCrawl();
    assert.equal((await confirm(valid({ hosts: ["shop.example.com", "help.example.com", "api.example.com"] }))).status, 200);
    assert.deepEqual((await read()).confirmation.hosts, ["shop.example.com", "help.example.com", "api.example.com"]);

    const response = await confirm(valid({ hosts: ["shop.example.com", "shpo.example.com"] }));
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).reasons, ["\"shpo.example.com\" isn't a host this site's address or crawl uses: check it for a typing error"]);
});

test("each refusal of Decision 13 gives its reason, and nothing is saved", async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
        ["no hosts", { hosts: [] }, "hosts is missing: type each host the confirmation covers"],
        ["an untyped host", { hosts: [" "] }, "each host must be typed: an empty one was given"],
        ["an address, not a host", { hosts: ["https://shop.example.com/"] }, "\"https://shop.example.com/\" isn't a host name: type it as shop.example.com, with no scheme, port or path"],
        ["a host with a port", { hosts: ["shop.example.com:443"] }, "\"shop.example.com:443\" isn't a host name: type it as shop.example.com, with no scheme, port or path"],
        ["a wildcard", { hosts: ["*.example.com"] }, "\"*.example.com\" is a wildcard: type each host in full (Decision 2)"],
        ["no basis", { basis: undefined }, "basis is missing or unknown: it must be one of owner, written-permission"],
        ["an unknown basis", { basis: "friend-said-ok" }, "basis is missing or unknown: it must be one of owner, written-permission"],
        ["no wording", { wording: "" }, "wording is missing: send the confirmation text the tester confirmed"],
        ["another basis's wording", { wording: CONFIRMATION_WORDING["written-permission"] }, "wording isn't the confirmation text for this basis: show the current text and send it back unchanged"],
        ["no name", { name: "  " }, "name is missing: the name of the person who confirms"],
        ["no contact email", { contactEmail: undefined }, "contactEmail is missing: how to reach the person who confirms"],
        ["an invalid contact email", { contactEmail: "tess at example" }, "contactEmail \"tess at example\" isn't a valid email address"],
        ["an email with no domain dot", { contactEmail: "tess@localhost" }, "contactEmail \"tess@localhost\" isn't a valid email address"],
        ["an expiry that isn't a date", { expiresAt: "soon" }, "expiresAt isn't a date"],
        ["an expiry in the past", { expiresAt: new Date(Date.now() - DAY).toISOString() }, "expiresAt is not after the date confirmed"],
        ["malformed scopes", { scopes: { active: "yes" } }, "scopes must be { active: true|false, load: true|false }"],
    ];
    for (const [label, overrides, reason] of cases) {
        const response = await confirm(valid(overrides));
        assert.equal(response.status, 400, label);
        assert.deepEqual((await response.json()).reasons, [reason], label);
    }
    const tooLong = await confirm(valid({ expiresAt: new Date(Date.now() + 367 * DAY).toISOString() }));
    assert.equal(tooLong.status, 400);
    assert.match((await tooLong.json()).reasons[0], /^expiresAt is beyond 1 year from the date confirmed \(at most \d{4}-/);
    const many = await confirm({ baseUrl: ORIGIN });
    assert.deepEqual((await many.json()).reasons, [
        "hosts is missing: type each host the confirmation covers",
        "basis is missing or unknown: it must be one of owner, written-permission",
        "wording is missing: send the confirmation text the tester confirmed",
        "name is missing: the name of the person who confirms",
        "contactEmail is missing: how to reach the person who confirms",
    ], "a request missing everything names each missing field");
    const notText = await confirm(valid({ hosts: [123] }));
    assert.deepEqual((await notText.json()).reasons, ["each host must be typed as text: 123 isn't"]);
    for (const loose of ["2027-02-13T00:00", "Nov 20 2026", "2027-02-13T00:00:00"]) {
        const response = await confirm(valid({ expiresAt: loose }));
        assert.deepEqual((await response.json()).reasons, ["expiresAt must be an ISO 8601 date (2027-02-13) or a date-time with its zone (2027-02-13T09:00:00Z)"], loose);
    }
    assert.equal((await confirm({ ...valid(), baseUrl: "not a url" })).status, 400);
    assert.equal((await read()).status, "missing", "nothing refused was saved");
});

test("the expiry: chosen up to exactly 1 year from the date confirmed; expired counts as absent (Decision 5)", async () => {
    const now = new Date("2026-11-15T10:00:00.000Z");
    const year = new Date("2027-11-15T10:00:00.000Z");
    const atLimit = await validateConfirmation(ORIGIN, { ...valid(), expiresAt: year.toISOString() }, now);
    assert.ok("confirmation" in atLimit, JSON.stringify(atLimit));
    assert.equal(atLimit.confirmation.expiresAt, year.toISOString());
    const past = await validateConfirmation(ORIGIN, { ...valid(), expiresAt: new Date(year.getTime() + 1000).toISOString() }, now);
    assert.deepEqual("refused" in past && past.refused, ["expiresAt is beyond 1 year from the date confirmed (at most 2027-11-15T10:00:00.000Z)"]);

    // A date with no time is midnight UTC.
    const dateOnly = await validateConfirmation(ORIGIN, { ...valid(), expiresAt: "2027-02-13" }, now);
    assert.equal("confirmation" in dateOnly && dateOnly.confirmation.expiresAt, "2027-02-13T00:00:00.000Z");
    // Confirmed on a leap day: a year on is 28 February, not 1 March.
    const leap = new Date("2028-02-29T10:00:00.000Z");
    assert.ok("confirmation" in (await validateConfirmation(ORIGIN, { ...valid(), expiresAt: "2029-02-28T10:00:00Z" }, leap)));
    const pastLeap = await validateConfirmation(ORIGIN, { ...valid(), expiresAt: "2029-03-01T10:00:00Z" }, leap);
    assert.deepEqual("refused" in pastLeap && pastLeap.refused, ["expiresAt is beyond 1 year from the date confirmed (at most 2029-02-28T10:00:00.000Z)"]);

    const { confirmation } = atLimit;
    assert.equal(confirmationStatus(confirmation, new Date(year.getTime() - 1)), "valid");
    assert.equal(confirmationStatus(confirmation, year), "expired");
    assert.equal(confirmationStatus(null, now), "missing");
    // An expiry that can't be read is never "valid", even for a confirmation handed in directly, not loaded.
    assert.equal(confirmationStatus({ ...confirmation, expiresAt: "garbage" }, now), "expired");
});

test("replacing keeps the old one in the history; withdrawing keeps it with its date, and counts as absent (Decision 6)", async () => {
    assert.equal((await confirm(valid())).status, 200);
    const first = (await read()).confirmation;
    assert.equal((await confirm(valid({ basis: "written-permission", wording: CONFIRMATION_WORDING["written-permission"], scopes: { active: false, load: true } }))).status, 200);
    let body = await read();
    assert.equal(body.confirmation.basis, "written-permission");
    assert.deepEqual(body.history, [first], "the replaced confirmation is kept");

    const before = Date.now();
    const withdrawn = await withdrawRoute.POST(post("/api/site-ownership/withdraw", { baseUrl: ORIGIN }));
    assert.equal(withdrawn.status, 200);
    body = await read();
    assert.equal(body.status, "withdrawn");
    assert.equal(body.confirmation.basis, "written-permission", "the withdrawn confirmation is kept");
    assert.ok(Date.parse(body.confirmation.withdrawnAt) >= before, body.confirmation.withdrawnAt);
    assert.deepEqual(body.history, [first]);

    assert.equal((await withdrawRoute.POST(post("/api/site-ownership/withdraw", { baseUrl: ORIGIN }))).status, 404, "nothing in force to withdraw");
    assert.equal((await withdrawRoute.POST(post("/api/site-ownership/withdraw", { baseUrl: "https://other.example.com" }))).status, 404);

    // Confirming again after a withdrawal starts a new one; the withdrawn one joins the history.
    assert.equal((await confirm(valid())).status, 200);
    body = await read();
    assert.equal(body.status, "valid");
    assert.equal(body.history.length, 2);
    assert.ok(body.history[1].withdrawnAt);
});

test("an unreadable or malformed confirmation file reads as missing: it fails closed", async () => {
    const dir = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(ORIGIN));
    mkdirSync(dir, { recursive: true });
    const good = { hosts: ["shop.example.com"], basis: "owner", wording: CONFIRMATION_WORDING.owner, name: "Tess", contactEmail: "tess@example.com", confirmedAt: "2026-11-15T10:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", scopes: { active: true, load: false } };
    const files: Array<[string, unknown]> = [
        ["not JSON", "{ not json"],
        ["an empty confirmation", { current: {} }],
        ["an expiry that isn't a date", { current: { ...good, expiresAt: "garbage" } }],
        ["no hosts", { current: { ...good, hosts: [] } }],
        ["an unknown basis", { current: { ...good, basis: "friend" } }],
        ["scopes that aren't booleans", { current: { ...good, scopes: { active: "yes", load: false } } }],
        ["a withdrawal that isn't a date", { current: { ...good, withdrawnAt: 1 } }],
    ];
    for (const [label, content] of files) {
        writeFileSync(join(dir, "ownership.json"), typeof content === "string" ? content : JSON.stringify(content));
        const body = await read();
        assert.equal(body.status, "missing", label);
        assert.equal(body.confirmation, null, label);
    }
    // The same file, well formed, is read: the checks above refuse only what is broken.
    writeFileSync(join(dir, "ownership.json"), JSON.stringify({ current: good, history: [{}, good] }));
    const body = await read();
    assert.equal(body.status, "valid");
    assert.deepEqual(body.history, [good], "a malformed history entry is dropped");
});

test("confirmations saved at the same moment are all kept: none is lost from the history", async () => {
    const names = ["One", "Two", "Three", "Four", "Five"];
    const responses = await Promise.all(names.map((name) => confirm(valid({ name }))));
    assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200, 200]);
    const body = await read();
    assert.deepEqual([...body.history.map((entry: { name: string }) => entry.name), body.confirmation.name].sort(), [...names].sort());
});

test("a request host the crawl recorded counts by its host alone, without a sample address", async () => {
    const dir = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(ORIGIN), "standard-suite");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profile.json"), JSON.stringify({ baseUrl: ORIGIN, pages: [], dependencyMap: [{ host: "cdn.example.com:443", kind: "script" }] }));
    assert.equal((await confirm(valid({ hosts: ["cdn.example.com"] }))).status, 200);
});

test("nothing is sent to the contact email: the store and its routes reach only the local file system", () => {
    for (const file of ["src/lib/ownership/confirmation.ts", "src/app/api/site-ownership/route.ts", "src/app/api/site-ownership/withdraw/route.ts"]) {
        const source = readFileSync(join(process.cwd(), file), "utf8");
        // Every module it loads, however it is written: a static import (on one line or several), import(), require().
        const loaded = [...source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)].map((match) => match.slice(1).find(Boolean)!);
        assert.ok(loaded.length > 0, `${file}: its imports were read`);
        // Mr Onion's own: the store, and what it uses for the site's origin and folder (none of them sends anything).
        const allowed = ["fs/promises", "path", "next/server", "@/lib/ownership/confirmation", "@/lib/generate/normalize", "@/lib/site-suites/store", "@/lib/storage/data-dir"];
        for (const name of loaded) assert.ok(allowed.includes(name), `${file} loads ${name}`);
        assert.doesNotMatch(source, /\bfetch\s*\(|\bimport\s*\(|\brequire\s*\(|smtp|nodemailer|sendmail/i, file);
    }
});
