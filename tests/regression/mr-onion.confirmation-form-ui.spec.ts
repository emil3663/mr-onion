import { mkdir, rm, writeFile } from "node:fs/promises";
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

test("TFP-233: opened from the run form, the host field is empty, 90 days preselected, the picker stops at 1 year, the ticks off", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Base URL").fill(`${SHOP}/shop`);
    // TFP-294: the run form's lookup is a modal over the form.
    await page.getByRole("button", { name: "This site's confirmation and settings", exact: true }).click();
    const lookup = page.getByRole("dialog", { name: "Site lookup" });
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
    // The label names the category the stored statement does, with today's example (owner ruling at Gate A, 2026-11-17).
    await expect(form.getByRole("checkbox", { name: "Active tests: attack-shaped input (today: script-shaped input in forms), on a run that asks for active tests." })).toBeVisible();

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

// Phase 46 Gate B, R2 (the owner's re-walk, 2026-11-18): required fields are marked, with the browser's required
// check; the API's refusals are shown beside their field and in a summary above the save button, focus on the first;
// the save button's hint names only what's missing. Partitions: a required control / an optional one; a required field
// left empty / all filled; a refusal with its field / one with none; nothing missing / some missing.
test("R2: each required control is marked with an asterisk and \"(required)\" and is required; the optional ones aren't", async ({ page }) => {
    const form = await openForm(page);
    const required = [
        form.getByLabel("Hosts, one per line"),
        form.getByRole("radio", { name: "I own this site" }),
        form.getByRole("radio", { name: "I have written permission to test it" }),
        form.getByRole("checkbox", { name: /I confirm the statement above/ }),
        form.getByLabel("Your name"),
        form.getByLabel("Contact email"),
    ];
    for (const control of required) await expect(control).toHaveAttribute("required", "");
    // Each label or legend, by how it begins (the save hint names some of the same words: the fresh-context review).
    for (const start of [/^Hosts, one per line/, /^Basis: choose one/, /^I confirm the statement above/, /^Your name/, /^Contact email/]) {
        const label = form.locator("label, legend").filter({ hasText: start });
        await expect(label).toHaveCount(1);
        await expect(label).toContainText("*");
        await expect(label).toContainText("(required)");
    }
    for (const optional of [form.getByLabel("Expires on"), form.getByRole("checkbox", { name: /^Active tests:/ }), form.getByRole("checkbox", { name: /^Load testing:/ })]) {
        await expect(optional).not.toHaveAttribute("required");
    }
    await expect(form.locator("label", { hasText: "Expires on" })).not.toContainText("(required)");
});

test("R2: a required field left empty is stopped by the browser's required check, focused, and nothing is sent", async ({ page }) => {
    const form = await openForm(page);
    const sent: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/site-ownership")) sent.push(request.url()); });
    await form.getByLabel("Hosts, one per line").fill(HOST);
    await form.getByRole("radio", { name: "I own this site" }).check();
    await form.getByLabel("Contact email").fill("tess@example.com");
    await form.getByRole("checkbox", { name: /I confirm the statement above/ }).check();
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    const name = form.getByLabel("Your name");
    await expect(name).toBeFocused();
    expect(await name.evaluate((input: HTMLInputElement) => input.validity.valueMissing), "the browser's own check found it empty").toBe(true);
    expect(await name.evaluate((input: HTMLInputElement) => input.validationMessage), "with the browser's message").not.toBe("");
    expect(sent, "nothing was sent to the API").toEqual([]);
    expect((await ownership(page)).status).toBe("missing");
});

test("R2: the API's refusals are shown beside their field and in a summary above the save button, focus on the first", async ({ page }) => {
    const form = await openForm(page);
    await fillValid(form, { hosts: `*.${HOST}`, email: "tess at example" });
    const save = form.getByRole("button", { name: "Save the confirmation" });
    await save.click();
    const hosts = form.getByLabel("Hosts, one per line");
    const email = form.getByLabel("Contact email");
    // Beside each field: its own refusal, the field marked invalid and described by it.
    await expect(hosts).toHaveAttribute("aria-invalid", "true");
    await expect(hosts).toHaveAccessibleDescription(new RegExp(`"\\*\\.${HOST.replace(/\./g, "\\.")}" is a wildcard`));
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription(/"tess at example" isn't a valid email address/);
    await expect(form.getByLabel("Your name")).not.toHaveAttribute("aria-invalid", "true");
    // The summary lists both, above the save button.
    await expect(refusals(form)).toHaveCount(2);
    const summary = form.getByRole("group", { name: "Mr Onion refused the confirmation:" });
    const [summaryBox, saveBox] = [await summary.boundingBox(), await save.boundingBox()];
    expect(summaryBox!.y + summaryBox!.height, "the summary ends above the save button").toBeLessThanOrEqual(saveBox!.y);
    // Focus on the first refused field, in the form's order.
    await expect(hosts).toBeFocused();
    expect((await ownership(page)).status).toBe("missing");

    // A field corrected loses its refusal, beside it and in the summary; focus stays where the tester types.
    await email.fill("tess@example.com");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(refusals(form)).toHaveCount(1);
    await expect(email).toBeFocused();
});

test("R2: a refusal about no field is in the summary only, and the summary is focused", async ({ page }) => {
    const form = await openForm(page);
    await page.route("**/api/site-ownership", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, body: "" }) : route.fallback()));
    await fillValid(form);
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(refusals(form)).toHaveText(["the server answered 500, with no reason given"]);
    await expect(form.getByRole("group", { name: "Mr Onion refused the confirmation:" })).toBeFocused();
    await expect(form.locator("[aria-invalid='true']")).toHaveCount(0);
});

