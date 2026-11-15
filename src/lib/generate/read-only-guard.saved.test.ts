/**
 * TFP-287 (owner rulings, 2026-11-14 and 2026-11-15): the read-only guard's dormant wrapper, in a real browser on the
 * comparison fixture behind the recording proxy, so what reached the server is measured, not assumed. Split from
 * read-only-guard.test.ts, which holds the guard's earlier cases (TFP-181, TFP-199, TFP-284), for the 500-line limit.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/generate/read-only-guard.saved.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import type { ExecutionRecord, JsonSuite } from "../report/types.ts";

const { READ_ONLY_GUARD_HELPER } = await import("./read-only-guard.ts");
const { flattenSuites } = await import("../report/execution.ts");
const { findTypeErrors } = await import("./validate.ts");
const { startRecordedFixture } = await import("../../test-support/comparison-fixture.ts");
const { chromiumSkipReason } = await import("../../test-support/chromium.ts");
const { runPlaywrightSpec } = await import("../../test-support/playwright-cli.ts");
const needsChromium = await chromiumSkipReason();

const one = (records: ExecutionRecord[], title: string) => {
    const found = records.filter((record) => record.title.endsWith(title));
    assert.equal(found.length, 1, `${title}: ${found.length} matches in ${records.map((record) => record.title).join(" | ")}`);
    return found[0];
};

/**
 * TFP-287 (owner ruling, 2026-11-14, closing #35): TFP-284's stub replaces sendBeacon, fetch and fetchLater when the
 * guard arms, after the page has loaded, so a page script that saved its own reference at load (as an analytics
 * script can) called the original. Measured on 1.62.1: its requests, sent as the page is left, reached the server.
 * A dormant wrapper is installed by an init script before the test's first navigation (tfReadOnlyWrap), so the page
 * saves the wrapper; the guard switches it on. The page's script here is an init script added after the wrapper's,
 * which runs before any script of the page's own, so it is the earliest a page could save a reference.
 * - Saved references used under the guard: a beacon and a keepalive POST as the page is left, and a fetchLater POST
 *   while it is alive. Nothing but GETs reaches the server, and the fetchLater POST (made while the page is alive,
 *   so nothing races it) is named as a breach. Whether the pagehide requests are named is Chromium's timing (TFP-208).
 * - The same saved references used at load, before the guard arms, with and without the wrapper: every one reaches
 *   the server, so the wrapper changes nothing until the guard arms.
 */
test("in a real browser: references to sendBeacon, fetch and fetchLater a page saves at load are stopped once the guard arms, and pass through before it (TFP-287)", { skip: needsChromium }, async () => {
    const fixture = await startRecordedFixture();
    try {
        const code = `import { test, expect } from '@playwright/test';

test.use({ baseURL: '${fixture.origin}' });

${READ_ONLY_GUARD_HELPER}

// A page's own script, at load: it keeps its own references, and sends with them later.
const savesReferences = (tag: string) => {
  if (location.pathname !== '/store') return;
  const scope = window as unknown as { fetchLater?: (url: string, init: RequestInit & { activateAfter?: number }) => unknown; __sendSaved?: (when: string) => void; __queueSaved?: (when: string) => void };
  const beacon = navigator.sendBeacon.bind(navigator);
  const send = window.fetch;
  const later = scope.fetchLater;
  scope.__sendSaved = (when: string) => {
    beacon('/api/store/cart?' + tag + '-' + when + '-beacon', '{}');
    send('/api/store/cart?' + tag + '-' + when + '-fetch', { method: 'POST', body: '{}', keepalive: true }).catch(() => undefined);
  };
  scope.__queueSaved = (when: string) => { later!('/api/store/cart?' + tag + '-' + when + '-later', { method: 'POST', body: '{}', activateAfter: 0 }); };
  addEventListener('pagehide', () => scope.__sendSaved!('left'));
};
type Saved = { __sendSaved: (when: string) => void; __queueSaved: (when: string) => void };

test('saved references, then a link', async ({ page }) => {
  await tfReadOnlyWrap(page);
  await page.addInitScript(savesReferences, 'guarded');
  await page.goto('/store');
  await tfReadOnlyGuarded(page, async () => {
    await page.evaluate(() => (window as unknown as Saved).__queueSaved('armed'));
    await page.getByRole('link', { name: 'Notes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
  });
});

for (const wrapped of [true, false]) {
  test('saved references at load, ' + (wrapped ? 'with' : 'without') + ' the wrapper', async ({ page }) => {
    if (wrapped) await tfReadOnlyWrap(page);
    await page.addInitScript(savesReferences, wrapped ? 'wrapped' : 'bare');
    await page.goto('/store');
    await page.evaluate(() => { (window as unknown as Saved).__sendSaved('load'); (window as unknown as Saved).__queueSaved('load'); });
  });
}
`;
        assert.deepEqual(findTypeErrors(code), []);
        const { report } = await runPlaywrightSpec(code, "read-only-guard-saved", ["--timeout=30000", "--workers=1"]);
        const records = flattenSuites(report.suites);
        const posts = () => fixture.recorded.filter((request) => request.method !== "GET").map((request) => `${request.method} ${request.path}`).sort();
        const atLoad = ["bare", "wrapped"].flatMap((tag) => ["beacon", "fetch", "later"].map((kind) => `POST /api/store/cart?${tag}-load-${kind}`)).sort();
        // A beacon can land a moment after the run ends: wait for the load-time ones, at most 5 s.
        for (const start = Date.now(); Date.now() - start < 5000 && !atLoad.every((post) => posts().includes(post)); ) await new Promise((resolve) => setTimeout(resolve, 100));

        assert.deepEqual(posts(), atLoad, "only the load-time requests reached the server, every one of them, with or without the wrapper");

        const guarded = one(records, "saved references, then a link");
        assert.equal(guarded.status, "Failed", guarded.rawMessage);
        assert.ok(guarded.rawMessage.includes(`POST ${fixture.origin}/api/store/cart?guarded-armed-later`), `the saved fetchLater's POST is a breach: ${guarded.rawMessage}`);
        for (const wrapped of ["with", "without"]) {
            const load = one(records, `saved references at load, ${wrapped} the wrapper`);
            assert.equal(load.status, "Passed", load.rawMessage);
        }
    } finally {
        await fixture.close();
    }
});

