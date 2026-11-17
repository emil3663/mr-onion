# Handover to Claude Code — Phase 46, the app screens (2026-11-17)

Use this now. In the commit that adds the first work from this file,
delete `HANDOVER_TO_CLAUDE_CODE_2026-11-14-phase-43.md` (`git rm`): this
file replaces it, and its queue is done (TFP-287, Phase 43).

## Read first

- `CLAUDE.md` and `docs/WORKING_AGREEMENTS.md`.
- `docs/decisions/phase-46-app-screens-decision-record.md`. Start with its
  **"Review before building" section (2026-11-17)**: it amends the record
  and overrides older wording below it.
- Phase 43's record only where a ticket touches the confirmation or the
  gate: `src/lib/ownership/confirmation.ts`, `src/lib/run/active-gate.ts`.

## Standing rules for this stretch

- One ticket at a time; each stops for verification. Commit and push each
  verified ticket before the next.
- A pull request is green only when `gh pr checks` passes every check on
  its head commit, CodeQL's alert check included.
- Every test and live check uses a temporary `LOCALAPPDATA` (and
  `XDG_DATA_HOME` in WSL), never the real data folder.
- Run `npm run check:old-name` before every push.
- These are screens: template output doesn't change. If it does,
  `check:template-unchanged` shows exactly what, and the owner accepts it.
- Planning sessions may have uncommitted docs in the tree. Leave files you
  didn't change alone, and say so.

## Work, in order

1. **Add TFP-289 and Decision 6 to the record** from the review's item 8
   (notes in the app's report tabs), with an acceptance criterion, in the
   record's own style. Add it to the execution order after TFP-235.
2. **TFP-234: the promotion screen** (needs only Phase 42's API).
3. **TFP-232: the site lookup.** It includes the review's items 2 (the API
   masks the contact email), 6 (saved suites and their last run, by site)
   and 7 (no listing route but `/api/candidates`).
4. **TFP-233: the confirmation form** (review items 3 and 4). Then
   **Gate A**: stop for independent verification and the owner's ruling.
5. **TFP-235: the active switch** (review item 5: the gate comes from the
   API).
6. **TFP-289: notes in the app's report tabs.** Then **Gate B**: stop for
   verification, and the owner's walkthrough (review item 9).
7. **Stop after Gate B.** The register's next item is D29 (a retention
   policy for saved runs), which needs its own record from a planning
   session.

## Not for this handover

- TFP-286 (Playwright 1.63+), TFP-288 / D45 (the payload test's required
  fields), TFP-249 (D31, active tests in CI): not placed yet.
- A version tag: Phases 43 and 46 can ship together as 0.5.0 once Phase 46
  completes. Ask the owner then.
