/**
 * Phase 45, TFP-228: reading what a sandbox run left in its output folder (planning session's verification,
 * 2026-11-23). The container wrote that folder, so anything in it may be a link, made to have the host read one of
 * its own files as the run's output.
 *
 * ISTQB techniques:
 * - equivalence partitioning of an entry in the output folder: a regular file (read), missing, a symbolic link
 *   (absolute or relative target), a link to a folder on the way to the file (a junction on Windows), a hard link,
 *   something that isn't a file (a folder);
 * - boundary values of the path asked for: directly in the folder, one folder down, `..`, absolute, empty parts.
 *
 * Where this machine can't make a symbolic link (Windows without Developer Mode), those cases skip with the reason;
 * the junction and the hard link need no privilege. The container's own links are tested in sandbox.test.ts.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/sandbox/output.test.ts
 */
import assert from "node:assert";
import { randomBytes } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { readSandboxOutput } from "./output.ts";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-sandbox-output-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const CANARY = `mr-onion-canary-${randomBytes(6).toString("hex")}`;

/** An output folder, and beside it, outside it, a host file and a host folder holding the canary. */
function layout() {
    const base = join(scratch, randomBytes(4).toString("hex"));
    const out = join(base, "out");
    const hostDir = join(base, "host");
    mkdirSync(out, { recursive: true });
    mkdirSync(hostDir);
    const hostFile = join(hostDir, "secret.txt");
    writeFileSync(hostFile, CANARY);
    return { out, hostDir, hostFile };
}

const symlinkSkip = (() => {
    const { out, hostFile } = layout();
    try {
        symlinkSync(hostFile, join(out, "probe"));
        return false;
    } catch (error) {
        return `this machine can't make a symbolic link (${(error as NodeJS.ErrnoException).code}); on Windows that needs Developer Mode`;
    }
})();

async function refused(out: string, path: string, reason: RegExp, maxBytes?: number) {
    const read = await readSandboxOutput(out, path, maxBytes);
    assert.equal(read.ok, false, `${path} isn't read`);
    assert.match(read.ok ? "" : read.reason, reason);
    assert.ok(read.ok || !read.reason.includes(CANARY), "the reason doesn't carry the file's content");
}

test("TFP-228: a regular file directly in the output folder, or in a folder of it, is read", async () => {
    const { out } = layout();
    writeFileSync(join(out, "report.json"), "{}");
    mkdirSync(join(out, "artifacts", "t1"), { recursive: true });
    writeFileSync(join(out, "artifacts", "t1", "trace.zip"), "zip");
    const report = await readSandboxOutput(out, "report.json");
    assert.deepEqual(report.ok && report.content.toString(), "{}");
    const trace = await readSandboxOutput(out, "artifacts/t1/trace.zip");
    assert.deepEqual(trace.ok && trace.content.toString(), "zip");
});

test("TFP-228: a file that wasn't written is no file, with that reason", async () => {
    const { out } = layout();
    await refused(out, "report.json", /^report\.json wasn't written$/);
});

test("TFP-228: a symbolic link in the output folder is never followed, absolute or relative", { skip: symlinkSkip }, async () => {
    const { out, hostFile } = layout();
    symlinkSync(hostFile, join(out, "report.json"));
    await refused(out, "report.json", /^report\.json is a link/);
    symlinkSync("../host/secret.txt", join(out, "relative.json"));
    await refused(out, "relative.json", /^relative\.json is a link/);
});

test("TFP-228: a link to a folder on the way to the file is never followed", async () => {
    const { out, hostDir } = layout();
    // A junction on Windows, which needs no privilege; a symbolic link elsewhere.
    symlinkSync(hostDir, join(out, "artifacts"), "junction");
    await refused(out, "artifacts/secret.txt", /^artifacts\/secret\.txt: artifacts is a link/);
});

test("TFP-228: a hard link to a host file isn't read", async () => {
    const { out, hostFile } = layout();
    linkSync(hostFile, join(out, "report.json"));
    await refused(out, "report.json", /^report\.json has other names/);
});

test("TFP-228: a folder where a file should be isn't read", async () => {
    const { out } = layout();
    mkdirSync(join(out, "report.json"));
    await refused(out, "report.json", /^report\.json isn't a regular file/);
});

test("TFP-228: a file over the size limit isn't read into memory", async () => {
    const { out } = layout();
    writeFileSync(join(out, "report.json"), "x".repeat(11));
    await refused(out, "report.json", /^report\.json is 11 bytes, over the 10-byte limit$/, 10);
    const fits = await readSandboxOutput(out, "report.json", 11);
    assert.equal(fits.ok && fits.content.length, 11, "at the limit, it's read");
});

test("TFP-228: only a path inside the output folder is asked for", async () => {
    const { out, hostFile } = layout();
    for (const path of ["../host/secret.txt", hostFile, "artifacts/../../host/secret.txt", "", "a//b", "./report.json", "a\\..\\..\\host\\secret.txt"]) {
        await refused(out, path, /not a path inside the output folder/);
    }
});
