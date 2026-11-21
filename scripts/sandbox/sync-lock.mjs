// Phase 45 (TFP-228): writes sandbox/package.json and sandbox/package-lock.json from the repo's own lockfile, so the
// sandbox image installs exactly the @playwright/test (and its playwright and playwright-core) the repo resolved, with
// the same integrity hashes, through `npm ci`. Run it after a Playwright upgrade; sandbox.test.ts fails until then.
//
//   node scripts/sandbox/sync-lock.mjs           write them
//   node scripts/sandbox/sync-lock.mjs --check   exit 1 if they differ from what it would write
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const PACKAGES = ["@playwright/test", "playwright", "playwright-core", "fsevents"];

export function sandboxLockFiles(rootLock) {
    const entries = Object.fromEntries(PACKAGES.map((name) => {
        const entry = rootLock.packages[`node_modules/${name}`];
        if (!entry) throw new Error(`the repo's lockfile has no ${name}`);
        return [`node_modules/${name}`, entry];
    }));
    const version = entries["node_modules/@playwright/test"].version;
    const manifest = { name: "mr-onion-sandbox", private: true, dependencies: { "@playwright/test": version } };
    const lock = {
        name: "mr-onion-sandbox",
        lockfileVersion: 3,
        requires: true,
        packages: { "": { name: "mr-onion-sandbox", dependencies: { "@playwright/test": version } }, ...entries },
    };
    return { "package.json": `${JSON.stringify(manifest, null, 2)}\n`, "package-lock.json": `${JSON.stringify(lock, null, 2)}\n` };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
    const files = sandboxLockFiles(JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")));
    const check = process.argv.includes("--check");
    let differs = false;
    for (const [name, text] of Object.entries(files)) {
        const path = join(root, "sandbox", name);
        if (check) {
            let current = "";
            try { current = readFileSync(path, "utf8").replace(/\r\n/g, "\n"); } catch { /* missing */ }
            if (current !== text) { differs = true; console.error(`sandbox/${name} differs from the repo's lockfile`); }
        } else {
            writeFileSync(path, text);
            console.log(`wrote sandbox/${name}`);
        }
    }
    if (differs) process.exit(1);
}
