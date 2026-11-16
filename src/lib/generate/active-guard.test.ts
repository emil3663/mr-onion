/**
 * Phase 43 (TFP-220, Decision 9, Acceptance Criterion 3, review item 4): the covered-host guard in a real browser,
 * measured at the server. Two sites on this machine: the covered host (127.0.0.1, the run's MRONION_ACTIVE_HOSTS)
 * and an uncovered one (localhost), each recording every request it gets. The uncovered site must get nothing from a
 * guarded test, whichever way the test's input is sent there.
 *
 * ISTQB technique: equivalence partitions of the ways a request reaches another host, each guarded, plus one control
 * without the guard (it does reach the uncovered site, so the recording could go red):
 *   a form's action on the uncovered host                     -> breach, naming the host
 *   a GET form there (the payload in its query string)        -> breach: a navigation, whatever its method
 *   a 307 from the covered host to the uncovered one          -> breach (unguarded, the body arrives: measured)
 *   two hops: covered, covered, uncovered                     -> breach (a fulfilled 3xx's next hop isn't routed)
 *   a 303 inside the covered host, setting a cookie           -> passes, followed by the guard, the cookie kept
 *   saved-at-load fetchLater, keepalive POST and beacon       -> nothing arrives; the fetchLater POST is a breach
 *   an image from the uncovered host                          -> stopped and noted, not a breach
 *   a covered image redirecting there; a frame from there     -> stopped and noted: reads (the review's findings 2, 3)
 *   a form posting to the uncovered host in a popup           -> breach (the guard is on the context)
 *   no covered host at all (outside a run)                     -> the test fails before sending anything
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/generate/active-guard.test.ts
 */
import assert from "node:assert";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { ExecutionRecord, JsonSuite } from "../report/types.ts";

const { ACTIVE_GUARD_HELPER } = await import("./active-guard.ts");
const { flattenSuites } = await import("../report/execution.ts");
const { findTypeErrors } = await import("./validate.ts");
const { chromiumSkipReason } = await import("../../test-support/chromium.ts");
const { runPlaywrightSpec } = await import("../../test-support/playwright-cli.ts");
const needsChromium = await chromiumSkipReason();

type Recorded = { method: string; path: string; bodyBytes: number };

async function recordingServer(host: string, respond: (path: string, res: import("node:http").ServerResponse) => void) {
    const recorded: Recorded[] = [];
    const server: Server = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            recorded.push({ method: req.method ?? "", path: req.url ?? "", bodyBytes: body.length });
            respond(req.url ?? "/", res);
        });
    });
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    return { origin: `http://${host}:${(server.address() as AddressInfo).port}`, recorded, close: () => new Promise((resolve) => server.close(resolve)) };
}

const html = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title></head><body>${body}</body></html>`;

/** Each test's notes from the guard, by title, from a Playwright JSON report. */
function guardNotes(suites: JsonSuite[]): Map<string, string[]> {
    const notes = new Map<string, string[]>();
    const walk = (list: JsonSuite[]) => list.forEach((suite) => {
        suite.specs.forEach((spec) => notes.set(spec.title, spec.tests.flatMap((t) => t.annotations ?? []).filter((a) => a.type === "note" && a.description?.startsWith("covered-host guard: stopped")).map((a) => a.description ?? "")));
        walk(suite.suites ?? []);
    });
    walk(suites);
    return notes;
}

const one = (records: ExecutionRecord[], title: string) => {
    const found = records.filter((record) => record.title.endsWith(title));
    assert.equal(found.length, 1, `${title}: ${found.length} matches in ${records.map((record) => record.title).join(" | ")}`);
    return found[0];
};

test("in a real browser: an active test's input reaches only the covered host, through a form's action, a redirect, two hops, a saved fetchLater, keepalive or beacon, or a popup; a redirect inside it is followed (TFP-220)", { skip: needsChromium, timeout: 300_000 }, async () => {
    const uncovered = await recordingServer("localhost", (path, res) => {
        if (path.startsWith("/pixel")) return res.writeHead(200, { "content-type": "image/gif" }).end(Buffer.from("R0lGODlhAQABAAAAACw=", "base64"));
        res.writeHead(200, { "content-type": "text/html" }).end(html("<h1>Elsewhere</h1>"));
    });
    const elsewhere = uncovered.origin;
    const covered = await recordingServer("127.0.0.1", (path, res) => {
        if (path.startsWith("/r307")) return res.writeHead(307, { location: `${elsewhere}/via307` }).end();
        if (path.startsWith("/hop1")) return res.writeHead(307, { location: "/hop2" }).end();
        if (path.startsWith("/hop2")) return res.writeHead(307, { location: `${elsewhere}/viahop2` }).end();
        if (path.startsWith("/ok")) return res.writeHead(303, { location: "/done", "set-cookie": "seen=1; Path=/" }).end();
        if (path.startsWith("/avatar")) return res.writeHead(302, { location: `${elsewhere}/pixel.gif?via=avatar` }).end();
        if (path.startsWith("/done")) return res.writeHead(200, { "content-type": "text/html" }).end(html("<h1>Done</h1><p id=\"cookie\"></p><script>document.getElementById('cookie').textContent = document.cookie;</script>"));
        const form = (id: string, action: string, extra = "", method = "post") => `<form id="${id}" method="${method}" action="${action}"${extra}><label>Note <input name="note"></label><button type="submit">Save ${id}</button></form>`;
        res.writeHead(200, { "content-type": "text/html" }).end(html(`<h1>Notes</h1>${form("ext", `${elsewhere}/ext`)}${form("search", `${elsewhere}/search`, "", "get")}${form("r307", "/r307")}${form("hop1", "/hop1")}${form("ok", "/ok")}${form("popup", `${elsewhere}/popup`, ' target="_blank"')}<a href="/done">Done</a>`));
    });
    try {
        const code = `import { test, expect } from '@playwright/test';

