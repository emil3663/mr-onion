import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { setting } from "../../src/lib/settings";
import { CONFIRMATION_WORDING } from "../../src/lib/ownership/confirmation";
import { siteFolderName } from "../../src/lib/site-suites/store";

// Phase 46 (TFP-235, Decision 4, Acceptance Criteria 4, review item 5): the active switch in the run form, in the real
// app. The switch reads the gate from GET /api/site-ownership (Phase 43's decideActiveGate), so each case is set by the
// confirmation file in the server's temporary data folder, never by the screen. Equivalence partitions:
//   a remote host: no confirmation, expired, withdrawn, host not covered, no active tick -> disabled, with the
//                  API's reason for each, and a link to the site's lookup entry
//   a remote host its valid confirmation covers with the active tick                   -> available; the run asks
//   that confirmation withdrawn while the switch is on                                 -> off again; the run doesn't ask
//   a local host, no confirmation at all                                               -> available
//   a suite with no active test                                                        -> no switch
// Only the browser's page inspection is stubbed, so a site that doesn't exist has a form for the real generator to write
// its payload test for. The run's own decision is Phase 43's (src/lib/run/active-gate.run.test.ts, real runs).

const dataDir = setting("DATA_DIR");
const REMOTE = "https://active-switch.example.com";
const HOST = "active-switch.example.com";
const LOCAL = "http://127.0.0.1:3001";

function ownRegressionFolder(dir: string | undefined): boolean {
    if (!dir) return false;
    const full = resolve(dir);
    return full.startsWith(resolve(tmpdir()) + sep) && basename(full).startsWith("mr-onion-regression-data-");
}
const siteFolder = (origin: string) => join(dataDir ?? "", "site-suites", siteFolderName(origin));

test.beforeEach(async () => {
    expect(ownRegressionFolder(dataDir), `the spec only touches the regression config's own temporary data folder, not ${dataDir}`).toBe(true);
    await rm(siteFolder(REMOTE), { recursive: true, force: true });
});

test.afterAll(async () => {
    if (ownRegressionFolder(dataDir)) await rm(siteFolder(REMOTE), { recursive: true, force: true });
});

const VALID = { hosts: [HOST], basis: "owner", wording: CONFIRMATION_WORDING.owner, name: "Tess Tester", contactEmail: "tess@example.com", confirmedAt: "2026-11-15T10:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", scopes: { active: true, load: false } };

async function confirm(current: Record<string, unknown> | null) {
    const file = join(siteFolder(REMOTE), "ownership.json");
    if (current === null) return rm(file, { force: true });
    await mkdir(siteFolder(REMOTE), { recursive: true });
    await writeFile(file, JSON.stringify({ current, history: [] }));
}

/** A page with one form and a text field, as an inspection of the target would record it. */
function profileWithForm(origin: string) {
    const element = (elementType: string, locator: Record<string, string>, text = "") => ({
        text, url: null, category: "form", elementType, containerLabel: "", expectedStatus: null, isVisible: true,
        ariaPressed: null, ariaSelected: null, ariaChecked: null, ariaExpanded: null, groupId: null,
        locator: { role: null, name: "", label: "", placeholder: "", id: "", inputType: "", ...locator },
    });
    return {
        scannedAt: "2026-11-17T00:00:00.000Z",
        baseUrl: origin,
        pages: [{
            path: "/", url: `${origin}/`, title: "Contact", metaDescription: "", headings: ["Contact"], buttons: ["Send"], links: [], visibleTextSnippets: [],
            actionableElements: [element("form", {}), element("input", { label: "Message", name: "Message", id: "message", inputType: "text" }), element("button", {}, "Send")],
        }],
    };
}

