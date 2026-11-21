# Handover to Claude Code — after 0.5.0 (2026-11-21)

Use this now. In the commit that adds the first work from this file,
delete `HANDOVER_TO_CLAUDE_CODE_2026-11-17-phase-46.md` (`git rm`): this
file replaces it, and its queue is done (Phase 46, TFP-301, TFP-292, the
0.5.0 release).

## Where things stand

- **0.5.0 is released** (`v0.5.0` on `7b113f9`; image
  `ghcr.io/emil3663/mr-onion:0.5.0`). It ships Phases 43 and 46 and
  TFP-292.
- **Model-written tests don't run** until Phase 45's sandbox
  (`MODEL_BODIES_RUN = false`, TFP-292). Nothing turns that on outside the
  sandbox's own work, tests included.
- **Phase 45** (the sandbox) is the next phase, moved up by the owner on
  2026-11-21. Its record was reviewed the same day; the "Review before
  building" section amends it and overrides older wording below it.
- **The security advisory** for TFP-292 is the owner's. Don't edit,
  publish or name it anywhere except where the owner says.

## Read first

- `CLAUDE.md` and `docs/WORKING_AGREEMENTS.md`.
- `docs/decisions/phase-46-gate-b-fixes-2026-11-17.md`, TFP-293.
- `src/lib/run/auth.ts` and `src/lib/run/login-fields.ts`.
- For Phase 45: `docs/decisions/phase-45-docker-sandbox-decision-record.md`,
  starting with its "Review before building" section (2026-11-21).

## Standing rules for this stretch

- One ticket at a time; each stops for verification. Commit and push each
  verified ticket before the next.
- A pull request is green only when `gh pr checks` passes every check on
  its head commit, CodeQL's alert check included.
- Every test and live check uses a temporary `LOCALAPPDATA` (and
  `XDG_DATA_HOME` in WSL), never the real data folder.
- Run `npm run check:old-name` before every push.
- Template output doesn't change. If it does, `check:template-unchanged`
  shows exactly what, and the owner accepts it.
- Planning sessions may have uncommitted docs in the tree. Leave files you
  didn't change alone, and say so.

## Work, in order

1. **TFP-293: a required prefix for login variable names**, once the owner
   confirms its proposed scope (the [for Emil] lines in its ticket). Red
   first, as its acceptance says. It's a breaking change: the changelog
   says so, with the migration.
2. **Stop after TFP-293** for verification. Ask the owner before any tag:
   it would ship as 0.5.1.
3. **Phase 45, TFP-228: the sandbox container and its mounts.**
4. **TFP-229: the network.** Remote sites reach their own hosts only
   (review item 7). Then **Gate A**: stop for independent verification,
   which includes D28's remaining zones (review item 2).
5. **TFP-230: model-written tests run in the sandbox.** One route, no
   switch (review item 6); promoted entries and the local model's and
   OpenAI's suites included (review items 3 and 4).
6. **TFP-231: measure it.** Then **Gate B**: stop for verification and
   the owner's ruling. Ask before any tag.

## Not for this handover

- TFP-300 (the rejection list): its wireframes come first, from a planning
  session, and it needs candidates running again.
- TFP-303 to TFP-305, TFP-286, TFP-288 / D45, TFP-291 and TFP-249 / D31:
  not placed.
