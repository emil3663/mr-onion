# Phase 45 Decision Record — The Docker Sandbox for Model-Written Tests

Date: 2026-10-20
Scope: Every test a model wrote runs inside a Docker container. That means:
- gap tests (Phase 42);
- candidates (Phase 42);
- scenario tests (Phase 44).

The container can reach nothing on the machine and nothing on the network
except the run's target hosts. Only the results leave it. The template's
tests and promoted library entries, which are reviewed code, keep running
as today.

Status: **Locked (Emil, 2026-10-20). In progress: TFP-228 built (2026-11-22), stopped for verification.** Decisions, acceptance criteria and tickets approved.
- Reviewed before building (planning session, 2026-11-21): see the next
  section. Its proposals are confirmed (owner, 2026-11-21).
- **Moved up in the build order** (owner, 2026-11-21): next, ahead of D29.
  Why: review item 1.
- This is R5's first decision record (`post-phase-42-review-plan.md`).
- Its build order: after D19, before Phase 44's writer (TFP-226)
  (`deferred-work-register.md`). Amended 2026-11-21: next, before D29
  (review item 1).
- Tickets TFP-228 to TFP-231.

## Review before building (planning session, 2026-11-21)

This record was locked on 2026-10-20, before Phases 43, 46, 47 and 48,
TFP-292 and the 0.5.0 release. Checked against `main` at `980d876`. The
design stands; these amendments apply and override older wording below.
Items 1, 2, 4 and 7 were proposals; the owner confirmed all four on
2026-11-21.

1. **Build order: Phase 45 is next (owner, 2026-11-21).** The triaged
   order put it eleventh, after D29, the Standard sets, failure triage
   (D19), D27 and D28. It moves up because several things now hinge on it:
   - since 0.5.0 nothing model-written runs (TFP-292): the gap writer,
     candidates, promoted entries, and the local model's and OpenAI's
     suites are all off until this phase lands;
   - Phase 44 (scenario tests), TFP-300 (the rejection list) and the
     candidate pool all need model-written tests running again;
   - the order was set on 2026-10-19, when the code check was thought to be
     enough and the sandbox was defence in depth. TFP-292 showed the check
     can't be made complete, so the sandbox is now the only way those
     features come back.

   Rejected: keeping the order with D29 next, as the register promised
   after Phase 46. D29 moves to straight after Phase 45; the rest keeps its
   order.
2. **D28 (owner, 2026-11-21).** D28's sweep was to come before this phase. TFP-292's
   two fresh-context reviews covered `src/lib/gap-writer/` and
   `src/lib/candidates/`. Decided: D28 is done for those zones; its
   other two (`src/lib/run/child-env.ts`, and the paths that read model
   output back into reports) are checked at Gate A, with Acceptance
   Criteria 2 and 4, rather than in a separate sweep first.
3. **What runs inside widens (TFP-292).** Decision 1's list adds:
   - the local model's gap fill on Standard and its scenarios on
     Comprehensive;
   - OpenAI's whole suite;
   - a site suite's saved gap tests.

   Where a model's tests were merged into the template's file, they run as
   their own spec in the sandbox, and the template's stay on the host.
   OpenAI's suite runs whole in the sandbox: the model wrote all of it,
   imports and `describe` bodies included, and Playwright runs those when it
   loads the file even when every test is skipped.
4. **Promoted library entries run inside too (owner, 2026-11-21).** Decision 1 kept
   them on the host as reviewed code; TFP-292 held them back because they
   began as model-written candidates. TFP-292's reviews found ways past the
   code check subtle enough that a person reading a body can miss them, and
   promotion reviews whether a test is useful, not whether it is safe. In
   the sandbox they cost nothing extra. The template's tests and the
   tester's own suites stay on the host.
