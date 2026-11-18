import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { setting } from "../../src/lib/settings";
import { CONFIRMATION_WORDING } from "../../src/lib/ownership/confirmation";
import { siteFolderName } from "../../src/lib/site-suites/store";

// Phase 46 (TFP-294, from Gate B's walkthrough, 2026-11-17): one header on every page; the site lookup as a modal on the
// run page, whose closing makes the active switch read the gate again; the generated suite kept for the session; an
// empty entry naming its port. Equivalence partitions:
//   each of the three pages                        -> one header: "Mr Onion: home", Run, Site lookup, Candidate tests,
//                                                     the current page marked
//   the run form's lookup                          -> a modal searched for the Base URL; the page and its form unchanged
//   a confirmation made while the modal is open    -> the switch reads it when the modal closes
//   away to another page and back, in the session -> the suite, the form and Run as they were
//   an address with its default port left out     -> "Nothing saved for http://192.168.1.17 (port 80)"

const dataDir = setting("DATA_DIR");
const REMOTE = "https://header-switch.example.com";
const HOST = "header-switch.example.com";

function ownRegressionFolder(dir: string | undefined): boolean {
    if (!dir) return false;
    const full = resolve(dir);
    return full.startsWith(resolve(tmpdir()) + sep) && basename(full).startsWith("mr-onion-regression-data-");
}
const siteFolder = join(dataDir ?? "", "site-suites", siteFolderName(REMOTE));

test.beforeEach(async () => {
    expect(ownRegressionFolder(dataDir), `the spec only touches the regression config's own temporary data folder, not ${dataDir}`).toBe(true);
    await rm(siteFolder, { recursive: true, force: true });
});

test.afterAll(async () => {
    if (ownRegressionFolder(dataDir)) await rm(siteFolder, { recursive: true, force: true });
});

for (const [path, current] of [["/", "Run"], ["/sites", "Site lookup"], ["/candidates", "Candidate tests"]] as const) {
    test(`TFP-294: ${path} has the one header, with ${current} marked as the current page`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("banner")).toHaveCount(1);
        const header = page.getByRole("banner");
        await expect(header.getByRole("link", { name: "Mr Onion: home", exact: true })).toHaveAttribute("href", "/");
        const nav = header.getByRole("navigation", { name: "Pages" });
        await expect(nav.getByRole("link")).toHaveText(["Run", "Site lookup", "Candidate tests"]);
        await expect(nav.getByRole("link", { name: current, exact: true })).toHaveAttribute("aria-current", "page");
        await expect(nav.locator("[aria-current]")).toHaveCount(1);
    });
}

test("TFP-294: from the run form, the site lookup opens as a modal searched for the Base URL, and closing it leaves the form as it was", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Base URL").fill(`${REMOTE}/cart?item=3`);
    await page.getByRole("button", { name: "This site's confirmation and settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Site lookup" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Results" }).getByRole("heading", { level: 2 })).toHaveText(REMOTE);
    await expect(dialog.getByLabel("Site URL")).toHaveValue(`${REMOTE}/cart?item=3`);
    expect(new URL(page.url()).pathname, "the run page stays the run page").toBe("/");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("Base URL")).toHaveValue(`${REMOTE}/cart?item=3`);
});

// Phase 46 Gate B, R6 (the owner's re-walk, 2026-11-18): autofill off on the run form's Base URL and the lookup's Site URL.
test("R6: the Base URL and the Site URL have autofill off", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Base URL")).toHaveAttribute("autocomplete", "off");
    await page.goto("/sites");
    await expect(page.getByLabel("Site URL")).toHaveAttribute("autocomplete", "off");
});

// Phase 46 Gate B, R1 (the owner's re-walk, 2026-11-18): the modal is centred in the window, and scrolls inside.
// Partitions: content shorter than the window -> equal gaps either side, above and below; content taller (the
// confirmation form open in it) -> the modal fits the window, still centred, its body scrolls while its title and Close
// stay in view, and the page behind doesn't move.
async function boxGaps(page: Page) {
    return page.getByRole("dialog", { name: "Site lookup" }).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: window.innerWidth - box.right, top: box.top, bottom: window.innerHeight - box.bottom };
    });
}

