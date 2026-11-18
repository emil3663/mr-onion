import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { setting } from "../../src/lib/settings";
import { candidateId } from "../../src/lib/candidates/pool";

// Phase 46 (TFP-234, Decision 3, Acceptance Criteria 3): the promotion screen, in the real app, on a candidate pool
// seeded in the server's temporary data folder (playwright.regression.config.ts). Equivalence partitions:
//   meets the rule (3 sites, every run clean)        -> offered, with its pattern, code, reasons and every host
//   below the rule (1 site)                          -> not offered
//   already approved                                 -> waiting to be committed, with the pointer, not offered
//   reject with no reason                            -> refused by the API, shown, the candidate still offered
//   approve, naming who                              -> waiting to be committed; nothing in the repo changed

const NEXT_STEP = "Next step: in your Mr Onion checkout, run npm run library:promote and commit the new entries under src/lib/library/promoted/, reviewed like any code. A coding agent can do this for you.";
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
// TFP-298: each with its proper id, candidateId(pattern), as the pool requires; the first argument only labels it.
const candidate = (_label: string, name: string, status: string, origins: string[], extra: Record<string, unknown> = {}) => ({
    id: candidateId({ kind: "element" as const, type: "button", name }),
    pattern: { kind: "element" as const, type: "button", name },
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
    // In the pool's order, by id (TFP-298: the ids are candidateId(pattern) now).
    const offeredInOrder = [OFFERED, REAL_DEFECT, SAME_HOST].sort((a, b) => a.id.localeCompare(b.id)).map((item) => `${item.pattern.name} [button]`);
    await expect(page.getByRole("region", { name: "Offered for promotion" }).getByRole("heading", { level: 3 })).toHaveText(offeredInOrder);
    await expect(page.getByRole("listitem", { name: "Candidate checkout [button]" }).getByText("it caught a real defect")).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Candidate compare [button]" }).getByRole("list", { name: "Sites it ran on" }).getByRole("listitem")).toHaveText(["http://dup.example.com", "https://dup.example.com", "localhost:4200"]);
    await expect(page).toHaveTitle("Candidate tests | Mr Onion");
    await expect(page.getByText("subscribe [button]")).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: "Candidate search [button]" })).toHaveCount(0);
    const waiting = page.getByRole("listitem", { name: "Waiting: search [button]" });
    await expect(waiting).toContainText("approved by Tess Tester on 2026-11-10");
    // R7 (the owner's re-walk, 2026-11-18): the next step, word for word, for anyone, not only Claude Code.
    await expect(page.getByTestId("next-step")).toHaveText(NEXT_STEP);
});

test("TFP-234: a rejection without a reason is refused, and the candidate stays offered", async ({ page }) => {
    await page.goto("/candidates");
    const offered = page.getByRole("listitem", { name: "Candidate add to cart [button]" });
    await offered.getByRole("button", { name: "Reject" }).click();
    await expect(offered.getByRole("alert")).toHaveText("Type a reason first: it is kept with the candidate.");
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
    // R7 (the owner's re-walk, 2026-11-18): the next step, word for word, for anyone, not only Claude Code.
    await expect(page.getByTestId("next-step")).toHaveText(NEXT_STEP);
    await page.reload();
    await expect(page.getByRole("listitem", { name: "Waiting: add to cart [button]" })).toBeVisible();
    const saved = JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8"));
    expect([saved.status, saved.approved.by]).toEqual(["approved", "Emil"]);
    expect(gitStatus(), "the working tree is unchanged after an approval").toBe(before);
});

// Phase 46 Gate B, R5 (the owner's re-walk, 2026-11-18): "Approving as <name> (change)" once at the top; Approve on each
// candidate; "Reason to reject" beside Reject only. Partitions: no name yet / a name used / changed; two candidates.
test("R5: the approver's name is asked once at the top, then reads \"Approving as <name> (change)\"", async ({ page }) => {
    await page.goto("/candidates");
    const offeredSection = page.getByRole("region", { name: "Offered for promotion" });
    await expect(offeredSection.getByRole("listitem", { name: "Candidate checkout [button]" })).toBeVisible();
    expect(await offeredSection.getByRole("listitem", { name: /^Candidate / }).count(), "more than one candidate is offered").toBeGreaterThan(1);
    // One name field for the page, none per candidate.
    await expect(page.getByLabel("Your name, for an approval")).toHaveCount(1);
    await expect(page.getByText(/^Approving as /)).toHaveCount(0);
    await page.getByLabel("Your name, for an approval").fill("Tess Tester");
    await page.getByRole("button", { name: "Use this name" }).click();
    const approving = page.getByTestId("approving-as");
    await expect(approving).toHaveText("Approving as Tess Tester (change)");
    // Focus goes to the line, a status (the fresh-context review: not lost with the form that went).
    await expect(approving).toBeFocused();
    await expect(approving).toHaveRole("status");
    await expect(page.getByText(/^Approving as /)).toHaveCount(1);
    await expect(page.getByLabel("Your name, for an approval")).toHaveCount(0);
    // It sits above the candidates.
    const [line, first] = [await approving.boundingBox(), await offeredSection.getByRole("listitem", { name: /^Candidate / }).first().boundingBox()];
    expect(line!.y + line!.height, "the line is above the first candidate").toBeLessThanOrEqual(first!.y);
    // change: the field again, with the name, focused.
    await approving.getByRole("button", { name: "change the approver's name" }).click();
    await expect(page.getByLabel("Your name, for an approval")).toHaveValue("Tess Tester");
    await expect(page.getByLabel("Your name, for an approval")).toBeFocused();
});

