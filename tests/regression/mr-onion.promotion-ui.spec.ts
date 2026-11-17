import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { setting } from "../../src/lib/settings";

// Phase 46 (TFP-234, Decision 3, Acceptance Criteria 3): the promotion screen, in the real app, on a candidate pool
// seeded in the server's temporary data folder (playwright.regression.config.ts). Equivalence partitions:
//   meets the rule (3 sites, every run clean)        -> offered, with its pattern, code, reasons and every host
//   below the rule (1 site)                          -> not offered
//   already approved                                 -> waiting to be committed, with the pointer, not offered
//   reject with no reason                            -> refused by the API, shown, the candidate still offered
//   approve, naming who                              -> waiting to be committed; nothing in the repo changed

const dataDir = setting("DATA_DIR");
const pool = () => join(dataDir!, "candidates");

// The fresh-context review: this spec deletes and rewrites <data>/candidates, so it runs only in the folder the
// regression config made for it. A data-folder setting (under either of its names) pointing at a real data folder
// stops the spec before anything is touched.
function ownRegressionFolder(dir: string | undefined): boolean {
    if (!dir) return false;
    const full = resolve(dir);
    return full.startsWith(resolve(tmpdir()) + sep) && basename(full).startsWith("mr-onion-regression-data-");
}

const run = (origin: string, at: string) => ({ origin, page: "/", at, status: "Passed", run: `run-${origin.length}-${at}` });
const candidate = (id: string, name: string, status: string, origins: string[], extra: Record<string, unknown> = {}) => ({
    id,
    pattern: { kind: "element", type: "button", name },
    body: `await page.goto(__PAGE__);\nawait expect(__LOCATOR__).toBeVisible(); // ${name}`,
    gate: "read-only",
    technique: "state transition",
    writer: "claude-code",
    sources: [{ origin: origins[0], page: "/", at: "2026-11-01T00:00:00.000Z" }],
    evidence: origins.map((origin, index) => run(origin, `2026-11-0${index + 2}T00:00:00.000Z`)),
    status,
    costUsd: 0,
    ...extra,
});

const OFFERED = candidate("aaaaaaaaaaa1", "add to cart", "candidate", ["http://localhost:4200", "https://shop.example.com", "http://192.168.1.10:8080"]);
const BELOW = candidate("aaaaaaaaaaa2", "subscribe", "candidate", ["http://localhost:4200"]);
const APPROVED = candidate("aaaaaaaaaaa3", "search", "approved", ["http://localhost:4200", "https://shop.example.com", "https://a.example.org"], { approved: { by: "Tess Tester", at: "2026-11-10T09:00:00.000Z" } });
// The rule's edges (the fresh-context review): 2 clean sites is below it; 1 site with a failure labelled a real
// defect meets it; 3 sites with one read-only breach doesn't.
const TWO_SITES = candidate("aaaaaaaaaaa4", "newsletter", "candidate", ["http://localhost:4200", "https://shop.example.com"]);
const REAL_DEFECT = candidate("aaaaaaaaaaa5", "checkout", "candidate", ["http://localhost:4200"], { evidence: [{ ...run("http://localhost:4200", "2026-11-02T00:00:00.000Z"), status: "Failed", label: "real" }] });
const BREACH = candidate("aaaaaaaaaaa6", "wishlist", "candidate", ["http://localhost:4200", "https://shop.example.com", "https://a.example.org"], { evidence: [{ ...run("http://localhost:4200", "2026-11-02T00:00:00.000Z"), breach: true }, run("https://shop.example.com", "2026-11-03T00:00:00.000Z"), run("https://a.example.org", "2026-11-04T00:00:00.000Z")] });
// Two origins on one host (http and https) are two sites to the rule, so the screen names them by origin.
const SAME_HOST = candidate("aaaaaaaaaaa7", "compare", "candidate", ["http://dup.example.com", "https://dup.example.com", "http://localhost:4200"]);
const SEEDED = [OFFERED, BELOW, APPROVED, TWO_SITES, REAL_DEFECT, BREACH, SAME_HOST];

const gitStatus = () => execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });

test.beforeEach(async () => {
    expect(ownRegressionFolder(dataDir), `the spec only touches the regression config's own temporary data folder, not ${dataDir}`).toBe(true);
    await rm(pool(), { recursive: true, force: true });
    await mkdir(pool(), { recursive: true });
    for (const seeded of SEEDED) await writeFile(join(pool(), `${seeded.id}.json`), JSON.stringify(seeded, null, 2));
});

test.afterAll(async () => {
    if (ownRegressionFolder(dataDir)) await rm(pool(), { recursive: true, force: true });
});

