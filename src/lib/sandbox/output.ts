/**
 * Phase 45, TFP-228: reading what a sandbox run left in its output folder.
 *
 * The container wrote that folder, so anything in it may be a link: a symbolic link to a host path, which the host
 * would follow and the container never could, or a hard link. Every read of the sandbox's output goes through
 * readSandboxOutput, so one rule holds for the report now and for traces, screenshots and video at TFP-230: regular
 * files only, no link anywhere on the way, nothing outside the folder (planning session's verification, 2026-11-23).
 *
 * Each part of the path is checked with lstat, which doesn't follow a link; the file is then opened without
 * following one where the platform can (O_NOFOLLOW; Windows has none), and the opened file must be the one that was
 * checked (same device and inode), so a part swapped for a link in between isn't read either. At most maxBytes are
 * read. runInSandbox reads only once the container is confirmed gone; these checks hold even if it weren't.
 */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export type SandboxOutputRead = { ok: true; content: Buffer } | { ok: false; reason: string };

// Not following a link, and not waiting on a FIFO swapped in for the file (both POSIX only; Windows has neither).
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** The most read from one file: the container can write as much as the disk holds. */
export const SANDBOX_OUTPUT_MAX_BYTES = 64 * 1024 * 1024;

function refuse(reason: string): SandboxOutputRead {
    return { ok: false, reason };
}

function code(error: unknown): string {
    return (error as NodeJS.ErrnoException)?.code ?? String(error);
}

/**
 * The content of `relativePath` in the sandbox's output folder (`/`-separated, e.g. "report.json" or
 * "artifacts/<test>/trace.zip"), or why it isn't read. Never throws for anything the container left there.
 */
export async function readSandboxOutput(outputDir: string, relativePath: string, maxBytes: number = SANDBOX_OUTPUT_MAX_BYTES): Promise<SandboxOutputRead> {
    const parts = relativePath.split(/[\\/]/);
    if (isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath) || parts.some((part) => part === "" || part === "." || part === "..")) {
        return refuse(`${relativePath}: not a path inside the output folder`);
    }
    let path = outputDir;
    let checked;
    for (const [index, part] of parts.entries()) {
        path = join(path, part);
        const shown = parts.slice(0, index + 1).join("/");
        const where = index === parts.length - 1 ? relativePath : `${relativePath}: ${shown}`;
        try {
            checked = await lstat(path, { bigint: true });
        } catch (error) {
            if (code(error) === "ENOENT") return refuse(`${relativePath} wasn't written`);
            // Docker Desktop on Windows: a link made in the container is a WSL link the host can't open (EACCES).
            return refuse(`${where} can't be read as a plain file (${code(error)}); it may be a link`);
        }
        if (checked.isSymbolicLink()) return refuse(`${where} is a link, not a file: links in the output folder are never followed`);
        if (index < parts.length - 1 && !checked.isDirectory()) return refuse(`${where} isn't a folder`);
    }
    if (!checked!.isFile()) return refuse(`${relativePath} isn't a regular file`);
    if (checked!.nlink !== BigInt(1)) return refuse(`${relativePath} has other names (a hard link), so it may be a host file`);

    let handle;
    try {
        handle = await open(path, OPEN_FLAGS);
    } catch (error) {
        return refuse(code(error) === "ELOOP" ? `${relativePath} is a link, not a file: links in the output folder are never followed` : `${relativePath} can't be read as a plain file (${code(error)})`);
    }
    try {
        const opened = await handle.stat({ bigint: true });
        if (opened.dev !== checked!.dev || opened.ino !== checked!.ino || !opened.isFile() || opened.nlink !== BigInt(1)) {
            return refuse(`${relativePath} changed while it was being read`);
        }
        if (opened.size > BigInt(maxBytes)) return refuse(`${relativePath} is ${opened.size} bytes, over the ${maxBytes}-byte limit`);
        // Read no more than was measured, whatever the file does meanwhile.
        const content = Buffer.alloc(Number(opened.size));
        const { bytesRead } = await handle.read(content, 0, content.length, 0);
        return { ok: true, content: content.subarray(0, bytesRead) };
    } finally {
        await handle.close();
    }
}
