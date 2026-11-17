import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, type Response, test } from "@playwright/test";

// Phase 46 (TFP-289, Decision 6, Acceptance Criteria 6, review item 8): a test's notes in the app's report tabs, with
// their test, apart from findings. Built from real runs:
//   a Standard run whose payload test the covered-host guard notes -> the note in full on that test's row in the
//     Execution tab, under "Notes"; a test with no notes shows no notes box
//   a Comprehensive run's view                                    -> "Notes from the run", each note with its test,
//     before the fixed statement of what the run did not test, which stays last; none when no test noted anything
// The fixture site: a form on 127.0.0.1 whose result page loads a script from localhost, a host the run's gate doesn't
// cover (a local target covers only itself), so the guard stops it and says the result may not reflect the page, as
// Phase 43's RPT-23 is built (src/lib/generate/active-guard.test.ts).
// A Comprehensive run has no active test, so it can't make that note: as Gate B's fix's own Comprehensive test does,
// its view is shown a real Comprehensive run's result with a note on one test's record (the reply is read, one note
// added, and passed on).

let site: Server;
let origin = "";
let scriptHost = "";

test.beforeAll(async () => {
    site = createServer((req, res) => {
        if (req.url === "/widget.js") return res.writeHead(200, { "content-type": "text/javascript" }).end("window.widget = true;");
        const page = (body: string) => `<!doctype html><html lang="en"><head><title>Contact</title></head><body><main><h1>Contact</h1>${body}</main></body></html>`;
        if (req.method === "POST") {
            req.resume();
            return req.on("end", () => res.writeHead(200, { "content-type": "text/html" }).end(page(`<p>Thanks.</p><script src="${scriptHost}/widget.js"></script>`)));
        }
        res.writeHead(200, { "content-type": "text/html" }).end(page(`<form method="post" action="/"><label for="message">Message</label><input id="message" name="message" type="text"><button type="submit">Send</button></form>`));
    });
    await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
    const { port } = site.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
    scriptHost = `http://localhost:${port}`;
});

test.afterAll(async () => {
    await new Promise((resolve) => site.close(resolve));
});

// The app's run reply: the report is under result.report (RunStatusSnapshot, src/app/_lib/types.ts).
type Snapshot = { result?: { report?: { execution?: Array<{ title: string; notes?: string[] }> } } };

/** The run's last snapshot the app was given, read from its own polling (not changed). */
// The run's status poll, not an artifact download (`&artifactId=`).
const RUN_POLL = /\/api\/run\?runId=[^&]+$/;

function watchRun(page: Page) {
    // Each reply keeps the place it arrived in, though their bodies are read in whatever order they finish.
    const seen: Array<Snapshot | undefined> = [];
    page.on("response", async (response: Response) => {
        if (response.request().method() !== "GET" || !RUN_POLL.test(response.url()) || !response.ok()) return;
        const index = seen.push(undefined) - 1;
        seen[index] = (await response.json().catch(() => ({}))) as Snapshot;
    });
    return () => seen.filter((snapshot) => snapshot?.result?.report?.execution).at(-1);
}