/**
 * TFP-287 (owner rulings, 2026-11-15), the fresh-context review's two findings and one measurement, all at the
 * server. Each case sends a keepalive POST as the page is left under the guard (what the route's abort no longer
 * stops) and, where it applies, queues a fetchLater POST while the page is alive (named every time).
 * - A Request made in another frame: `instanceof Request` is false for it, so the guard read neither its method nor
 *   its keepalive. The guard now reads method, keepalive and url from any Request-like object.
 * - The page writes the guard's armed flag: it was a property of window.__tfGuard. The flag is now private to the
 *   wrapper, which exposes only a one-way arm function the page can't replace.
 * - A fresh about:blank iframe's own fetch, taken under the guard: a new realm. Measured: Playwright runs init scripts
 *   there too, so its fetch is the wrapper and its POST doesn't reach the server.
 * - A fetchLater queued while the page loads, before the guard arms: measured reaching the server as the page is left
 *   under the guard. Known limitation 12 (listed, not fixed: the load stays unjudged); the case pins it.
 */
test("in a real browser: a Request from another frame and a page writing the guard's state don't get past it, nor a fresh about:blank iframe's fetch; a fetchLater queued at load does (known limitation 12) (TFP-287)", { skip: needsChromium }, async () => {
    const fixture = await startRecordedFixture();
    try {
        const code = `import { test, expect } from '@playwright/test';

test.use({ baseURL: '${fixture.origin}' });

${READ_ONLY_GUARD_HELPER}

type Later = { fetchLater: (input: RequestInfo, init?: RequestInit) => unknown };
const leave = async (page: import('@playwright/test').Page) => {
  await page.getByRole('link', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
};

test('a Request from another frame', async ({ page }) => {
  await tfReadOnlyWrap(page);
  await page.goto('/store');
  await page.evaluate(() => new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.src = '/notes';
    frame.onload = () => resolve();
    document.body.append(frame);
  }));
  await tfReadOnlyGuarded(page, async () => {
    await page.evaluate(() => {
      const Other = (window.frames[0] as unknown as typeof window).Request;
      const sent = new Other('/api/store/cart?cross-fetch', { method: 'POST', body: '{}', keepalive: true });
      addEventListener('pagehide', () => { fetch(sent).catch(() => undefined); });
      (window as unknown as Later).fetchLater(new Other('/api/store/cart?cross-later', { method: 'POST', body: '{}' }));
    });
    await leave(page);
  });
});

test('the page writes the guard state', async ({ page }) => {
  await tfReadOnlyWrap(page);
  await page.goto('/store');
  await tfReadOnlyGuarded(page, async () => {
    await page.evaluate(() => {
      const scope = window as unknown as Record<string, unknown>;
      // Everything the guard leaves on window that the page could switch off.
      const guard = scope.__tfGuard as { armed?: boolean } | undefined;
      if (guard) guard.armed = false;
      scope.__tfGuardArm = () => false;
      addEventListener('pagehide', () => {
        fetch('/api/store/cart?unarmed-fetch', { method: 'POST', body: '{}', keepalive: true }).catch(() => undefined);
      });
      (window as unknown as Later).fetchLater('/api/store/cart?unarmed-later', { method: 'POST', body: '{}' });
    });
    await leave(page);
  });
});

test('a fresh about:blank iframe', async ({ page }) => {
  await tfReadOnlyWrap(page);
  await page.goto('/store');
  await tfReadOnlyGuarded(page, async () => {
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const send = (frame.contentWindow as unknown as typeof window).fetch;
      addEventListener('pagehide', () => { send('/api/store/cart?blank-fetch', { method: 'POST', body: '{}', keepalive: true }).catch(() => undefined); });
      // Whether the frame's fetch is the browser's own or the guard's wrapper, read before the page is left.
      return /native code/.test(String(send)) ? 'native' : 'wrapped';
    }).then((fetchIs) => test.info().annotations.push({ type: 'blank-frame-fetch', description: fetchIs }));
    await leave(page);
  });
});

test('a fetchLater queued while the page loads', async ({ page }) => {
  await tfReadOnlyWrap(page);
  await page.goto('/store');
  await page.evaluate(() => { (window as unknown as Later).fetchLater('/api/store/cart?loaded-later', { method: 'POST', body: '{}' }); });
  await tfReadOnlyGuarded(page, async () => { await leave(page); });
});
`;
        assert.deepEqual(findTypeErrors(code), []);
        const { report } = await runPlaywrightSpec(code, "read-only-guard-realms", ["--timeout=30000", "--workers=1"]);
        const records = flattenSuites(report.suites);
        // A keepalive request can land a moment after its test ends: give the server 3 s.
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const posts = fixture.recorded.filter((request) => request.method !== "GET").map((request) => `${request.method} ${request.path}`).sort();
        assert.deepEqual(posts.filter((post) => /\?(cross|unarmed)-/.test(post)), [], "no request from another frame's Request, or from a page that wrote the guard's state, reached the server");
        for (const [title, tag] of [["a Request from another frame", "cross"], ["the page writes the guard state", "unarmed"]]) {
            const record = one(records, title);
            assert.equal(record.status, "Failed", record.rawMessage);
            assert.ok(record.rawMessage.includes(`POST ${fixture.origin}/api/store/cart?${tag}-later`), `${title}: its fetchLater POST is a breach: ${record.rawMessage}`);
        }
        // Measured on 1.62.1 (2026-11-15): Playwright runs init scripts in a fresh about:blank iframe too, so its fetch is
        // the guard's wrapper, armed, and its keepalive POST doesn't reach the server. Not a known limitation.
        const blank = one(records, "a fresh about:blank iframe");
        assert.equal(blank.status, "Passed", blank.rawMessage);
        const blankFetch: string[] = [];
        const walk = (list: JsonSuite[]): void => list.forEach((suite) => {
            suite.specs.filter((spec) => spec.title === "a fresh about:blank iframe").forEach((spec) => blankFetch.push(...spec.tests.flatMap((t) => t.annotations ?? []).filter((a) => a.type === "blank-frame-fetch").map((a) => a.description ?? "")));
            walk(suite.suites ?? []);
        });
        walk(report.suites);
        assert.deepEqual(blankFetch, ["wrapped"], "the about:blank frame's fetch is the guard's wrapper");
        assert.deepEqual(posts.filter((post) => post.includes("?blank-")), [], "the about:blank frame's keepalive POST didn't reach the server");
        // Known limitation 12 (owner ruling, 2026-11-15: listed, not fixed): a fetchLater queued during the load, before
        // the guard arms, is the load's, so the wrapper passes it; the browser sends it as the page is left under the
        // guard, past the route's abort, and the guard never sees it. This pins what happens today.
        const loaded = one(records, "a fetchLater queued while the page loads");
        assert.equal(loaded.status, "Passed", loaded.rawMessage);
        assert.deepEqual(posts.filter((post) => post.includes("?loaded-")), ["POST /api/store/cart?loaded-later"], "known limitation 12: the load's fetchLater reaches the server");
    } finally {
        await fixture.close();
    }
});
