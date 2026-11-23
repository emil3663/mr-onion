/**
 * Phase 45, TFP-228: the sandbox container and its mounts (Decisions 2 and 5; Acceptance Criteria 2 and 5).
 *
 * ISTQB techniques:
 * - equivalence partitioning of what a test inside can reach: the specs (read), the output folder (write), the
 *   temporary folder (write), and everything else (neither): the repo, the data folder, the home folder, the host's
 *   drives, Docker's socket, the image's own folders;
 * - one case per limit (Decision 2): non-root user, no capabilities, no new privileges, read-only root, capped CPU,
 *   memory and processes, no network;
 * - state transition for availability (Decision 5): Docker answering, not installed, installed but not answering;
 * - error guessing: a bare `-e NAME`, which Docker fills from the host's environment; a mount path with a comma.
 *
 * The containment test hands the sandbox a spec the code check would refuse outright (it imports node:fs and reads
 * process.env): the sandbox runs what it's given, so no fixture needs a way past the check (review item 11).
 *
 * Docker's tests skip with a reason where Docker isn't answering. The first one builds the sandbox image if this
 * machine hasn't got it (sandbox/Dockerfile), which takes minutes once.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/sandbox/sandbox.test.ts
 */
import assert from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { dockerSkipReason } from "../../test-support/docker.ts";
import { SANDBOX_BASE_IMAGE, SANDBOX_PLAYWRIGHT_VERSION, sandboxBuildArgs, sandboxImageTag } from "./image.ts";
import { runInSandbox, SANDBOX_LABEL, SANDBOX_UNAVAILABLE, sandboxConfig, sandboxReady, sandboxRunArgs } from "./sandbox.ts";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-sandbox-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const needsDocker = dockerSkipReason();

