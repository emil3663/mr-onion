/**
 * Phase 43 (TFP-220, Decision 9; review item 4): the covered-host guard. An active test - today the script-payload
 * test - reaches only the hosts the run's gate covers: the target host when it is local (Decision 7), and every host
 * of the site's valid confirmation with the active tick. The run gives them to its tests as `MRONION_ACTIVE_HOSTS`,
 * always set by the executor, never inherited (src/lib/run/active-gate.ts). Attack-shaped input sent to a host nobody
 * confirmed is what the confirmation exists to prevent, through a form's `action`, a redirect or a page's script.
 *
 * While the guard is armed, on the test's browser context (so a popup is covered too):
 * - a request to an uncovered host is aborted before it leaves the browser;
 * - a request to a covered host is sent by the guard itself, with redirects off, and each redirect hop is checked and
 *   followed by the guard: measured on Chromium 151 (Playwright 1.62.1), a redirect's later hops are never routed, so
 *   a 307 from a covered host carried a form's body to an uncovered one, and a fulfilled 3xx was followed by the
 *   browser unrouted, so two hops (covered, covered, uncovered) got through as well. A hop to an uncovered host is
 *   aborted;
 * - `sendBeacon`, a keepalive `fetch` and `fetchLater` are stopped in the page, whatever their host, and handed to the
 *   guard: the route can't stop them as a page is left (TFP-284), `fetchLater` is never routed at all (measured), and
 *   the guard can't follow their redirects. As the read-only guard's (TFP-287), the wrappers are installed dormant by
 *   an init script before the test's first navigation (tfActiveWrap), so what a page saves at load is the wrapper.
 *
 * What fails the test as a guard breach, naming the host: a page's navigation (a popup's too) to an uncovered host
 * (a form's action, a link, a script's location change, a redirect), and any request but GET, HEAD and QUERY to one.
 * What is stopped and noted, not a breach: a read of an uncovered host (an image, a script, a font, a frame's page,
 * a covered image that redirects there), a beacon (TFP-199's class: a site's analytics as a page navigates), and a
 * beacon, keepalive fetch or fetchLater to a covered host. Nothing reaches an uncovered host either way. (The
 * fresh-context review's findings: a covered image redirecting to a CDN, and a captcha's frame, failed the test.)
 *
 * Not covered, as with the read-only guard and the request cap: a service worker's own requests, and WebSockets,
 * which Playwright doesn't route.
 *
 * Generated code, kept as a raw string like the read-only guard, so it reaches the generated file exactly as written.
 */
