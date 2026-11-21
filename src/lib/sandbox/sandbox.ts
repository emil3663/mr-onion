/**
 * Phase 45 (TFP-228, Decisions 2 and 5): run model-written specs inside a Docker container, one container per run.
 *
 * What the container gets, and nothing else:
 * - the run's specs and their config, read-only, at /sandbox/specs;
 * - one empty output folder, writable, at /sandbox/out;
 * - a signed-in run's session (storageState), read-only, when there is one. It's never copied into the image or the
 *   output folder;
 * - the environment set here, each entry given as NAME=value. Nothing comes from Mr Onion's own environment: no keys,
 *   tokens, settings or login variables (review item 9). Docker forwards a bare `-e NAME` from the host, so that form
 *   is refused.
 *
 * Limits: capped CPU, memory and processes; not privileged; every capability dropped; no new privileges; a non-root
 * user; a read-only root filesystem apart from the output folder and a temporary folder. No network yet: TFP-229
 * replaces `--network none` with an internal network whose only way out is the proxy.
 *
 * Decision 5: if Docker isn't running, or the image can't be built or the container won't start, the result is
 * "unavailable" with SANDBOX_UNAVAILABLE. There is no fallback to the host, and no option for one.
 *
 * This runs what it's given. It doesn't check the bodies: the code check is the caller's first filter, and the
 * sandbox is the boundary whether or not that check ran (review item 5). The containment tests hand it specs that
 * the code check would refuse.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxBuildArgs, sandboxImageTag } from "./image";

/** Decision 5's reason, word for word. */
export const SANDBOX_UNAVAILABLE = "sandbox unavailable: start Docker Desktop";

/** Every container this starts carries it, so one can be found (`docker ps --filter label=mr-onion.sandbox=1`). */
export const SANDBOX_LABEL = "mr-onion.sandbox=1";

/**
 * Names the run's own settings may not use: anything named like a credential (a login variable, a key, a token, a
 * secret, a password), and the ones that change how Node or the loader start. A caller that passes one is refused,
 * so the rule holds in code, not only in this comment (review item 9).
 */
const REFUSED_ENV = /LOGIN|KEY|TOKEN|SECRET|PASS|CREDENTIAL|^NODE_OPTIONS$|^NODE_PATH$|^LD_|^DYLD_/;

export const SANDBOX_LIMITS = { cpus: 2, memory: "2g", pids: 1024, tmp: "512m", shm: "1g" } as const;

const SPEC_NAME = /^[a-z0-9][a-z0-9-]*\.spec\.ts$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

export interface SandboxSpec {
    /** A file name: lower case, digits and hyphens, ending in .spec.ts. */
    name: string;
    content: string;
}

export interface SandboxRunOptions {
    specs: SandboxSpec[];
    /** An empty folder on the host. The only thing that comes back. */
    outputDir: string;
    /** A signed-in run's storageState file on the host, mounted read-only. */
    storageState?: string;
    /** Set for the tests on purpose: the interactive switch and the like. Never a credential. */
    env?: Record<string, string>;
    /** The whole run, start to removal. A run over it is stopped and removed. */
    timeoutMs?: number;
    /** The Docker CLI, and its own environment (DOCKER_HOST and the like). Neither reaches the container. */
    docker?: string;
    dockerEnv?: NodeJS.ProcessEnv;
    /** Where sandbox/Dockerfile is: the repo root. */
    root?: string;
}

export type SandboxRunResult =
    | { status: "unavailable"; reason: typeof SANDBOX_UNAVAILABLE; detail: string }
    | {
          status: "ran";
          exitCode: number | null;
          timedOut: boolean;
          /** Playwright's JSON report as text, or null if none was written. Read as data; it's never run. */
          report: string | null;
          /** The container's arguments, for the run record and the tests. */
          args: string[];
      };

interface Exec {
    code: number | null;
    stdout: string;
    stderr: string;
    error?: string;
}

