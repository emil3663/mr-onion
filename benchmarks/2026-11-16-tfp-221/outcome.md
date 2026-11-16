# TFP-221 — The script-payload test on local with-bugs, and nothing else changed

Phase 43, Acceptance Criteria 6 and 7. Measured 2026-11-16, on `main` at
`1da312a` (its code is TFP-220's merged head, `1d0a84c`). It was started the
same day, not overnight: owner decision, 2026-11-16.

## The decisions it was measured against

- **The base is Action Gate's runs on `202a17a`** (owner decision,
  2026-11-15; review item 6). Those are
  `benchmarks/2026-11-15-phase-43-base/`, not Phase 39's final runs, which
  Acceptance Criterion 6 first named.
- **"The same" means each test's status and its Not run reason**, matched by
  title. Failure messages and findings aren't compared.
- **Active tests on means one Standard run through the app**, with
  `enableActive: true`, on the local with-bugs copy, a local host. Each
  payload result is matched to the answer key
  (`benchmarks/2026-10-06-toolshop-known-bugs/answer-key.md`), and every
  request the covered-host guard stopped or failed on is listed.

## 1. Switch off: Action Gate on `main`, test by test

Action Gate dispatched on `main` at `1da312a`, run
[43863206585](https://github.com/emil3663/mr-onion/actions/runs/43863206585),
12:03:58 to 12:24:38 UTC, every step passed. Its `clean-baseline` and
`with-bugs` reports are in `action-gate/`, the same artifacts the base kept.
`compare.mjs` matched them to the base (`comparison.txt`).

| Copy | Base (`202a17a`) | Now (`1da312a`) | Tests matched | Status changed |
| --- | --- | --- | --- | --- |
| clean | 470 / 406 passed / 46 failed / 18 not run | 470 / 406 / 46 / 18 | 470 of 470 | 0 |
| with-bugs | 481 / 377 passed / 84 failed / 20 not run | 481 / 377 / 84 / 20 | 481 of 481 | 0 |

**Every test has the same status on both copies, and the same failure set.**
There are 6 differences, each a Not run reason, and each one intended:

- **Clean:** TFSC-034 (Search on `/`), TFSC-035 (`/auth/register`) and
  TFSC-036 (`/contact`).
- **With-bugs:** TFSC-034 (`/#/auth/register`), TFSC-035 (`/#/contact`)
  and TFSC-036 (`/#/auth/login`).

In each, the script-payload test's reason went from "attack-shaped input:
needs the ownership confirmation, not built yet" to "active test: not
available in CI yet (TFP-249)". Action Gate runs Mr Onion's action, so
the CLI, which can't ask for active tests (review item 3, TFP-220).

**Masked to match:** 70 of clean's titles, and 2 of its Not run reasons,
name record ids (ULIDs), which the clean copy draws again each time its
database is seeded. They are matched with the ids masked. With-bugs' ids
didn't change.

## 2. Switch on: one Standard run through the app, local with-bugs

**How it ran** (`run-active.mts`):

- **The app:** `next build`, then `next start` on `127.0.0.1:3100`, on a
  temporary data folder and `LOCALAPPDATA`.
- **No model:** `OPENAI_API_KEY` and the local model's setting were empty,
  so the template wrote the suite.
- **The calls:** the app's own API, as the UI does: the crawl, the page
  selection by type, the inspection, the generation, then `POST /api/run`
  with `enableActive: true`.
- **The site:** the with-bugs copy, started fresh (seeded) at 12:08 UTC.
  The run went from 12:10:58 to 12:16:53.

**What the run reported** (`with-bugs-active/`):

- **The pages:** 34 crawled; 8 tested (`/#/`, `/#/product/6`,
  `/#/category/hand-tools`, `/#/auth/register`, `/#/contact`,
  `/#/auth/login`, `/#/auth/forgot-password`, `/#/chainsaws`).
- **The suite:** 481 tests generated from the template, the site suite's
  first run.
- **The gate:** "Active gate: open (a local host, which needs no ownership
  confirmation)". Host limits: 3 workers, no request cap.
- **Totals:** 481 planned, 378 passed, 84 failed, 19 not run, 0 blocked.

**Against the switch-off run.** `compare-active.mjs` compared it with
Action Gate's with-bugs run (`comparison-active.txt`). Only the 3 payload
tests differ; the other 478 tests have the same status and reason, so the
same 84 failures. That holds although the two ran on different machines
(this Windows machine, and GitHub's `ubuntu-26.04`).

### Each payload result, against the answer key

The answer key lists no bug where a page renders input as HTML. Its 7
active-gate bugs (71, 74, 76 to 79, 81) are attacks on the API, which the
payload test doesn't attempt.

| Test | Form | Result | Against the answer key |
| --- | --- | --- | --- |
| TFSC-036 | `/#/auth/login`, "Your E-mail" | **Passed**: the form was submitted with the payload, and nothing ran | No listed bug, and none found. Matches. |
| TFSC-034 | `/#/auth/register`, 9 text fields | **Not run**: "submitting the form ... sent no request, so the payload never reached the site" | Untested. Explained below. |
| TFSC-035 | `/#/contact`, First and Last name | **Not run**: the same reason | Untested. Explained below. |

**Why two forms didn't submit** (reasoned from the saved page data, not
measured). Both are Angular forms that validate in their own code, not
with HTML constraints, so the test's browser-validation check passes them.

