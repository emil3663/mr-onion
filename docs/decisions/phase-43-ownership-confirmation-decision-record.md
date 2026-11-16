# Phase 43 Decision Record — Ownership Confirmation, Once per Site, and the Active Gate

Date: 2026-10-19
Scope: A tester confirms once, per site, that they own the site or have
written permission to test it. TestForge saves that confirmation with the
site, and every run on the site uses it without asking again. A valid
confirmation does three things:
- opens the active gate;
- allows the opt-in load-testing run (built later, D24);
- lifts Phase 39's worker and request caps.

The script-payload test runs again behind the active gate.

Status: **Locked (Emil, 2026-10-19). Not started.**
- He decided the shape in the deferred-work triage
  (`deferred-work-register.md`, D8): Decisions 1, 3, 5 and 6, and the
  amendments to two locked records.
- He then confirmed Cowork's proposals for Decisions 2, 4, 8, 11 and 13, the
  contact email in Decision 1, Acceptance Criteria 1 to 7 and the tickets,
  all the same evening.
- Decision 14's amendments are made in Phase 35's and Phase 39's records,
  in the same change as this lock.

Order: first after Phase 39 and R4 (the triage's build order, item 1).
Tickets TFP-218 to TFP-221.

## Review before building (planning session, 2026-11-14)

This record was locked before Phase 47 (Mr Onion in CI), Phase 48 (the
rename) and TFP-284 (Chromium 151). Checked against `main` at `bc09f98`.
The design stands. These amendments apply; each says who decided it.

1. **Names (Phase 48, mechanical).** Read every setting by its new name:
   the run switch is `MRONION_ACTIVE`, the interactive switch
   `MRONION_INTERACTIVE`, the data folder's setting `MRONION_DATA_DIR`, and
   the product is Mr Onion. A run's child processes get each setting under
   both names (Phase 48 Decision 8), so this needs no extra work. The
   generated script-payload test checks the new name.
2. **The run switch is set from the run's request, never inherited.**
   (Planning session, following the interactive switch's rule in
   `src/lib/run/interactive.ts`.) The executor always sets
   `MRONION_ACTIVE` to "0" or "1" from what the run asked for. A value in
   the shell or in CI's environment can't open the gate.
3. **CI (owner decision, 2026-11-14): a confirmation lifts the caps, and
   nothing else.** The app and the CLI share one pipeline, so the CLI reads
   a confirmation from its data folder (`--data-dir`) as the app does, and a
   confirmed deployed host runs uncapped, as Phase 47 Decision 2 foresaw.
   The CLI and the action get no active switch in this phase, so no
   attack-shaped test runs in CI until TFP-249 (D31). A CLI run always sets
   `MRONION_ACTIVE=0`. TFP-220's acceptance adds: a CLI run against a
   confirmed remote fixture host is uncapped, and its active tests are Not
   run with the reason "not available in CI yet (TFP-249)". The CI guide
   gets a short section on carrying a confirmation in the data folder.
4. **The covered-host guard stops what the route can't (planning
   session).** Since Chromium 151 a route's abort doesn't stop
   `sendBeacon`, a keepalive `fetch` or `fetchLater`. Decision 9's guard is
   built on the read-only guard's page stub (TFP-284) and dormant wrapper
   (TFP-287), not on the route alone. Acceptance Criterion 3 adds a beacon,
   a keepalive POST and a `fetchLater` to the uncovered host, each shown
   not reaching it at the server.
5. **TFP-287 comes first (owner decision, 2026-11-14).** It's built and
   verified before TFP-218, so the guard has the full stub from the start.
6. **TFP-221's comparison base is today's runs, not Phase 39's.** Since
   Phase 39 the browser (Chromium 151), the guard and the template have
   moved. "Unchanged with the switch off" is measured against runs of
   `main` taken just before TFP-219 lands, on both local Toolshop copies.
   For reference, Action Gate on `f5b8e5c` gave clean 470 / 46 failed / 18
   not run and with-bugs 481 / 84 / 20. TFP-221 is a measurement session:
   ask the owner first, and batch it overnight (the register's standing
   rules).
   **The base is Action Gate's runs (owner decision, 2026-11-15), not a
   local measurement session.** Action Gate was dispatched on `main` at
   `202a17a` just before TFP-219, as run 43672714248. Its clean and
   with-bugs `report.json` files are committed under
   `benchmarks/2026-11-15-phase-43-base/`: clean 470 planned / 406 passed
   / 46 failed / 18 not run, and with-bugs 481 / 377 / 84 / 20. Both equal
   0.4.0's.
7. **Still true:** today's `ACTIVE_GATE_REASON` ("not built yet"),
   `closedGates()` in `src/lib/run/test-gates.ts`, and the confirmation
   stub `src/lib/run/ownership.ts` that `hostLimitsFor` reads in the
   executor (TFP-157). TFP-220 replaces the stub. Acceptance Criterion 6's
   template difference is measured against the current
   `TEMPLATE_BASELINE` (`0fe8ffe`).
   **Since then:** TFP-287 moved the baseline to `7ba7399`, the base
   TFP-219's template difference is measured against. TFP-219 replaces
   `ACTIVE_GATE_REASON`'s "not built yet", and `closedGates()` now takes
   the run's gate. The stub remains for TFP-220.

## Context

- **Phase 35 Decision 8 (2026-09-30)** decided the confirmation, before any
  active check existed:
  - the user types the domain;
  - they confirm they own it or have written permission;
  - it is saved with the run and shown in its report;
  - a run whose domain doesn't match doesn't start.

  It was never built.
