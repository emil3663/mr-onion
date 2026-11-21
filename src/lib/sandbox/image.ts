/**
 * Phase 45 (TFP-228, Decision 2): the sandbox's image. Microsoft's Playwright image, pinned to the version
 * package-lock.json resolves for @playwright/test and to its digest, with that @playwright/test installed
 * (sandbox/Dockerfile). Built once on this machine, the first time a sandbox run needs it.
 *
 * sandbox.test.ts fails if this pin, sandbox/package-lock.json and the repo's lockfile disagree: a Playwright upgrade
 * moves it in the same commit (and `node scripts/sandbox/sync-lock.mjs` rewrites the sandbox's lockfile).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The lockfile's @playwright/test, which the base image's tag and the installed package must both match. */
export const SANDBOX_PLAYWRIGHT_VERSION = "1.62.1";

/** Ubuntu 26.04 ("resolute"), as in Mr Onion's own image and CI. The digest is the multi-platform index's. */
export const SANDBOX_BASE_IMAGE = `mcr.microsoft.com/playwright:v${SANDBOX_PLAYWRIGHT_VERSION}-resolute@sha256:aebd85bce8056dcdc2269853fd94ea432b6a201da4f0ef125b509489ecd52ddb`;

/** Where the image's definition lives, from the repo root. */
export const SANDBOX_DOCKERFILE_DIR = "sandbox";

/**
 * The local tag: the version and a hash of the definition, its lockfile and the base, so a change to any of them
 * builds a new image rather than reusing a stale one.
 */
export function sandboxImageTag(root: string = process.cwd()): string {
    const hash = createHash("sha256");
    for (const file of ["Dockerfile", "package.json", "package-lock.json"]) hash.update(readFileSync(join(root, SANDBOX_DOCKERFILE_DIR, file))).update("\0");
    hash.update(SANDBOX_BASE_IMAGE);
    return `mr-onion-sandbox:${SANDBOX_PLAYWRIGHT_VERSION}-${hash.digest("hex").slice(0, 12)}`;
}

/** The build's arguments, from the constants above, so the Dockerfile has no version of its own. */
export function sandboxBuildArgs(root: string = process.cwd()): string[] {
    return [
        "build",
        "--build-arg", `BASE_IMAGE=${SANDBOX_BASE_IMAGE}`,
        "--build-arg", `PLAYWRIGHT_VERSION=${SANDBOX_PLAYWRIGHT_VERSION}`,
        "-t", sandboxImageTag(root),
        join(root, SANDBOX_DOCKERFILE_DIR),
    ];
}