function emptyDir(name: string) {
    const dir = join(scratch, `${name}-${randomBytes(4).toString("hex")}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

/** Every file under `dir`, as relative paths. */
function filesUnder(dir: string, prefix = ""): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? filesUnder(path, `${prefix}${entry}/`) : [`${prefix}${entry}`];
    });
}

function reportTests(report: string | null): { title: string; status: string }[] {
    assert.ok(report, "Playwright's JSON report came back");
    type Suite = { suites?: Suite[]; specs?: { title: string; tests: { results: { status: string }[] }[] }[] };
    const walk = (suite: Suite): { title: string; status: string }[] => [
        ...(suite.specs ?? []).map((spec) => ({ title: spec.title, status: spec.tests[0]?.results.at(-1)?.status ?? "none" })),
        ...(suite.suites ?? []).flatMap(walk),
    ];
    return ((JSON.parse(report) as { suites?: Suite[] }).suites ?? []).flatMap(walk);
}

// --- The pin (Decision 2; Regression Policy: "a unit test fails if the image's Playwright version and package.json's
// resolved version differ").

test("TFP-228: the sandbox image is pinned to the lockfile's Playwright, by tag and by digest", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as { packages: Record<string, { version?: string }> };
    const resolved = lock.packages["node_modules/@playwright/test"]?.version;
    assert.equal(SANDBOX_PLAYWRIGHT_VERSION, resolved, "the sandbox's Playwright is the lockfile's @playwright/test");
    assert.equal(lock.packages["node_modules/playwright"]?.version, resolved, "and the lockfile's playwright, which it runs");
    assert.match(SANDBOX_BASE_IMAGE, new RegExp(`^mcr\\.microsoft\\.com/playwright:v${resolved!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-resolute@sha256:[0-9a-f]{64}$`));
    const args = sandboxBuildArgs();
    assert.ok(args.includes(`BASE_IMAGE=${SANDBOX_BASE_IMAGE}`) && args.includes(`PLAYWRIGHT_VERSION=${resolved}`), "the build is given both");
    const dockerfile = readFileSync("sandbox/Dockerfile", "utf8");
    assert.doesNotMatch(dockerfile, /\d+\.\d+\.\d+/, "the Dockerfile carries no version of its own to drift");
    // What the image installs is the repo's own lockfile entries, integrity hashes included, through npm ci.
    assert.match(dockerfile, /COPY package\.json package-lock\.json/);
    assert.match(dockerfile, /npm ci /);
    const check = spawnSync(process.execPath, ["scripts/sandbox/sync-lock.mjs", "--check"], { encoding: "utf8" });
    assert.equal(check.status, 0, `sandbox/package-lock.json matches the repo's lockfile; run node scripts/sandbox/sync-lock.mjs (${check.stderr.trim()})`);
});

// --- The container's arguments: every limit, and nothing from the host's environment.

test("TFP-228: the container gets every limit, two mounts (three when signed in), and no socket", () => {
    const args = sandboxRunArgs("n", "img", "/specs", "/out", undefined, { MRONION_INTERACTIVE: "0" });
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    assert.ok(args.includes("--read-only") && args.includes("--rm") && args.includes("--init"));
    assert.equal(value("--network"), "none", "no network until TFP-229's proxy");
    assert.equal(value("--cap-drop"), "ALL");
    assert.equal(value("--security-opt"), "no-new-privileges");
    assert.equal(value("--memory"), "2g");
    assert.equal(value("--memory-swap"), "2g", "no swap beyond the memory cap");
    assert.equal(value("--pids-limit"), "1024");
    assert.ok(Number(value("--cpus")) >= 1 && Number(value("--cpus")) <= 2);
    assert.match(value("--tmpfs"), /^\/tmp:rw,noexec,nosuid,nodev,size=/);
    assert.notEqual(value("--user"), "0");
    assert.notEqual(value("--user"), "root");
    assert.equal(value("--label"), SANDBOX_LABEL);
    for (const flag of ["--privileged", "--cap-add", "-v", "--volume", "--env-file", "--ipc", "--pid", "--device", "-e"]) {
        assert.ok(!args.includes(flag), `no ${flag}`);
    }
    assert.ok(!args.some((arg) => /docker\.sock|\/var\/run\/docker/.test(arg)), "Docker's socket is never mounted (review item 8)");
    assert.deepEqual(args.filter((_, i) => args[i - 1] === "--mount"), [
        "type=bind,source=/specs,target=/sandbox/specs,readonly",
        "type=bind,source=/out,target=/sandbox/out",
    ]);
    const signedIn = sandboxRunArgs("n", "img", "/specs", "/out", "/auth/state.json", {});
    assert.equal(signedIn.filter((_, i) => signedIn[i - 1] === "--mount").at(-1), "type=bind,source=/auth/state.json,target=/sandbox/state/state.json,readonly");
    // Each environment entry is NAME=value: none can be filled in from the host.
    assert.deepEqual(args.filter((_, i) => args[i - 1] === "--env"), ["HOME=/tmp", "FORCE_COLOR=0", "MRONION_INTERACTIVE=0"]);
    // The container ends itself at the run's limit, whatever the host does.
    assert.equal(value("--entrypoint"), "/usr/bin/timeout");
    assert.deepEqual(args.slice(args.indexOf("img") + 1), ["-s", "KILL", "600s", "/sandbox/node_modules/.bin/playwright", "test", "--config", "/sandbox/specs/playwright.config.mjs"]);
    assert.equal(sandboxRunArgs("n", "img", "/specs", "/out", undefined, {}, 20_500).at(-5), "21s");
});

test("TFP-228: a name that isn't one, or a mount path a comma would split, is refused", () => {
    assert.throws(() => sandboxRunArgs("n", "img", "/specs", "/out", undefined, { "OPENAI_API_KEY=x,Y": "1" }), /not an environment variable name/);
    assert.throws(() => sandboxRunArgs("n", "img", "/sp,ecs", "/out", undefined, {}), /can't contain a comma/);
});

test("TFP-228: a caller can't hand the sandbox a credential, a key or a loader setting as one of the run's settings", () => {
    for (const name of ["MRONION_LOGIN_PASS", "MRONION_LOGIN_USER", "SITE_LOGIN_PASS", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "CLIENT_SECRET", "DB_PASSWORD", "NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD"]) {
        assert.throws(() => sandboxRunArgs("n", "img", "/specs", "/out", undefined, { [name]: "x" }), /may not be set for a sandbox run/, name);
    }
    assert.ok(sandboxRunArgs("n", "img", "/specs", "/out", undefined, { MRONION_INTERACTIVE: "0" }).includes("MRONION_INTERACTIVE=0"), "the run's own switches still go in");
});

// --- Decision 5: no Docker, no run, and nothing falls back to the host.

test("TFP-228: with no Docker installed, the run is unavailable with Decision 5's reason, and nothing runs", async () => {
    const outputDir = emptyDir("no-docker-out");
    const result = await runInSandbox({ specs: [{ name: "a.spec.ts", content: "throw new Error('must not run')" }], outputDir, docker: join(scratch, "no-such-docker") });
    assert.equal(result.status, "unavailable");
    assert.equal(result.status === "unavailable" && result.reason, SANDBOX_UNAVAILABLE);
    assert.equal(SANDBOX_UNAVAILABLE, "sandbox unavailable: start Docker Desktop");
    assert.deepEqual(readdirSync(outputDir), [], "nothing was written");
});

test("TFP-228: with Docker installed but not answering, the run is unavailable with the same reason", { skip: needsDocker }, async () => {
    const outputDir = emptyDir("dead-daemon-out");
    // A daemon address nothing listens on: the CLI is there, the engine isn't, as when Docker Desktop is stopped.
    const result = await runInSandbox({ specs: [{ name: "a.spec.ts", content: "throw new Error('must not run')" }], outputDir, dockerEnv: { ...process.env, DOCKER_HOST: "tcp://127.0.0.1:9", DOCKER_CONTEXT: "" } });
    assert.equal(result.status, "unavailable");
    assert.equal(result.status === "unavailable" && result.reason, SANDBOX_UNAVAILABLE);
    assert.match(result.status === "unavailable" ? result.detail : "", /Docker isn't answering/);
    assert.deepEqual(readdirSync(outputDir), []);
});

test("TFP-228: the module has no way to run a spec on the host", () => {
    const source = readFileSync("src/lib/sandbox/sandbox.ts", "utf8");
    // The only Playwright it names is the container's, at /sandbox/node_modules.
    assert.doesNotMatch(source, /cli\.js|process\.execPath|(?<!\/sandbox\/)node_modules/, "it never starts the host's Playwright");
    assert.doesNotMatch(source, /fallback\s*[:=]|onHost|allowHost|unsandboxed/i, "and has no option that would");
});

// --- Acceptance Criteria 2: containment, with a spec the code check would refuse.

const CANARY = `mr-onion-canary-${randomBytes(6).toString("hex")}`;

const HOSTILE = `import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';

const read =(p: string) => { try { return 'READ ' + fs.readFileSync(p, 'utf8').slice(0, 100); } catch (e: any) { return 'ERR ' + e.code; } };
const write = (p: string) => { try { fs.writeFileSync(p, 'x'); return 'WROTE'; } catch (e: any) { return 'ERR ' + e.code; } };
// The whole filesystem, within a budget: a clean container's takes seconds. Cut short, it says so, and the test fails.
const budget = { until: Date.now() + 45_000, cut: false };
function find(dir: string, name: string, found: string[], depth = 0) {
    if (Date.now() > budget.until) { budget.cut = true; return; }
    if (depth > 12 || ['/proc', '/sys', '/dev'].includes(dir)) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.name.includes(name)) found.push(full);
        if (entry.isDirectory() && !entry.isSymbolicLink()) find(full, name, found, depth + 1);
    }
}

test('reach out', async () => {
    const found: string[] = [];
    find('/', '${CANARY}', found);
    const status = fs.readFileSync('/proc/self/status', 'utf8');
    const findings = {
        uid: process.getuid!(),
        capEff: /CapEff:\\s*(\\w+)/.exec(status)?.[1],
        capBnd: /CapBnd:\\s*(\\w+)/.exec(status)?.[1],
        noNewPrivs: /NoNewPrivs:\\s*(\\d)/.exec(status)?.[1],
        mounts: fs.readFileSync('/proc/self/mounts', 'utf8').trim().split('\\n').map((line) => { const [, target, type, flags] = line.split(' '); return { target, type, flags }; }),
        env: process.env,
        found,
        searchCut: budget.cut,
        exists: Object.fromEntries(['/var/run/docker.sock', '/run/docker.sock', '/run/desktop/mnt/host', '/mnt/c', '/mnt/host', '/host_mnt', '/c', '/Users', '/work'].map((p) => [p, fs.existsSync(p)])),
        specs: fs.readdirSync('/sandbox/specs'),
        writes: Object.fromEntries(['/x', '/sandbox/x', '/sandbox/specs/x', '/sandbox/node_modules/x', '/usr/x', '/etc/x', '/home/pwuser/x', '/ms-playwright/x', '/tmp/x', '/dev/shm/x', '/sandbox/out/x'].map((p) => [p, write(p)])),
        // Something written where it may write can't be run from there.
        runs: Object.fromEntries(['/tmp', '/dev/shm'].map((dir) => {
            try { fs.writeFileSync(dir + '/run.sh', '#!/bin/sh\\necho ran\\n'); fs.chmodSync(dir + '/run.sh', 0o755); return [dir, 'RAN ' + childProcess.execFileSync(dir + '/run.sh', { encoding: 'utf8' }).trim()]; } catch (e: any) { return [dir, 'ERR ' + e.code]; }
        })),
        reads: { shadow: read('/etc/shadow') },
    };
    fs.writeFileSync('/sandbox/out/findings.json', JSON.stringify(findings));
});

test('a browser starts under the limits', async ({ page }) => {
    await page.setContent('<h1>inside</h1>');
    await expect(page.locator('h1')).toHaveText('inside');
});
`;

test("TFP-228: a spec the code check would refuse can't reach the repo, the data folder, the home folder or Mr Onion's environment, and runs unprivileged", { skip: needsDocker, timeout: 25 * 60_000 }, async () => {
    // A canary in each place a test must not reach. The repo's is in a gitignored folder of it; the home folder's is
    // removed in the finally. The data folder is this test's own.
    const dataDir = emptyDir("data");
    const canaries = [join(process.cwd(), ".playwright-runs", `${CANARY}-repo.txt`), join(dataDir, `${CANARY}-data.txt`), join(homedir(), `${CANARY}-home.txt`)];
    const secrets = { OPENAI_API_KEY: `${CANARY}-key`, MRONION_LOGIN_PASS: `${CANARY}-pass`, MRONION_DATA_DIR: dataDir, GITHUB_TOKEN: `${CANARY}-token` };
    const saved = Object.fromEntries(Object.keys(secrets).map((key) => [key, process.env[key]]));
    mkdirSync(join(process.cwd(), ".playwright-runs"), { recursive: true });
    for (const file of canaries) writeFileSync(file, CANARY);
    Object.assign(process.env, secrets);
    const outputDir = emptyDir("out");
    try {
        const result = await runInSandbox({ specs: [{ name: "hostile.spec.ts", content: HOSTILE }], outputDir });
        assert.equal(result.status, "ran", result.status === "unavailable" ? result.detail : "");
        assert.deepEqual(reportTests(result.status === "ran" ? result.report : null).map((t) => `${t.title}: ${t.status}`), ["reach out: passed", "a browser starts under the limits: passed"]);
        const f = JSON.parse(readFileSync(join(outputDir, "findings.json"), "utf8"));

        // Files: no canary anywhere in the container's filesystem, and no host drive or socket.
        assert.equal(f.searchCut, false, "the search covered the whole filesystem");
        assert.deepEqual(f.found, [], "no file from the repo, the data folder or the home folder is anywhere inside");
        assert.deepEqual(Object.entries(f.exists).filter(([, there]) => there), [], "no host drive, home or Docker socket");
        assert.deepEqual(f.specs.sort(), ["hostile.spec.ts", "playwright.config.mjs"], "the specs folder holds the run's specs and config only");
        // Only what Docker itself adds (its hosts files, and --init's binary, read-only), the kernel's own
        // filesystems, and the run's mounts.
        const allowed = /^(\/|\/proc(\/.*)?|\/dev(\/.*)?|\/sys(\/.*)?|\/tmp|\/sandbox\/specs|\/sandbox\/out|\/etc\/(hosts|hostname|resolv\.conf)|\/usr\/sbin\/docker-init)$/;
        assert.deepEqual(f.mounts.filter((m: { target: string }) => !allowed.test(m.target)), [], "no other mount");
        const mount = (target: string) => f.mounts.find((m: { target: string }) => m.target === target);
        assert.match(mount("/usr/sbin/docker-init").flags, /(^|,)ro(,|$)/, "--init's binary read-only");
        assert.match(mount("/").flags, /(^|,)ro(,|$)/, "a read-only root filesystem");
        assert.match(mount("/sandbox/specs").flags, /(^|,)ro(,|$)/, "the specs read-only");
        assert.match(mount("/sandbox/out").flags, /(^|,)rw(,|$)/, "the output folder writable");

        // Writes: the output folder and the two temporary folders only, and nothing written to those can be run.
        assert.deepEqual(Object.entries(f.writes).filter(([, outcome]) => outcome === "WROTE").map(([p]) => p).sort(), ["/dev/shm/x", "/sandbox/out/x", "/tmp/x"]);
        assert.deepEqual(f.runs, { "/tmp": "ERR EACCES", "/dev/shm": "ERR EACCES" }, "the temporary folders are noexec");

        // Environment: nothing Mr Onion holds.
        const env = JSON.stringify(f.env);
        assert.ok(!env.includes(CANARY), "no key, token or login value from Mr Onion's environment");
        assert.deepEqual(Object.keys(f.env).filter((key) => /LOGIN|KEY|TOKEN|SECRET|PASS|^MRONION_|^OPENAI|^ANTHROPIC|^GITHUB_|^DOCKER_/.test(key) && key !== "MRONION_INTERACTIVE"), [], "no credential-shaped or Mr Onion variable at all");

        // Privileges.
        assert.notEqual(f.uid, 0, "not root");
        assert.equal(f.capEff, "0000000000000000", "no capabilities");
        // A non-root process has none in effect anyway; the bounding set shows every one was dropped.
        assert.equal(f.capBnd, "0000000000000000", "none it could gain");
        assert.equal(f.noNewPrivs, "1", "no new privileges");
        assert.match(f.reads.shadow, /^ERR /, "can't read /etc/shadow");

        // Nothing came back but what the run wrote.
        assert.ok(!filesUnder(outputDir).some((file) => readFileSync(join(outputDir, file)).includes(`${CANARY}-key`)));
    } finally {
        for (const file of canaries) rmSync(file, { force: true });
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test("TFP-228: a signed-in run's session is mounted read-only, used, and never comes back in the output", { skip: needsDocker, timeout: 25 * 60_000 }, async () => {
    const stateDir = emptyDir("auth");
    const storageState = join(stateDir, "state.json");
    const session = `${CANARY}-session`;
    writeFileSync(storageState, JSON.stringify({ cookies: [{ name: "sid", value: session, domain: "app.example.test", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] }));
    const outputDir = emptyDir("signed-in-out");
    const spec = `import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
test('signed in', async ({ context }) => {
    const cookies = await context.cookies('http://app.example.test/');
    expect(cookies.map((c) => c.name)).toEqual(['sid']);
    let wrote = 'WROTE';
    try { fs.writeFileSync('/sandbox/state/state.json', '{}'); } catch (e: any) { wrote = 'ERR ' + e.code; }
    expect(wrote).toMatch(/^ERR /);
});
`;
    const result = await runInSandbox({ specs: [{ name: "signed-in.spec.ts", content: spec }], outputDir, storageState });
    assert.equal(result.status, "ran", result.status === "unavailable" ? result.detail : "");
    assert.deepEqual(reportTests(result.status === "ran" ? result.report : null).map((t) => t.status), ["passed"]);
    assert.ok(readFileSync(storageState, "utf8").includes(session), "the session file is as it was");
    for (const file of filesUnder(outputDir)) {
        assert.ok(!readFileSync(join(outputDir, file)).includes(session), `the session isn't in ${file}`);
    }
});

test("TFP-228: one container holds the run's specs, and it's removed when they finish, or when the run is stopped", { skip: needsDocker, timeout: 25 * 60_000 }, async () => {
    const containerGone = (args: string[]) => {
        const name = args[args.indexOf("--name") + 1];
        const listed = spawnSync("docker", ["ps", "--all", "--quiet", "--filter", `name=^${name}$`], { encoding: "utf8" });
        return listed.status === 0 && listed.stdout.trim() === "";
    };
    const outputDir = emptyDir("two-specs-out");
    const passing = (title: string) => `import { test, expect } from '@playwright/test';\ntest('${title}', async () => { expect(1).toBe(1); });\n`;
    const result = await runInSandbox({ specs: [{ name: "one.spec.ts", content: passing("one") }, { name: "two.spec.ts", content: passing("two") }], outputDir });
    assert.equal(result.status, "ran", result.status === "unavailable" ? result.detail : "");
    assert.deepEqual(reportTests(result.status === "ran" ? result.report : null).map((t) => `${t.title}: ${t.status}`).sort(), ["one: passed", "two: passed"], "both specs in one run");
    assert.ok(result.status === "ran" && containerGone(result.args), "the container is gone after the run");

    const hungOut = emptyDir("hung-out");
    const hung = await runInSandbox({ specs: [{ name: "hung.spec.ts", content: "import { test } from '@playwright/test';\ntest('hangs', async () => { await new Promise(() => {}); });\n" }], outputDir: hungOut, timeoutMs: 15_000 });
    assert.equal(hung.status, "ran");
    assert.ok(hung.status === "ran" && hung.timedOut, "the run was stopped at its time limit");
    assert.ok(hung.status === "ran" && containerGone(hung.args), "and its container removed");
});

test("TFP-228: a container whose client died, in a loop that blocks Node, ends by itself at its limit", { skip: needsDocker, timeout: 25 * 60_000 }, async () => {
    assert.equal(await sandboxReady(), null, "the sandbox image is here");
    const specsDir = emptyDir("orphan-specs");
    const outputDir = emptyDir("orphan-out");
    writeFileSync(join(specsDir, "busy.spec.ts"), "import { test } from '@playwright/test';\ntest('busy', () => { while (true) {} });\n");
    writeFileSync(join(specsDir, "playwright.config.mjs"), sandboxConfig(false));
    const name = `mr-onion-sandbox-orphan-${randomBytes(4).toString("hex")}`;
    const listed = (filter: string[]) => spawnSync("docker", ["ps", "--all", "--quiet", "--filter", `name=^${name}$`, ...filter], { encoding: "utf8" }).stdout.trim() !== "";
    const waitFor = async (check: () => boolean, ms: number) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
            if (check()) return true;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return check();
    };
    const client = spawn("docker", sandboxRunArgs(name, sandboxImageTag(), specsDir, outputDir, undefined, {}, 20_000), { stdio: "ignore", windowsHide: true });
    try {
        assert.ok(await waitFor(() => listed(["--filter", "status=running"]), 60_000), "the container started");
        // Mr Onion's side is gone: nothing on the host will remove the container now.
        client.kill("SIGKILL");
        const killed = Date.now();
        assert.ok(await waitFor(() => !listed([]), 90_000), "the container ended and was removed by itself");
        assert.ok(Date.now() - killed < 60_000, `within its 20 s limit, not left running (${Math.round((Date.now() - killed) / 1000)} s)`);
    } finally {
        client.kill("SIGKILL");
        spawnSync("docker", ["rm", "--force", name]);
    }
});

// --- The output folder is the container's: anything in it may be a link (planning session's verification,
// 2026-11-23).

test("TFP-228: a report.json the container made a link to a host file isn't read, and the result says why", { skip: needsDocker, timeout: 25 * 60_000 }, async () => {
    // Outside the output folder, where the host would find it by following the link. The container can't see it.
    const canary = join(emptyDir("linked"), `${CANARY}-linked.txt`);
    writeFileSync(canary, `${CANARY}-linked`);
    const outputDir = emptyDir("link-out");
    const spec = `import { test } from '@playwright/test';
import * as fs from 'node:fs';
test('links the report', () => { fs.symlinkSync(process.env.LINK_TARGET!, '/sandbox/out/report.json'); });
`;
    const result = await runInSandbox({ specs: [{ name: "link.spec.ts", content: spec }], outputDir, env: { LINK_TARGET: canary } });
    assert.equal(result.status, "ran", result.status === "unavailable" ? result.detail : "");
    if (result.status !== "ran") return;
    assert.equal(result.report, null, "the linked file's content doesn't come back as the report");
    // A link the host sees as one (Linux), or one Docker Desktop leaves as a WSL link the host can't open (Windows);
    // never "wasn't written", which would mean the spec made no link at all.
    assert.match(result.reportProblem ?? "", /^report\.json (is a link|can't be read as a plain file \(\w+\); it may be a link)/, "and the result says why there's no report");
    assert.equal(readFileSync(canary, "utf8"), `${CANARY}-linked`, "the host file is as it was");
});

test("TFP-228: the spec names and the output folder are checked before anything starts", async () => {
    await assert.rejects(runInSandbox({ specs: [{ name: "../x.spec.ts", content: "" }], outputDir: emptyDir("names"), docker: join(scratch, "no-such-docker") }), /not a spec file name/);
    const used = emptyDir("used");
    writeFileSync(join(used, "left-over"), "x");
    await assert.rejects(runInSandbox({ specs: [], outputDir: used, docker: join(scratch, "no-such-docker") }), /isn't empty/);
    assert.ok(existsSync(join(used, "left-over")));
});
