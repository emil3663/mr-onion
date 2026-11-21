/**
 * TFP-292 (hardening of the model-written test check; owner ruling, 2026-11-21): model-written test bodies are not
 * run at all until Phase 45's sandbox: no gap test is written, no pool candidate or promoted library entry is bound,
 * a site suite's saved gap tests are kept but not run, and neither the local model nor OpenAI is asked for a suite
 * (the gap fill, Comprehensive's scenarios, OpenAI's whole suite). Template-built tests and the tester's own suites run as
 * before. Each place that would have run one says so, with this reason; nothing is dropped without a word.
 * The code check (code-check.ts) stays, as the first filter for when the sandbox lets them run again.
 */
export const MODEL_BODIES_RUN = false;

export const MODEL_BODIES_OFF = "model-written tests don't run until Phase 45's sandbox (TFP-292)";
