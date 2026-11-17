import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

// Phase 46 (TFP-296, from Gate B's walkthrough, 2026-11-17): the run overlay during a real run in two Playwright passes
// (the read-only tests, then the serial group: the payload test runs there with active tests on). On the walkthrough
// the progress said "55 of 56" while the planned list said "55 total". Here, read once a second through the run:
//   whenever both are shown, the planned list's total is the progress's total;
//   the projected remaining time counts down by the second between estimates.

let site: Server;
let origin = "";

test.beforeAll(async () => {
    site = createServer((req, res) => {
        const page = (body: string) => `<!doctype html><html lang="en"><head><title>Contact</title></head><body><main><h1>Contact</h1>${body}</main></body></html>`;
        if (req.method === "POST") {
            req.resume();
            return req.on("end", () => res.writeHead(200, { "content-type": "text/html" }).end(page("<p>Thanks.</p>")));
        }
        res.writeHead(200, { "content-type": "text/html" }).end(page(`<form method="post" action="/"><label for="message">Message</label><input id="message" name="message" type="text"><button type="submit">Send</button></form>`));
    });
    await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
    await new Promise((resolve) => site.close(resolve));
});

const seconds = (label: string) => {
    const match = /^(?:(\d+)m )?(\d+)s$/.exec(label.trim());
    return match ? Number(match[1] ?? 0) * 60 + Number(match[2]) : null;
};

test("TFP-296: through a two-pass run the planned list's total is the progress's at every reading", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    await page.getByLabel("Base URL").fill(`${origin}/`);
    await page.getByLabel("What do you want to test?").fill("Check the contact form for security issues.");
    await expect(page.getByText(/\d+ active/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Generate test suite" }).click();
    const runSuite = page.getByRole("button", { name: "Run suite" }).first();
    await expect(runSuite).toBeEnabled({ timeout: 90_000 });
    const switchControl = page.getByRole("switch", { name: /^Run active tests/ });
    await expect(switchControl).toBeEnabled();
    await switchControl.check();
    await runSuite.click();

    const samples: Array<{ at: number; finished: number | null; of: number | null; listed: number | null; remaining: string | null }> = [];
    const started = Date.now();
    while (Date.now() - started < 240_000) {
        if (await page.getByText("Release readiness at a glance").isVisible()) break;
        // One moment of the page: the three texts read together, so a snapshot landing between two reads can't pair
        // an old total with a new list.
        const read = await page.evaluate(() => {
            const texts = [...document.querySelectorAll("div, span")].map((element) => (element.childElementCount === 0 ? element.textContent?.trim() ?? "" : ""));
            const overall = texts.find((text) => /^\d+ of \d+ tests finished/.test(text)) ?? "";
            const listed = texts.find((text) => /^\d+ total$/.test(text)) ?? "";
            const label = [...document.querySelectorAll("div")].find((element) => element.textContent?.trim() === "Projected remaining");
            return { overall, listed, remaining: label?.nextElementSibling?.textContent?.trim() ?? null };
        });
        const counted = /^(\d+) of (\d+) tests finished/.exec(read.overall);
        const list = /^(\d+) total$/.exec(read.listed);
        samples.push({ at: Date.now() - started, finished: counted ? Number(counted[1]) : null, of: counted ? Number(counted[2]) : null, listed: list ? Number(list[1]) : null, remaining: read.remaining });
        await page.waitForTimeout(1000);
    }
    await expect(page.getByText("Release readiness at a glance")).toBeVisible({ timeout: 60_000 });

    const both = samples.filter((sample) => sample.of !== null && sample.listed !== null);
    expect(both.length, JSON.stringify(samples)).toBeGreaterThan(3);
    for (const sample of both) expect(sample.listed, `at ${sample.at} ms: "${sample.finished} of ${sample.of}" with "${sample.listed} total"; all: ${JSON.stringify(samples)}`).toBe(sample.of);

    // The run ends with every test listed and counted: the last reading has the list's total as the run's, and the run's
    // own record lists exactly what ran, none left as a seeded place (the fresh-context review).
    const last = both.at(-1)!;
    expect(last.listed).toBe(last.of);
    const runId = await page.evaluate(() => window.sessionStorage.getItem("mronion.run.activeRunId"));
    expect(runId).toBe("null");
    const saved = (await (await page.request.get(`/api/runs?baseUrl=${encodeURIComponent(origin)}`)).json()) as { runs: Array<{ finishedAt: string; result: { progress: { totalTests: number; completedTests: number; plannedExecutions: Array<{ id: string; status: string }> } } }> };
    const progress = saved.runs.sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))[0].result.progress;
    expect(progress.completedTests).toBe(progress.totalTests);
    expect(progress.plannedExecutions.filter((entry) => entry.id.startsWith("planned:") || entry.status === "not-run")).toEqual([]);
});

// A run long enough to see the countdown between estimates: a functional suite of the app's own page (about a minute).
test("TFP-296: the projected remaining time counts down by the second between estimates", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    await page.getByLabel("Base URL").fill("http://127.0.0.1:3001/");
    await page.getByLabel("What do you want to test?").fill("Create a functional smoke test for the Mr Onion landing page.");
    await expect(page.getByText(/\d+ active/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Generate test suite" }).click();
    const runSuite = page.getByRole("button", { name: "Run suite" }).first();
    await expect(runSuite).toBeEnabled({ timeout: 90_000 });
    await runSuite.click();
    // Read once a second until 3 readings running have gone down a second each, the report appears, or 120 s: a slow
    // machine's start shouldn't eat the window (the fresh-context review).
    const readings: Array<string | null> = [];
    const started = Date.now();
    let longest = 0;
    let current = 0;
    let previous: number | null = null;
    while (Date.now() - started < 120_000 && longest < 3) {
        if (await page.getByText("Release readiness at a glance").isVisible()) break;
        const reading = await page.evaluate(() => [...document.querySelectorAll("div")].find((element) => element.textContent?.trim() === "Projected remaining")?.nextElementSibling?.textContent?.trim() ?? null);
        readings.push(reading);
        const now = reading ? seconds(reading) : null;
        current = previous !== null && now !== null && previous - now >= 1 && previous - now <= 2 ? current + 1 : 0;
        longest = Math.max(longest, current);
        previous = now;
        await page.waitForTimeout(1000);
    }
    expect(longest, `the remaining time, read once a second: ${JSON.stringify(readings)}`).toBeGreaterThanOrEqual(3);
    await expect(page.getByText("Release readiness at a glance")).toBeVisible({ timeout: 240_000 });
});
