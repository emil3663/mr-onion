# Phase 43's comparison base: Action Gate on `main` before TFP-219

Acceptance Criterion 6 of Phase 43 (review item 6) compares runs with the
active switch off against runs of `main` taken just before TFP-219 lands. The
owner decided on 2026-11-15 that the base is Action Gate's runs, not a local
measurement session.

- **Run:** Action Gate, dispatched on `main` at `202a17a`, run
  [43672714248](https://github.com/emil3663/mr-onion/actions/runs/43672714248),
  2026-11-15 03:31 to 03:54 UTC. Every step passed.
- **What made them:** Mr Onion 0.4.0 at `202a17a`, the image the workflow
  builds, on GitHub's `ubuntu-26.04` runner, against the local Toolshop copies
  the workflow starts there.
- **The files:** each is the run's `report.json` artifact as uploaded,
  unchanged.
  - `clean/report.json`: the `clean-baseline` artifact. This is the clean
    copy's first run. The workflow's second clean run, compared against it
    (`clean`), gave the same totals and isn't copied here.
  - `with-bugs/report.json`: the `with-bugs` artifact.

| Copy | Planned | Passed | Failed | Not run | Blocked |
| --- | --- | --- | --- | --- | --- |
| clean | 470 | 406 | 46 | 18 | 0 |
| with-bugs | 481 | 377 | 84 | 20 | 0 |

Both equal 0.4.0's release counts (clean 470 / 46 / 18, with-bugs
481 / 84 / 20), and Action Gate's on `f5b8e5c`.