test("TFP-234: only a candidate that meets the rule is offered, with its pattern, code, evidence and every site by host", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Candidate tests" }).click();
    await expect(page.getByRole("heading", { name: "Candidate tests", level: 1 })).toBeVisible();

    const offered = page.getByRole("listitem", { name: "Candidate add to cart [button]" });
    await expect(offered).toBeVisible();
    await expect(offered.getByRole("heading", { name: "add to cart [button]" })).toBeVisible();
    await expect(offered.getByLabel("Its code")).toContainText("await expect(__LOCATOR__).toBeVisible(); // add to cart");
    await expect(offered.getByText("it passed the gates on all 3 runs")).toBeVisible();
    await expect(offered.getByText("it has caught no real defect")).toBeVisible();
    await expect(offered.getByText("it ran on 3 sites (3 needed without one)")).toBeVisible();
    await expect(offered.getByRole("list", { name: "Sites it ran on" }).getByRole("listitem")).toHaveText(["localhost:4200", "shop.example.com", "192.168.1.10:8080"]);

    // Exactly the candidates meeting the rule: not 1 or 2 clean sites, not a breach, not one already approved.
    await expect(page.getByRole("region", { name: "Offered for promotion" }).getByRole("heading", { level: 3 })).toHaveText(["add to cart [button]", "checkout [button]", "compare [button]"]);
    await expect(page.getByRole("listitem", { name: "Candidate checkout [button]" }).getByText("it caught a real defect")).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Candidate compare [button]" }).getByRole("list", { name: "Sites it ran on" }).getByRole("listitem")).toHaveText(["http://dup.example.com", "https://dup.example.com", "localhost:4200"]);
    await expect(page).toHaveTitle("Candidate tests | Mr Onion");
    await expect(page.getByText("subscribe [button]")).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: "Candidate search [button]" })).toHaveCount(0);
    const waiting = page.getByRole("listitem", { name: "Waiting: search [button]" });
    await expect(waiting).toContainText("approved by Tess Tester on 2026-11-10");
    await expect(page.getByText("Ask Claude Code: run `npm run library:promote`")).toBeVisible();
});

test("TFP-234: a rejection without a reason is refused, and the candidate stays offered", async ({ page }) => {
    await page.goto("/candidates");
    const offered = page.getByRole("listitem", { name: "Candidate add to cart [button]" });
    await offered.getByRole("button", { name: "Reject" }).click();
    await expect(offered.getByRole("alert")).toHaveText("a rejection needs its reason");
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" })).toBeVisible();
    expect(JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8")).status).toBe("candidate");

    // With a reason, it is rejected and kept, with the reason, and offered no more.
    await page.getByRole("listitem", { name: "Candidate add to cart [button]" }).getByLabel("Reason to reject").fill("duplicates the cart test");
    await page.getByRole("listitem", { name: "Candidate add to cart [button]" }).getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" })).toHaveCount(0);
    const saved = JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8"));
    expect([saved.status, saved.reason]).toEqual(["rejected", "duplicates the cart test"]);
});

test("TFP-234: an approval moves the candidate to waiting to be committed, with the pointer, and writes nothing into the repo", async ({ page }) => {
    const before = gitStatus();
    await page.goto("/candidates");
    await page.getByLabel("Your name, for an approval").fill("Emil");
    await page.getByRole("listitem", { name: "Candidate add to cart [button]" }).getByRole("button", { name: "Approve" }).click();

    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" })).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: "Waiting: add to cart [button]" })).toContainText("approved by Emil on");
    await expect(page.getByText("Ask Claude Code: run `npm run library:promote`")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Waiting: add to cart [button]" })).toBeVisible();
    const saved = JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8"));
    expect([saved.status, saved.approved.by]).toEqual(["approved", "Emil"]);
    expect(gitStatus(), "the working tree is unchanged after an approval").toBe(before);
});

// The fresh-context review's three failure paths, each with the API's answer arranged by the test.
test("TFP-234: a decision the server can't answer in JSON, or that never reaches it, is said so, and nothing is decided", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByLabel("Your name, for an approval").fill("Emil");
    const offered = page.getByRole("listitem", { name: "Candidate add to cart [button]" });
    await page.route("**/api/candidates", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Internal Server Error</h1>" }) : route.fallback()));
    await offered.getByRole("button", { name: "Approve" }).click();
    await expect(offered.getByRole("alert")).toHaveText("the server answered 500, with no reason given");
    await page.unroute("**/api/candidates");
    await page.route("**/api/candidates", (route) => (route.request().method() === "POST" ? route.abort("connectionrefused") : route.fallback()));
    await offered.getByRole("button", { name: "Approve" }).click();
    await expect(offered.getByRole("alert")).toHaveText("Mr Onion didn't answer, so nothing was decided. Try again.");
    expect(JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8")).status).toBe("candidate");
});

test("TFP-234: while one decision is with the API, every Approve and Reject is disabled", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByLabel("Your name, for an approval").fill("Emil");
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/candidates", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await held;
        return route.fallback();
    });
    await page.getByRole("listitem", { name: "Candidate add to cart [button]" }).getByRole("button", { name: "Approve" }).click();
    const decisions = page.getByRole("region", { name: "Offered for promotion" }).getByRole("button", { name: /^(Approve|Reject)$/ });
    await expect(decisions).toHaveCount(6);
    for (const button of await decisions.all()) await expect(button).toBeDisabled();
    release();
    await expect(page.getByRole("listitem", { name: "Waiting: add to cart [button]" })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Candidate checkout [button]" }).getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("TFP-234: a candidate decided elsewhere shows the API's refusal, and the list is read again", async ({ page }) => {
    await page.goto("/candidates");
    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" })).toBeVisible();
    // Approved behind the screen's back (another tab, or the API).
    await writeFile(join(pool(), `${OFFERED.id}.json`), JSON.stringify({ ...OFFERED, status: "approved", approved: { by: "Someone else", at: "2026-11-16T10:00:00.000Z" } }, null, 2));
    await page.getByLabel("Your name, for an approval").fill("Emil");
    await page.getByRole("listitem", { name: "Candidate add to cart [button]" }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("listitem", { name: "Waiting: add to cart [button]" })).toContainText("approved by Someone else");
    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" })).toHaveCount(0);
});

test("TFP-234: an approval without a name is refused by the API, as shown", async ({ page }) => {
    await page.goto("/candidates");
    const offered = page.getByRole("listitem", { name: "Candidate add to cart [button]" });
    await offered.getByRole("button", { name: "Approve" }).click();
    await expect(offered.getByRole("alert")).toHaveText("an approval names who approved it (by)");
    expect(JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8")).status).toBe("candidate");
});
