import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { setting } from "./src/lib/settings";
import { AUTH_FIXTURE_ENV } from "./tests/regression/auth-fixture";

// Phase 42 (TFP-190): the server under test gets a temporary data folder outside the repo, never the real one.
// Phase 46 (TFP-234): set in this process's environment too, so Playwright's workers, which load this config again
// and inherit it, use the same folder: a screen's test can seed what the server reads (the candidate pool).
const REGRESSION_DATA_DIR = setting("DATA_DIR") || (process.env.MRONION_DATA_DIR = mkdtempSync(join(os.tmpdir(), "mr-onion-regression-data-")));

export default defineConfig({
    testDir: "tests/regression",
    timeout: 240_000,
    expect: {
        timeout: 20_000,
    },
    fullyParallel: false,
    retries: 0,
    workers: 1,
    reporter: [
        ["line"],
        [
            "allure-playwright",
            {
                resultsDir: "artifacts/allure-results/regression",
                detail: true,
                suiteTitle: true,
                environmentInfo: {
                    os_platform: os.platform(),
                    os_release: os.release(),
                    node_version: process.version,
                    suite: "regression",
                },
            },
        ],
    ],
    use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3001",
        headless: true,
    },
    webServer: {
        // TFP-208: only the start. `npm run test:regression` builds first (build:self-test), so the
        // 120 s covers the server starting, not a `next build` as well, which missed it once in R1
        // (TFP-207). Run outside those scripts, the suite needs that build first.
        command: "npm run start:self-test",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: false,
        timeout: 120_000,
        // Phase 20: test-only credentials for tests/regression/auth-fixture.ts.
        // A credential only ever reaches Mr Onion as an environment variable.
        // Phase 42 (TFP-190): site suites are saved in Mr Onion's data folder (above).
        env: { ...AUTH_FIXTURE_ENV, MRONION_DATA_DIR: REGRESSION_DATA_DIR },
    },
});