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

// Phase 46 Gate B, R10 (C's investigation, 2026-11-18): the overlay of the owner's second run, from its own shape. The
// page follows a run kept for the session (TFP-294), and the run's polls are answered with snapshots this test sets, on
// a clock it moves (page.clock), so the moments the recording showed can be staged exactly. The clock still runs
// between moves (page.clock.install doesn't stop it), so a time is read as at least what it was set to.
const RUN_ID = "0b0e6c1e-2f4a-4c35-9d55-7a3a2f9e1b10";
const title = (n: number) => `TFFU-${String(n).padStart(3, "0")}: test ${n}`;
type Planned = { id: string; title: string; linkLabel: null; status: string; duration: number | null; startedAt?: number };
function snapshot(planned: Planned[], completed: number, durationMs: number, lastCompletedTitle: string | null) {
    const passed = planned.filter((entry) => entry.status === "passed").length;
    return {
        runId: RUN_ID, runStatus: "running", duration: durationMs, cancellationRequested: false, result: null,
        progress: {
            totalTests: planned.length, startedTests: completed + planned.filter((entry) => entry.status === "running").length, completedTests: completed,
            passedTests: passed, failedTests: completed - passed, flakyTests: 0, blockedTests: 0,
            currentTestTitle: null, currentLinkLabel: null, lastCompletedTitle, activeExecutions: [], plannedExecutions: planned,
        },
    };
}
async function followScriptedRun(page: import("@playwright/test").Page, current: () => unknown) {
    await page.route("**/api/run?runId=*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current()) }));
    await page.addInitScript((id) => sessionStorage.setItem("mronion.run.activeRunId", JSON.stringify(id)), RUN_ID);
}

test("R10 (a): every test running is shown, and the last finished, not only the first running one", async ({ page }) => {
    const start = new Date("2026-11-18T19:37:00Z").getTime();
    await page.clock.install({ time: start + 150_000 });
    // The recording at 2.5 min: test 1 (one worker's unit) still running, tests 7 to 36 finished, 37 and 38 running.
    const planned: Planned[] = Array.from({ length: 56 }, (_, index) => {
        const n = index + 1;
        const status = n === 1 || n === 37 || n === 38 ? "running" : n >= 7 && n <= 36 ? "passed" : "not-run";
        return { id: `t${n}`, title: title(n), linkLabel: null, status, duration: status === "passed" ? 900 : null, ...(status === "running" ? { startedAt: n === 1 ? start + 5_000 : start + 140_000 } : {}) };
    });
    await followScriptedRun(page, () => snapshot(planned, 30, 150_000, title(36)));
    await page.goto("/");
    const now = page.getByRole("region", { name: "Running now" });
    await expect(now.getByRole("list", { name: "Tests running now" }).getByRole("listitem")).toHaveText([
        new RegExp(String.raw`^Test 1: TFFU-001: test 1 · running for 2m [2-5]\ds$`),
        new RegExp(String.raw`^Test 37: TFFU-037: test 37 · running for [1-4]\ds$`),
        new RegExp(String.raw`^Test 38: TFFU-038: test 38 · running for [1-4]\ds$`),
    ]);
    await expect(now).toContainText("Running now (3)");
    await expect(page.getByTestId("last-finished")).toHaveText(`Last finished: ${title(36)} (Passed, 900ms)`);
});

// R10 (the fresh-context review): one title, a test in two browsers; the last finished is the one the server names.
test("R10 (a): the last finished is the test the server names, when two share a title", async ({ page }) => {
    const planned: Planned[] = [
        { id: "chromium-1", title: title(1), linkLabel: null, status: "failed", duration: 2000 },
        { id: "chromium-2", title: title(2), linkLabel: null, status: "running", duration: null, startedAt: Date.now() - 3000 },
        { id: "firefox-1", title: title(1), linkLabel: null, status: "passed", duration: 1000 },
        { id: "firefox-2", title: title(2), linkLabel: null, status: "not-run", duration: null },
    ];
    await followScriptedRun(page, () => ({ ...snapshot(planned, 2, 10_000, title(1)), progress: { ...snapshot(planned, 2, 10_000, title(1)).progress, lastCompletedId: "chromium-1" } }));
    await page.goto("/");
    await expect(page.getByTestId("last-finished")).toHaveText(`Last finished: ${title(1)} (Failed, 2.0s)`);
    // Every running row is marked as running, in the list itself.
    await expect(page.getByText("Test 2", { exact: true })).toHaveClass(/text-indigo-600/);
    await expect(page.getByText("Test 1", { exact: true })).not.toHaveClass(/text-indigo-600/);
});

test("R10 (b): once the projection reaches zero it stays Finishing, naming what's still running, through later finishes", async ({ page }) => {
    const start = new Date("2026-11-18T19:37:00Z").getTime();
    await page.clock.install({ time: start + 252_000 });
    // Paused: only runFor moves the clock, so a countdown can't run on between readings.
    await page.clock.pauseAt(start + 252_000);
    const planned = (done: number): Planned[] => Array.from({ length: 56 }, (_, index) => {
        const n = index + 1;
        const status = n <= done ? "passed" : n <= done + 3 ? "running" : "not-run";
        return { id: `t${n}`, title: title(n), linkLabel: null, status, duration: status === "passed" ? 1000 : null, ...(status === "running" ? { startedAt: start + 200_000 } : {}) };
    });
    // Run 2's tail: 52 of 56 at 4.2 min (an estimate of about 19 s), 53 at 5.0 min.
    let current = snapshot(planned(52), 52, 252_000, title(52));
    await followScriptedRun(page, () => current);
    await page.goto("/");
    const remaining = page.getByTestId("projected-remaining");
    // The first poll's answer on screen, then the ticks, on the paused clock (the answer comes over the network, so
    // moving the clock first would tick before there is anything to estimate from).
    await expect(page.getByText("52 of 56 tests finished")).toBeVisible();
    await page.clock.runFor(2_000);
    await expect(remaining).toHaveText(/^\d+s$/);
    await page.clock.runFor(30_000);
    await expect(remaining).toHaveText("Finishing...");
    const ran = String.raw`\(\d+m \d{2}s\)`;
    await expect(page.getByTestId("finishing-running")).toHaveText(new RegExp(`^Still running: TFFU-053: test 53 ${ran}; TFFU-054: test 54 ${ran}; TFFU-055: test 55 ${ran}$`));
    // A late finish: before R10 a new estimate counted down again ("17s"); now it stays Finishing. Read once a second
    // without retrying (an assertion that waits would see a countdown reach zero again, and pass).
    current = snapshot(planned(53), 53, 300_000, title(53));
    await page.clock.runFor(18_000);
    await expect(page.getByText("53 of 56 tests finished")).toBeVisible();
    const readings: string[] = [];
    for (let second = 0; second < 5; second++) {
        await page.clock.runFor(1_000);
        readings.push((await remaining.textContent()) ?? "");
    }
    expect(readings, "each second after the late finish").toEqual(Array(5).fill("Finishing..."));
    await expect(page.getByTestId("finishing-running")).toContainText("Still running: TFFU-054: test 54 (");
});