async function generateAndRun(page: Page, description: string, active: boolean) {
    await page.getByLabel("Base URL").fill(`${origin}/`);
    await page.getByLabel("What do you want to test?").fill(description);
    await expect(page.getByText(/\d+ active/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Generate test suite" }).click();
    const run = page.getByRole("button", { name: "Run suite" }).first();
    await expect(run).toBeEnabled({ timeout: 90_000 });
    if (active) {
        const switchControl = page.getByRole("switch", { name: /^Run active tests/ });
        await expect(switchControl).toBeEnabled();
        await switchControl.check();
    }
    await run.click();
    await expect(page.getByText("Test Reports")).toBeVisible({ timeout: 180_000 });
}

test("TFP-289: a Standard run's payload test shows the guard's note in full on its row in the Execution tab; a test with none shows nothing extra", async ({ page }) => {
    test.setTimeout(300_000);
    const lastRun = watchRun(page);
    await page.goto("/");
    await generateAndRun(page, "Check the contact form for security issues.", true);
    await expect(page.getByText("Release readiness at a glance")).toBeVisible({ timeout: 180_000 });

    // The notes the run's record carries, as the API gave them to the app: the screen must show each one, whole.
    await expect.poll(() => lastRun()?.result?.report?.execution?.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    const records = lastRun()!.result!.report!.execution!;
    const payload = records.find((record) => record.title.includes("script-shaped input is not executed"));
    expect(payload, JSON.stringify(records.map((record) => record.title))).toBeTruthy();
    const notes = payload!.notes ?? [];
    expect(notes.some((note) => note.includes(`a script from an uncovered host was stopped (GET ${scriptHost}/widget.js), so the result may not reflect the page as visitors see it`)), JSON.stringify(notes)).toBe(true);
    const quiet = records.find((record) => (record.notes ?? []).length === 0);
    expect(quiet, "a test with no notes, to show nothing extra").toBeTruthy();

    await page.getByRole("button", { name: "Execution", exact: true }).click();
    // As a tester would: open the set the payload test is in by its summary.
    const group = page.locator("details").filter({ has: page.getByText(payload!.title, { exact: true }) });
    await group.locator("summary").click();
    const row = group.getByRole("article").filter({ has: page.getByText(payload!.title, { exact: true }) });
    await expect(row).toHaveCount(1);
    const box = row.getByRole("region", { name: `Notes on ${payload!.title}`, exact: true });
    await expect(box).toBeVisible();
    await expect(box.getByRole("listitem")).toHaveText(notes);
    // Apart from findings: no part of the note is in the test's observed outcome, which its result is read from
    // (the fresh-context review: an exact match missed a note appended to the remark).
    const outcome = row.locator("div").filter({ has: page.getByText("Observed Outcome", { exact: true }) }).locator("p");
    await expect(outcome).not.toContainText("may not reflect the page as visitors see it");
    const quietGroup = page.locator("details").filter({ has: page.getByText(quiet!.title, { exact: true }) });
    if (!(await quietGroup.evaluate((element) => (element as HTMLDetailsElement).open))) await quietGroup.locator("summary").click();
    const quietRow = quietGroup.getByRole("article").filter({ has: page.getByText(quiet!.title, { exact: true }) }).first();
    await expect(quietRow).toBeVisible();
    await expect(quietRow.getByRole("region", { name: /^Notes on / })).toHaveCount(0);
});

test("TFP-289: a Comprehensive run's view shows a test's notes with their test, only the noted one, before what it didn't test", async ({ page }) => {
    test.setTimeout(300_000);
    // The guard's own stopped-script wording (src/lib/generate/active-guard.ts), so the view is shown that sentence.
    const NOTE = "covered-host guard: a script from an uncovered host was stopped (GET https://cdn.example.net/app.js), so the result may not reflect the page as visitors see it";
    let noteOn = "";
    await page.route(RUN_POLL, async (route) => {
        const response = await route.fetch();
        const body = (await response.json().catch(() => null)) as Snapshot | null;
        const first = body?.result?.report?.execution?.[0];
        if (first) {
            noteOn = first.title;
            first.notes = [NOTE];
        }
        await route.fulfill({ response, json: body ?? {} });
    });
    await page.goto("/");
    // The Run Type section starts collapsed (page.tsx).
    await page.getByRole("button", { name: /^Run Type/ }).click();
    await page.getByRole("radio", { name: /^Comprehensive/ }).check();
    await page.getByRole("radio", { name: /^Security \(passive\)/ }).check();
    await generateAndRun(page, "Check the site's security in depth.", false);
    const view = page.getByTestId("comprehensive-report");
    await expect(view).toBeVisible({ timeout: 180_000 });
    const section = view.getByRole("region", { name: "Notes from the run" });
    await expect(section).toBeVisible();
    // Only the test that noted something, with its note in full: the others show nothing extra.
    await expect(section.getByRole("list", { name: "Tests with notes" }).getByRole("listitem").filter({ hasText: noteOn })).toHaveCount(1);
    await expect(section.getByRole("list", { name: "Tests with notes" }).locator(":scope > li")).toHaveCount(1);
    await expect(section.getByText(NOTE, { exact: true })).toBeVisible();
    // Before the fixed statement of what the run did not test, which stays last (Phase 35 Decision 6).
    const order = await view.evaluate((root) => {
        const text = root.textContent ?? "";
        return { notes: text.indexOf("Notes from the run"), notTested: text.indexOf("What this run did not test") };
    });
    expect(order.notes).toBeGreaterThan(-1);
    expect(order.notes).toBeLessThan(order.notTested);
});
