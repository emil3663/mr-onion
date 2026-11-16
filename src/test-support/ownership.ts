/**
 * Phase 43 (TFP-220): a site's saved ownership confirmation, written as the store writes it (TFP-218), for tests that
 * run on a temporary data folder (`MRONION_DATA_DIR`). It replaced TFP-157's stub lookup, so the caps and the active
 * gate are proven against the file a run really reads.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { siteFolderName } from "../lib/site-suites/store.ts";

const DAY = 86_400_000;

/** A valid confirmation covering `hosts`, with the active tick, confirmed yesterday and expiring in 30 days. */
export function validConfirmation(hosts: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        hosts,
        basis: "owner",
        wording: "the owner wording",
        name: "Tess Tester",
        contactEmail: "tess.private@example.com",
        confirmedAt: new Date(Date.now() - DAY).toISOString(),
        expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
        scopes: { active: true, load: false },
        ...overrides,
    };
}

/** Saves `current` as the site's confirmation (null: none), in the data folder a run reads. */
export function saveConfirmation(origin: string, current: Record<string, unknown> | null, dataDir: string = process.env.MRONION_DATA_DIR ?? "") {
    if (!dataDir) throw new Error("saveConfirmation needs MRONION_DATA_DIR set to a temporary folder");
    const dir = join(dataDir, "site-suites", siteFolderName(origin));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ownership.json"), JSON.stringify({ current, history: [] }));
}

export const expiredOverrides = () => ({ expiresAt: new Date(Date.now() - 3_600_000).toISOString() });
export const withdrawnOverrides = () => ({ withdrawnAt: new Date(Date.now() - 3_600_000).toISOString() });