async function generate(page: Page, baseUrl: string, description: string, stubbedProfile: boolean) {
    if (stubbedProfile) await page.route("**/api/introspect", (route) => route.fulfill({ json: profileWithForm(new URL(baseUrl).origin) }));
    await page.goto("/");
    await page.getByLabel("Base URL").fill(baseUrl);
    await page.getByLabel("What do you want to test?").fill(description);
    await expect(page.getByText(/\d+ active/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Generate test suite" }).click();
    // The suite is generated when it can be run (the file name is shown before any code is).
    await expect(page.getByRole("button", { name: "Run suite" }).first()).toBeEnabled({ timeout: 60_000 });
}

/** The tab comes back into focus, as when the tester returns from the site lookup's tab: the switch reads again. */
const refocus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("TFP-235: on a remote host the switch is disabled for each of Phase 43's five reasons, available once covered, and the run asks", async ({ page }) => {
    await generate(page, REMOTE, "Check the contact form for security issues.", true);
    const switchControl = page.getByRole("switch", { name: /^Run active tests/ });
    const state = page.getByTestId("active-switch-state");
    await expect(switchControl).toBeVisible();
    await expect(switchControl).toHaveAccessibleDescription(/^(Checking|Not available)/);

    const cases: Array<[string, Record<string, unknown> | null, string]> = [
        ["none", null, `Not available: the site has no ownership confirmation; confirm it in the site lookup to run active tests on ${HOST}.`],
        ["expired", { ...VALID, expiresAt: "2026-11-16T00:00:00.000Z" }, "Not available: the site's ownership confirmation expired on 2026-11-16; renew it in the site lookup to run active tests."],
        ["withdrawn", { ...VALID, withdrawnAt: "2026-11-16T12:00:00.000Z" }, "Not available: the site's ownership confirmation was withdrawn on 2026-11-16; confirm the site again in the site lookup to run active tests."],
        ["host not covered", { ...VALID, hosts: ["other.example.com"] }, `Not available: the site's ownership confirmation doesn't cover ${HOST}; add the host to it in the site lookup to run active tests there.`],
        ["no active tick", { ...VALID, scopes: { active: false, load: false } }, "Not available: the site's ownership confirmation doesn't allow active tests; change it in the site lookup to tick active tests."],
    ];
    for (const [label, current, reason] of cases) {
        await confirm(current);
        await refocus(page);
        await expect(state, label).toHaveText(reason);
        await expect(switchControl, label).toBeDisabled();
        await expect(switchControl, label).not.toBeChecked();
    }
    // TFP-294: it opens the site's entry as a modal, searched for the target.
    await page.getByRole("button", { name: "This site's ownership confirmation", exact: true }).click();
    const lookup = page.getByRole("dialog", { name: "Site lookup" });
    await expect(lookup.getByRole("region", { name: "Results" }).getByRole("heading", { level: 2 })).toHaveText(REMOTE);
    await lookup.getByRole("button", { name: "Close", exact: true }).click();

    // Covered, with the active tick: available, and the run asks for active tests. The run's request is only read here:
    // a real run against a host that doesn't exist is not this test's subject.
    await confirm(VALID);
    await refocus(page);
    await expect(state).toHaveText(`Available: the site's ownership confirmation covers ${HOST} and allows active tests.`);
    await expect(switchControl).toBeEnabled();
    await expect(switchControl).not.toBeChecked();
    const asked: unknown[] = [];
    await page.route("**/api/run", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        asked.push(route.request().postDataJSON().enableActive);
        await route.fulfill({ status: 400, json: { error: "the spec read the run's request and stopped it" } });
    });
    await switchControl.check();
    const runSuite = page.getByRole("button", { name: "Run suite" }).first();
    await runSuite.click();
    await expect.poll(() => asked).toEqual([true]);

    // A run collapses the suite's section, which unmounts the switch; opened again, it keeps the tester's choice while
    // it reads the gate again, and the next run still asks (the fresh-context review).
    await page.getByRole("button", { name: /^Generated Suite/ }).click();
    await expect(state).toHaveText(`Available: the site's ownership confirmation covers ${HOST} and allows active tests.`);
    await expect(switchControl).toBeChecked();
    await runSuite.click();
    await expect.poll(() => asked).toEqual([true, true]);

    // Withdrawn while the switch is on: it can't be on, so it turns off, and the next run doesn't ask.
    await page.getByRole("button", { name: /^Generated Suite/ }).click();
    await expect(switchControl).toBeChecked();
    await confirm({ ...VALID, withdrawnAt: "2026-11-17T06:00:00.000Z" });
    await refocus(page);
    await expect(state).toHaveText(/^Not available: the site's ownership confirmation was withdrawn on 2026-11-17/);
    await expect(switchControl).not.toBeChecked();
    await runSuite.click();
    await expect.poll(() => asked).toEqual([true, true, false]);
});

test("TFP-235: a suite generated again without an active test doesn't ask, though the switch was left on", async ({ page }) => {
    await confirm(VALID);
    await generate(page, REMOTE, "Check the contact form for security issues.", true);
    const switchControl = page.getByRole("switch", { name: /^Run active tests/ });
    await expect(page.getByTestId("active-switch-state")).toHaveText(`Available: the site's ownership confirmation covers ${HOST} and allows active tests.`);
    await switchControl.check();
    const asked: unknown[] = [];
    await page.route("**/api/run", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        asked.push(route.request().postDataJSON().enableActive);
        await route.fulfill({ status: 400, json: { error: "the spec read the run's request and stopped it" } });
    });
    // The same page, a functional suite this time: the description no longer names security, so no security area, and
    // the stubbed inspection's form gets no payload test.
    await page.getByLabel("What do you want to test?").fill("Create a functional smoke test for the contact page.");
    await page.getByRole("button", { name: "Generate test suite" }).click();
    await expect(page.getByRole("button", { name: "Run suite" }).first()).toBeEnabled({ timeout: 60_000 });
    await expect(switchControl).toHaveCount(0);
    await page.getByRole("button", { name: "Run suite" }).first().click();
    await expect.poll(() => asked).toEqual([false]);
});

test("TFP-235: on a local host the switch is available with no confirmation at all", async ({ page }) => {
    await generate(page, LOCAL, "Check the contact form for security issues.", true);
    const switchControl = page.getByRole("switch", { name: /^Run active tests/ });
    await expect(page.getByTestId("active-switch-state")).toHaveText("Available: 127.0.0.1 is a local host, which needs no ownership confirmation.");
    await expect(switchControl).toBeEnabled();
    await expect(page.getByRole("button", { name: "This site's ownership confirmation", exact: true })).toHaveCount(0);
});

test("TFP-235: a suite with no active test has no active switch", async ({ page }) => {
    await generate(page, LOCAL, "Create a functional smoke test for the Mr Onion landing page.", false);
    await expect(page.getByRole("switch", { name: /^Run active tests/ })).toHaveCount(0);
});