test("R2: the save button's hint names only what is still missing", async ({ page }) => {
    const form = await openForm(page);
    const hint = form.locator("#confirmation-save-hint");
    await expect(hint).toHaveText("Still needed to save: the hosts, a basis, the statement's tick, your name and the contact email.");
    await form.getByLabel("Hosts, one per line").fill(HOST);
    await form.getByLabel("Your name").fill("Tess Tester");
    await expect(hint).toHaveText("Still needed to save: a basis, the statement's tick and the contact email.");
    await form.getByRole("radio", { name: "I own this site" }).check();
    await form.getByLabel("Contact email").fill("tess@example.com");
    await expect(hint).toHaveText("Still needed to save: the statement's tick.");
    await form.getByRole("checkbox", { name: /I confirm the statement above/ }).check();
    await expect(hint).toHaveText("");
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

    // TFP-295 (Gate B's walkthrough): "Change or renew", pre-filled from the current confirmation (hosts, basis, name,
    // ticks; the expiry back to the 90-day default), but for the statement tick and the contact email, retyped.
    await page.getByRole("region", { name: "Results" }).getByRole("button", { name: "Change or renew", exact: true }).click();
    const renewal = page.getByRole("form", { name: "Change or renew the confirmation" });
    await expect(renewal.getByLabel("Hosts, one per line")).toHaveValue(HOST);
    await expect(renewal.getByRole("radio", { name: "I own this site" })).toBeChecked();
    await expect(renewal.getByLabel("Your name")).toHaveValue("Tess Tester");
    await expect(renewal.getByRole("checkbox", { name: /^Active tests:/ })).toBeChecked();
    await expect(renewal.getByRole("checkbox", { name: /^Load testing:/ })).not.toBeChecked();
    await expect(renewal.getByLabel("I confirm the statement above")).not.toBeChecked();
    await expect(renewal.getByLabel("Contact email")).toHaveValue("");
    const tomorrow = await renewal.getByLabel("Expires on").getAttribute("min");
    await expect(renewal.getByLabel("Expires on")).toHaveValue(isoDay(new Date(Date.parse(`${tomorrow}T00:00:00Z`) - DAY + 90 * DAY)));
    await expect(renewal.getByRole("button", { name: "Save the change", exact: true })).toBeDisabled();
    const later = isoDay(new Date(Date.now() + 200 * DAY));
    await fillValid(renewal, { name: "Robin Renewer", email: "robin@example.org", expires: later, basis: "I have written permission to test it" });
    await renewal.getByRole("button", { name: "Save the change", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    const after = page.getByRole("region", { name: "Results" });
    await expect(after.getByTestId("confirmation-status")).toHaveText(`Valid until ${at(later)}`);
    await expect(after.getByText(/^Robin Renewer, on /)).toBeVisible();
    await expect(after.getByText("I have written permission to test it")).toBeVisible();
    const renewed = await ownership(page);
    expect(renewed.history.map((entry: { name: string }) => entry.name)).toEqual(["Tess Tester"]);
    // The active tick came pre-filled, and was kept.
    expect(renewed.confirmation.scopes).toEqual({ active: true, load: false });
    await page.reload();
    await expect(page.getByRole("region", { name: "Results" }).getByText(/^Robin Renewer, on /)).toBeVisible();
    expect(await page.content()).not.toMatch(/tess@example\.com|robin@example\.org/);
});

test("TFP-295: an expired confirmation is changed or renewed from what it was, and the renewal makes it valid again", async ({ page }) => {
    // Written as a confirmation made a year ago would be: the API can't save one that has already expired.
    await mkdir(siteFolder, { recursive: true });
    await writeFile(join(siteFolder, "ownership.json"), JSON.stringify({ current: { hosts: [HOST], basis: "written-permission", wording: CONFIRMATION_WORDING["written-permission"], name: "Old Owner", contactEmail: "old@example.com", confirmedAt: "2025-11-10T10:00:00.000Z", expiresAt: "2026-02-08T10:00:00.000Z", scopes: { active: false, load: true } }, history: [] }));
    await page.goto(`/sites?url=${encodeURIComponent(SHOP)}`);
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Expired on 2026-02-08/);
    await results.getByRole("button", { name: "Change or renew", exact: true }).click();
    const form = page.getByRole("form", { name: "Change or renew the confirmation" });
    await expect(form.getByLabel("Hosts, one per line")).toHaveValue(HOST);
    await expect(form.getByRole("radio", { name: "I have written permission to test it" })).toBeChecked();
    await expect(form.getByLabel("Your name")).toHaveValue("Old Owner");
    await expect(form.getByRole("checkbox", { name: /^Active tests:/ })).not.toBeChecked();
    await expect(form.getByRole("checkbox", { name: /^Load testing:/ })).toBeChecked();
    await expect(form.getByLabel("Contact email")).toHaveValue("");
    await form.getByLabel("Contact email").fill("new@example.com");
    await form.getByLabel("I confirm the statement above").check();
    await form.getByRole("button", { name: "Save the change", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Valid until /);
    const saved = await ownership(page);
    expect(saved.history.map((entry: { name: string }) => entry.name)).toEqual(["Old Owner"]);
    expect(saved.confirmation).toMatchObject({ name: "Old Owner", basis: "written-permission", scopes: { active: false, load: true }, contactEmail: "n***@example.com" });
});

// The owner's answer at the re-walk's set-up (2026-11-18): a withdrawn confirmation opens pre-filled too, the statement
// tick and the email excepted. It is a new confirmation, so the button and the form say "Confirm".
test("TFP-295: a withdrawn confirmation is confirmed again from what it was, the statement and email retyped", async ({ page }) => {
    await mkdir(siteFolder, { recursive: true });
    await writeFile(join(siteFolder, "ownership.json"), JSON.stringify({ current: { hosts: [HOST], basis: "owner", wording: CONFIRMATION_WORDING.owner, name: "Was Owner", contactEmail: "was@example.com", confirmedAt: "2026-11-01T10:00:00.000Z", expiresAt: "2027-01-30T10:00:00.000Z", scopes: { active: true, load: false }, withdrawnAt: "2026-11-10T10:00:00.000Z" }, history: [] }));
    await page.goto(`/sites?url=${encodeURIComponent(SHOP)}`);
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Withdrawn on 2026-11-10/);
    await results.getByRole("button", { name: "Confirm ownership", exact: true }).click();
    const form = page.getByRole("form", { name: "Confirm ownership or permission" });
    await expect(form.getByText("It starts from the withdrawn confirmation.", { exact: false })).toBeVisible();
    await expect(form.getByLabel("Hosts, one per line")).toHaveValue(HOST);
    await expect(form.getByRole("radio", { name: "I own this site" })).toBeChecked();
    await expect(form.getByLabel("Your name")).toHaveValue("Was Owner");
    await expect(form.getByRole("checkbox", { name: /^Active tests:/ })).toBeChecked();
    await expect(form.getByRole("checkbox", { name: /^Load testing:/ })).not.toBeChecked();
    await expect(form.getByLabel("Contact email")).toHaveValue("");
    await expect(form.getByLabel("I confirm the statement above")).not.toBeChecked();
    await form.getByLabel("Contact email").fill("again@example.com");
    await form.getByLabel("I confirm the statement above").check();
    await form.getByRole("button", { name: "Save the confirmation", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    await expect(results.getByTestId("confirmation-status")).toHaveText(/^Valid until /);
    const saved = await ownership(page);
    expect(saved.history.map((entry: { name: string }) => entry.name)).toEqual(["Was Owner"]);
    expect(saved.confirmation).toMatchObject({ name: "Was Owner", basis: "owner", scopes: { active: true, load: false }, contactEmail: "a***@example.com" });
});

test("TFP-233: the expiry left at its default is the API's own 90 days from the moment confirmed", async ({ page }) => {
    const form = await openForm(page);
    await fillValid(form);
    await form.getByRole("button", { name: "Save the confirmation" }).click();
    await expect(page.getByRole("status")).toHaveText("The confirmation was saved.");
    const { confirmation } = await ownership(page);
    expect(Date.parse(confirmation.expiresAt) - Date.parse(confirmation.confirmedAt)).toBe(90 * DAY);
});
