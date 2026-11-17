import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { setting } from "../../src/lib/settings";
import { CONFIRMATION_WORDING } from "../../src/lib/ownership/confirmation";
import { siteFolderName } from "../../src/lib/site-suites/store";

// Phase 46 (TFP-232, Decision 1, Acceptance Criteria 1): the site lookup, in the real app. Its data is in the server's
// temporary data folder (playwright.regression.config.ts). Equivalence partitions:
//   the site's URL in any form (path, query, trailing slash)     -> its entry
//   a partial host, another port, another site's path            -> that exact address: nothing saved
//   a confirmation created through the API with a full email     -> shown masked; the page holds no full address
//   withdraw                                                     -> needs a second click; written in place, kept on reload
//   the gap writer changed                                       -> through the API; written in place, kept on reload
//   a real run on the local app                                  -> its saved suite, with that run as its last run
//   the run form's link                                          -> the lookup, the target already searched

const dataDir = setting("DATA_DIR");
const SHOP = "https://lookup-shop.example.com";
const LOCAL_APP = "http://127.0.0.1:3001";
const EMAIL = "tess.tester@example.com";

// As the promotion spec does: this spec deletes its sites' folders, so it runs only in the regression config's own
// temporary data folder, never a real one.
function ownRegressionFolder(dir: string | undefined): boolean {
    if (!dir) return false;
    const full = resolve(dir);
    return full.startsWith(resolve(tmpdir()) + sep) && basename(full).startsWith("mr-onion-regression-data-");
}

const siteFolder = (origin: string) => join(dataDir!, "site-suites", siteFolderName(origin));

test.beforeEach(async () => {
    expect(ownRegressionFolder(dataDir), `the spec only touches the regression config's own temporary data folder, not ${dataDir}`).toBe(true);
    await rm(siteFolder(SHOP), { recursive: true, force: true });
});

test.afterAll(async () => {
    if (ownRegressionFolder(dataDir)) await rm(siteFolder(SHOP), { recursive: true, force: true });
});

async function lookUp(page: Page, url: string): Promise<Locator> {
    await page.getByLabel("Site URL").fill(url);
    await page.getByRole("button", { name: "Look up" }).click();
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByRole("heading", { level: 2 })).toBeVisible();
    return results;
}

async function confirmThroughApi(page: Page) {
    const response = await page.request.post("/api/site-ownership", {
        data: { baseUrl: `${SHOP}/shop`, hosts: ["lookup-shop.example.com"], basis: "owner", wording: CONFIRMATION_WORDING.owner, name: "Tess Tester", contactEmail: EMAIL, scopes: { active: true, load: false } },
    });
    expect(response.status(), await response.text()).toBe(200);
}

test("TFP-232: the site's URL in any form finds its entry, with the contact email masked and never in the page", async ({ page }) => {
    await confirmThroughApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Site lookup" }).click();
    await expect(page.getByRole("heading", { name: "Site lookup", level: 1 })).toBeVisible();

    for (const form of [`${SHOP}/cart?item=3`, `${SHOP}/`, "HTTPS://Lookup-Shop.Example.com/a/b/"]) {
        const results = await lookUp(page, form);
        await expect(results.getByRole("heading", { level: 2 })).toHaveText(SHOP);
        await expect(results.getByTestId("confirmation-status")).toHaveText(/^Valid until \d{4}-\d{2}-\d{2}$/);
        await expect(results.getByText("lookup-shop.example.com", { exact: true })).toBeVisible();
        await expect(results.getByText("I own this site")).toBeVisible();
        await expect(results.getByText(/^Tess Tester, on \d{4}-\d{2}-\d{2}$/)).toBeVisible();
        await expect(results.getByText("t***@example.com")).toBeVisible();
        await expect(results.getByText("Runs without the request limits; active tests (attack-shaped input)")).toBeVisible();
    }
    // A typed search names its site in the address, so a reload shows the same entry (the fresh-context review).
    await expect(page).toHaveURL(/\/sites\?url=HTTPS%3A%2F%2FLookup-Shop\.Example\.com%2Fa%2Fb%2F$/);
    await page.reload();
    await expect(page.getByRole("region", { name: "Results" }).getByRole("heading", { level: 2 })).toHaveText(SHOP);
    await expect(page.getByText("t***@example.com")).toBeVisible();
    // Review item 2: nothing the app receives holds the full address.
    expect(await page.content()).not.toContain(EMAIL);
    const api = await (await page.request.get(`/api/site-ownership?baseUrl=${encodeURIComponent(SHOP)}`)).text();
    expect(api).not.toContain(EMAIL);
});