- **Register:** the test leaves Password and State empty.
- **Contact:** it leaves Subject (a select) empty, and Message isn't among
  the fields it fills.

The app then refuses to submit and sends nothing, so the test skips itself
with its own reason, which is the honest outcome. Since Phase 38 moved
these tests to the active gate they were always Not run, so this is the
first time it shows.

### What the covered-host guard stopped or failed on: nothing

- **Covered hosts:** `localhost`, the target, with no confirmation (TFP-220's
  second reading, kept at its verification: a local target covers itself,
  by host name). The login form posts to the API
  at `localhost:8091` (`src/environments/environment.ts`, per the local
  copies' README), the same host, so it would be allowed through.
- **No breach:** none of the 3 payload tests failed, and a breach fails
  its test.
- **No request stopped:** the guard records a stopped request only as a
  Playwright note, which Mr Onion's report doesn't carry (finding 1). So
  the three payload tests of the run's saved suite were run again alone
  (`guard-notes.mts`, `guard-notes.txt`). That was against the copy
  started fresh at 12:29 UTC, with the settings the run gave them (the
  gate open, covered host `localhost`).
- **The re-run's results:** the same three, login passed and the other two
  skipped for the same reason. Not one guard note: the guard stopped
  nothing. The page needs no script, image or frame from another host.
- **Ruling 3 at TFP-220's verification** (a third-party write stays a
  breach, revisit after TFP-221): no third-party write happened on this
  copy, so the measurement gives no case for changing it.

## Acceptance Criteria

- **6. Unchanged by default: met.** With the switch off, both local copies
  are the same as the base, test by test, in status and failure set. The
  only differences are the payload tests' reason, described above. The
  template difference was accepted at Gate A and TFP-220 (baseline
  `6397e37`).
- **7. One real run: met as worded, with a gap to rule on.** The payload
  test ran on each form it targets: all 3 under the open gate. Its results
  are recorded against the answer key, and there was no finding to match
  or explain. But only the login form was really tested: on register and
  contact the payload never reached the site (finding 2).

## Findings for Gate B

1. **The guard's notes never reach Mr Onion's report.** The covered-host
   guard's stopped requests aren't in `report.json` or its export.
   Neither are the read-only guard's beacon notes (TFP-199), nor ruling 4's
   "the result may not reflect the page as visitors see it". They exist
   only in Playwright's JSON report, which a run discards.
   - *Checked:* not one record in this run's report holds a note.
   - *Why:* the report's records carry findings, measurements, issues and
     skip reasons, not `note` annotations.
   - *For the owner:* the ruling says the note is in "the test's note",
     and as built nobody using Mr Onion sees it.
2. **Two of the three payload tests can't submit their form on the
   with-bugs copy**, because the test doesn't fill Angular's required
   selects, password or message. The test skips itself honestly, but the
   two forms aren't tested.
3. **This measured the gate open on a local host only.** No confirmed
   remote host was measured here. That path is covered by the unit suite's
   real runs on this machine's LAN address (RUN-61, RUN-66, RUN-67).

## Limits

- **One run each,** not repeated.
- **The local run was on this Windows machine,** with Chromium 151 and
  Playwright 1.62.1, as CI pins. The hosted Toolshop wasn't run.
- **The local run's `report.json` and `generate-meta.json` were redacted
  before commit.** The temporary data folder's path became `<data>`, and
  the repository's path `<repo>`, in each evidence file's path. Nothing
  else was changed.
- **The guard-notes re-run** ran the saved suite's three tests through
  Playwright directly, not through the app, to keep Playwright's report.
  It started the copy fresh again, so the data was re-seeded.

## Timings

| Step | Started (UTC) | Took | Projected |
| --- | --- | --- | --- |
| Action Gate on `1da312a` | 12:03:58 | 20.7 min | 23 min (the base run) |
| Toolshop with-bugs start | 12:08 | 70 s | 38 to 49 s (its README) |
| `next build` | 12:08:19 | 76 s | — |
| The active run, crawl to report | 12:10:58 | 5.9 min | 15 min (an estimate; no earlier run through the app) |
| Toolshop start, for the guard-notes re-run | 12:29 | 44 s | 38 to 49 s (its README) |

## Files

- `run-active.mts`: drives the app, as the UI does.
- `with-bugs-active/`: that run's crawl, page data, suite, report and
  output.
- `action-gate/clean/report.json`, `action-gate/with-bugs/report.json`:
  Action Gate's artifacts, unchanged.
- `compare.mjs`, `comparison.txt`: the switch-off comparison with the base.
- `compare-active.mjs`, `comparison-active.txt`: the active run against
  the switch-off run.
- `payload-results.mjs`: each payload test's result from the report.
- `guard-notes.mts`, `guard-notes.txt`: the re-run that reads the guard's
  notes.
