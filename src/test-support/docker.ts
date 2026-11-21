import { spawnSync } from "node:child_process";

/**
 * Phase 45 (TFP-228): unit tests that run the sandbox skip, with this reason, where Docker isn't answering, as
 * chromiumSkipReason does for the browser. Returns false when it answers, so it can be passed to node:test's `skip`.
 * The tests that prove what happens without Docker don't use it: they run everywhere.
 */
export function dockerSkipReason(): string | false {
    const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8", timeout: 20_000, windowsHide: true });
    if (result.status === 0) return false;
    const why = result.error?.message ?? (result.stderr.trim().split("\n")[0] || `exit ${result.status}`);
    return `needs Docker for the sandbox, and it isn't answering (${why}); start Docker Desktop, or the Docker service`;
}
