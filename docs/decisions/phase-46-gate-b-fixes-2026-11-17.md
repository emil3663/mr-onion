# Phase 46, Gate B: fixes from the owner's walkthrough (2026-11-17)

Status: **Owner decision (Emil, 2026-11-17).** Gate B waits for these
fixes, one at a time, each seen failing first, in the order A, B, E, C,
D (D changes the template: its difference is shown and waits for the
owner's acceptance). Then a short re-walk of the changed screens and the
owner's Gate B ruling. TFP-292 follows.

Record: `phase-46-app-screens-decision-record.md` (Gate B). The
walkthrough itself: the owner, on a production build of `152bd93`
served on `127.0.0.1:3100`, against the local Toolshop (`sprint5`) and,
as the remote site, the Toolshop's UI forwarded to this machine's LAN
address (`192.168.1.17:4201`). Its temporary folders were removed
afterwards; the run record the walkthrough left is kept outside the
repo as evidence for C and TFP-299.

The owner's answers before the re-walk (2026-11-18): B, a withdrawn
confirmation opens pre-filled too (built, below); E, withdrawn approvals
stay on record; C, either threshold; D, as built (the third-party script
warning, ruling 4, kept). No version tag until TFP-292 is done: 0.5.0
ships Phases 43 and 46 with that fix.

## TFP-294 (A) — One header; the site lookup as a modal; the suite kept for the session

- **Status:** Built (2026-11-17). Stopped for the re-walk.
- **Problem it solves:** each page had its own header, with no way back
  to the run page but the logo text; the run form's lookup opened a new
  tab; leaving the run page lost the generated suite; and an empty
  lookup entry said "Nothing saved for this site", though the walkthrough
  showed `http://192.168.1.17` (port 80) and `:4201` are different sites.
- **Scope (the owner's words):** one header on every page: "Mr Onion"
  with a home icon (accessible name "Mr Onion: home"), and links Run,
  Site lookup and Candidate tests, the current page marked. On the run
  page, the site lookup opens as a modal pre-searched with the Base URL;
  closing it makes the active switch re-read the gate. The generated
  suite is kept for the session (sessionStorage). The /sites page stays
  for direct visits. An empty entry names its port: "Nothing saved for
  http://192.168.1.17 (port 80)".
- **As built:**
  - `SiteHeader` on all three pages; the current page has
    `aria-current="page"`; the run page's Help is the header's action.
  - `SiteLookupDialog`: the run form's lookup and the active switch's
    link each open the lookup in a native `<dialog>`, searched for the
    target; it doesn't change the page's address; closing it fires an
    event the switch reads the gate again on.
  - `useSessionState` (sessionStorage, through `useSyncExternalStore`,
    so the server's render and hydration use the defaults): the run
    form's inputs, the crawl's selection and the generated suite with its
    signatures, so Run is ready on return, after a reload too. Not kept:
    the interactive and active switches (asked for each time), a run's
    progress or report, and the login inputs (a credential pasted where a
    variable name belongs mustn't be stored). A fresh page with a kept
    suite counts as having code; one left during a run follows that run
    (its id is kept) rather than offering Run.
- **Found by the fresh-context review and fixed, red first where it could
  fail:**
  - A generation still answering for a page that was left could write
    the session after a newer one: a setter does nothing once its
    component unmounted.
  - The session test passed on the page's memory alone: it reloads and
    reads sessionStorage now (red with storage never written).
  - A page left during a run offered Run while it went on: the run id is
    kept, and the page follows it (red with the id in plain state).
  - A refused write left half a suite: a group's keys are kept, or
    dropped from storage, together. Each key is read from storage once.
  - The login inputs aren't kept. Two dialogs had one heading id. Escape
    no longer closes the modal over an open confirmation form (red
    without the guard), and a change saved in it prompts the switch to
    read again. The header's links and Help wrap together; `/sitesX`
    isn't Site lookup. Whether the suite was saved is kept with it.
  - Accepted: on a reload the form fills in just after the first paint
    (the server can't know the session).
- **Acceptance criteria:** RUN-76.

## TFP-295 (B) — "Change or renew", pre-filled; the lookup in a closed gate's reason

- **Status:** Built (2026-11-17). Stopped for the re-walk.
- **As built:**
  - "Change or renew" (for a valid or an expired confirmation) opens the
    form pre-filled from the current one: hosts, basis, name, the active
    and load ticks; the expiry back to the 90-day default. The statement
    tick starts off and the contact email empty (the API gives it masked
    only); saving ("Save the change") makes a new confirmation, and the
    API keeps the old one in the history, as it did.
  - `closedReasonInApp` (`src/lib/run/active-gate.ts`): the reasons
    `GET /api/site-ownership` gives the app's switch end "in the site
    lookup", never the docs path. A run's own reasons, and its report's,
    are unchanged (`closedReason`, with `docs/SITE_OWNERSHIP.md`).
  - Found by the fresh-context review and fixed: a host from the current
    confirmation that the site no longer records gets its own note, not
    "a typing error"; the form starts afresh when another confirmation is
    read while it is open; an expired confirmation's change is tested.
- **The owner's answer (2026-11-18):** a *withdrawn* confirmation
  opens pre-filled too, the statement tick and the email excepted. It is
  a new confirmation, so the button stays "Confirm ownership" and the
  form "Confirm ownership or permission", saying it starts from the
  withdrawn one (`SiteLookup.tsx`, `ConfirmationForm.tsx`).
- **Acceptance criteria:** RUN-74 (the change), RUN-75 (the reasons).
- **Scope (the owner's words):** "Renew" becomes "Change or renew",
  pre-filled from the current confirmation (hosts, basis, name, ticks;
  expiry back to the 90-day default), except the statement tick and the
  contact email, which are retyped. Saving makes a new confirmation; the
  old one goes to the history. In the app, a closed gate's reason points
  to the lookup, not `docs/SITE_OWNERSHIP.md`; reports keep the docs
  path.

## TFP-296 (C) — The projected time; "55 of 56" against "55 total"

- **Status:** Built (2026-11-17). Stopped for the re-walk.
- **Why "55 of 56" against "55 total":** a run is two Playwright passes,
  the read-only units then the serial group (TFP-156). With active tests
  on, the payload test runs in the second. The total came from the
  suite's declared tests (56); the planned list from the first pass's
  start (55), and the second pass's start then *replaced* it with its own
  1 test, which is why the walkthrough's saved run had 1 planned test.
  Reproduced on the build before, through a two-pass run: "0 of 12" with
  "11 total".
- **As built:**
  - The planned list is seeded before the run with every runnable test
    (`plannedPlaceholders`, from the run selection's titles, once per
    browser project), and each pass's tests take their places by title;
    a test no place is seeded for is added. So the list's total is the
    progress's from the start.
  - The projected remaining time (`src/app/_lib/projection.ts`, shown by
    `useProjectedRemaining` in the overlay) counts down once a second, is
    estimated again only when a test finishes, and moves only when the new
    estimate differs from what's shown by more than 10 s or more than
    10%. It is shown to the second ("1m 20s"), so the countdown shows; at
    zero with tests still going, "Finishing...".
- **Found by the fresh-context review and fixed:** a title the reporter
  writes otherwise (an escape, a template) or a phantom match (`.test(`)
  left a seeded place nothing took, raising the total: only plain
  literal titles are seeded, the title regex no longer reads `.test(`,
  and at a run's end untaken places are dropped (a stopped run keeps
  them, Not run). Places are seeded in the order the passes run. The
  overlay's old remaining label is gone from `derive.ts`.
- **The owner's answer (2026-11-18):** either threshold, as built: it
  moves past 10 seconds or past 10%, whichever comes first.
- **Acceptance criteria:** RUN-78.
- **Scope (the owner's words):** the projected remaining time counts down
  once a second, re-estimates as tests finish, and moves only when the
  new estimate differs by more than 10 seconds or 10%. Find and fix why
  progress showed "55 of 56" while the planned list said "55 total" on an
  active-switch run.

## TFP-297 (D) — Guard notes that name a host the site's crawl recorded

- **Status:** Built (2026-11-17). Stopped for the re-walk. The template
  difference was accepted (owner, 2026-11-18): the guard's warning, hint
  and beacon lines only, in the 2 page-data security inputs of 172. The
  breach hint on a redirect to a site host was tested red first before
  the commit, as asked then.
- **As built:**
  - The run passes the site's own hosts to its tests as
    `MRONION_SITE_HOSTS` (`src/lib/run/executor.ts`), always set, `""`
    when the active gate is closed, never the covered hosts.
  - The guard (`ACTIVE_GUARD_HELPER`) names one of them in its note when
    it stops a read there: "`<host>` is one of this site's hosts, so the
    result may not reflect the page as visitors see it: add `<host>` to
    this site's confirmation". When a stopped script already says the
    result may not reflect the page, it is said once. A beacon, a
    keepalive fetch or a `fetchLater` stopped there gets no warning: it
    doesn't change the page. A breach to one names it in the failure:
    "... add `<host>` to this site's confirmation to test with it".
  - The payload test's expected result: "the script typed into
    {fields} on {path} is not executed" (`buildExecutionDescription`).
- **The D1 ruling (owner, 2026-11-17), after the fresh-context review
  found the first build counted every host the crawl recorded, so a
  tag manager's host was "one of this site's hosts":**
  - A host is the site's own when it is same-site with the target: the
    same registrable domain by the Public Suffix List, through `tldts`
    (a new dependency, owner-accepted; pinned at 7.4.19, its
    `tldts-core` by an override; in `THIRD_PARTY_NOTICES.md`, with the
    list's MPL 2.0). IPs and `localhost` match exactly. The hosts of
    crawled pages always count. Everything else stays a plain note
    (`src/lib/ownership/site-hosts.ts`).
  - The review's D2 to D6, as proposed: the third-party check now runs
    beside a site host; beacons get no warning; the warning is said
    once; a breach gets the hint; the port isn't compared.
  - What isn't caught is known limitation 16: a page on an IP reading
    from `localhost`, and an API on an unrelated domain.
- **Acceptance criteria:** RUN-79.
- **Scope (the owner's words):** when the covered-host guard stops a read
  to a host the site's saved crawl recorded, the test's note carries
  ruling 4's warning and says "add `<host>` to this site's confirmation".
  Third-party hosts stay plain notes. The payload test's expected result
  says what it checks, e.g. "the script typed into Search on / is not
  executed".

## TFP-298 (E) — The pool and the promotion screen

- **Status:** Built (2026-11-17). Stopped for the re-walk.
- **As built:**
  - `loadDecidablePool` and `poolProblems` (`src/lib/candidates/pool.ts`):
    only a candidate in `<id>.json` whose id is `candidateId(pattern)`
    is offered. The others (that id wrong, the file misnamed, not JSON)
    come back from `GET /api/candidates` as `problems`, each with why,
    and the screen lists them under "Not offered".
  - The API's refusals, as the screen shows them, are plain: "Type your
    name to approve: the approval records who made it.", "Type a reason
    first: it is kept with the candidate.", "This candidate was already
    approved, so it can't be approved again.", "This candidate doesn't
    meet the promotion rule yet: ...", "There is no such candidate in
    the pool: ...".
  - Each waiting candidate has "Withdraw approval" with "Reason to
    withdraw", through `POST /api/candidates` `reject`, which already
    took an approved candidate.
- **Found by the fresh-context review and fixed, red first:** the first
  build checked only the offer, so a misnamed *approved* file was still
  waiting (and refused), `library:promote` would have committed it, and a
  misfiled copy could be bound into runs or overwrite a real rejection.
  `loadPool` itself now gives only well-formed candidates, so the screen,
  promotion, binding and the gap writer read one pool; the promote script
  lists what it skipped. A withdrawal sends `from: "approved"` and is
  refused once the candidate changed (another tab, or promotion first);
  `reject` refuses a rejected one; promotion re-reads before it saves;
  a withdrawn approval keeps `approved` and records `withdrawn`. The last
  technical refusals (labels, the route's own, the screen's fallbacks, a
  save that fails) are in words.
- **The owner's answer (2026-11-18):** keep withdrawn approvals on
  record beside the rejection (`approved` and `withdrawn`), as built.
- **Acceptance criteria:** RUN-70 (updated), RUN-77.
- **Scope (the owner's words):** the pool doesn't offer a candidate whose
  id isn't `candidateId(pattern)`; it reports it instead. API refusals on
  the candidate screen are in plain words. The waiting list gets
  "Withdraw approval", with a reason, through the API's reject.

## TFP-299 — TFFU-030 (link types) fails on the local Toolshop

- **Status:** Not placed. Ticketed because it fails against
  `http://localhost:4200` directly, not only through the walkthrough's
  LAN forwarder (the owner's condition).
- **Problem it solves:** in the walkthrough's run on
  `http://192.168.1.17:4201`, TFFU-030 ("link types: internal, external,
  anchor, mailto, and download links are classified correctly") failed:
  `getByRole('link', { name: 'Combination Pliers ABCDE$14.15', exact:
  true })` was not visible within 2000 ms. A Standard functional suite
  generated for `http://localhost:4200` directly (inspection of `/`,
  then that test alone, 2026-11-17) failed the same way, with the same
  locator. Not diagnosed here: whether the product cards' accessible
  names change between inspection and run (the Toolshop's list loads
  after the page, and its order or prices may differ), or the 2 s wait
  is too short for them.
- **Acceptance criteria:** the cause is found and stated; the test
  passes on the clean local Toolshop (`sprint5`), or the template stops
  asserting a name that isn't stable; a false failure recorded in
  `labelled-failures.md` with its evidence.