test.use({ baseURL: '${covered.origin}' });

${ACTIVE_GUARD_HELPER}

const submits = (id: string) => async ({ page }: { page: import('@playwright/test').Page }) => {
  await tfActiveWrap(page);
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.locator('#' + id + ' input').fill('payload-' + id);
    await page.getByRole('button', { name: 'Save ' + id }).click();
    await page.waitForTimeout(1000);
  });
};

test('a form posting to the uncovered host', submits('ext'));
test('a GET form to the uncovered host', submits('search'));
test('a 307 to the uncovered host', submits('r307'));
test('two hops to the uncovered host', submits('hop1'));
test('a popup posting to the uncovered host', submits('popup'));

test('a 303 inside the covered host', async ({ page }) => {
  await tfActiveWrap(page);
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.locator('#ok input').fill('payload-ok');
    await page.getByRole('button', { name: 'Save ok' }).click();
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
    await expect(page.locator('#cookie')).toHaveText('seen=1');
  });
});

// A page's own script, at load: it keeps its own references, and sends with them later (TFP-287's case).
const savesReferences = (elsewhere: string) => {
  if (location.pathname !== '/') return;
  const scope = window as unknown as { fetchLater?: (url: string, init: RequestInit & { activateAfter?: number }) => unknown; __queueSaved?: () => void };
  const beacon = navigator.sendBeacon.bind(navigator);
  const send = window.fetch;
  const later = scope.fetchLater;
  scope.__queueSaved = () => { later!(elsewhere + '/later', { method: 'POST', body: 'payload-later', activateAfter: 0 }); };
  addEventListener('pagehide', () => {
    beacon(elsewhere + '/beacon', 'payload-beacon');
    send(elsewhere + '/keepalive', { method: 'POST', body: 'payload-keepalive', keepalive: true }).catch(() => undefined);
  });
};

test('saved references to the uncovered host', async ({ page }) => {
  await tfActiveWrap(page);
  await page.addInitScript(savesReferences, '${elsewhere}');
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.evaluate(() => (window as unknown as { __queueSaved: () => void }).__queueSaved());
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
    await page.waitForTimeout(1000);
  });
});

test('an image from the uncovered host', async ({ page }) => {
  await tfActiveWrap(page);
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.evaluate((src) => { const img = document.createElement('img'); img.src = src; document.body.append(img); }, '${elsewhere}/pixel.gif');
    await page.waitForTimeout(1000);
  });
});

// The fresh-context review's findings 2 and 3: reads, not breaches. A covered image that redirects to the uncovered
// host (an avatar or a CDN), and a frame loaded from there (a captcha's challenge, an embedded video).
test('a covered image redirecting to the uncovered host', async ({ page }) => {
  await tfActiveWrap(page);
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.evaluate(() => { const img = document.createElement('img'); img.src = '/avatar/1'; document.body.append(img); });
    await page.waitForTimeout(1000);
  });
});

test('a frame from the uncovered host', async ({ page }) => {
  await tfActiveWrap(page);
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.evaluate((src) => { const frame = document.createElement('iframe'); frame.src = src; document.body.append(frame); }, '${elsewhere}/frame');
    await page.waitForTimeout(1000);
  });
});