- **Phase 38 Decision 1** put three things at the active gate:
  - attack-shaped input;
  - lockout and rate-limit probing;
  - load testing.

  **Decision 6** keeps the gate closed until the confirmation exists. Today
  `closedGates()` (`src/lib/run/test-gates.ts`) always closes it. The one
  active test, the Standard script-payload test
  (`src/lib/generate/mock/security-checks.ts`), is Not run with
  `ACTIVE_GATE_REASON`.
- **Phase 39 Decision 10** keys its host table on the same confirmation:
  - a remote host with the confirmation runs at the machine limit, with no
    request cap;
  - until this phase, TFP-157 tests that row with a stub.
- **Emil, 2026-10-19:** "a tester confirms once, not repeatedly". Saved
  with each run, the confirmation would be asked for on every run.
- **The precedent for per-site settings is Phase 42.** The gap writer's
  opt-in lives at `<data>/site-suites/<site>/settings.json`, set through
  `/api/site-settings` (API only; R5's app-screens record designs its
  screen).
- **Testing a site without permission is unauthorised security testing.**
  That is illegal in most countries, including South Africa (Phase 35
  Decision 8). The confirmation is the tester's statement. TestForge records
  it; it can't verify it.

## Decisions

1. The confirmation is saved with the site, not with the run (Emil,
   2026-10-19).
- It lives at `<data>/site-suites/<site>/ownership.json`, beside Phase 42's
  `settings.json`, in TestForge's local data folder. It is never in the
  repo.
- It records:
  - the hosts it covers, each typed by the tester;
  - its basis: "I own this site", or "I have written permission to test
    it";
  - the exact wording the tester confirmed;
  - the name of the person who confirmed;
  - their contact email (Emil, 2026-10-19);
  - the date;
  - the expiry;
  - its scopes (Decision 3);
  - when withdrawn, the date it was withdrawn.
- **The contact email** says who confirmed and how to reach them.
  - It is kept in the local file only, like the rest of the confirmation.
  - This phase sends nothing to it: TestForge has no way to send mail yet
    (TFP-217 Part B, D25).
  - D25 uses it later as the report email's default recipient, for a
    reminder before expiry, and for a notice when a confirmation is created
    or withdrawn.
- Every run on the site uses it without asking.
- Each run's record and report name the confirmation: its hosts, basis,
  name, date, expiry and scopes. The run record keeps a copy as it was when
  the run started, so a later withdrawal doesn't rewrite an old run's
  history.

2. Hosts are typed exactly. (Emil, 2026-10-19)
- Each host is a full host name, such as `shop.example.com`. A tester
  covering `api.example.com` as well types it too.
- No wildcards. `*.example.com` would cover hosts the tester never named,
  and some of those may belong to someone else, for example a hosted
  service on a customer subdomain.
- A typed host must match a host the site's crawl or target address uses.
  Otherwise it is refused, with the reason. This catches typing errors.

3. What it unlocks (Emil, 2026-10-19).
- **Always:** Phase 39's worker and request caps are lifted on the covered
  hosts (Phase 39 Decision 10's ownership row).
- **Active, its own tick:** the active gate opens on the covered hosts
  (Decision 6).
- **Load testing, its own tick:** the opt-in load-testing run (D24, its own
  record) may run. This phase stores the tick. It builds no load test.
- **Not the interactive gate.** That stays on `TESTFORGE_INTERACTIVE=1`
  with no confirmation (Phase 38 Decision 1, unchanged).

4. A valid confirmation alone doesn't make a run active. (Emil, 2026-10-19)
- The active gate opens only when two things are true:
  - the run asks for active tests: a per-run switch, `TESTFORGE_ACTIVE`,
    set by the executor to "0" or "1" as it sets `TESTFORGE_INTERACTIVE`;
  - and the target host is covered by a valid confirmation with the active
    tick, or is a local host (Decision 7).
- So a Standard run stays non-intrusive by default (Emil, October 2026).
  Confirming once removes the repeated question. It doesn't turn every
  later run into an attack run.
- The switch is a choice made per run, like interactive. It isn't a second
  confirmation.
- **Amended at Gate A (Emil, 2026-11-16): two settings, not one.**
  - `MRONION_ACTIVE` carries what the run asked for, "0" or "1".
  - `MRONION_ACTIVE_GATE` carries the executor's decision: `open`, or the
    reason the gate is closed. A generated test reads only this one.
  - The executor always sets both for the run's children, so no value in a
    shell or in CI opens the gate on its own (review item 2).

5. Expiry (Emil, 2026-10-19).
- 90 days by default.
- The tester may choose another expiry, up to 1 year from the date
  confirmed.
- An expired confirmation counts as absent.
- The report says it expired and when, so the tester knows why the caps
  came back and the active tests didn't run.

6. Withdrawal (Emil, 2026-10-19).
- A tester can withdraw it at any time.
- A withdrawn confirmation counts as absent from the next run on. The
  record keeps it, with its withdrawal date, as evidence of what was
  confirmed and when.

7. Local hosts need no confirmation (the D8 proposal, accepted
   2026-10-19).
- The local hosts are Phase 39 Decision 10's list: `localhost`,
  `127.0.0.1`, `[::1]`, `*.localhost`, `*.test`.
- On those, the active gate follows Decision 4's switch alone.
- This covers the local Docker copies of Toolshop and of other practice
  sites.
- **Amended at Gate A (Emil, 2026-11-16): the local hosts are whatever
  Phase 39's `isLocalDevelopmentHost` counts.** That adds `0.0.0.0` and the
  rest of `127.0.0.0/8` to the list above, all of them this machine.

8. When the confirmation doesn't cover a run, the run still runs. (Emil,
   2026-10-19)