test("R5: each candidate has its Approve, which approves as the name at the top", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByLabel("Your name, for an approval").fill("Tess Tester");
    await page.getByRole("button", { name: "Use this name" }).click();
    for (const name of ["Candidate add to cart [button]", "Candidate checkout [button]"]) {
        await expect(page.getByRole("listitem", { name }).getByRole("button", { name: "Approve" })).toHaveCount(1);
    }
    await page.getByRole("listitem", { name: "Candidate checkout [button]" }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("listitem", { name: "Waiting: checkout [button]" })).toContainText("approved by Tess Tester on");
});

test("R5: an Approve after the name is changed approves as the new name, and the line shows it", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByLabel("Your name, for an approval").fill("Tess Tester");
    await page.getByRole("button", { name: "Use this name" }).click();
    await page.getByTestId("approving-as").getByRole("button", { name: /^change/ }).click();
    await page.getByLabel("Your name, for an approval").fill("Sam Second");
    // Approved without pressing "Use this name": the name in the field is the one used (the fresh-context review).
    await page.getByRole("listitem", { name: "Candidate checkout [button]" }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("listitem", { name: "Waiting: checkout [button]" })).toContainText("approved by Sam Second on");
    await expect(page.getByTestId("approving-as")).toHaveText("Approving as Sam Second (change)");
});