5. **The sandbox is the boundary.** Decision 3's "defence in depth behind
   the code check" no longer holds: the check is an allowlist kept as a
   first filter (TFP-230's amendment), and nothing relies on it. The
   Context's description of TFP-202's check is history.
6. **One route, not a switch.** TFP-230 replaces `MODEL_BODIES_RUN` with a
   single route: a model-written body runs in the sandbox or not at all. No
   code path runs one on the host, at any setting. A test shows the host
   runner refuses a spec marked model-written. The tests TFP-292 skipped
   with the Phase 45 reason run again through the sandbox, or are removed
   where they only tested the host path, with each named.
7. **Remote sites: the site's own hosts only (owner, 2026-11-21).** Decision 3
   allows the hosts a remote site's pages load, third parties included. A
   signed-in run mounts the session (`storageState`), so an allowed third
   party is a way out for it. Decided: allow only the site's own
   hosts, by Phase 43's same-site rule (the Public Suffix List), and refuse
   third-party requests, naming each in the results. Pages may draw less
   completely, as with the read-only guard's stubbed beacons. Rejected:
   allowing third parties on runs that aren't signed in.
8. **Where there's no Docker: CI and the release image.** Mr Onion's own
   image and the GitHub Action have no Docker inside, and mounting the host's
   Docker socket would hand the tests the host. So in CI and in the image,
   model-written tests are Not run with Decision 5's reason ("sandbox
   unavailable"), and the socket is never mounted. Decision 5's "start
   Docker Desktop" applies to a desktop only.
9. **Credentials.** Only the session (`storageState`) enters the container.
   Login passwords, under TFP-293's `MRONION_LOGIN_` names, never do.
   Acceptance Criteria 2's environment check includes them.
10. **The image pin is 1.62.1 today** (Playwright, with Chromium 151), as in
    Mr Onion's own image. Chromium 151 doesn't stop a beacon on a route
    abort (Phase 43); the proxy refuses at the network, which covers that.
11. **Containment is proven without publishing ways past the filter.**
    Acceptance Criteria 2's test-only path hands the sandbox a body without
    the code check, so no fixture needs a way past it. At Gate A, the
    verifier also runs the privately recorded gaps against the sandbox,
    outside the repo.
12. **No new screen.** The phase adds report notes only, so the Screens
    rules (`QUALITY_GATES.md` §4) don't apply.

## Context

- **Phase 42's batch 2 ruling 5 (2026-10-14).** Gap tests "turn text read
  from a site under test into code that runs on Emil's machine, and
  candidates carry that code to other sites". TFP-202 hardened them (P0),
  and "a real sandbox (the tests run inside Docker) is the follow-up".
- **TFP-202's hardening, as built:**
  - Claude Code is called with every tool off, from an empty temporary
    folder.
  - Tests run with a stripped environment (`src/lib/run/child-env.ts`).
  - The code check parses the body and refuses imports, `process`,
    `require`, network and dynamic code.

  That is a filter on the code. Nothing contains the code if the filter
  misses something.
- **Where model-written code runs today:**
  - gap tests: `runGapSpec` in `src/lib/gap-writer/gap-run.ts`;
  - candidates and bound candidates: bound into the main run
    (`src/lib/candidates/apply.ts`, TFP-203).

  Both run on the host, as the user, with the repo, the data folder and the
  home folder in reach.
- **Phase 44** makes scenario tests the gap writer's purpose. They change
  data on purpose, so containing them matters more.
- **The gap writer is off unless a site opts in.** Nothing runs model code
  by default today, so the sandbox lands before Phase 44's writer, not
  urgently now.

## Decisions

1. What runs in the sandbox, and what doesn't.
- **Inside:** every test a model wrote:
  - gap tests and their revisions;
  - candidates, bound or not;
  - scenario tests.

  It doesn't matter which run mode or which site.
- **Outside, as today:** the reviewed code:
  - the template's tests;
  - promoted library entries (Phase 42's promotion is a reviewed commit
    with Emil's approval).
- **The writer stays on the host.** Claude Code is called with every tool
  off, from an empty folder (TFP-202), and writes text, not running code.
  Running it in the container would need its sign-in inside the container.
  - The writer's revisions read the sandbox's results like any other.
- **Bound candidates leave the main run.** They move into the sandbox run
  of the same job, and their results are merged into the report's
  candidate and gap sections as today.

2. The container.
- **Image:** Microsoft's Playwright image, pinned to the exact version
  `package.json` resolves (`@playwright/test`), and to its digest.
  - A Playwright upgrade moves the pin in the same commit.
  - The tests run in Chromium only (Phase 16).
- **One container per run,** not per test. It holds every model-written
  test of that run and is removed when they finish.
- **Mounts:**
  - the run's model-written specs and their config, read-only;
  - one empty output folder, writable.

  Nothing else: not the repo, not the data folder, not the home folder.
- **Environment:** TFP-202's stripped environment. No keys, tokens or
  TestForge settings.
- **Sign-in state:** a signed-in run's `storageState` (Phase 20) is mounted
  read-only for the run and removed after. It is never written into the
  image or the output folder.
- **Limits:**
  - CPU and memory capped;
  - not privileged;
  - no added capabilities;
  - a non-root user;
  - a read-only root filesystem, apart from the output folder and a
    temporary folder.

3. The network: only the run's target hosts (Emil, 2026-10-20).
- **The way out:** the container's only route is a small forward proxy
  started with it. The proxy allows:
  - the run's target hosts;
  - for a remote site, the hosts its pages load, as recorded by the main
    run's crawl.

  Anything else is refused and named in the results.
- **The browser in the container uses the proxy.** The container sits on
  an internal Docker network with no other way out.
- **Local targets** (the local Toolshop copies, in WSL from D26) are reached
  through the host.
  - The app calls its API at `http://localhost:8091` from the browser, so
    inside the container `localhost:4200` and `localhost:8091` must reach
    the host's ports.
  - The mechanism is named in TFP-229's commit. Proven by Acceptance
    Criteria 3.
- This is defence in depth behind the code check, which already refuses
  `fetch`, `XMLHttpRequest`, `WebSocket` and `page.request`.

4. What leaves, and how it is checked.
- **Only the output folder leaves:**
  - Playwright's JSON report;
  - for failures, traces, screenshots and video.
- **Capped in size.** A run over the cap keeps its report and drops the
  largest attachments, saying so.
- **TestForge reads it as untrusted data,** like the page text in TFP-202.
  - It is parsed, never executed.
  - Every captured file goes through Phase 20's credential scan, as today.

5. No Docker, no model-written tests (Emil, 2026-10-20).
- If Docker isn't running, or the image or proxy won't start, every
  model-written test in the run is Not run, with the reason "sandbox
  unavailable: start Docker Desktop".
- The rest of the run goes ahead.
- They are never run outside the sandbox. There is no setting to allow it.

6. The cost: at most 60 seconds per run (Emil, 2026-10-20).
- **What's measured:** start, proxy, the tests' own time, and removal, on
  local Toolshop. The image pull is done once and measured separately.
- **Up to 60 s more** than the same tests run on the host today: kept.
- **Over 60 s:** the design is revisited before it is kept, for example by
  keeping one container warm between runs. Recorded either way.

7. Results are the same.
- On the fixture, every model-written test gets the same result inside the
  sandbox as it got on the host, apart from tests that reach a host outside
  the allowed set. Those are now refused, and each is named.

## Acceptance Criteria

1. What runs where
- **The model's tests:** on the fixture, with the gap writer (a stand-in
  writer) and candidates on, the run record shows every model-written test
  ran in the sandbox.
- **The rest:** the template's tests and promoted entries ran on the host.
- **The writer:** runs on the host, with TFP-202's flags.

2. Containment
- **Files:** a stand-in test that slips past the code check (a test-only
  bypass) can't read a file in the repo, the data folder or the home
  folder. It can't write outside the output folder.
- **Environment:** it can't read an environment variable TestForge holds.
- **Privileges:** it runs as a non-root user, with a read-only root.

3. Network
- **Blocked:** a request to a host outside the allowed set is refused, and
  the results name the host.
- **Local Toolshop:** a sandboxed test reaches local with-bugs, including
  the app's own calls to `localhost:8091`, and passes where it passed on
  the host.

4. What leaves
- **The cap:** an oversized output is cut to the report, with the drop
  named.
- **The scan:** every captured file goes through the credential scan.
- **Untrusted data:** a report holding a script-shaped string is shown as
  text.

5. No Docker
- **Not run:** with Docker stopped, every model-written test is Not run
  with Decision 5's reason.
- **The rest:** the other tests run and pass as before.
- **No bypass:** no option runs them on the host.

6. Cost and results
- **Overhead:** Decision 6's measurement on local Toolshop, with the 60 s
  rule applied.
- **Same results:** Decision 7's comparison on the fixture.
- **Template:** `check:template-unchanged` reports every fixed input identical against
  the recorded baseline (`TEMPLATE_BASELINE`). The count is whatever the
  check's input set holds at the time, 166 when this was written, not a
  fixed number. Model-written tests
  aren't template output.

## Regression Policy

- **`TEST_PLAN.md` cases:**
  - each mount;
  - each limit;
  - the proxy's allow and refuse;
  - the local-target route;
  - the output cap;
  - the credential scan of sandbox output;
  - Docker unavailable;
  - bound candidates leaving the main run;
  - results unchanged.
- **The image pin:** a unit test fails if the image's Playwright version and
  `package.json`'s resolved version differ.

## Related, deferred (not this phase)

- **The main run in a container.** Not planned: the template is reviewed
  code. Revisit if TestForge is ever deployed (the SaaS phase,
  `saas-prerequisites.md`).
- **The writer in a container,** if Claude Code's sign-in can be used
  there.
- **A warm container between runs,** only if Decision 6's bar is missed.

## Dependencies and order

- **D26:** the local Toolshop copies in WSL. The local-target route is
  proven against them.
- **Phase 43:** none directly.
- **Before Phase 44's TFP-226.**
- **In the build order:** after D19, before Phase 44.

## Backlog

### TFP-228 — The sandbox container and its mounts

- **Phase:** 45 · **Priority:** P1 · **Labels:** `security`, `run`
- **Status:** Built (2026-11-22). Stopped for verification. `src/lib/sandbox/`
  and `sandbox/Dockerfile`; RUN-92 to RUN-98. Nothing routes a test to it yet
  (TFP-230), and it has no network yet (TFP-229: `--network none` until the
  proxy). The container also enforces its own time limit, so it ends if Mr
  Onion's process dies or a test blocks Node.
  - **For TFP-230, from this ticket's review:** a signed-in run's session
    can reach the output folder (a failing test's trace holds its cookies,
    and a body can write them out), so the output must go through Decision
    4's credential scan before anything reads it, as Acceptance Criteria 4
    says; TFP-230's tests include a failing signed-in test. And "no host
    path" is checked again against the routing code there: at this ticket
    it's a check of the sandbox module's source.
  - **From the planning session's verification (2026-11-23):** the output
    folder is the container's, so anything in it may be a link. The report
    is read only as a regular file directly in it, never through a link, and
    only once Docker confirms the container is gone (RUN-98). TFP-230 reads traces,
    screenshots and video through the same reader, `readSandboxOutput`.
- **Problem it solves:** model-written code runs on the host with the repo,
  data and home folder in reach.
- **Scope:** Decisions 2 and 5. Acceptance Criteria 2 and 5.
- **Deliverables:**
  - the pinned image and its version test;
  - one container per run;
  - the mounts, environment and limits;
  - the no-Docker rule;
  - `TEST_PLAN.md` cases.
- **Dependencies:** none.

### TFP-229 — The network: target hosts only, and local targets through the host

- **Phase:** 45 · **Priority:** P1 · **Labels:** `security`, `run`
- **Scope:** Decision 3. Acceptance Criteria 3.
- **Deliverables:**
  - the internal network and proxy;
  - the allowed set from the run;
  - the local-target route, named in the commit;
  - `TEST_PLAN.md` cases.
- **Dependencies:** TFP-228; D26.

### TFP-230 — Model-written tests run in the sandbox; results come back

- **Phase:** 45 · **Priority:** P1 · **Labels:** `security`, `run`, `report`
- **Scope:** Decisions 1 and 4. Acceptance Criteria 1 and 4.
- **Deliverables:**
  - gap tests, candidates and bound candidates routed to the sandbox;
  - the output read as data, capped and scanned;
  - the report sections unchanged;
  - `TEST_PLAN.md` cases.
- **Dependencies:** TFP-229.
- **Added (owner, 2026-11-21, with TFP-292):** model-written bodies run
  again only inside the sandbox, with the code check's allowlist kept as a
  first filter. Until then they don't run at all
  (`src/lib/gap-writer/model-bodies.ts`). That includes the local model's
  and OpenAI's whole-suite generation (amended the same day). This ticket
  turns them back on there, and the tests skipped until then run again.

### TFP-231 — Measure the sandbox (Gate B)

- **Phase:** 45 · **Priority:** P2 · **Labels:** `measurement`
- **Scope:** Decisions 6 and 7. Acceptance Criteria 6.
- **Deliverables:**
  - the overhead on local Toolshop;
  - the same-results comparison on the fixture;
  - an `outcome.md`;
  - the 60 s rule applied.
- **Dependencies:** TFP-230.
- **Stop at Gate B.**

## Recommended Execution Order

1. TFP-228.
2. TFP-229.
3. TFP-230.
4. TFP-231.

## Suggested Milestone Gates

### Gate A — Contained
- TFP-228 and TFP-229 landed and independently verified.
- Acceptance Criteria 2 and 3 are shown.

### Gate B — In use and measured
- TFP-230 and TFP-231 landed and independently verified.
- The 60 s rule is applied and recorded.
