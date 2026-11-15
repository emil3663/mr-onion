# Handover to Claude Code — TFP-287, then Phase 43 (2026-11-14)

Use this now. In the commit that adds the first work from this file,
delete `HANDOVER_TO_CLAUDE_CODE_2026-11-13-after-phase-48.md` (`git rm`):
this file replaces it, and its queue is done (TFP-248, `v0.4.0`, TFP-282 to
TFP-284). Its history is in git and the records.

## Read first

- `CLAUDE.md` and `docs/WORKING_AGREEMENTS.md`: the loop, the decision
  vocabulary, and what needs confirmation.
- `docs/decisions/phase-43-ownership-confirmation-decision-record.md`.
  Start with its **"Review before building" section (2026-11-14)**: it
  amends the record for the rename, CI and Chromium 151, and it overrides
  older wording below it.
- `docs/decisions/workflow-and-ci-backlog-2026-10-26.md`: TFP-287.
- `src/lib/generate/read-only-guard.ts`: the guard as it stands, with its
  history in the header comment (TFP-181, TFP-199, TFP-284).

## Standing rules for this stretch

- One ticket at a time. Each stops for verification unless its entry says
  otherwise. Commit and push each verified ticket before the next.
- A pull request is green only when `gh pr checks` passes every check on
  its head commit, CodeQL's alert check included.
- Every test and live check uses a temporary `LOCALAPPDATA` (and
  `XDG_DATA_HOME` in WSL), never the real data folder. On Windows, point
  `PLAYWRIGHT_BROWSERS_PATH` at the real browsers when you do.
- Run `npm run check:old-name` before every push.
- Template output changes only where a ticket says so, with
  `check:template-unchanged` showing exactly what changed. The baseline
  moves in its own commit, then a dispatched nightly on the branch must be
  green.
- No timing or measurement sessions without asking first. TFP-221 is one:
  ask, and batch it overnight.
- Planning sessions may have uncommitted docs in the tree. Leave files you
  didn't change alone, and say so.

## Work, in order

1. **TFP-287: the read-only guard covers references a page saves at load**
   (owner decision, 2026-11-14: before Phase 43). As its backlog entry
   says. Red first at the server: a page that saves `navigator.sendBeacon`,
   `window.fetch` and `fetchLater` at load and calls them after the guard
   arms reaches the server today; with the dormant wrapper it doesn't.
   TFP-199's classes stay as they are (a site's beacon is noted, a
   control's write is a breach). The template baseline moves once. Close
   #35 if every saved-reference case is covered. If one can't be, name it
   and keep #35 open. Stop for verification.

2. **Phase 43, from its record, with its review section applied:**
   - **TFP-218:** the confirmation, stored per site, and its API.
   - **TFP-219:** the active gate opens on a covered host, by run switch.
     The switch is set from the run's request, never inherited from the
     environment (review item 2). Gate A after it: stop for independent
     verification and the owner's ruling.
   - **TFP-220:** active tests reach only covered hosts, and the caps come
     from the confirmation. It's built on the read-only guard's stub and
     wrapper (review item 4). It includes the CLI: a confirmation lifts the
     caps in CI, and active tests stay Not run there (review item 3).
   - **TFP-221:** the measurement, against runs of `main` taken just before
     TFP-219 lands (review item 6). Ask before starting it. Gate B after
     it: stop for independent verification and the owner's ruling.

3. **Stop after Phase 43's Gate B.** The register's next item is Phase 46,
   the app screens. Its record predates Phases 47 and 48 too, so a
   planning session reviews it first and writes the next handover.

## Not for this handover

- TFP-286 (Playwright 1.63+ and its step titles): not placed yet. There's
  no pressure while CI is pinned to `ubuntu-26.04` on Playwright 1.62.1.
- TFP-249 (D31): interactive and active gates in CI, after Phase 43.
- D25, a summary email after a site run: its record is still to write.