function exec(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number, onTimeout?: () => void): Promise<Exec & { timedOut: boolean }> {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let child;
        try {
            child = spawn(command, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        } catch (error) {
            resolve({ code: null, stdout, stderr, error: error instanceof Error ? error.message : String(error), timedOut });
            return;
        }
        const timer = setTimeout(() => {
            timedOut = true;
            if (onTimeout) onTimeout();
            else child.kill();
        }, timeoutMs);
        child.stdout.on("data", (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-20_000); });
        child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-20_000); });
        child.on("error", (error) => { clearTimeout(timer); resolve({ code: null, stdout, stderr, error: error.message, timedOut }); });
        child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
    });
}

function unavailable(detail: string): SandboxRunResult {
    return { status: "unavailable", reason: SANDBOX_UNAVAILABLE, detail };
}

/** The container's user: the image's pwuser, or on Linux the host's own user, so the output folder is writable. */
function containerUser(): string {
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const gid = typeof process.getgid === "function" ? process.getgid() : undefined;
    return uid !== undefined && gid !== undefined && uid !== 0 ? `${uid}:${gid}` : "pwuser";
}

/** The config the specs run under, at container paths. Chromium only (Phase 16), one worker. */
export function sandboxConfig(signedIn: boolean): string {
    return `// Written by Mr Onion for one sandbox run (TFP-228).
export default {
    testDir: '/sandbox/specs',
    outputDir: '/sandbox/out/artifacts',
    reporter: [['json', { outputFile: '/sandbox/out/report.json' }]],
    workers: 1,
    timeout: 30000,
    use: {
        headless: true,${signedIn ? "\n        storageState: '/sandbox/state/state.json'," : ""}
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
};
`;
}

