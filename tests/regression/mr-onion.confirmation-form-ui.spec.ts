import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { setting } from "../../src/lib/settings";
import { CONFIRMATION_WORDING, LEGAL_NOTE } from "../../src/lib/ownership/confirmation";
import { siteFolderName } from "../../src/lib/site-suites/store";

// Phase 46 (TFP-233, Decision 2, Acceptance Criteria 2, and AC1's creating and renewing): the confirmation form in the
// site lookup, in the real app, on the server's temporary data folder. Equivalence partitions and boundaries:
//   opened from the run form, its URL set       -> the host field empty; 90 days preselected; the picker stops at 1 year;
//                                                  active and load off; save disabled until the statement is ticked
//   the basis changed                           -> its own statement (the written-permission one has the practice-site
//                                                  rule); the tick cleared
//   no name, no email                           -> the API's reasons, shown; nothing saved
//   a wildcard host, an invalid email, an expiry past 1 year -> each refused by the API with its reason, shown
//   a host the site doesn't use yet             -> refused, with how a host comes to be accepted
//   valid                                       -> saved through the API, shown in place and after a reload
//   renewed                                     -> replaces it, the old one in the history; after a reload

const dataDir = setting("DATA_DIR");
const SHOP = "https://confirm-shop.example.com";
const HOST = "confirm-shop.example.com";
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function ownRegressionFolder(dir: string | undefined): boolean {
    if (!dir) return false;
    const full = resolve(dir);
    return full.startsWith(resolve(tmpdir()) + sep) && basename(full).startsWith("mr-onion-regression-data-");
}
const siteFolder = join(dataDir ?? "", "site-suites", siteFolderName(SHOP));

test.beforeEach(async () => {
    expect(ownRegressionFolder(dataDir), `the spec only touches the regression config's own temporary data folder, not ${dataDir}`).toBe(true);
    await rm(siteFolder, { recursive: true, force: true });
});

test.afterAll(async () => {
    if (ownRegressionFolder(dataDir)) await rm(siteFolder, { recursive: true, force: true });
});

const ownership = async (page: Page) => (await page.request.get(`/api/site-ownership?baseUrl=${encodeURIComponent(SHOP)}`)).json();

async function openForm(page: Page): Promise<Locator> {
    await page.goto(`/sites?url=${encodeURIComponent(SHOP)}`);
    const results = page.getByRole("region", { name: "Results" });
    await results.getByRole("button", { name: "Confirm ownership" }).click();
    return results.getByRole("form", { name: "Confirm ownership or permission" });
}

async function fillValid(form: Locator, overrides: { hosts?: string; name?: string; email?: string; expires?: string; basis?: string } = {}) {
    await form.getByLabel("Hosts, one per line").fill(overrides.hosts ?? HOST);
    await form.getByRole("radio", { name: overrides.basis ?? "I own this site" }).check();
    await form.getByLabel("Your name").fill(overrides.name ?? "Tess Tester");
    await form.getByLabel("Contact email").fill(overrides.email ?? "tess@example.com");
    if (overrides.expires) await form.getByLabel("Expires on").fill(overrides.expires);
    await form.getByLabel("I confirm the statement above").check();
}

const refusals = (form: Locator) => form.getByRole("list", { name: "Why it was refused" }).getByRole("listitem");
const at = (day: string) => `${day} 00:00 UTC`;