- At the start of a run that asks for active tests, TestForge checks the
  target host against the confirmation.
- If the confirmation is missing, expired, withdrawn, doesn't cover the
  host, or lacks the active tick, the run goes ahead with the active gate
  closed. Each active test is Not run, with a reason naming which of these
  applies. The report says how to fix it: confirm, renew, or add the host.
- Nothing prompts mid-run. TestForge is driven by the API and runs
  unattended.
- **The change from Phase 35 Decision 8:** that decision's "a run whose
  domain doesn't match does not start" becomes "its active tests don't
  run". Read-only and interactive tests on a site don't need permission, so
  stopping the whole run would only remove harmless coverage.

9. Active tests reach only covered hosts.
- During an active-gate test, a request to a host the confirmation doesn't
  cover is aborted. The test fails as a guard breach, naming the host. This
  is the read-only guard's pattern (Phase 41, TFP-181).
- Attack-shaped input sent to a host nobody confirmed is exactly what the
  confirmation exists to prevent, including through a redirect or a
  third-party form handler.

10. The script-payload test runs again behind the open gate.
- It is Phase 38's test, unchanged: "script-shaped input is not executed".
- With the gate closed, it is Not run, with Decision 8's specific reason in
    place of today's "not built yet".

11. Model-written tests at the active gate stay Not run. (Emil, 2026-10-19)
- Today the local model's Comprehensive security scenarios sit at the
  active gate (Phase 38, TFP-147). They are never run, because they may
  send attack-shaped input.
- Opening the gate doesn't change that. Untrusted, model-written attack
  code against a real site is a separate decision. It goes with D6's
  measurement in R5's scenario-gaps record.
- They stay listed, with the reason "model-written active test: not run".

12. Practice sites (2026-10-19).
- A hosted practice site counts as "written permission" only when its
  published terms explicitly allow attack-shaped or load testing.
  Otherwise the tester doesn't confirm it. It stays capped, with no active
  tests.
- TestForge can't check a site's terms. So this rule goes in the setup
  documentation and in the confirmation's wording.

13. API first. The screen comes from R5's app-screens record. (Emil, 2026-10-19)
- This phase adds the API:
  - read the confirmation;
  - create or replace it;
  - withdraw it.

  This follows Phase 20's login config and Phase 42's gap-writer opt-in.
- R5's app-screens record designs the screen alongside the gap-writer
  opt-in and candidate promotion. It is built after that record locks.
- The API refuses a confirmation that:
  - is missing its typed hosts, its basis, the confirmed wording, the
    name or the contact email;
  - has a contact email that isn't a valid address;
  - has an expiry beyond 1 year.

14. Two locked records are amended in the same commit as this record locks
    (Emil, 2026-10-19).
- **Phase 35 Decision 8:**
  - "saved with the run" becomes "saved with the site, and named in each
    run's report";
  - and Decision 8 above replaces "does not start".
- **Phase 39 Decision 10:** "once that confirmation is saved with the run"
  becomes "once the site has a valid confirmation covering the host".
- The behaviour Phase 39 builds is otherwise unchanged.

## Acceptance Criteria

1. The stored confirmation
- Through the API, a confirmation can be:
  - created and read back with every field of Decision 1;
  - withdrawn, keeping it with its withdrawal date.
- The API refuses one with a missing field, an untyped host, a wildcard,
  an invalid contact email or an expiry beyond 1 year, each with its
  reason.
- Nothing is sent to the contact email: no mail code is added in this phase.
- It is written under the data folder, never the repo. A unit test runs on
  a temporary data folder (`TESTFORGE_DATA_DIR`).

2. The gate
- On the fixture, with `TESTFORGE_ACTIVE=1` and a valid confirmation with
  the active tick, the script-payload test runs.
- On the fixture, without `TESTFORGE_ACTIVE`, it is Not run, whatever the
  confirmation says.
- Each of these gives its own Not-run reason:
  - missing;
  - expired;
  - withdrawn;
  - host not covered;
  - no active tick.
- With the gate closed, the rest of the run is unchanged.
- On a local host, `TESTFORGE_ACTIVE=1` alone opens it.
- Model-written active tests stay Not run with the gate open (Decision 11).

3. Only covered hosts
- A fixture case in which an active test's submit goes to an uncovered
  host (by a redirect or a form's `action`) fails as a guard breach naming
  the host.
- No request reaches that host. The request-recording test shows it.

4. The caps
- Phase 39's TFP-157 stub is replaced by the stored confirmation:
  - a remote fixture host with a valid confirmation runs at the machine
    limit, with no request cap;
  - with the confirmation expired or withdrawn, the same host is capped.
- The run record shows the host row and the confirmation's copy (Phase 39
  Decision 11).

5. The report
- A run with a confirmation names it: hosts, basis, name, date, expiry and
  scopes.
- The contact email is never in the report or its exports (Emil,
  2026-10-19). Reports get shared, and the email only needs to be in the
  local confirmation file. A unit test checks a report built from a
  confirmation doesn't contain it.
- A run whose confirmation is missing, expired or withdrawn says so, with
  what to do.

6. Unchanged by default
- Without `TESTFORGE_ACTIVE`, the failure sets on both local Toolshop copies
  are the same as Phase 39's final runs, test by test.
- `check:template-unchanged` differs only by the script-payload test's skip
  line becoming a check at run time. The difference is described and the
  baseline (`TEMPLATE_BASELINE` in `nightly.yml`) is updated in its own
  commit.

