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

- **Status:** Built (2026-11-16). Stopped for Gate A's independent
  verification and the owner's ruling.
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

## Recommended Execution Order

1. TFP-218.
2. TFP-219.
3. TFP-220.
4. TFP-221.

## Suggested Milestone Gates

### Gate A — Confirmed and gated
- TFP-218 and TFP-219 landed and independently verified.
- Without the switch, the template difference is the described one only.

### Gate B — Guarded and measured
- TFP-220 and TFP-221 landed and independently verified.
- The covered-host guard is shown blocking an uncovered host by a recording
  test.
- Both local copies: unchanged with the switch off; the payload results on
  with-bugs recorded and explained.