test("R1: the site lookup modal is centred in the window", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByLabel("Base URL").fill(REMOTE);
    await page.getByRole("button", { name: "This site's confirmation and settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Site lookup" });
    await expect(dialog.getByRole("region", { name: "Results" }).getByRole("heading", { level: 2 })).toHaveText(REMOTE);
    const gaps = await boxGaps(page);
    // This partition is content shorter than the window (the fresh-context review): not the clamped case below.
    expect(gaps.top + gaps.bottom, "the modal is shorter than the window").toBeGreaterThan(32);
    expect(gaps.left, "a gap at the left").toBeGreaterThan(16);
    expect(Math.abs(gaps.left - gaps.right), `left ${gaps.left} against right ${gaps.right}`).toBeLessThanOrEqual(2);
    expect(gaps.top, "a gap above").toBeGreaterThan(8);
    expect(Math.abs(gaps.top - gaps.bottom), `top ${gaps.top} against bottom ${gaps.bottom}`).toBeLessThanOrEqual(2);
});

test("R1: with content taller than the window, the modal fits it and scrolls inside, its title and Close in view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/");
    await page.getByLabel("Base URL").fill(REMOTE);
    await page.getByRole("button", { name: "This site's confirmation and settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Site lookup" });
    await dialog.getByRole("button", { name: "Confirm ownership" }).click();
    await expect(dialog.getByLabel("Hosts, one per line")).toBeVisible();
    // Read once the modal is open: clicking its button scrolled the page to the button.
    const pageScroll = await page.evaluate(() => window.scrollY);

    const gaps = await boxGaps(page);
    expect(gaps.top, "the modal's top is in the window").toBeGreaterThanOrEqual(0);
    expect(gaps.bottom, "the modal's bottom is in the window").toBeGreaterThanOrEqual(0);
    expect(Math.abs(gaps.left - gaps.right), `left ${gaps.left} against right ${gaps.right}`).toBeLessThanOrEqual(2);
    expect(Math.abs(gaps.top - gaps.bottom), `top ${gaps.top} against bottom ${gaps.bottom}`).toBeLessThanOrEqual(2);

    // The form's last control, reached by scrolling inside the modal, with the title and Close still in view.
    const body = dialog.getByTestId("site-lookup-dialog-body");
    const sizes = await body.evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight }));
    expect(sizes.scroll, "the body is taller than its box, so it scrolls").toBeGreaterThan(sizes.client);
    // The wheel over the body's top-left inset, away from the hosts field (a scroller of its own).
    const inset = (await body.boundingBox())!;
    await page.mouse.move(inset.x + 12, inset.y + 12);
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => body.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1), { message: "the body scrolled to its end" }).toBe(true);
    await expect(dialog.getByRole("heading", { name: "Site lookup" })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport({ ratio: 1 });
    // The page behind doesn't move (the fresh-context review): one wheel latches to the body, so a second gesture at its
    // end, and one over the backdrop, are what would reach the page.
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 2000);
    await page.mouse.move(5, 300);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY), "the page behind stays where it was").toBe(pageScroll);
});

/** A page with a form, as an inspection of the target would record it, so the real generator writes an active test. */
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