7. One real run
- Standard with `TESTFORGE_ACTIVE=1` on the local with-bugs Toolshop copy
  (a local host):
  - the script-payload test runs on each form it targets;
  - its results are recorded against the answer key;
  - any finding is matched to a listed bug or explained.

## Regression Policy

- Add `TEST_PLAN.md` cases for:
  - each confirmation field and each refusal;
  - expiry and withdrawal;
  - each Not-run reason;
  - the local-host rule;
  - the run switch;
  - the covered-host guard;
  - the caps lifted and restored;
  - the report's confirmation section;
  - model-written active tests staying Not run.
- Each case lands with its code.
- The request-recording test from Phases 35, 38 and 39 is extended to the
  covered-host guard.
- `docs/AUTOMATED_ACCOUNT_SETUP.md` (or a new site-setup section beside it)
  explains:
  - the confirmation;
  - what each tick allows;
  - expiry;
  - the practice-site rule (Decision 12).

## Related, deferred (not this phase)

- **The opt-in load-testing run (D24).** It has its own record, designed
  with the ISTQB Performance Testing syllabus. This phase stores its tick
  only.
- **The confirmation screen.** R5's app-screens record (Decision 13).
- **Model-written active tests** (Decision 11), with D6 in R5's
  scenario-gaps record.