export const ACTIVE_GUARD_HELPER = String.raw`// TFP-220: in a frame, wraps sendBeacon, fetch and fetchLater once, dormant: every call passes through. Armed (a one-way
// switch the page can't replace), every sendBeacon, keepalive fetch and fetchLater is stopped and handed to the
// covered-host guard, which the route can't do for them.
const tfActiveFrame = (arm: boolean) => {
  type Later = (input: RequestInfo | URL, init?: RequestInit) => { activated: boolean };
  const scope = window as unknown as { __tfActiveRequest?: (method: string, url: string, type: string) => void; __tfActiveArm?: () => boolean; fetchLater?: Later };
  if (!scope.__tfActiveArm) {
    let armed = false;
    Object.defineProperty(scope, '__tfActiveArm', { value: () => (armed ? false : (armed = true)) });
    const requestOf = (input: RequestInfo | URL) => (input && typeof input === 'object' && typeof (input as Request).method === 'string' && typeof (input as Request).url === 'string' ? (input as Request) : null);
    const stopped = (method: string, url: string, type: string) => scope.__tfActiveRequest?.(method, new URL(url, location.href).href, type);
    const beacon = Navigator.prototype.sendBeacon;
    Navigator.prototype.sendBeacon = function (this: Navigator, url: string | URL, data?: BodyInit | null) {
      if (!armed) return beacon.call(this, url, data);
      stopped('POST', String(url), 'ping');
      return true;
    };
    const send = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input);
      if (armed && (init?.keepalive ?? request?.keepalive)) {
        stopped(String(init?.method ?? request?.method ?? 'GET').toUpperCase(), request ? request.url : String(input), 'fetch');
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return send.call(window, input, init);
    };
    const later = scope.fetchLater;
    if (later) scope.fetchLater = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!armed) return later.call(window, input, init);
      const request = requestOf(input);
      stopped(String(init?.method ?? request?.method ?? 'GET').toUpperCase(), request ? request.url : String(input), 'fetchLater');
      return { activated: false };
    };
  }
  if (arm) scope.__tfActiveArm!();
};

// TFP-220: an active test calls this before its first navigation, so every frame of every page in its context gets the
// dormant wrappers before the page's own scripts run. Nothing changes until tfActiveGuarded arms them.
async function tfActiveWrap(page: import('@playwright/test').Page) {
  await page.context().addInitScript(tfActiveFrame, false);
}

// TFP-220 (Phase 43 Decision 9): an active test sends its input here. It reaches only the hosts the run's active gate
// covers (MRONION_ACTIVE_HOSTS); anything sent elsewhere is stopped, and a navigation, a redirect or a write to an
// uncovered host fails the test as a guard breach, naming the host.
async function tfActiveGuarded(page: import('@playwright/test').Page, interact: () => Promise<void>) {
  const hosts = (process.env.MRONION_ACTIVE_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (hosts.length === 0) throw new Error('covered-host guard: the run named no host its active tests may reach (MRONION_ACTIVE_HOSTS), so nothing was sent');
  const context = page.context();
  const breaches: string[] = [];
  const stopped: string[] = [];
  const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };
  const covered = (url: string) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return true; }
    return !['http:', 'https:'].includes(parsed.protocol) || hosts.includes(parsed.hostname.toLowerCase());
  };
  // A page's own navigation (a popup's too), not a frame's: a captcha's challenge or an embedded video is a read.
  const topLevel = (request: import('@playwright/test').Request) => {
    // A popup's first navigation has no frame to read yet (measured: without this it was judged a frame's), so an
    // unknown frame counts as a page's.
    try { return request.isNavigationRequest() && request.frame().parentFrame() === null; } catch { return request.isNavigationRequest(); }
  };
  // What can carry the test's input to another host: a page's navigation, or a write (any method but GET, HEAD and QUERY).
  const carries = (request: import('@playwright/test').Request, method: string) => topLevel(request) || !['GET', 'HEAD', 'QUERY'].includes(method.toUpperCase());
  const judge = (method: string, url: string, type: string, navigation: boolean) => {
    if (covered(url)) {
      stopped.push(method + ' ' + url + ' (' + type + ', which the guard can\'t follow)');
      return;
    }
    const breach = navigation || (type !== 'ping' && !['GET', 'HEAD', 'QUERY'].includes(method.toUpperCase()));
    (breach ? breaches : stopped).push(method + ' ' + url + ' (' + (navigation ? 'navigation' : type) + ') to ' + hostOf(url));
  };
  await context.exposeBinding('__tfActiveRequest', (_source, method: string, url: string, type: string) => judge(method, url, type, false));
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (!covered(request.url())) {
      judge(request.method(), request.url(), request.resourceType(), topLevel(request));
      return route.abort('blockedbyclient');
    }
    // Sent by the guard, each redirect hop checked: the browser's own later hops are never routed (measured).
    let url = request.url();
    let method = request.method();
    let postData: Buffer | string | undefined = request.postDataBuffer() ?? undefined;
    for (let hop = 0; hop <= 20; hop++) {
      let response: import('@playwright/test').APIResponse;
      try {
        response = await route.fetch({ url, method, postData, maxRedirects: 0 });
      } catch (error) {
        if (hop > 0) breaches.push('a redirect from ' + request.url() + ' to ' + url + ' the guard could not follow (' + String(error).split('\n')[0] + ')');
        return route.abort('failed').catch(() => undefined);
      }
      const location = response.headers()['location'];
      if (response.status() < 300 || response.status() > 399 || !location) return route.fulfill({ response });
      const next = new URL(location, url).href;
      if (!covered(next)) {
        // Judged as the request it would become: a covered image redirected to a CDN is a read, noted.
        const what = method + ' ' + url + ' redirected to ' + next + ' (' + response.status() + ') to ' + hostOf(next);
        (carries(request, method) ? breaches : stopped).push(what);
        return route.abort('blockedbyclient');
      }
      if ([301, 302, 303].includes(response.status()) && !['GET', 'HEAD'].includes(method)) {
        method = 'GET';
        postData = '';
      }
      url = next;
    }
    breaches.push('more than 20 redirects from ' + request.url());
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(tfActiveFrame, true);
  for (const open of context.pages()) for (const frame of open.frames()) await frame.evaluate(tfActiveFrame, true).catch(() => undefined); // a frame gone since
  let failure: unknown = null;
  try {
    await interact();
  } catch (error) {
    failure = error;
  }
  if (stopped.length > 0) test.info().annotations.push({ type: 'note', description: 'covered-host guard: stopped ' + stopped.length + ' request(s), not a breach: ' + [...new Set(stopped)].join('; ') });
  expect(breaches, 'covered-host guard breach, stopped: ' + breaches.join('; ') + ' (an active test reaches only the hosts the site\'s ownership confirmation covers: ' + hosts.join(', ') + ')').toEqual([]);
  if (failure) throw failure;
}`;
