import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { originOf } from "@/lib/ownership/confirmation";
import { listRunRecords } from "@/lib/run/persistence";
import { dataDir } from "@/lib/storage/data-dir";
import { siteFolderName, siteSuiteDirFromStore, type SiteSuiteIdentity, type SiteSuiteManifest } from "./store";

/**
 * Phase 46 (TFP-232, review item 6): one site's saved suites, each with when it was last run, for the site lookup.
 * Read by site only: the caller names the origin, and nothing here walks other sites' folders (Decision 1).
 *
 * A suite is a folder under the site's with a readable version-1 manifest saved for this origin. Its last run is the
 * latest finished saved run on this site whose generation record names that folder as its store
 * (`generation.siteSuite.store`, Phase 42).
 */

export interface SavedSuiteSummary extends SiteSuiteIdentity {
    savedAt: string;
    /** How many tests the suite keeps. */
    tests: number;
    lastRun: { runId: string; finishedAt: string } | null;
}

async function manifestAt(dir: string): Promise<SiteSuiteManifest | null> {
    const text = await readFile(join(dir, "manifest.json"), "utf8").catch(() => null);
    if (!text) return null;
    try {
        const manifest = JSON.parse(text) as SiteSuiteManifest;
        return manifest?.version === 1 && Array.isArray(manifest.units) && manifest.identity ? manifest : null;
    } catch {
        return null;
    }
}

// path.relative, not a string compare: on Windows the same folder can differ in its drive letter's case.
const sameFolder = (a: string, b: string) => relative(a, b) === "";

/** The site's saved suites, newest saved first. */
export async function savedSuitesOf(origin: string): Promise<SavedSuiteSummary[]> {
    const site = join(dataDir(), "site-suites", siteFolderName(origin));
    const suites: Array<{ dir: string; manifest: SiteSuiteManifest }> = [];
    for (const entry of await readdir(site, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) continue;
        const dir = join(site, entry.name);
        const manifest = await manifestAt(dir);
        // Two origins can share a folder name (siteFolderName maps every other character to "_"): a suite saved for
        // the other one isn't this site's (the fresh-context review).
        if (manifest && manifest.origin === origin) suites.push({ dir, manifest });
    }
    if (suites.length === 0) return [];

    const runs = (await listRunRecords())
        // A run's store comes from the client's generation record, so a run on another site could name this site's
        // suite: its own address decides whose run it is (the fresh-context review).
        .filter((record) => originOf(record.baseUrl) === origin)
        .map((record) => {
            const store = record.generation?.siteSuite?.store;
            const dir = typeof store === "string" ? siteSuiteDirFromStore(store) : null;
            const finishedAt = Date.parse(record.finishedAt);
            return dir && !Number.isNaN(finishedAt) ? { dir, runId: record.runId, finishedAt: record.finishedAt, at: finishedAt } : null;
        })
        .filter((run): run is NonNullable<typeof run> => run !== null);

    return suites
        .map(({ dir, manifest }) => {
            const last = runs.filter((run) => sameFolder(run.dir, dir)).sort((a, b) => b.at - a.at)[0];
            const { runType, area, practices, auditMode } = manifest.identity;
            return {
                runType,
                ...(area !== undefined ? { area } : {}),
                practices: Array.isArray(practices) ? practices : [],
                auditMode,
                savedAt: manifest.savedAt,
                tests: manifest.units.length,
                lastRun: last ? { runId: last.runId, finishedAt: last.finishedAt } : null,
            };
        })
        .sort((a, b) => (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0));
}