test('without the guard, the control', async ({ page }) => {
  await page.goto('/');
  await page.locator('#ext input').fill('payload-control');
  await page.getByRole('button', { name: 'Save ext' }).click();
  await expect(page.getByRole('heading', { name: 'Elsewhere' })).toBeVisible();
});
`;
        assert.deepEqual(findTypeErrors(code), []);
        const { report } = await runPlaywrightSpec(code, "active-guard", ["--timeout=30000", "--workers=1"], { MRONION_ACTIVE_HOSTS: "127.0.0.1" });
        const records = flattenSuites(report.suites);
        // A beacon can land a moment after the run ends.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        assert.deepEqual(uncovered.recorded.map((request) => `${request.method} ${request.path}`), ["POST /ext"], "only the unguarded control reached the uncovered host");

        const breach = (title: string, ...named: string[]) => {
            const record = one(records, title);
            assert.equal(record.status, "Failed", `${title}: ${record.status} ${record.rawMessage}`);
            assert.ok(record.rawMessage.includes("covered-host guard breach"), `${title}: ${record.rawMessage}`);
            for (const name of named) assert.ok(record.rawMessage.includes(name), `${title} names ${name}: ${record.rawMessage}`);
        };
        breach("a form posting to the uncovered host", `POST ${elsewhere}/ext (navigation) to localhost`);
        // Its payload is in the query string: a navigation to an uncovered host is a breach whatever its method.
        breach("a GET form to the uncovered host", `GET ${elsewhere}/search?note=payload-search (navigation) to localhost`);
        breach("a 307 to the uncovered host", `redirected to ${elsewhere}/via307 (307) to localhost`);
        breach("two hops to the uncovered host", `redirected to ${elsewhere}/viahop2 (307) to localhost`);
        breach("a popup posting to the uncovered host", `POST ${elsewhere}/popup (navigation) to localhost`);
        breach("saved references to the uncovered host", `POST ${elsewhere}/later (fetchLater) to localhost`);

        const inside = one(records, "a 303 inside the covered host");
        assert.equal(inside.status, "Passed", inside.rawMessage);
        assert.ok(covered.recorded.some((request) => request.method === "POST" && request.path === "/hop2"), "the guard followed the covered hop itself, and stopped at the uncovered one");

        const image = one(records, "an image from the uncovered host");
        assert.equal(image.status, "Passed", image.rawMessage);
        const notes = guardNotes(report.suites).get("an image from the uncovered host") ?? [];
        assert.ok(notes.some((note) => note.includes(`GET ${elsewhere}/pixel.gif (image) to localhost`)), JSON.stringify(notes));

        for (const [title, noted] of [["a covered image redirecting to the uncovered host", `GET ${covered.origin}/avatar/1 redirected to ${elsewhere}/pixel.gif?via=avatar (302) to localhost`], ["a frame from the uncovered host", `GET ${elsewhere}/frame (document) to localhost`]] as const) {
            const read = one(records, title);
            assert.equal(read.status, "Passed", `${title}: a read, not a breach: ${read.rawMessage}`);
            const readNotes = guardNotes(report.suites).get(title) ?? [];
            assert.ok(readNotes.some((note) => note.includes(noted)), `${title}: ${JSON.stringify(readNotes)}`);
        }

        assert.equal(one(records, "without the guard, the control").status, "Passed");
    } finally {
        await covered.close();
        await uncovered.close();
    }
});

test("in a real browser: outside a run, with no covered host, the guard sends nothing and fails the test saying why (TFP-220)", { skip: needsChromium, timeout: 120_000 }, async () => {
    const site = await recordingServer("127.0.0.1", (_path, res) => res.writeHead(200, { "content-type": "text/html" }).end(html("<h1>Notes</h1><form method=\"post\" action=\"/\"><input name=\"note\"><button>Save</button></form>")));
    try {
        const code = `import { test } from '@playwright/test';

test.use({ baseURL: '${site.origin}' });

${ACTIVE_GUARD_HELPER}

test('no covered host', async ({ page }) => {
  await tfActiveWrap(page);
  await page.goto('/');
  await tfActiveGuarded(page, async () => {
    await page.locator('input').fill('payload');
    await page.getByRole('button', { name: 'Save' }).click();
  });
});
`;
        const { report } = await runPlaywrightSpec(code, "active-guard-none", ["--timeout=30000", "--workers=1"], { MRONION_ACTIVE_HOSTS: undefined });
        const record = one(flattenSuites(report.suites), "no covered host");
        assert.equal(record.status, "Failed");
        assert.match(record.rawMessage, /covered-host guard: the run named no host its active tests may reach/);
        assert.deepEqual(site.recorded.map((request) => request.method), ["GET"], "the page loaded, and nothing was posted");
    } finally {
        await site.close();
    }
});