function bindMount(source: string, target: string, readonly: boolean): string[] {
    // --mount splits on commas, and a quote would change how it's read: refused rather than escaped.
    if (/[,"]/.test(source)) throw new Error(`sandbox: a mounted path can't contain a comma or a quote: ${source}`);
    return ["--mount", `type=bind,source=${source},target=${target}${readonly ? ",readonly" : ""}`];
}

/** A run's time limit when the caller gives none. */
export const SANDBOX_DEFAULT_TIMEOUT_MS = 10 * 60_000;

/**
 * The `docker run` arguments for one sandbox run. Exported for the tests, which check every limit is there.
 *
 * The container enforces its own time limit (coreutils `timeout -s KILL`), so it ends even if a test blocks Node's
 * event loop, or Mr Onion's process dies before it can remove it; --rm then removes it.
 */
export function sandboxRunArgs(name: string, image: string, specsDir: string, outputDir: string, storageState: string | undefined, env: Record<string, string>, timeoutMs: number = SANDBOX_DEFAULT_TIMEOUT_MS): string[] {
    const environment: string[] = [];
    for (const [key, value] of Object.entries({ HOME: "/tmp", FORCE_COLOR: "0", ...env })) {
        if (!ENV_NAME.test(key)) throw new Error(`sandbox: not an environment variable name: ${key}`);
        if (REFUSED_ENV.test(key)) throw new Error(`sandbox: ${key} may not be set for a sandbox run: no credential, key or loader setting enters it`);
        environment.push("--env", `${key}=${value}`);
    }
    return [
        "run", "--rm", "--init",
        "--name", name,
        "--label", SANDBOX_LABEL,
        "--network", "none",
        "--read-only",
        // The two temporary folders, /tmp and /dev/shm (the browser's shared memory), are the only writable places
        // besides the output folder; nothing written to either can be run, and both go with the container.
        "--tmpfs", `/tmp:rw,noexec,nosuid,nodev,size=${SANDBOX_LIMITS.tmp}`,
        "--shm-size", SANDBOX_LIMITS.shm,
        "--cpus", String(Math.min(SANDBOX_LIMITS.cpus, cpus().length || 1)),
        "--memory", SANDBOX_LIMITS.memory,
        "--memory-swap", SANDBOX_LIMITS.memory,
        "--pids-limit", String(SANDBOX_LIMITS.pids),
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--user", containerUser(),
        "--workdir", "/sandbox",
        ...bindMount(specsDir, "/sandbox/specs", true),
        ...bindMount(outputDir, "/sandbox/out", false),
        ...(storageState ? bindMount(storageState, "/sandbox/state/state.json", true) : []),
        ...environment,
        "--entrypoint", "/usr/bin/timeout",
        image,
        "-s", "KILL", `${Math.max(1, Math.ceil(timeoutMs / 1000))}s`,
        "/sandbox/node_modules/.bin/playwright", "test", "--config", "/sandbox/specs/playwright.config.mjs",
    ];
}

/** Docker is answering, and the image is here or has just been built: null. Otherwise, why not. */
export async function sandboxReady(docker = "docker", dockerEnv: NodeJS.ProcessEnv = process.env, root: string = process.cwd()): Promise<string | null> {
    const version = await exec(docker, ["version", "--format", "{{.Server.Version}}"], dockerEnv, 20_000);
    if (version.code !== 0) return `Docker isn't answering (${(version.error ?? version.stderr.trim()) || `exit ${version.code}`})`.slice(0, 500);
    const image = sandboxImageTag(root);
    const inspect = await exec(docker, ["image", "inspect", "--format", "{{.Id}}", image], dockerEnv, 20_000);
    if (inspect.code === 0) return null;
    const build = await exec(docker, sandboxBuildArgs(root), dockerEnv, 20 * 60_000);
    return build.code === 0 ? null : `the sandbox image couldn't be built (${build.stderr.trim().split("\n").slice(-3).join(" ") || `exit ${build.code}`})`.slice(0, 500);
}

export async function runInSandbox(options: SandboxRunOptions): Promise<SandboxRunResult> {
    const docker = options.docker ?? "docker";
    const dockerEnv = options.dockerEnv ?? process.env;
    const root = options.root ?? process.cwd();
    for (const spec of options.specs) {
        if (!SPEC_NAME.test(spec.name)) throw new Error(`sandbox: not a spec file name: ${spec.name}`);
    }
    if ((await readdir(options.outputDir)).length > 0) throw new Error(`sandbox: the output folder isn't empty: ${options.outputDir}`);

    const notReady = await sandboxReady(docker, dockerEnv, root);
    if (notReady) return unavailable(notReady);

    const specsDir = await mkdtemp(join(tmpdir(), "mr-onion-sandbox-specs-"));
    const name = `mr-onion-sandbox-${randomBytes(6).toString("hex")}`;
    try {
        for (const spec of options.specs) await writeFile(join(specsDir, spec.name), spec.content, "utf8");
        await writeFile(join(specsDir, "playwright.config.mjs"), sandboxConfig(Boolean(options.storageState)), "utf8");
        const timeoutMs = options.timeoutMs ?? SANDBOX_DEFAULT_TIMEOUT_MS;
        const args = sandboxRunArgs(name, sandboxImageTag(root), specsDir, options.outputDir, options.storageState, options.env ?? {}, timeoutMs);
        // The host's limit is a little past the container's own, which should end it first.
        const run = await exec(docker, args, dockerEnv, timeoutMs + 15_000, () => {
            void exec(docker, ["rm", "--force", name], dockerEnv, 60_000);
        });
        const report = await readFile(join(options.outputDir, "report.json"), "utf8").catch(() => null);
        // 124: the container's own limit ended it (uutils' timeout, which Ubuntu 26.04 ships; GNU's gives 137 for KILL).
        const timedOut = run.timedOut || run.code === 124 || run.code === 137;
        // 125 and up, with no report and no time limit reached: Docker couldn't start the container (a bad mount, no
        // memory for the limits), or what it starts wasn't there (126, 127), or the engine went away mid-run. None of
        // that is a test result.
        if (run.error || (report === null && !timedOut && (run.code === null || run.code >= 125))) {
            return unavailable(`the container wouldn't run (${run.error ?? (run.stderr.trim().split("\n").slice(-2).join(" ") || `exit ${run.code}`)})`.slice(0, 500));
        }
        return { status: "ran", exitCode: run.code, timedOut, report, args };
    } finally {
        // --rm removes it when it ends; this covers a stopped or timed-out run, and is quiet when it's already gone.
        await exec(docker, ["rm", "--force", name], dockerEnv, 60_000);
        await rm(specsDir, { recursive: true, force: true });
    }
}