test("TFP-232: exact match only: a partial host, another port or another site's path finds nothing of this site's", async ({ page }) => {
    await confirmThroughApi(page);
    await page.goto("/sites");
    for (const [form, origin] of [
        ["lookup-shop", "http://lookup-shop"],
        ["https://lookup-shop.example", "https://lookup-shop.example"],
        ["https://lookup-shop.example.com:8443/", "https://lookup-shop.example.com:8443"],
        ["http://lookup-shop.example.com", "http://lookup-shop.example.com"],
        ["https://elsewhere.example.org/lookup-shop.example.com", "https://elsewhere.example.org"],
    ]) {
        const results = await lookUp(page, form);
        await expect(results.getByRole("heading", { level: 2 })).toHaveText(origin);
        await expect(results.getByText("Nothing saved for this site.")).toBeVisible();
        await expect(results.getByTestId("confirmation-status")).toHaveText("None");
    }
    // There is nothing on the page to choose a site from: the search field suggests nothing (no datalist, autocomplete
    // off), the only drop-down is the gap writer's, and no list names sites.
    const field = page.getByLabel("Site URL");
    expect(await field.getAttribute("list")).toBeNull();
    expect(await field.getAttribute("autocomplete")).toBe("off");
    await expect(page.locator("datalist")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(1);
    await expect(page.getByRole("combobox")).toHaveAccessibleName("Who writes gap tests");
    await expect(page.getByRole("list", { name: /sites/i })).toHaveCount(0);
});

test("TFP-232: withdrawing needs a second click, and the withdrawal is written in place and kept after a reload", async ({ page }) => {
    await confirmThroughApi(page);
    await page.goto(`/sites?url=${encodeURIComponent(SHOP)}`);
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Valid until/);

    await results.getByRole("button", { name: "Withdraw", exact: true }).click();
    // The first click withdraws nothing: the API still has it valid.
    expect((await (await page.request.get(`/api/site-ownership?baseUrl=${encodeURIComponent(SHOP)}`)).json()).status).toBe("valid");
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Valid until/);
    await results.getByRole("button", { name: "Keep it" }).click();
    expect((await (await page.request.get(`/api/site-ownership?baseUrl=${encodeURIComponent(SHOP)}`)).json()).status).toBe("valid");

    await results.getByRole("button", { name: "Withdraw", exact: true }).click();
    // Focus follows: to the confirming button, which says what withdrawing does, then to the status once it's done.
    const confirm = results.getByRole("button", { name: "Withdraw: yes, withdraw it" });
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAccessibleDescription("From the next run on, this site counts as unconfirmed.");
    await confirm.click();
    const status = page.getByRole("status");
    await expect(status).toHaveText("The confirmation was withdrawn.");
    await expect(status).toBeFocused();
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Withdrawn on \d{4}-\d{2}-\d{2}$/);
    await expect(results.getByRole("button", { name: "Withdraw", exact: true })).toHaveCount(0);
    expect((await (await page.request.get(`/api/site-ownership?baseUrl=${encodeURIComponent(SHOP)}`)).json()).status).toBe("withdrawn");

    await page.reload();
    await expect(page.getByRole("region", { name: "Results" }).getByTestId("confirmation-status")).toHaveText(/^Withdrawn on/);
});

