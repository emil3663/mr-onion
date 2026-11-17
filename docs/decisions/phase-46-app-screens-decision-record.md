# Phase 46 Decision Record — App Screens: Site Lookup, the Confirmation, Promotion and the Active Switch

Date: 2026-10-20
Scope: Give the app screens for settings that are API-only today:
- a **site lookup**: search one site by its URL to see and change its
  ownership confirmation (Phase 43) and gap-writer opt-in (Phase 42). There
  is no list of sites;
- a **promotion screen** for candidates (Phase 42);
- the **active switch** in the run form (Phase 43).

What Emil sees and approves is decided here. TestForge still never writes
into the repo.

Status: **Locked (Emil, 2026-10-20). In progress: TFP-232 to TFP-235 done, Gate A passed (2026-11-17).** Decisions, acceptance criteria and tickets approved; AC1 revised to a site lookup at his request.
- This is R5's second decision record (`post-phase-42-review-plan.md`).
- Its build order: straight after Phase 43, before D1
  (`deferred-work-register.md`).
- Tickets TFP-232 to TFP-235, and TFP-289 (Decision 6, added 2026-11-17
  from the review's item 8).

## Review before building (planning session, 2026-11-17)

This record was locked before Phase 47 (CI), Phase 48 (the rename) and
Phase 43 as built. Checked against `main` at `32b965a`. The design stands;
these amendments apply and override older wording below.

1. **Names (Phase 48).** The product is Mr Onion; the run switch is
   `MRONION_ACTIVE`, and the run request's field is `enableActive`
   (TFP-219). "TestForge never writes into the repo" reads "Mr Onion".
2. **The contact email is masked in the API too (owner decision,
   2026-11-17).** `GET /api/site-ownership` returns it masked
   (`e***@gmail.com`); the full address stays in the local file only, and
   nothing in the app receives it. A POST still takes it in full. TFP-232
   makes the change, with a test that no GET response holds the full
   address.
3. **The screen shows the confirmation's fixed wording** from the API
   (TFP-218's `wording`, one text per basis, sent back unchanged). The
   legal note (Phase 35 Decision 8) is shown beside it. The practice-site
   rule is already in the written-permission text.
4. **A host the site doesn't use yet is refused** (TFP-218's reading of
   Decision 2: the site's own host plus those its saved suite recorded).
   When the API refuses one, the form says a host is accepted once a
   Standard run has recorded it.
5. **The active switch asks the API, not its own copy of the rules.**
   `GET /api/site-ownership` gains the gate a run would get for the URL
   (`decideActiveGate`, asked for active tests): open, or which of Phase
   43's reasons closes it. The switch shows that. The run itself still
   decides at its start (Decision 4).
6. **Saved suites and their last run** have no API yet. TFP-232 adds them
   to the lookup's read, by site only.
7. **"No listing" means no route that lists sites or confirmations.**
   `GET /api/candidates` names the hosts each candidate ran on, by Decision
   3's choice; AC1's test allows that route and no other.
8. **Notes in the app's report tabs (Phase 43 Gate B ruling 3).** The
   run's notes (`notes` on each record: the guards' stopped requests, and
   ruling 4's "the result may not reflect the page" warning) are shown in
   the app with their test, as the HTML report shows them. This becomes
   Decision 6, with an acceptance criterion and a ticket, TFP-289.
9. **Gate B's walkthrough** confirms the local Toolshop and, as the remote
   site, this machine's LAN address (as TFP-219's runs did), not a hosted
   practice site, which needs its terms checked first (Phase 43 Decision
   12).
10. **What stays from Phase 43, not built here:** CI never asks for active
    tests (TFP-249); the CLI has no switch.

## Context

- **API only today:**
  - the gap-writer opt-in (`/api/site-settings`, TFP-194);
  - candidate promotion (`/api/candidates`, TFP-196);
  - Phase 43's confirmation (TFP-218).

  Phase 42's batch 2 ruling 3 left their screens for this review.
- **Phase 20's login config** got its screen in TFP-097. This phase follows
  that pattern: the API stays the source of truth, and the screen calls it.
- **Promotion is a library commit through Claude Code** (Phase 42 Decision
  8; `src/lib/candidates/promotion.ts`).
  - `promoteApproved` writes the approved entries, and Claude Code commits
    them.
  - Only a candidate that meets the rule is offered. A rejection is kept
    with its reason.
- **Phase 43's run switch** (`TESTFORGE_ACTIVE`) is a choice made per run,
  like interactive.

## Decisions

1. A site lookup, not a list (Emil, 2026-10-20).
- **Why:** a list of every site, with its confirmation, would show what's
  being tested, and by whom, to anyone at the screen. Per-site settings are
  reached by naming the site.
- **The search field:**
  - the tester types or pastes a URL;
  - TestForge reduces it to its site (scheme, host and port: the origin, as
    `/api/site-settings` does today);
  - it shows that site's entry only.
- **Exact match only:**
  - no suggestions;
  - no partial matches;
  - no "all sites", in the app or in the API.

  A site with no data shows "nothing saved for this site", the same as one
  never seen, plus the actions below.
- **The entry shows:**
  - **confirmation:** none, valid (until when), expired or withdrawn; its
    hosts, basis, name and scopes;
  - **contact email:** masked, e.g. `e***@gmail.com`. The full address is
    only in the local file;
  - **gap writer:** off, Claude Code or the local model;
  - its saved suites, with when each was last run.
- **What can be done from the entry:**
  - create or renew a confirmation;
  - withdraw it, after a second "withdraw" click;
  - set the gap writer.
- **A new confirmation or setting** is written into the same results area,
  as if the site had just been searched. The tester sees the saved entry
  straight away, read back from the API.
- **The run form** opens the lookup with the target's URL already searched.
  Searching is the act of naming a site. The confirmation's own host field
  still starts empty (Decision 2).
- **Later, with users (the SaaS phase, `saas-prerequisites.md`):** only the
  person who confirmed a site, or someone they share it with, sees its
  entry. Deferred: TestForge has no user identity yet.

2. The confirmation form keeps its friction (Emil, 2026-10-20).
- **Hosts are typed by hand,** one per line. Never pre-filled from the URL
  field: typing them is the act of naming what's covered.
- **The basis** is chosen: "I own this site", or "I have written permission
  to test it".
- **The full statement** is shown and must be ticked. It includes:
  - the legal note (Phase 35 Decision 8);
  - the practice-site rule (Phase 43 Decision 12).
- **Name and contact email** are required.
- **Expiry** defaults to 90 days, with a date picker that can't go past 1
  year.
- **The active and load-testing ticks** are off by default. Each says what
  it allows.
- **Refusals come from the API.** The screen shows them as returned
  (Phase 43 Decision 13). It doesn't duplicate the rules.

3. The promotion screen: approve, then Claude Code commits (Emil,
   2026-10-20).
- **It lists the candidates the rule offers.** For each one:
  - its pattern;
  - its code, read-only;
  - its evidence: the sites and runs, gates passed, real defects caught,
    unlabelled failures (`promotionVerdict`'s reasons, in words);
  - **every site it ran on, named by host,** in plain view, so evidence
    across several sites can be compared quickly (Emil, 2026-10-20).
    Promotion is Emil's own decision on a candidate, not a browse of
    sites.
- **Approve or reject.**
  - A rejection needs a reason, kept with it (Phase 42).
  - Candidates below the rule aren't offered, so they can't be approved.
- **Approved candidates** are listed as "waiting to be committed", with the
  one-line pointer to give Claude Code. Claude Code runs `promoteApproved`
  and commits the entries, reviewed like any code.
- The app never writes into the repo.

4. The active switch in the run form (Emil, 2026-10-20).
- **Where:** next to the interactive toggle, labelled with what it sends:
  attack-shaped input.
- **On a remote host without a valid confirmation that has the active
  tick:**
  - the switch is disabled;
  - it shows why (none, expired, withdrawn, host not covered, no active
    tick), using Phase 43's reasons;
  - it links to the site's entry in the site lookup.
- **On a local host:** always available (Phase 43 Decision 7).
- **The API still decides.** A run started through the API with the switch
  on but no cover gets Phase 43 Decision 8's Not-run reasons, whatever the
  screen showed.

5. Scenario tests and candidates in the report keep their own sections.
- They are unchanged in shape, outside the verdict.
- This phase adds no new report screen. Decision 6 adds to the existing
  tabs, not a screen.

6. A test's notes are shown in the app's report tabs, with their test
   (Phase 43 Gate B ruling 3, Emil, 2026-11-16; review item 8).
- **What a note is:** what a test recorded that is neither a finding nor a
  failure, kept on its record as `notes` since Phase 43's Gate B fix (PR
  #47). Today:
  - the covered-host guard's stopped requests;
  - ruling 4's warning that a stopped script means "the result may not
    reflect the page as visitors see it";
  - the read-only guard's aborted beacons (TFP-199).
- **Where:**
  - in the Execution tab, on the test's own row or details, as the HTML
    report shows them;
  - in a Comprehensive run's view, the same way.
- **Apart from findings:** never counted as a finding, never in the
  verdict, the pass ratio or the Not-run count. Labelled as a note, with
  its full text.
- **Every note,** none summarised away. A test with none shows nothing
  extra.
- **The report's data is unchanged:** the screen reads `notes` as saved.
  Runs saved before Phase 43's fix have none to show.

## Acceptance Criteria

1. Site lookup
- **The lookup:** a site's URL, in any form (path, query, trailing slash),
  finds its entry.
- **No list:** a partial host, or another site's path, finds nothing.
  Neither the app nor the API offers any way to list sites. A test checks
  the API has no listing route for sites or confirmations.
- **Email masked:** the contact email is shown masked.
- **Results area:** a new confirmation or setting appears in the results
  area at once, read back from the API.
- **Through the API:** creating, renewing and withdrawing a confirmation,
  and changing the gap writer, each go through the API. The result shows
  after a reload.
- **Withdrawal:** needs the second click.

2. Confirmation form
- **Hosts:** the host field is empty when opened from a run whose URL is
  set.
- **Required:** the statement must be ticked; name and email are required.
- **Expiry:** the picker stops at 1 year, and 90 days is preselected.
- **Ticks:** active and load are off when opened.
- **API refusals:** each one (a wildcard, an invalid email, an expiry too
  long) is shown with its reason.

3. Promotion
- **What's offered:** only candidates meeting the rule are listed. Each
  shows its pattern, code and evidence reasons, with every site it ran on
  named by host.
- **Rejecting:** a rejection without a reason is refused.
- **Approving:** an approval moves the candidate to "waiting to be
  committed", with the pointer for Claude Code.
- **No repo writes:** the app writes nothing into the repo. A test checks
  the working tree is unchanged after an approval.

4. Active switch
- **Remote, uncovered:** disabled, with the right reason for each of the
  five cases.
- **Remote, covered:** available with a valid confirmation that has the
  active tick.
- **Local:** always available.
- **The API decides:** a run through the API with the switch on and no
  cover gets Phase 43's Not-run reasons.

5. Unchanged
- **Regression suite:** passes, with new cases for each screen.
- **Template:** `check:template-unchanged` reports every fixed input identical against
  the recorded baseline (`TEMPLATE_BASELINE`). The count is whatever the
  check's input set holds at the time, 166 when this was written, not a
  fixed number.

6. Notes in the report tabs
- **Shown with their test:** a run whose tests have notes shows each note,
  in full, with its test in the Execution tab. That includes a stopped
  script's "the result may not reflect the page as visitors see it". A
  Comprehensive run's view shows them the same way.
- **Apart from findings:** no finding count, verdict, pass ratio or Not-run
  count changes when a test has notes.
- **None:** a test with no notes shows nothing extra.
- **Tested from a real run:** built from a run whose test has the
  covered-host guard's stopped-script note, as Phase 43's RPT-23 is. Red
  first: the tab without the change doesn't show it.

## Regression Policy

- **`TEST_PLAN.md` cases:**
  - the site lookup: exact match, no partial match, no listing route, the
    masked email, results written in place;
  - each confirmation-form rule;
  - the promotion screen's offer, reject and approve;
  - the "waiting to be committed" list;
  - each active-switch state;
  - a test's notes in the Execution tab and the Comprehensive view, and none
    shown for a test without.
- **The regression suite** covers each screen, as Phase 20's login screen
  is covered.

## Related, deferred (not this phase)

- **A screen for scenario-test results,** beyond the report's section. Only
  if Phase 44's results need more than the report shows.
- **Load testing's run option.** With D24.
- **A screen for library entries** (browse or retire). Not asked for.
- **TFP-291: a site folder name that can't collide** (found building
  TFP-232; owner ruling 2026-11-17: a known limitation, ticketed, not
  placed). Register D46; TEST_PLAN known limitation 15; issue #51.

### TFP-291 — A site folder name that can't collide, with a one-time move

- **Phase:** none, not placed · **Priority:** P3 · **Labels:**
  `storage`, `known-limitation`
- **Problem it solves:** `siteFolderName` (`src/lib/site-suites/store.ts`,
  Phase 42) makes every character outside `[a-z0-9.-]` a `_`, so two
  origins can share one folder (`https://a.b:8080` and `https://a.b_8080`
  are both `https_a.b_8080`). They share the confirmation, the gap writer
  and the saved crawls that decide which typed hosts a confirmation
  accepts. It can't open the active gate or lift the caps: both compare
  the run's own host with the confirmation's typed hosts, and colliding
  origins always have different host names.
- **Scope:**
  - a folder name that is one-to-one with the origin (an encoding that
    can't produce one origin's name from another's);
  - a one-time move of existing folders to the new names, once per data
    folder, as Phase 48's rename moved the data folder (TFP-277): a
    folder whose contents belong to two origins is split by each file's
    recorded origin where it has one, and otherwise reported, not
    guessed;
  - run records that name a suite folder by its old path still find it.
- **Acceptance criteria:**
  - two origins that collide today get different folders; a unit test
    over the colliding pairs fails on today's `siteFolderName`;
  - after the move, every existing site's confirmation, gap writer and
    suites are found by its origin, and a run saved before the move still
    finds its suite;
  - a folder shared by two origins is split or reported, never merged.
- **Dependencies:** none.

## Dependencies and order

- **Phase 43:** the confirmation API and the run switch.
- **The promotion screen** needs only Phase 42's API, so it can be built
  first.
- **In the build order:** straight after Phase 43, before D1. That way the
  confirmation doesn't stay API-only while the Standard sets are built.

## Backlog

### TFP-232 — The site lookup

- **Status:** Done 2026-11-17: `7a7e521` and `23235e7` (the owner's
  rulings below), on `main` by fast-forward (PR #50). Every check passed
  on its head `23235e7`: PR Validation, CodeQL and its alert check, and
  Release Image. Verified by a planning session (2026-11-17). AC1's
  creating and renewing are TFP-233's.
  - **Where:** a page of its own, `/sites` (`src/app/sites/page.tsx`,
    `src/app/_components/SiteLookup.tsx`), reached from "Site lookup" in
    the app's header and from the run form's Base URL field, which opens
    it in a new tab with its target searched (`/sites?url=`).
  - **It calls only the APIs by site:** `/api/site-ownership` (and its
    withdraw), `/api/site-settings`, and a new `GET /api/site-suites`
    (review item 6: each saved suite, its tests, and its last run, the
    latest finished saved run whose record names that suite).
  - **The email is masked in every response** of the ownership API, the
    history's included (review item 2). The local file keeps it.
  - **Tests:** RUN-71 (`tests/regression/mr-onion.site-lookup-ui.spec.ts`),
    RUN-72 (`src/lib/ownership/confirmation.test.ts`), RUN-73
    (`src/app/api/no-listing.test.ts`, `src/app/api/site-suites/route.test.ts`).
- **Found by the fresh-context review and fixed before commit, red first:**
  - A run on another site could be shown as a suite's last run: a run's
    store comes from the client. A run counts only on its own site now.
  - A suite saved for another origin in the same folder was listed (see
    the folder names, below). Only this origin's suites are.
  - The no-listing test didn't ask with a partial host, so a suggestions
    route would have passed. It does now.
  - A typed search didn't name its site in the address, so a reload lost
    it. It does now.
  - Accessibility:
    - focus moves to the confirming button when "Withdraw" is clicked, then
      to the status line once the API answers;
    - one status line, always in the page, replaces a live entry that was
      read aloud whole;
    - a refusal is shown outside the entry, so it shows even when the
      read-back fails;
    - "Keep it" is disabled while the withdrawal is with the API;
    - an entry being searched again is dimmed.
- **The owner's rulings at verification (Emil, 2026-11-17):**
  1. **`GET /api/runs` is restricted to one site.** It listed every saved
     run with its address, which is a list of the sites tested (the app
     never called it). It now requires `baseUrl` and returns only that
     site's runs. `no-listing.test.ts` allows `/api/candidates` alone to
     name more than one site, and failed on the old route first.
  2. **Two origins can share a site's folder** (`siteFolderName` maps
     every character outside `[a-z0-9.-]` to `_`, so `https://a.b:8080`
     and `https://a.b_8080` share one, from Phase 42). A known limitation
     (TEST_PLAN item 15, issue #51) with a ticket, TFP-291, not placed. It
     can't open the active gate or lift the caps: both compare the run's
     own host with the confirmation's typed hosts, and colliding origins
     always have different host names. The lookup shows only the suites
     saved for its origin.
- **Built against the record, as Claude Code read it, also:**
  - **Creating and renewing a confirmation** are AC1's, but the form is
    TFP-233's (Decision 2). The entry here shows, withdraws and sets the
    gap writer; the form adds the rest.
  - **The run form's link opens a new tab,** so the form keeps what was
    typed.
  - **"Nothing saved for this site"** shows when there is no confirmation
    now or before, the gap writer is off and no suite is saved.
- **Phase:** 46 · **Priority:** P2 · **Labels:** `ui`
- **Scope:** Decision 1. Acceptance Criteria 1.
- **Deliverables:**
  - the search field and the entry, calling the existing APIs by site;
  - the email masked on screen. Phase 43's API reads by site only, and it
    gains no listing route;
  - regression and `TEST_PLAN.md` cases.
- **Dependencies:** Phase 43's TFP-218.

### TFP-233 — The confirmation form

- **Status:** Done 2026-11-17: `342b357`, and `a58f4f1` (the active
  tick's label, the owner's Gate A ruling), on `main` by fast-forward (PR
  #52). Every check passed on its head `a58f4f1`: PR Validation, CodeQL
  and its alert check, and Release Image. Verified at Gate A by a planning
  session (2026-11-17).
  - **Where:** in the site lookup's entry
    (`src/app/_components/ConfirmationForm.tsx`), opened by "Confirm
    ownership", or "Renew" on a valid confirmation. A renewal replaces it,
    and the old one stays in the history.
  - **It posts to `/api/site-ownership` only,** with the API's wording for
    the chosen basis, sent back unchanged. Phase 35 Decision 8's legal note
    now comes with the wording from the same read (`legalNote`), so the
    text has one source (review item 3).
  - **Refusals are the API's,** listed as returned and focused. The form
    sets `noValidate`, so the browser doesn't stop what the API should
    refuse. A host the site doesn't use yet gets review item 4's note.
  - **Tests:** RUN-74 (`tests/regression/mr-onion.confirmation-form-ui.spec.ts`),
    RUN-72 (`legalNote`).
- **Found by the fresh-context review and fixed before commit, red first
  where it could fail:**
  - The default expiry was sent as a date, so it was midnight UTC, under
    90 days, and "Valid until" named the day it had already expired. The
    default is now left to the API (90 days to the minute). A picked date
    is that date from 00:00 UTC, and the entry shows the time.
  - While the form's request was with the API, a search or another action
    could run, and a late reply could put the first site's entry over the
    second's. The lookup's actions now wait, and a closed form ignores its
    reply.
  - Cancel focused a stale status line. It now returns to the button.
  - The review item 4 note keyed on the API's English. Both now share one
    text (`src/lib/ownership/messages.ts`).
  - "Renew" is offered for an expired confirmation too, as the run's
    closed reason says "renew it".
  - The refusals are a focused, named group, not also an alert. The save
    hint is linked to the button. A missing statement can't be ticked.
  - The spec read the date in the test, not the form, so it could fail
    across UTC midnight. It reads the form's own minimum now.
- **The owner's rulings at Gate A (Emil, 2026-11-17):**
  - **No basis is preselected** stays (Decision 2: "the basis is
    chosen"). The statement and its tick appear once one is chosen.
  - **The active tick reads** "Active tests: attack-shaped input (today:
    script-shaped input in forms), on a run that asks for active tests.",
    the category the stored statement names, with today's one payload
    test as its example. Changed with its test before the merge.
- **Built against the record, as Claude Code read it, also:**
  - **A renewal starts empty,** hosts included: Decision 2 has hosts typed
    every time, so nothing is carried over from the confirmation it
    replaces.
  - **The load tick says "Nothing uses it yet":** `scopes.load` is stored
    and named in the report, and no load test exists (D24).
- **Phase:** 46 · **Priority:** P2 · **Labels:** `ui`, `security`
- **Scope:** Decision 2. Acceptance Criteria 2.
- **Deliverables:**
  - the form;
  - regression and `TEST_PLAN.md` cases.
- **Dependencies:** TFP-232.

### TFP-234 — The promotion screen

- **Status:** Done 2026-11-17: `3538c37`, on `main` by fast-forward
  (PR #48). Every check passed on that head: PR Validation, CodeQL and its
  alert check, and Release Image. Verified by a planning session
  (2026-11-17). The owner kept both choices below (Emil, 2026-11-17).
  - **Where:** a page of its own, `/candidates`
    (`src/app/candidates/page.tsx`, `src/app/_components/PromotionScreen.tsx`),
    reached from "Candidate tests" in the app's header.
  - **It calls only `/api/candidates`** (Phase 42, TFP-196). It lists the
    candidates the API offers, each with its pattern, its code read-only,
    `promotionVerdict`'s reasons and every site it ran on by host.
  - **Approve (with a name) and reject (with a reason) go to the API,**
    and its refusals are shown as returned. The approved candidates are
    listed as waiting to be committed, with the pointer for Claude Code.
  - **Regression:** `tests/regression/mr-onion.promotion-ui.spec.ts`
    (RUN-70). Its candidate pool is seeded in the server's temporary data
    folder. For that, `playwright.regression.config.ts` now sets
    `MRONION_DATA_DIR` in its own process too, so its workers share the
    server's folder.
- **Found by the fresh-context review and fixed before commit, each red
  first:**
  - The spec deletes and rewrites `<data>/candidates`. With a
    `MRONION_DATA_DIR` pointing at a real data folder, it would have
    deleted that pool. It now runs only in the config's own temporary
    folder.
  - A decision answered with a reply that isn't JSON, or with no reply,
    showed nothing. It now says so, and nothing is decided.
  - Only the candidate being decided had its buttons disabled, so two
    decisions could race. Every Approve and Reject is now disabled while
    one is with the API.
  - After a refusal the list wasn't read again, so a candidate decided
    elsewhere stayed offered. Every answer now re-reads it.
  - Two origins on one host showed as one site beside the rule's "ran on
    3 sites". They are now named by origin.
  - Accessibility:
    - each Approve and Reject is described by its candidate's heading;
    - the code can be scrolled from the keyboard;
    - the loading text is a status;
    - the page has its own title.
  - The fixtures now cover the rule's edges: 2 clean sites, a real defect,
    a breach.
- **Built against the record, as Claude Code read it.** Two choices for the
  owner to keep or change; both stand (Emil, 2026-11-17):
  - **A page of its own, not a section of the run page.** Candidates
    aren't per site, and Decision 3 makes promotion the owner's decision
    on a candidate.
  - **The approver's name is typed once on the screen** and sent with each
    approval: the API requires `by`, and Mr Onion has no user identity
    yet.

- **Phase:** 46 · **Priority:** P2 · **Labels:** `ui`
- **Scope:** Decision 3. Acceptance Criteria 3.
- **Deliverables:**
  - the screen;
  - the waiting list and pointer;
  - regression and `TEST_PLAN.md` cases.
- **Dependencies:** none (Phase 42's API).

### TFP-235 — The active switch in the run form

- **Status:** Done 2026-11-17: `3217982`, and `ff63d62` (the route's own
  step, tested, at verification), on `main` by fast-forward (PR #53). Every
  check passed on its head `ff63d62`: PR Validation, CodeQL and its alert
  check, and Release Image. Verified by a planning session (2026-11-17).
  - **Where:** "Run active tests", under the interactive toggle
    (`src/app/_components/ActiveSwitch.tsx`), shown for a suite with an
    active test (`checksActiveGate`). It is labelled with what it sends:
    "attack-shaped input (today: script-shaped input in forms)", as the
    confirmation's tick reads since Gate A.
  - **It asks the API (review item 5):** `GET /api/site-ownership` gives
    `activeGate`, Phase 43's `decideActiveGate` for a run asking for active
    tests on the suite's target. Closed: disabled and off, with Phase 43's
    reason and a link to the site's lookup entry. Open: available. It reads
    again when the tab is focused, so a confirmation made in the lookup's
    tab shows on return.
  - **The run decides at its start** (Decision 4): the switch sends
    `enableActive` with the run (Run, Continue and rerun alike, through
    `startRun`), and only for a suite with an active test. A switch whose
    gate is read as closed turns off.
  - **Tests:** RUN-75 (`tests/regression/mr-onion.active-switch-ui.spec.ts`,
    and `activeGate` in `src/lib/ownership/confirmation.test.ts`). AC4's
    "the API decides" is Phase 43's real-run test
    (`src/lib/run/active-gate.run.test.ts`, RUN-61), unchanged: it starts
    runs through the executor (`startRunJob`) with `enableActive`, and
    skips without Chromium or a LAN address. The route's own step is
    tested now (planning session's verification, 2026-11-17): `POST
    /api/run` reads its request through `readRunRequest`
    (`src/lib/run/run-request.ts`), and `src/lib/run/run-request.test.ts`
    shows only `enableActive: true` asks for active tests ("true", 1,
    missing and false don't). Red first: with the check loosened to a
    truthy one, `"true"` asked for them. A source check pins the route to
    pass that result through, not read the body itself.
- **Found by the fresh-context review and fixed before commit, red first:**
  - The switch turned itself off whenever its section remounted (a run
    collapses it), as a read on its way counted as closed. Only a definite
    closed answer turns it off now.
  - A suite with no active test sent the switch's last value. `startRun`
    sends it only for a suite with one.
  - A read for an earlier target could show for a new one; a read counts
    only for the URL it was made for.
  - The status names the host it is about; it is a live region; the
    switch's description id is `useId()`; the lookup link waits for the
    read.
  - The "nothing is sent" test now reads the gate's modules too.
  - **Docs:** `docs/SITE_OWNERSHIP.md` and `README.md` name the site lookup
    and the switch; the README's "the lifted caps come next" was stale.
- **Built against the record, as Claude Code read it.** For the owner:
  - **The switch shows only for a suite with an active test,** as the
    interactive toggle shows only for a suite that reads its switch.
  - **Its state is kept in `useRun`**, not the page, and starts off on
    every open.
- **Phase:** 46 · **Priority:** P2 · **Labels:** `ui`, `security`
- **Scope:** Decision 4. Acceptance Criteria 4 and 5.
- **Deliverables:**
  - the switch, its states and reasons, and the link;
  - regression and `TEST_PLAN.md` cases.
- **Dependencies:** Phase 43's TFP-219; TFP-232.

### TFP-289 — Notes in the app's report tabs

- **Status:** Built (2026-11-17). Stopped for Gate B.
  - **Where:** `src/app/_components/TestNotes.tsx`. In the Execution tab,
    each test with notes has a "Notes" box after its observed outcome,
    every note whole. A Comprehensive run's view has "Notes from the run"
    (only the noted tests, each with its status), before "What this run
    did not test", which stays last, as in the HTML export.
  - **Apart from findings:** the screen reads `notes` as saved; no count,
    verdict, pass ratio or Not-run figure reads them. A test with none
    shows nothing.
  - **Tests:** RPT-24 (`tests/regression/mr-onion.report-notes-ui.spec.ts`),
    from real runs: a Standard run whose payload test the covered-host
    guard notes, and a Comprehensive run, which has no active test, given
    a note on one record on its way to the screen, as Gate B's fix's own
    Comprehensive test does. Red first, on the build before: the row had
    no Notes region and the view no "Notes from the run" ("element(s) not
    found"); the Standard run's record had the note.
- **Found by the fresh-context review and fixed before commit:**
  - The check that a note isn't in the observed outcome matched exactly,
    so a note appended to the outcome would have passed. It checks for any
    part of it now, and failed red on a mutant that appended it.
  - Each row's box was a region named "Notes", the same for every test.
    It is "Notes on <the test>".
  - The Comprehensive list names the browser when a run had more than one.
  - The spec opens the payload test's set by its summary, as a tester
    would; reads the app's run replies in arrival order; skips artifact
    downloads; and shows the Comprehensive view the guard's own
    stopped-script wording.
- **For the owner at Gate B:**
  - **The Comprehensive case is a substitute.** A Comprehensive run has no
    active test, so its view is shown a real Comprehensive run's reply
    with the stopped-script note added to one record, as Gate B's fix's
    Comprehensive test did. It proves the view, not that a Comprehensive
    run saves its notes (the HTML export's test covers the record). A
    candidate bound into a Comprehensive run can call the read-only guard
    (4812e84), so a real Comprehensive note is reachable, at the cost of a
    bound candidate and a beacon fixture in the spec.
  - **The counts are unchanged by inspection:** they read `report.summary`,
    built on the server, and only `TestNotes.tsx` reads `notes`.
- **Phase:** 46 · **Priority:** P2 · **Labels:** `ui`, `report`
- **Problem it solves:** since Phase 43's Gate B fix (PR #47) a test's notes
  are on its record and in the HTML exports, but not in the app's report
  tabs. A tester reading the run in the app doesn't see what a guard
  stopped, or that a payload test's result may not reflect the page
  (Phase 43, TFP-221's finding 1; Gate B ruling 3).
- **Scope:** Decision 6. Acceptance Criteria 6 and 5.
- **Deliverables:**
  - each test's notes in the Execution tab and the Comprehensive view;
  - regression and `TEST_PLAN.md` cases.
- **Dependencies:** Phase 43's Gate B fix (`4812e84`, the `notes` field).
  None in this phase.

## Recommended Execution Order

1. TFP-234.
2. TFP-232.
3. TFP-233.
4. TFP-235.
5. TFP-289 (added 2026-11-17, review item 8).

## Suggested Milestone Gates

### Gate A — Settings on screen
- TFP-232 to TFP-234 landed and independently verified.

**Gate A verification (planning session, 2026-11-17; it built none of
TFP-232 to TFP-234): every checked criterion met. The owner's ruling
(Emil, 2026-11-17): Gate A passes.**

| Check | How | Result |
|---|---|---|
| TFP-234: offer, reject, approve; no repo writes | Read the screen and its spec, 2026-11-17 | Only candidates meeting the rule; a rejection needs a reason; approved ones wait with the pointer; the spec refuses any data folder but its own temporary one |
| TFP-232: by site only (AC1) | Read `/api/site-suites`, the ownership routes, the runs route | Each needs `baseUrl`; `GET /api/runs` restricted to one site (owner ruling); only `/api/candidates` names more than one site, by Decision 3 |
| TFP-232: email masked (review item 2) | Read `maskedOwnership` in the routes | Every response masks it, history included; the file keeps it in full |
| TFP-233: the form keeps its friction (AC2) | Read `ConfirmationForm.tsx` on `342b357` | Hosts start empty, typed one per line; no basis preselected, and changing basis unticks the statement; the statement is the API's wording, with the legal note beside it; name and email required; 90 days by default, the picker's `max` one year on; active and load start off |
| Refusals come from the API | Read the form's submit | Shown as returned; the form doesn't repeat the rules |

Not checked here: the suites (882 unit, 5 self-test, 91 regression
reported) and PR #52's checks (reported green on `342b357`).

**The owner's rulings (Emil, 2026-11-17):**
1. **Gate A passes.**
2. **No basis preselected** stays: it matches Decision 2.
3. **The active tick's label** reads "Active tests: attack-shaped input
   (today: script-shaped input in forms), on a run that asks for active
   tests." The stored statement says "attack-shaped input", and a
   confirmation lasts up to a year while later phases add more active
   tests (D3, D10), so the tick names the category with today's example.
   Changed with its test in TFP-233's pull request (PR #52).

### Gate B — The run form
- TFP-235 and TFP-289 landed and independently verified.
- A walkthrough with Emil: confirm a local and a remote site, start a run
  with the switch, and approve a stand-in candidate.