test("TFP-233: opened from the run form, the host field is empty, 90 days preselected, the picker stops at 1 year, the ticks off", async ({ page, context }) => {
    await page.goto("/");
    await page.getByLabel("Base URL").fill(`${SHOP}/shop`);
    const [lookup] = await Promise.all([
        context.waitForEvent("page"),
        page.getByRole("link", { name: "This site's confirmation and settings (opens in a new tab)" }).click(),
    ]);
    const results = lookup.getByRole("region", { name: "Results" });
    await expect(results.getByRole("heading", { level: 2 })).toHaveText(SHOP);
    await results.getByRole("button", { name: "Confirm ownership" }).click();
    const form = results.getByRole("form", { name: "Confirm ownership or permission" });

    // Decision 2: typed by hand, never filled from the URL; the cursor starts there.
    await expect(form.getByLabel("Hosts, one per line")).toHaveValue("");
    await expect(form.getByLabel("Hosts, one per line")).toBeFocused();
    // The form's own day, read from its minimum (tomorrow), so a run across UTC midnight can't put the two a day apart
    // (the fresh-context review).
    const tomorrow = await form.getByLabel("Expires on").getAttribute("min");
    expect(tomorrow, "the picker has a minimum").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date(Date.parse(`${tomorrow}T00:00:00Z`) - DAY);
    const yearOn = new Date(today);
    yearOn.setUTCFullYear(yearOn.getUTCFullYear() + 1);
    if (yearOn.getUTCMonth() !== today.getUTCMonth()) yearOn.setUTCDate(0);
    await expect(form.getByLabel("Expires on")).toHaveValue(isoDay(new Date(today.getTime() + 90 * DAY)));
    await expect(form.getByLabel("Expires on")).toHaveAttribute("max", isoDay(yearOn));
    await expect(form.getByRole("checkbox", { name: /^Active tests:/ })).not.toBeChecked();
    await expect(form.getByRole("checkbox", { name: /^Load testing:/ })).not.toBeChecked();
    await expect(form.getByText("sends script-shaped input to these hosts' forms, on a run that asks for active tests.", { exact: false })).toBeVisible();

    // The basis is chosen: none is preselected, and there is nothing to tick until one is.
    await expect(form.getByRole("radio", { name: "I own this site" })).not.toBeChecked();
    await expect(form.getByRole("radio", { name: "I have written permission to test it" })).not.toBeChecked();
    await expect(form.getByText("Choose a basis to see what you confirm.")).toBeVisible();
    await expect(form.getByLabel("I confirm the statement above")).toBeDisabled();
    // The statement is the API's wording, with the legal note beside it; it must be ticked.
    await form.getByRole("radio", { name: "I own this site" }).check();
    await expect(form.getByText(CONFIRMATION_WORDING.owner, { exact: true })).toBeVisible();
    await expect(form.getByText(LEGAL_NOTE, { exact: true })).toBeVisible();
    const save = form.getByRole("button", { name: "Save the confirmation" });
    await expect(save).toBeDisabled();
    await form.getByLabel("I confirm the statement above").check();
    await expect(save).toBeEnabled();
    // Another basis is another statement: the tick no longer stands.
    await form.getByRole("radio", { name: "I have written permission to test it" }).check();
    await expect(form.getByText(CONFIRMATION_WORDING["written-permission"], { exact: true })).toBeVisible();
    await expect(form.getByText(/A hosted practice site counts only when its published terms explicitly allow/)).toBeVisible();
    await expect(form.getByLabel("I confirm the statement above")).not.toBeChecked();
    await expect(save).toBeDisabled();
    // Cancel closes the form and returns focus to the button that opened it.
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(results.getByRole("form")).toHaveCount(0);
    await expect(results.getByRole("button", { name: "Confirm ownership" })).toBeFocused();
});

test("TFP-233: no name and no email are refused by the API, each with its reason, and nothing is saved", async ({ page }) => {
    const form = await openForm(page);
    await form.getByLabel("Hosts, one per line").fill(HOST);
    await form.getByRole("radio", { name: "I own this site" }).check();
    await form.getByLabel("I confirm the statement above").check();
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(refusals(form)).toHaveText([
        "name is missing: the name of the person who confirms",
        "contactEmail is missing: how to reach the person who confirms",
    ]);
    await expect(form.getByRole("group", { name: "Mr Onion refused the confirmation:" })).toBeFocused();
    expect((await ownership(page)).status).toBe("missing");
});