test("TFP-232: the gap writer is set through the API, written in place and kept after a reload", async ({ page }) => {
    await page.goto(`/sites?url=${encodeURIComponent(`${SHOP}/any/page`)}`);
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByTestId("gap-writer-now")).toHaveText("Off");
    await expect(results.getByText("Nothing saved for this site.")).toBeVisible();

    await results.getByLabel("Who writes gap tests").selectOption("claude-code");
    await results.getByRole("button", { name: "Save gap writer" }).click();
    await expect(page.getByRole("status")).toHaveText("The gap writer was saved.");
    await expect(results.getByTestId("gap-writer-now")).toHaveText("Claude Code");
    await expect(results.getByText("Nothing saved for this site.")).toHaveCount(0);
    expect((await (await page.request.get(`/api/site-settings?baseUrl=${encodeURIComponent(SHOP)}`)).json()).gapWriter).toBe("claude-code");

    await page.reload();
    await expect(page.getByRole("region", { name: "Results" }).getByTestId("gap-writer-now")).toHaveText("Claude Code");
});

test("TFP-232: after a real run, the run form's link opens the lookup on its site, with the saved suite and that run as its last", async ({ page, context }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    await page.getByLabel("Base URL").fill(`${LOCAL_APP}/`);
    await page.getByLabel("What do you want to test?").fill("Create SEO and usability coverage for the Mr Onion landing page including metadata, heading structure, canonical signals, and crawler files.");
    const generate = page.getByRole("button", { name: "Generate test suite" });
    await expect(page.getByText(/\d+ active/)).toBeVisible({ timeout: 15_000 });
    await generate.click();
    const suitePanel = page.locator("section").filter({ has: page.getByRole("button", { name: /Generated Suite Review the generated Playwright code/i }) }).first();
    await expect(suitePanel.getByText("generated_test.spec.ts")).toBeVisible({ timeout: 60_000 });
    const started = Date.now();
    await suitePanel.getByRole("button", { name: "Run suite" }).first().click();
    await expect(page.getByText("Release readiness at a glance")).toBeVisible({ timeout: 180_000 });

    // The run form's link: a new tab, the target already searched. The form keeps its target. A run collapses the
    // creation section (useRun), so it is opened again, as a tester would.
    const creationToggle = page.getByRole("button", { name: /^Test Suite Creation/ });
    if ((await creationToggle.getAttribute("aria-expanded")) === "false") await creationToggle.click();
    // The app keeps the target as it normalised it for the run (no trailing slash): the link carries what the form holds.
    const target = await page.getByLabel("Base URL").inputValue();
    expect(target.replace(/\/$/, "")).toBe(LOCAL_APP);
    const [lookup] = await Promise.all([
        context.waitForEvent("page"),
        page.getByRole("link", { name: "This site's confirmation and settings (opens in a new tab)" }).click(),
    ]);
    await expect(page.getByLabel("Base URL")).toHaveValue(target);
    const results = lookup.getByRole("region", { name: "Results" });
    await expect(results.getByRole("heading", { level: 2 })).toHaveText(LOCAL_APP);
    await expect(lookup.getByLabel("Site URL")).toHaveValue(target);
    const suites = results.getByRole("list", { name: "Saved suites" }).getByRole("listitem");
    const standard = suites.filter({ hasText: /^Standard, / });
    await expect(standard.first()).toContainText("last run");

    // That run, by its time: the API's last run for the suite finished after this test started it.
    const body = (await (await lookup.request.get(`/api/site-suites?baseUrl=${encodeURIComponent(LOCAL_APP)}`)).json()) as { suites: Array<{ runType: string; lastRun: { finishedAt: string } | null }> };
    const latest = Math.max(...body.suites.filter((suite) => suite.lastRun).map((suite) => Date.parse(suite.lastRun!.finishedAt)));
    expect(latest).toBeGreaterThanOrEqual(started - 1000);
});