- **Authenticated and active security (D10, GitHub issue #3)** builds on
  this gate.
- **Emails to the confirmer** (report, expiry reminder, created-or-withdrawn
  notice): D25, using the contact email stored here.
- **Lockout and rate-limit probing.** They sit at the active gate (Phase 38
  Decision 1); no test exists yet. D3 or D10 designs them.
- **Scenario gaps that need the owner's sign-off.** R5's scenario-gaps
  record decides which of the ten sit at the active gate.

Each of these has a line in `deferred-work-register.md`.

## Dependencies and order

- After Phase 39 (TFP-157's stub is what TFP-220 replaces) and R4.
- No other dependency. D3's active parts, D10 and D24 wait on it.

## Backlog

### TFP-218 — The confirmation, stored per site, and its API

- **Status:** Done 2026-11-15: `dc64412` and `4c2d4f9`, on `main` by
  fast-forward (PR #40). Every check passed on its head `4c2d4f9`: PR
  Validation, CodeQL and its alert check, and Release Image. Verified by a
  planning session (2026-11-15). Both readings below stand (the owner).
- **Built (2026-11-15).**
  - **The store:** `src/lib/ownership/confirmation.ts` writes
    `<data>/site-suites/<site>/ownership.json` as `{ current, history }`.
  - **The API:** `GET` and `POST /api/site-ownership`, and
    `POST /api/site-ownership/withdraw`.
  - **Docs and cases:** `docs/SITE_OWNERSHIP.md`, and RUN-56 to RUN-60.
  - **Nothing reads it yet** but its API. TFP-219 and TFP-220 do.
- **Built against the record, as Claude Code read it.** Two readings, each
  in its code and docs, for the owner to keep or change:
  - **Wording (Decisions 1 and 12):** each basis has one fixed text,
    which includes the practice-site rule. A POST must send that text
    unchanged, or it is refused. That keeps the stored "exact wording"
    the text the tester was shown.
  - **"A host the site's crawl or target address uses" (Decision 2):**
    the host of the site's address, plus the page hosts and request
    hosts (from the dependency map) in the page data of the site's saved
    suites. Hosts the site only links to don't count.
- **Found by the fresh-context review and fixed before commit, each
  red first:**
  - A malformed confirmation file read as `valid`: a confirmation with
    a missing field, or an expiry that isn't a date, which was never
    reached. It now reads as `missing`.
  - Two saves at the same moment lost one from the history, or failed
    on a shared temporary file. Writes are now serialised in the server
    process.
  - The 1-year limit from 29 February landed on 1 March.
  - An expiry with no zone was read in local time, and free text such
    as `Nov 20 2026` was accepted.
  - A request host recorded with no sample address was ignored.
  - A non-text host was refused as "empty".
- **Phase:** 43 · **Priority:** P1 · **Labels:** `enhancement`, `security`, `api`
- **Problem it solves:** the confirmation Phase 35 decided doesn't exist.
  Saved with each run, it would be asked for on every run.
- **Scope:** Decisions 1, 2, 5, 6, 12 and 13.
- **Deliverables:**
  - the store (`ownership.json`), with its API;
  - the refusals;
  - the setup documentation;
  - `TEST_PLAN.md` cases.
- **Acceptance criteria:** Acceptance Criteria 1.
- **Dependencies:** none.

### TFP-219 — The active gate opens on a covered host, by run switch

- **Status:** Done 2026-11-16: `acaf56f`, `4d83bef` and `832f4ca`, with
  `2c50fef` moving `TEMPLATE_BASELINE` to `acaf56f`, on `main` by
  fast-forward (PR #41). Every check passed on its head `832f4ca`: PR
  Validation, CodeQL and its alert check, and Release Image. The nightly
  dispatched on the branch was green on the same commit (run 43839514843),
  its template check against `acaf56f`. Verified by a planning session at
  Gate A, which the owner passed (2026-11-16, rulings 1 to 5 below).
  - **Found by the first nightly on the branch (run 43836726361) and fixed
    in `832f4ca`:** knip's dead-code job failed on an unused re-export of
    the gate's four setting names in `active-gate.ts`. PR Validation
    doesn't run knip.
- **Built (2026-11-16).**
  - **The gate:** `src/lib/run/active-gate.ts` decides it once, as the run
    starts. The run must ask (`enableActive` in `POST /api/run`; the CLI
    never does), and the target host must be local or covered by the
    site's valid confirmation with the active tick. Otherwise the gate is
    closed, with one of six reasons, each saying what to do.
  - **What the tests read:** the executor always sets `MRONION_ACTIVE` (what
    the run asked for) and `MRONION_ACTIVE_GATE` (`open`, or the closed
    reason). The generated active test checks only the second, at run time.
  - **Model-written active tests** get `test.skip(true, 'model-written active
    test: not run')` (Decision 11).
  - **The report** has an ownership section, and the run record keeps the
    confirmation's copy as it was, without the contact email.
  - **Reused suites:** an unedited reused test with the old static skip gets
    the run-time check (found by the fresh-context review). A hand-edited
    one keeps the old skip.
- **Built against the record, as Claude Code read it.** Three choices for
  the owner to keep or change at Gate A:
  - **Two settings, not one.** Decision 4 names one switch, set "to 0 or
    1". Here `MRONION_ACTIVE` is what the run asked for, and a second
    setting, `MRONION_ACTIVE_GATE`, carries the executor's decision. That
    way no setting a person could put in a shell or in CI opens the gate on
    its own (review item 2).
  - **The local hosts are Phase 39's function.** `isLocalDevelopmentHost`
    also counts `0.0.0.0` and the whole of `127.0.0.0/8` as local, which
    Decision 7's list doesn't name.
  - **Model-written active tests and the per-gate count.** With the gate
    open, they are Not run under their own reason and are not counted under
    "Not run because their gate was closed". They still count in the total
    and in the reasons.
- **Not moved here:** `TEMPLATE_BASELINE`. Against `7ba7399`, 2 of 172
  outputs differ (the two security suites), each in one line, the payload
  test's skip becoming the run-time check, as Acceptance Criterion 6
  describes. The baseline moves in its own commit once the owner accepts
  that.

- **Phase:** 43 · **Priority:** P1 · **Labels:** `enhancement`, `security`, `run`, `generate`
- **Problem it solves:** the active gate is always closed, and its one
  reason says "not built yet".
- **Scope:** Decisions 3, 4, 7, 8, 10 and 11.
- **Deliverables:**
  - `TESTFORGE_ACTIVE`, set by the executor;
  - `closedGates()` taking the confirmation;
  - the run-time check in place of the static skip;
  - each Not-run reason;
  - the report section;
  - the template baseline updated in its own commit;
  - `TEST_PLAN.md` cases.
- **Acceptance criteria:** Acceptance Criteria 2, 5 and 6.
- **Dependencies:** TFP-218.

### TFP-220 — Active tests reach only covered hosts; the caps come from the confirmation

- **Status:** Done 2026-11-16: `b7fc1cb` and `6397e37` (ruling 4's
  note), with `6ac3541` moving `TEMPLATE_BASELINE` to `6397e37` and
  `1d0a84c` quoting it, on `main` by fast-forward (PR #42). Every check
  passed on its head `1d0a84c`: PR Validation, CodeQL and its alert
  check, and Release Image. The nightly dispatched on the branch was green
  on the same commit (run 43855174332), its template check against
  `6397e37`.
  - **Found by the nightly on `6ac3541` and fixed in `1d0a84c`:** YAML
    read the unquoted `6397e37` as the number 6.397e40, so the template
    check couldn't find its base. The baseline is quoted now. Before that,
    run 43853367395 stayed "queued" on GitHub with no jobs, refusing both
    cancel and force-cancel; it was left there and run again.
- Verified by a planning session (2026-11-16). The owner's rulings at
  verification (Emil, 2026-11-16):
  1. **The template change is accepted.** `TEMPLATE_BASELINE` moves in its
     own commit, to the commit below that carries the guard as accepted.
  2. **The four readings below stand.**
  3. **A third-party write stays a breach.** Revisit after TFP-221's
     measurement.
  4. **A stopped script from an uncovered host is named in the test's
     note**, which says "the result may not reflect the page as visitors
     see it", and it is listed as known limitation 14. Built in the
     commit after `b7fc1cb`, red first.
  5. **The redirect-address, streaming and port limits are accepted as
     documented** below.
  - **The covered-host guard:** `src/lib/generate/active-guard.ts`. The
    payload test types its input and submits under `tfActiveGuarded`, on
    the test's browser context, so a popup is covered too. The run gives
    its tests `MRONION_ACTIVE_HOSTS`, always set by the executor, never
    inherited. With the gate open, that is the target host when it is
    local and every host of a valid confirmation with the active tick.
  - **Measured before building it (Chromium 151, Playwright 1.62.1, at
    the server):** the route alone stops a form posting to another host,
    but not a 307 or 302 from the covered host (the 307 carried the
    form's body), nor two hops (covered, covered, uncovered), nor
    `fetchLater`, which is never routed. A redirect's later hops aren't
    routed at all, and fulfilling a 3xx lets the browser follow it
    unrouted. So the guard sends each covered request itself with
    redirects off, checks every hop's `Location`, and follows it. As
    the read-only guard does (TFP-287), the page's `sendBeacon`,
    keepalive `fetch` and `fetchLater` are wrapped dormant before the
    first navigation and stopped once the guard arms.
  - **The caps:** TFP-157's stub (`src/lib/run/ownership.ts`) is gone. The
    executor reads the site's confirmation once, for the caps and the
    gate. A valid one covering the host lifts the caps, whatever its
    ticks (Decision 3).
  - **The CLI (review item 3):** it reads the confirmation from its data
    folder, and asks for no active tests. Its active tests are Not run,
    "active test: not available in CI yet (TFP-249)".
  - **Saved suites:** an unedited saved active test without the guard is
    regenerated, not reused. This replaces TFP-219's in-place upgrade of
    0.4.0's static skip, which would have run 0.4.0's payload tests
    unguarded with the gate open. A hand-edited one is kept.
  - **Docs and cases:** RUN-66 to RUN-69, known limitation 13,
    `docs/SITE_OWNERSHIP.md` (what an active test may reach; Gate A
    ruling 3's local hosts), and `docs/CI_INTEGRATION.md` (carrying a
    confirmation in `data-dir`).
  - **Also fixed here:** the security suite's note still said the
    payload tests wait for a confirmation "not built yet".
- **Built against the record, as Claude Code read it.** Four choices for
  the owner to keep or change:
  - **What is a breach.** Decision 9 says every request to an uncovered
    host is aborted and fails the test. Here every one is aborted, so
    nothing reaches the host, but only a navigation, a redirect, or a
    write (any method but GET, HEAD and QUERY) fails the test. A read
    (an image, a script, a font) and a beacon are noted, as TFP-199 notes
    the read-only guard's beacons. Failing on every read would fail the
    payload test on any site whose result page loads a third-party font.
    A site's analytics that POSTs by `fetch` to a third party after the
    submit is still a breach; TFP-221 will show whether that happens on
    the Toolshop copies.
  - **A local target covers itself only**, by exact host name, not every
    local host. `localhost` and `127.0.0.1` are different hosts here.
    Both local Toolshop copies use `localhost` for the pages and the API.
  - **A redirect inside the covered hosts is followed by the guard**, so
    the page's address stays the one the form posted to, with the final
    response's content. Playwright documents that `route.fetch` can't
    change a request's scheme, so a covered redirect from `http` to
    `https` should fail the test as one the guard couldn't follow. That
    is read from the documentation, not measured.
  - **Beacons, keepalive fetches and `fetchLater` to a covered host are
    stopped too**, and noted: the guard can't follow their redirects.
- **Found by the fresh-context review, fixed before commit, each red
  first:**
  - A covered image that redirects to an uncovered host (an avatar, a CDN)
    failed the test as a breach. It is now judged as the request it would
    become: a read, stopped and noted.
  - A frame loaded from an uncovered host (a captcha's challenge, an
    embedded video) failed the test as a navigation. Only a page's own
    navigation, or a popup's, is now a breach. A popup's first navigation
    has no frame to read yet, so an unknown frame counts as a page's.
  - The review also found that `68b2ce6`, the commit marking TFP-219 done,
    deleted TFP-157's stub by mistake: a staged deletion from this work went
    with it, and `main` didn't build. `91a627e` restored it on `main`.
- **Raised by the review, ruled on at verification** (rulings 3 to 5
  above; none sends anything to an uncovered host):
  - **A third-party write is a breach, a beacon isn't.** Sentry's
    transport (a keepalive POST) or an analytics POST to another host
    during the payload test fails it on every run. The tester can't fix
    that by confirming the third party's host. TFP-221 will show whether
    the Toolshop copies do it.
  - **A stopped third-party script can make the payload test pass
    falsely.** If the result page needs a script from an uncovered host
    to render the input, the guard stops it. The payload is never
    rendered, and the test passes with only a note. A stricter choice:
    Not run, "couldn't be judged", whenever an uncovered script is stopped.
  - **A redirect the guard follows is fulfilled at the original
    address.** The page's URL, relative links and history stay on the
    address the form posted to. A redirect between two covered hosts
    shows the second host's page under the first's origin, with its
    cookies. Headers may be forwarded to the second host (not checked).
  - **Streaming responses on a covered host** (server-sent events, long
    polls) are buffered by `route.fetch`, so such a request waits until
    it times out (from how `route.fetch` works, not measured).
  - **Hosts match by name, not port.** On a local target, a form posting
    to another port on the same host is allowed through: another service
    on this machine, such as a dev server. Matching ports would stop
    both local Toolshop copies, whose pages (`localhost:4200`) post to
    their API (`localhost:8091`).
- **The template changes again**, as the guard is in the generated test.
  Against `acaf56f`, 2 of 172 outputs differ: the two security suites
  with page data (fast and deep), each 556 to 683 lines at `b7fc1cb` and
  690 with ruling 4's note. The guard's
  helper is added before the payload tests, the note's wording is
  corrected, and the payload test's body, from typing to the result page,
  moves inside `tfActiveGuarded` with `tfActiveWrap` before its
  navigation. `TEMPLATE_BASELINE` moves in its own commit once the owner
  accepts it.

- **Phase:** 43 · **Priority:** P1 · **Labels:** `enhancement`, `security`, `run`
- **Problem it solves:**
  - attack-shaped input could reach an unconfirmed host through a redirect
    or a form's target;
  - Phase 39's ownership row runs on a stub.
- **Scope:** Decisions 9 and 3 (caps), and the Phase 39 Decision 10 row.
- **Deliverables:**
  - the covered-host guard;
  - TFP-157's stub replaced;
  - the extended request-recording test;
  - `TEST_PLAN.md` cases.
- **Acceptance criteria:** Acceptance Criteria 3 and 4.
- **Dependencies:** TFP-219.

### TFP-221 — Measure: the script-payload test on local with-bugs

- **Status:** Measured 2026-11-16 (owner decision, the same day: not
  overnight). Stopped for Gate B's verification. Everything is in
  `benchmarks/2026-11-16-tfp-221/outcome.md`.
  - **Switch off:** Action Gate on `main` at `1da312a` (run 43863206585)
    against the base (`202a17a`), test by test. Every test of both copies
    has the same status. The only differences are the payload tests' Not
    run reason (3 on each copy), now "not available in CI yet (TFP-249)".
  - **Switch on:** one Standard run through the app on local with-bugs,
    with `enableActive: true`. The gate was open on the local host, and
    the run gave 481 / 378 passed / 84 failed / 19 not run.
    - Against the switch-off run, only the 3 payload tests differ.
    - Login's payload test passed. The answer key lists no
      script-injection bug.
    - Register and contact were Not run: Angular's own validation stopped
      the submit.
    - The covered-host guard stopped nothing and failed nothing.
  - **Three findings for Gate B:**
    - The guard's notes (and the read-only guard's) never reach Mr Onion's
      report, including ruling 4's.
    - Two of the three forms aren't really tested.
    - The gate was measured open on a local host only.
- **Phase:** 43 · **Priority:** P2 · **Labels:** `measurement`, `benchmark`
- **Problem it solves:** the payload test has not run since Phase 38 moved
  it to the active gate.
- **Scope:** Acceptance Criteria 6 and 7.
- **Deliverables:**
  - with the switch off: both local copies, failure sets compared with
    Phase 39's final runs;
  - with the switch on: with-bugs, each payload result matched to the
    answer key;
  - an `outcome.md` under `benchmarks/`.
- **Acceptance criteria:** Acceptance Criteria 6 and 7.
- **Dependencies:** TFP-220.

### TFP-288 — The payload test fills a form's required fields, so it is tested

- **Status:** Added 2026-11-16 (owner), from TFP-221's finding 2. Not
  started. **Owner decision before building:** it changes the Phase 38
  template (the payload test's body), which stays unchanged until this is
  decided.
- **Phase:** 43 follow-up · **Priority:** P2 · **Labels:** `enhancement`, `security`, `generate`
- **Problem it solves:** on the local with-bugs copy, two of the three
  payload tests are Not run: "submitting the form on /#/auth/register
  (/#/contact) sent no request, so the payload never reached the site".
  - Both are Angular forms that validate in their own code, not with HTML
    constraints, so the test's browser-validation check passes them.
  - The test fills only free-text fields with the payload, and email, url
    and tel fields with a dummy. It leaves required selects (State,
    Subject), a password and a message empty, and the app silently refuses
    to submit.
  - Reasoned from the saved page data
    (`benchmarks/2026-11-16-tfp-221/outcome.md`), not measured.
- **Scope:** the payload test, generated (`src/lib/generate/mock/security-checks.ts`):
  - every field of the form it targets that has to hold a value gets a
    valid one before the submit: a select's first real option, a password,
    a checkbox ticked, a textarea or number long enough for a length or
    range rule;
  - the payload still goes only into the free-text fields it goes into
    today;
  - a field it can't fill validly is named in the Not run reason, in place
    of today's "sent no request".
- **For the owner:** which fields count as "has to hold a value": the
  `required` attribute, an `aria-required`, a label's "*", or every field
  of the form. And whether a ticked checkbox may agree to terms on the
  tester's behalf.
- **Deliverables:**
  - the template change, measured with `check:template-unchanged` and its
    baseline moved in its own commit once accepted;
  - a fixture case for each kind of field, red first;
  - `TEST_PLAN.md` cases;
  - a re-run of TFP-221's switch-on run, showing register and contact
    tested.
- **Acceptance criteria:**
  - on the local with-bugs copy, the payload tests on `/#/auth/register`
    and `/#/contact` submit, and their results are matched to the answer
    key;
  - with the switch off, nothing else changes.
- **Dependencies:** TFP-221, and the owner's decision above.

## Recommended Execution Order

1. TFP-218.
2. TFP-219.
3. TFP-220.
4. TFP-221.
5. TFP-288, once the owner decides it (added 2026-11-16).

## Suggested Milestone Gates

### Gate A — Confirmed and gated
- TFP-218 and TFP-219 landed and independently verified.
- Without the switch, the template difference is the described one only.

**Gate A verification (planning session, 2026-11-16; it built neither
ticket): every checked criterion met. The owner's ruling (Emil,
2026-11-16): Gate A passes, with rulings 1 to 5 below as written.**

| Check | How | Result |
|---|---|---|
| Commits and scope | `git log`, `git diff --stat main 4d83bef`, `git ls-remote` | `acaf56f`, `9f02465`, `4d83bef` on `tfp-219-active-gate`, pushed; `main` at `16d5e3e`. The gate, its two setting names, the executor, the run route, the report's confirmation section, the reuse fix and their tests |
| TFP-218 (criterion 1) | Read `src/lib/ownership/confirmation.ts` and both routes, 2026-11-15 | Every field of Decision 1; each refusal with its reason; a malformed file reads as no confirmation; no mail code |
| The gate needs both conditions (Decision 4) | Read `decideActiveGate` | Closed unless the run asked and the host is local, or covered by a valid confirmation with the active tick. One reason per way it is closed (Decision 8), each saying what to do |
| Nothing inherited (review item 2) | Read `executor.ts`, `activeGateEnv`, `runEnv` | The executor decides once as the run starts and always sets both settings for the run's children, under both prefixes. The generated test reads only the executor's decision |
| The run asks explicitly | Read `src/app/api/run/route.ts` | `enableActive === true` only; off by default; the CLI never passes it |
| The run's copy (Decision 1, criterion 5) | Read `ownershipCopy` | The confirmation as the run started, without the contact email |
| Model-written active tests (Decision 11) | Read `comprehensive.ts`, `gap-fill.ts` | A static skip of their own, never run, gate open or not |
| Saved suites | Read `reuse.ts` | An unedited reused test gets the run-time check in place of the old static skip; a hand-edited one is left alone |

Not checked here: the unit suite (862 of 862 reported), the 9 real runs
and 15 mutants, and PR #41's checks (reported green on `4d83bef`). The
template check (2 of 172 differ, the payload test's skip line) is the
builder's measurement.

**The owner's ruling (Emil, 2026-11-16): yes to each.**
1. **Gate A passes**, and the template change is accepted (criterion 6's
   described difference). `TEMPLATE_BASELINE` then moves in its own commit.
2. **Decision 4 amended:** two settings, not one. `MRONION_ACTIVE` carries
   what the run asked for, and `MRONION_ACTIVE_GATE` the executor's
   decision, which is all a generated test reads.
3. **Decision 7 amended:** the local hosts are whatever Phase 39's
   `isLocalDevelopmentHost` counts, which adds `0.0.0.0` and the rest of
   `127.0.0.0/8` (all this machine).
4. **Model-written active tests** count in the Not run total with their
   own reason, not under "gate closed".
5. **No version tag between TFP-219 and Gate B.** Until TFP-220's
   covered-host guard lands, an open gate on a confirmed remote host has
   nothing stopping an active test's submit from reaching an uncovered
   host. `main` may carry that; a release may not.

### Gate B — Guarded and measured
- TFP-220 and TFP-221 landed and independently verified.
- The covered-host guard is shown blocking an uncovered host by a recording
  test.
- Both local copies: unchanged with the switch off; the payload results on
  with-bugs recorded and explained.

**Gate B verification (planning session, 2026-11-16; it built none of
TFP-220, TFP-221 or the notes fix): every checked criterion met once the
notes fix (PR #47, `4812e84`) merges. The owner's ruling (Emil,
2026-11-16): Gate B passes, with rulings 1 to 3 below as written.**

| Check | How | Result |
|---|---|---|
| TFP-220: nothing reaches an uncovered host | Read `src/lib/generate/active-guard.ts` | Every request to a covered host is sent by the guard with redirects off, each hop checked; any hop to an uncovered host is aborted. `sendBeacon`, keepalive `fetch` and `fetchLater` are wrapped before the first navigation and stopped once armed. The route is on the browser context, so a popup is covered |
| Criterion 3: shown at the server | `active-guard.test.ts`, red first as `b7fc1cb`'s body quotes | With the guard off, the uncovered host received every case (form, 307, two hops, popup, `fetchLater`, beacon, keepalive); with it, none |
| Criterion 4: the caps | Read `executor.ts`, `active-gate.ts`; TFP-157's stub removed | The confirmation read once per run; a valid one covering the host lifts the caps, whatever its ticks |
| Criterion 6: unchanged with the switch off | `benchmarks/2026-11-16-tfp-221/` | Every test's status identical on both copies against the 2026-11-15 base; the only differences are the payload tests' Not-run reason in CI |
| Criterion 7: one real run, switch on | `outcome.md` | Login's payload test ran and passed (no listed injection bug); register and contact were Not run, "sent no request", their required fields left empty (TFP-288) |
| The notes fix | Read `execution.ts`, `notes.ts`, both HTML reports | `note` annotations reach each record as `notes` and both exports show them with their test; no template change |

Not checked here: the unit suite and PR #47's checks (reported green on
`4812e84`), and the live runs, which rest on `outcome.md`.

**The owner's ruling (Emil, 2026-11-16): yes to each.**
1. **Gate B passes** once PR #47 merges, and Phase 43 is complete.
2. **Register and contact untested:** accepted for Phase 43 (its Decision
   10 kept Phase 38's test unchanged); TFP-288 is decided when it is placed.
3. **Notes in the app's own report tabs:** a Phase 46 item (its review
   adds it), not this phase.

**Gate B waits for one fix (owner, 2026-11-16).** TFP-221 found that the
report drops every guard note: `findingsOf` reads only `finding`
annotations. The owner asked for three things:
- the run's records carry `note` annotations;
- the HTML report shows each with its test, apart from findings;
- no template change.

**Built (2026-11-16), stopped for Gate B's verification.**
- **Records:** a test's notes are now carried as `notes`
  (`src/lib/report/execution.ts`).
- **The HTML report:** it lists them under "Notes from the run", each under
  its test (`src/lib/report/notes.ts`).
- **The Comprehensive export too,** before its fixed "what this run did not
  test", which stays last. The fresh-context review found it missing: a
  candidate bound into a Comprehensive run can call the read-only guard.
  Red first.
- **Raised by the review, left alone:**
  - A shared visit's re-run keeps only the re-run's notes, not the first
    attempt's. That is template code, and the ruling is no template change.
  - Notes are in the HTML exports and the saved record, not in the app's
    report tabs, which the ruling didn't name.
  - Runs saved before this have no notes to recover.
- **Red first:** on a report built from a real browser run that has the
  guard's stopped-script note, the record had no notes. A mutant dropping
  the HTML section fails, and so does one filing notes as findings
  (RPT-23).
- **Template:** `check:template-unchanged`, 172 of 172 identical.
- **TFP-288** (the payload test's required fields) is ticketed for a
  decision and not built. The Phase 38 template stays as it is until then.