test("TFP-233: a wildcard host, an invalid email and an expiry past 1 year are each refused with the API's reason", async ({ page }) => {
    const form = await openForm(page);
    await fillValid(form, { hosts: `*.${HOST}` });
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(refusals(form)).toHaveText([`"*.${HOST}" is a wildcard: type each host in full (Decision 2)`]);

    await fillValid(form, { email: "tess at example" });
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(refusals(form)).toHaveText([`contactEmail "tess at example" isn't a valid email address`]);

    // Past the picker's own limit (a date typed or pasted in): the API refuses it, and says its limit.
    await fillValid(form, { expires: isoDay(new Date(Date.now() + 2 * 365 * DAY)) });
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(refusals(form)).toHaveCount(1);
    await expect(refusals(form).first()).toHaveText(/^expiresAt is beyond 1 year from the date confirmed \(at most \d{4}-\d{2}-\d{2}T/);
    expect((await ownership(page)).status).toBe("missing");
});

test("TFP-233: a host the site doesn't use yet is refused, and the form says a Standard run records it", async ({ page }) => {
    const form = await openForm(page);
    await fillValid(form, { hosts: `${HOST}\ncdn.not-recorded.example.net` });
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(refusals(form)).toHaveText([`"cdn.not-recorded.example.net" isn't a host this site's address or crawl uses: check it for a typing error`]);
    await expect(form.getByText("A host is accepted once a Standard run on this site has recorded it: run one, then confirm.")).toBeVisible();
});

test("TFP-233: a confirmation is created and renewed through the API, shown in place and after a reload", async ({ page }) => {
    const form = await openForm(page);
    const expires = isoDay(new Date(Date.now() + 30 * DAY));
    await fillValid(form, { expires });
    await form.getByRole("checkbox", { name: /^Active tests:/ }).check();
    await form.getByRole("button", { name: "Save the confirmation" }).click();

    const results = page.getByRole("region", { name: "Results" });
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    await expect(page.getByRole("status")).toBeFocused();
    await expect(results.getByTestId("confirmation-status")).toHaveText(`Valid until ${at(expires)}`);
    await expect(results.getByText("t***@example.com")).toBeVisible();
    await expect(results.getByText("Runs without the request limits; active tests (attack-shaped input)")).toBeVisible();
    await expect(results.getByRole("form")).toHaveCount(0);
    const created = await ownership(page);
    expect(created.confirmation).toMatchObject({ hosts: [HOST], basis: "owner", name: "Tess Tester", contactEmail: "t***@example.com", scopes: { active: true, load: false }, wording: CONFIRMATION_WORDING.owner });
    await page.reload();
    await expect(page.getByRole("region", { name: "Results" }).getByTestId("confirmation-status")).toHaveText(`Valid until ${at(expires)}`);

    // Renew: the form starts empty again (hosts typed again), and the new one replaces the old, kept in the history.
    await page.getByRole("region", { name: "Results" }).getByRole("button", { name: "Renew" }).click();
    const renewal = page.getByRole("form", { name: "Renew the confirmation" });
    await expect(renewal.getByLabel("Hosts, one per line")).toHaveValue("");
    const later = isoDay(new Date(Date.now() + 200 * DAY));
    await fillValid(renewal, { name: "Robin Renewer", email: "robin@example.org", expires: later, basis: "I have written permission to test it" });
    await renewal.getByRole("button", { name: "Save the renewal" }).click();
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    const after = page.getByRole("region", { name: "Results" });
    await expect(after.getByTestId("confirmation-status")).toHaveText(`Valid until ${at(later)}`);
    await expect(after.getByText(/^Robin Renewer, on /)).toBeVisible();
    await expect(after.getByText("I have written permission to test it")).toBeVisible();
    const renewed = await ownership(page);
    expect(renewed.history.map((entry: { name: string }) => entry.name)).toEqual(["Tess Tester"]);
    expect(renewed.confirmation.scopes).toEqual({ active: false, load: false });
    await page.reload();
    await expect(page.getByRole("region", { name: "Results" }).getByText(/^Robin Renewer, on /)).toBeVisible();
    expect(await page.content()).not.toMatch(/tess@example\.com|robin@example\.org/);
});

test("TFP-233: the expiry left at its default is the API's own 90 days from the moment confirmed", async ({ page }) => {
    const form = await openForm(page);
    await fillValid(form);
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    const { confirmation } = await ownership(page);
    expect(Date.parse(confirmation.expiresAt) - Date.parse(confirmation.confirmedAt)).toBe(90 * DAY);
});