async function generate(page: Page, baseUrl: string, description: string) {
    await page.getByLabel("Base URL").fill(baseUrl);
    await page.getByLabel("What do you want to test?").fill(description);
    await expect(page.getByText(/\d+ active/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Generate test suite" }).click();
    await expect(page.getByRole("button", { name: "Run suite" }).first()).toBeEnabled({ timeout: 60_000 });
}

test("TFP-294: a confirmation made while the switch's lookup modal is open shows on the switch once it closes", async ({ page }) => {
    await page.route("**/api/introspect", (route) => route.fulfill({ json: profileWithForm(REMOTE) }));
    await page.goto("/");
    await generate(page, REMOTE, "Check the contact form for security issues.");
    const state = page.getByTestId("active-switch-state");
    await expect(state).toHaveText(/^Not available: the site has no ownership confirmation/);
    await page.getByRole("button", { name: "This site's ownership confirmation", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Site lookup" });
    await expect(dialog.getByRole("region", { name: "Results" }).getByRole("heading", { level: 2 })).toHaveText(REMOTE);
    // Confirmed while the modal is open (written as the confirmation form would save it).
    await mkdir(siteFolder, { recursive: true });
    await writeFile(join(siteFolder, "ownership.json"), JSON.stringify({ current: { hosts: [HOST], basis: "owner", wording: CONFIRMATION_WORDING.owner, name: "Tess Tester", contactEmail: "tess@example.com", confirmedAt: "2026-11-15T10:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", scopes: { active: true, load: false } }, history: [] }));
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(state).toHaveText(`Available: the site's ownership confirmation covers ${HOST} and allows active tests.`);
});

test("TFP-294: the generated suite, the form and Run are kept for the session, away to another page and back", async ({ page }) => {
    await page.goto("/");
    await generate(page, "http://127.0.0.1:3001/", "Create a functional smoke test for the Mr Onion landing page.");
    const code = await page.locator("pre").filter({ hasText: "import { test, expect } from '@playwright/test';" }).first().textContent();
    expect(code).toBeTruthy();
    // The form as generation left it (it keeps the target as it normalised it).
    const target = await page.getByLabel("Base URL").inputValue();

    await page.getByRole("banner").getByRole("link", { name: "Site lookup", exact: true }).click();
    await expect(page).toHaveURL(/\/sites$/);
    await page.getByRole("banner").getByRole("link", { name: "Run", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByLabel("Base URL")).toHaveValue(target);
    await expect(page.getByLabel("What do you want to test?")).toHaveValue("Create a functional smoke test for the Mr Onion landing page.");
    await expect(page.locator("pre").filter({ hasText: "import { test, expect } from '@playwright/test';" }).first()).toHaveText(code!);
    await expect(page.getByRole("button", { name: "Run suite" }).first()).toBeEnabled();

    // And after a reload, which goes through the server's render: from sessionStorage itself, not the page's memory
    // (the fresh-context review: a client-side return alone can't tell the two apart).
    expect(await page.evaluate(() => window.sessionStorage.getItem("mronion.suite.editedCode"))).toBe(JSON.stringify(code));
    await page.reload();
    await expect(page.getByLabel("Base URL")).toHaveValue(target);
    await expect(page.locator("pre").filter({ hasText: "import { test, expect } from '@playwright/test';" }).first()).toHaveText(code!);
    await expect(page.getByRole("button", { name: "Run suite" }).first()).toBeEnabled();
});

test("TFP-294: a page left during a run, and come back to, follows that run to its report rather than offering Run", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await generate(page, "http://127.0.0.1:3001/", "Create a functional smoke test for the Mr Onion landing page.");
    await page.getByRole("button", { name: "Run suite" }).first().click();
    // The run's id once the server has started it (stored as JSON: "null" until then).
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("mronion.run.activeRunId")), { timeout: 30_000 }).toMatch(/^"[0-9a-f-]{36}"$/);
    await page.reload();
    // Following the run, not offering another: Run isn't there to press while it goes on.
    await expect(page.getByRole("button", { name: "Run suite" })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText("Release readiness at a glance")).toBeVisible({ timeout: 180_000 });
    expect(await page.evaluate(() => window.sessionStorage.getItem("mronion.run.activeRunId"))).toBe("null");
});

test("TFP-294: Escape doesn't close the lookup's modal while a confirmation form is open in it; Close does", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Base URL").fill(`${REMOTE}/`);
    await page.getByRole("button", { name: "This site's confirmation and settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Site lookup" });
    await dialog.getByRole("button", { name: "Confirm ownership" }).click();
    await dialog.getByLabel("Hosts, one per line").fill(HOST);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Hosts, one per line")).toHaveValue(HOST);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
});

test("TFP-294: an empty entry names its port, the default one included", async ({ page }) => {
    await page.goto("/sites");
    for (const [typed, shown] of [["http://192.168.1.17", "Nothing saved for http://192.168.1.17 (port 80)"], ["https://empty-port.example.com/x", "Nothing saved for https://empty-port.example.com (port 443)"], ["http://192.168.1.17:4201/", "Nothing saved for http://192.168.1.17:4201 (port 4201)"]] as const) {
        await page.getByLabel("Site URL").fill(typed);
        await page.getByRole("button", { name: "Look up" }).click();
        await expect(page.getByRole("region", { name: "Results" }).getByText(/^Nothing saved for /)).toHaveText(shown);
    }
});
