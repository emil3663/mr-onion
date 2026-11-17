/**
 * Phase 46 (TFP-297; Gate B's D1 ruling, owner, 2026-11-17): the site's own hosts, which the covered-host guard names
 * with "add <host> to this site's confirmation", are the hosts same-site with the target (the Public Suffix List's
 * registrable domain), IPs and localhost exactly, and always the hosts of the crawled pages. A third-party script the
 * crawl recorded is not the site's own. The fresh-context review's finding: every recorded host was counted, so
 * www.googletagmanager.com was "one of this site's hosts".
 *
 * ISTQB techniques: equivalence partitioning (same registrable domain; another domain; a multi-label public suffix;
 * a private suffix; an IP; localhost; a crawled page on another domain) and boundary value analysis on the suffix
 * (example.co.uk against other.co.uk, where the last two labels agree).
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/ownership/site-hosts.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-site-hosts-"));
const savedDataDir = process.env.MRONION_DATA_DIR;
let run = 0;

const { ownHostsOfSite, sameSite } = await import("./site-hosts.ts");
const { siteFolderName } = await import("../site-suites/store.ts");

beforeEach(() => {
    process.env.MRONION_DATA_DIR = join(scratch, `data-${run++}`);
});

after(() => {
    if (savedDataDir === undefined) delete process.env.MRONION_DATA_DIR;
    else process.env.MRONION_DATA_DIR = savedDataDir;
    rmSync(scratch, { recursive: true, force: true });
});

/** A saved crawl, as a site suite keeps its page data (Phase 42). */
function savedCrawl(origin: string, pages: string[], dependencyMap: Array<Record<string, string>>) {
    const dir = join(process.env.MRONION_DATA_DIR!, "site-suites", siteFolderName(origin), "standard-suite");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profile.json"), JSON.stringify({ baseUrl: origin, pages: pages.map((url) => ({ path: new URL(url).pathname, url })), dependencyMap }));
}

test("a third-party script the crawl recorded is not the site's own; an API on the site's domain is", async () => {
    savedCrawl("https://shop.example.com", ["https://shop.example.com/"], [
        { kind: "third-party-script", host: "www.googletagmanager.com", sampleUrl: "https://www.googletagmanager.com/gtm.js?id=GTM-X" },
        { kind: "form-action", host: "api.example.com", sampleUrl: "https://api.example.com/v1/search" },
    ]);
    const own = await ownHostsOfSite("https://shop.example.com");
    assert.ok(own.has("api.example.com"), "same registrable domain: the site's own");
    assert.ok(!own.has("www.googletagmanager.com"), "a third-party script stays a plain note");
});

test("by the Public Suffix List: example.co.uk is not same-site with other.co.uk, though their last two labels agree", async () => {
    savedCrawl("https://shop.example.co.uk", ["https://shop.example.co.uk/"], [
        { kind: "iframe", host: "other.co.uk", sampleUrl: "https://other.co.uk/embed" },
        { kind: "fetch", host: "api.example.co.uk", sampleUrl: "https://api.example.co.uk/items" },
    ]);
    const own = await ownHostsOfSite("https://shop.example.co.uk");
    assert.ok(own.has("api.example.co.uk"));
    assert.ok(!own.has("other.co.uk"));
    // A private suffix counts as a browser counts it: two github.io sites are two sites.
    assert.equal(sameSite("alice.github.io", "bob.github.io"), false);
    assert.equal(sameSite("docs.alice.github.io", "alice.github.io"), true);
});

test("an IP address and localhost match only themselves, whatever their port", async () => {
    assert.equal(sameSite("localhost", "localhost"), true);
    assert.equal(sameSite("127.0.0.1", "localhost"), false, "known limitation 16: not caught");
    assert.equal(sameSite("127.0.0.2", "127.0.0.1"), false);
    savedCrawl("http://127.0.0.1:4200", ["http://127.0.0.1:4200/"], [{ kind: "third-party-script", host: "localhost:8091", sampleUrl: "http://localhost:8091/app.js" }]);
    assert.ok(!(await ownHostsOfSite("http://127.0.0.1:4200")).has("localhost"));
});

test("the hosts of the pages the crawl visited always count, on another domain too", async () => {
    savedCrawl("https://shop.example.com", ["https://shop.example.com/", "https://help.example-support.net/faq"], []);
    const own = await ownHostsOfSite("https://shop.example.com");
    assert.ok(own.has("help.example-support.net"));
    assert.ok(own.has("shop.example.com"), "the target's own host");
});
