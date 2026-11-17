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

- **Status:** Not started.
- **Scope (the owner's words):** "Renew" becomes "Change or renew",
  pre-filled from the current confirmation (hosts, basis, name, ticks;
  expiry back to the 90-day default), except the statement tick and the
  contact email, which are retyped. Saving makes a new confirmation; the
  old one goes to the history. In the app, a closed gate's reason points
  to the lookup, not `docs/SITE_OWNERSHIP.md`; reports keep the docs
  path.

## TFP-296 (C) — The projected time; "55 of 56" against "55 total"

- **Status:** Not started.
- **Scope (the owner's words):** the projected remaining time counts down
  once a second, re-estimates as tests finish, and moves only when the
  new estimate differs by more than 10 seconds or 10%. Find and fix why
  progress showed "55 of 56" while the planned list said "55 total" on an
  active-switch run.

## TFP-297 (D) — Guard notes that name a host the site's crawl recorded

- **Status:** Not started. Changes the template: its difference is shown
  and waits for the owner's acceptance.
- **Scope (the owner's words):** when the covered-host guard stops a read
  to a host the site's saved crawl recorded, the test's note carries
  ruling 4's warning and says "add <host> to this site's confirmation".
  Third-party hosts stay plain notes. The payload test's expected result
  says what it checks, e.g. "the script typed into Search on / is not
  executed".

## TFP-298 (E) — The pool and the promotion screen

- **Status:** Not started.
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