for (const width of [1280, 390]) test(`R5: "Reason to reject" is beside Reject only, apart from Approve, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/candidates");
    for (const name of ["Candidate add to cart [button]", "Candidate checkout [button]"]) {
        const candidate = page.getByRole("listitem", { name });
        const rejecting = candidate.getByRole("group", { name: "Reject this candidate" });
        await expect(rejecting.getByLabel("Reason to reject")).toHaveCount(1);
        await expect(rejecting.getByRole("button", { name: "Reject" })).toHaveCount(1);
        await expect(rejecting.getByRole("button", { name: "Approve" })).toHaveCount(0);
        // Beside: the reason's field and Reject on one line, the reason first, Approve not between them.
        const [reason, reject, approve] = await Promise.all([rejecting.getByLabel("Reason to reject").boundingBox(), rejecting.getByRole("button", { name: "Reject" }).boundingBox(), candidate.getByRole("button", { name: "Approve" }).boundingBox()]);
        expect(Math.abs((reason!.y + reason!.height / 2) - (reject!.y + reject!.height / 2)), "the reason and Reject on one line").toBeLessThan(reject!.height);
        expect(reason!.x + reason!.width, "the reason just before Reject").toBeLessThanOrEqual(reject!.x);
        const between = approve!.x > reason!.x && approve!.x < reject!.x && Math.abs(approve!.y - reject!.y) < reject!.height;
        expect(between, "Approve isn't between the reason and Reject").toBe(false);
    }
});

// The fresh-context review's three failure paths, each with the API's answer arranged by the test.
test("TFP-234: a decision the server can't answer in JSON, or that never reaches it, is said so, and nothing is decided", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByLabel("Your name, for an approval").fill("Emil");
    const offered = page.getByRole("listitem", { name: "Candidate add to cart [button]" });
    await page.route("**/api/candidates", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "text/html", body: "<h1>Internal Server Error</h1>" }) : route.fallback()));
    await offered.getByRole("button", { name: "Approve" }).click();
    await expect(offered.getByRole("alert")).toHaveText("Mr Onion couldn't answer (the server said 500, with no reason). Nothing was decided.");
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
    await expect(offered.getByRole("alert")).toHaveText("Type your name to approve: the approval records who made it.");
    expect(JSON.parse(await readFile(join(pool(), `${OFFERED.id}.json`), "utf8")).status).toBe("candidate");
});

// Phase 46 (TFP-298, from Gate B's walkthrough): a candidate whose id isn't candidateId(pattern) isn't offered, and is
// reported, as the walkthrough's stand-in "walkthrough01" was offered and then refused at every decision.
test("TFP-298: a candidate whose id isn't the one its pattern gives isn't offered; it's reported, with why", async ({ page }) => {
    const misnamed = { ...candidate("x", "misnamed stand-in", "candidate", ["http://localhost:4200", "https://shop.example.com", "https://a.example.org"]), id: "walkthrough01" };
    await writeFile(join(pool(), "walkthrough01.json"), JSON.stringify(misnamed, null, 2));
    await page.goto("/candidates");
    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Candidate misnamed stand-in [button]" })).toHaveCount(0);
    const notOffered = page.getByRole("region", { name: "Not offered" });
    await expect(notOffered.getByRole("listitem")).toHaveText([
        `walkthrough01.json: its id, walkthrough01, isn't the one its pattern gives (${candidateId(misnamed.pattern)}), so it can't be approved or rejected; save it again under that id`,
    ]);
});

// Phase 46 Gate B, R6 (the owner's re-walk, 2026-11-18): autofill off on both reason fields.
// R9 (the fresh-context review): approved, then a failure on a fourth site with no label, so below the rule; withdrawn
// for it, it stays on the screen with the withdrawal, can be rejected, and isn't offered for approval.
test("R9: a withdrawn candidate below the rule now is still shown, with its withdrawal, under Offered", async ({ page }) => {
    const failedSince = candidate("aaaaaaaaaaa8", "filter", "approved", ["http://localhost:4200", "https://shop.example.com", "https://a.example.org"], {
        approved: { by: "Tess Tester", at: "2026-11-10T09:00:00.000Z" },
    });
    failedSince.evidence.push({ ...run("https://b.example.net", "2026-11-11T00:00:00.000Z"), status: "Failed" });
    await writeFile(join(pool(), `${failedSince.id}.json`), JSON.stringify(failedSince, null, 2));
    await page.goto("/candidates");
    const waiting = page.getByRole("listitem", { name: "Waiting: filter [button]" });
    await waiting.getByLabel("Reason to withdraw").fill("failed on a fourth site");
    await waiting.getByRole("button", { name: "Withdraw approval" }).click();
    await expect(waiting).toHaveCount(0);
    const shown = page.getByRole("region", { name: "Offered for promotion" }).getByRole("listitem", { name: "Withdrawn candidate filter [button]" });
    await expect(shown.getByRole("list", { name: "Approvals withdrawn" }).getByRole("listitem")).toHaveText([/: failed on a fourth site$/]);
    await expect(shown.getByRole("list", { name: "Why it isn't offered for approval" })).not.toBeEmpty();
    await expect(shown.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(shown.getByRole("group", { name: "Reject this candidate" })).toBeVisible();
});

test("R6: both reason fields have autofill off", async ({ page }) => {
    await page.goto("/candidates");
    await expect(page.getByRole("listitem", { name: "Candidate add to cart [button]" }).getByLabel("Reason to reject")).toHaveAttribute("autocomplete", "off");
    await expect(page.getByRole("listitem", { name: "Waiting: search [button]" }).getByLabel("Reason to withdraw")).toHaveAttribute("autocomplete", "off");
});

test("TFP-298: an approval is withdrawn from the waiting list with a reason, through the API's reject", async ({ page }) => {
    await page.goto("/candidates");
    const waiting = page.getByRole("listitem", { name: "Waiting: search [button]" });
    await expect(waiting).toBeVisible();
    await waiting.getByRole("button", { name: "Withdraw approval" }).click();
    await expect(waiting.getByRole("alert")).toHaveText("Type a reason first: it is kept with the candidate.");
    expect(JSON.parse(await readFile(join(pool(), `${APPROVED.id}.json`), "utf8")).status).toBe("approved");
    await waiting.getByLabel("Reason to withdraw").fill("approved by mistake: a stand-in");
    await waiting.getByRole("button", { name: "Withdraw approval" }).click();
    await expect(page.getByRole("listitem", { name: "Waiting: search [button]" })).toHaveCount(0);
    // R9 (the owner's re-walk, 2026-11-18): back in Offered, the withdrawal shown on it, and kept in the pool.
    const offeredAgain = page.getByRole("region", { name: "Offered for promotion" }).getByRole("listitem", { name: "Candidate search [button]" });
    await expect(offeredAgain).toBeVisible();
    await expect(offeredAgain.getByRole("list", { name: "Approvals withdrawn" }).getByRole("listitem")).toHaveText([/^Withdrawn on \d{4}-\d{2}-\d{2}, approved by .+ on \d{4}-\d{2}-\d{2}: approved by mistake: a stand-in$/]);
    const saved = JSON.parse(await readFile(join(pool(), `${APPROVED.id}.json`), "utf8"));
    expect(saved.status).toBe("candidate");
    expect(saved.approved).toBeUndefined();
    expect(saved.withdrawals.map((entry: { reason: string }) => entry.reason)).toEqual(["approved by mistake: a stand-in"]);
    await page.reload();
    await expect(page.getByRole("region", { name: "Offered for promotion" }).getByRole("listitem", { name: "Candidate search [button]" }).getByRole("list", { name: "Approvals withdrawn" })).toBeVisible();
});
