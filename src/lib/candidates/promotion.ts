import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { join, relative } from "path";
import { setting } from "@/lib/settings";
import { loadCandidate, loadPool, saveCandidate, type Candidate } from "./pool";

/**
 * Phase 42 (TFP-196, Decision 8's promotion rule, owner decision, 2026-10-12): a
 * candidate is promoted to the library when it has passed the gates on every
 * run, and either caught a real defect (a benchmark bug, or a failure a
 * person labelled real) or run on 3 sites with the pattern with no
 * unlabelled failure, and the tester has approved it.
 *
 * - Only a candidate that meets the rule is offered; approving one below it
 *   is refused.
 * - A rejection is kept with its reason; the pattern is never proposed again
 *   (the pool keeps the file, so TFP-195 never pools that pattern anew).
 * - Promotion is a library commit through Claude Code: `promoteApproved`
 *   writes each approved candidate, with its evidence, as an entry under
 *   src/lib/library/promoted/, and marks it promoted in the pool. Claude
 *   Code runs it and commits the entries, reviewed like any code. Mr Onion
 *   never writes into the repo itself.
 */

export const CLEAN_SITES_FOR_PROMOTION = 3;
const FAILED = new Set(["Failed", "Blocked"]);

export interface PromotionVerdict {
    meetsRule: boolean;
    runs: number;
    gatesPassedEveryRun: boolean;
    realDefect: boolean;
    /** Sites it ran on. */
    sites: number;
    unlabelledFailures: number;
    /** Why it does or doesn't meet the rule, in words. */
    reasons: string[];
}

export function promotionVerdict(candidate: Candidate): PromotionVerdict {
    const runs = candidate.evidence;
    const breaches = runs.filter((run) => run.breach).length;
    const gatesPassedEveryRun = runs.length > 0 && breaches === 0;
    const realDefect = runs.some((run) => run.label === "real" || run.bug !== undefined);
    const sites = new Set(runs.map((run) => run.origin)).size;
    const unlabelledFailures = runs.filter((run) => FAILED.has(run.status) && !run.label && run.bug === undefined).length;
    const cleanSites = sites >= CLEAN_SITES_FOR_PROMOTION && unlabelledFailures === 0;
    const reasons = [
        runs.length === 0 ? "it has not run yet" : breaches > 0 ? `it breached the read-only gate on ${breaches} of ${runs.length} runs` : `it passed the gates on all ${runs.length} runs`,
        realDefect ? "it caught a real defect" : "it has caught no real defect",
        `it ran on ${sites} ${sites === 1 ? "site" : "sites"} (${CLEAN_SITES_FOR_PROMOTION} needed without one)${unlabelledFailures > 0 ? `, with ${unlabelledFailures} unlabelled ${unlabelledFailures === 1 ? "failure" : "failures"}` : ""}`,
    ];
    return { meetsRule: gatesPassedEveryRun && (realDefect || cleanSites), runs: runs.length, gatesPassedEveryRun, realDefect, sites, unlabelledFailures, reasons };
}

/** The candidates to offer the tester: in the pool, not decided, and meeting the rule. */
export async function offeredCandidates(): Promise<Array<{ candidate: Candidate; verdict: PromotionVerdict }>> {
    // TFP-298: only a well-formed candidate (its id candidateId(pattern), in <id>.json); poolProblems reports the others.
    return (await loadPool())
        .filter((candidate) => candidate.status === "candidate")
        .map((candidate) => ({ candidate, verdict: promotionVerdict(candidate) }))
        .filter(({ verdict }) => verdict.meetsRule);
}

export class PromotionError extends Error {}

const NO_SUCH_CANDIDATE = "There is no such candidate in the pool. The list is read again.";

export async function approveCandidate(id: string, by: string): Promise<Candidate> {
    const candidate = await loadCandidate(id);
    // TFP-298: each refusal in plain words, as the candidate screen shows it.
    if (!candidate) throw new PromotionError(NO_SUCH_CANDIDATE);
    if (candidate.status !== "candidate") throw new PromotionError(`This candidate was already ${candidate.status}, so it can't be approved again.`);
    const verdict = promotionVerdict(candidate);
    if (!verdict.meetsRule) throw new PromotionError(`This candidate doesn't meet the promotion rule yet: ${verdict.reasons.join("; ")}.`);
    const approved: Candidate = { ...candidate, status: "approved", approved: { by, at: new Date().toISOString() } };
    await saveCandidate(approved);
    return approved;
}

/**
 * Also how an approval is withdrawn (TFP-298): `from: "approved"`, refused if the candidate is no longer approved (a
 * second tab, or the library step got there first).
 * Gate B R9 (the owner's re-walk, 2026-11-18): a withdrawal returns the candidate to Offered (status "candidate"; it is
 * offered again if it meets the rule, as it did when approved), with the withdrawal kept on it, in `withdrawals`: when,
 * why, and the approval it undid. The live `approved` goes, so approving again records a new approval. It replaces
 * TFP-298's withdrawal, which rejected the candidate. A reject with no `from` is a rejection, an approved candidate's
 * too, its approval kept beside it.
 */
export async function rejectCandidate(id: string, reason: string, from?: Candidate["status"], approvedAt?: string): Promise<Candidate> {
    const candidate = await loadCandidate(id);
    if (!candidate) throw new PromotionError(NO_SUCH_CANDIDATE);
    if (candidate.status === "promoted") throw new PromotionError("This candidate is already in the library: it can't be rejected, or its approval withdrawn, here. Remove its library entry in a reviewed commit.");
    if (from === "approved" && candidate.status !== "approved") {
        throw new PromotionError(`This approval was already withdrawn: the candidate is ${candidate.status === "candidate" ? "offered again" : `${candidate.status} now`}. The list is read again.`);
    }
    // R9 (the fresh-context review): a withdrawal names the approval it withdraws, so a tab still showing an earlier
    // approval can't withdraw one given since (approved, withdrawn, approved again by someone else).
    if (from === "approved" && approvedAt !== undefined && candidate.approved?.at !== approvedAt) {
        throw new PromotionError(`This candidate was approved again since you read it (by ${candidate.approved?.by ?? "someone"}), so that approval wasn't withdrawn. The list is read again.`);
    }
    if (candidate.status === "rejected") throw new PromotionError("This candidate was already rejected.");
    if (!reason.trim()) throw new PromotionError("Type a reason first: it is kept with the candidate.");
    if (from === "approved") {
        const { approved, ...rest } = candidate;
        const withdrawal = { at: new Date().toISOString(), reason: reason.trim(), ...(approved ? { approved } : {}) };
        const offeredAgain: Candidate = { ...rest, status: "candidate", withdrawals: [...(candidate.withdrawals ?? []), withdrawal] };
        await saveCandidate(offeredAgain);
        return offeredAgain;
    }
    const rejected: Candidate = { ...candidate, status: "rejected", reason: reason.trim() };
    await saveCandidate(rejected);
    return rejected;
}

/** A person's label for one run's failure: a real defect (optionally a benchmark bug), or not one. */
export async function labelRun(id: string, run: string, label: "real" | "not a defect", bug?: number): Promise<Candidate> {
    const candidate = await loadCandidate(id);
    if (!candidate) throw new PromotionError(NO_SUCH_CANDIDATE);
    if (!candidate.evidence.some((evidence) => evidence.run === run)) throw new PromotionError("This candidate has no such run to label.");
    const labelled: Candidate = {
        ...candidate,
        evidence: candidate.evidence.map((evidence) => (evidence.run === run ? { ...evidence, label, ...(bug !== undefined ? { bug } : {}) } : evidence)),
    };
    await saveCandidate(labelled);
    return labelled;
}

/** A library entry made from a promoted candidate (src/lib/library/promoted/<id>.json). */
export interface PromotedEntry {
    id: string;
    pattern: Candidate["pattern"];
    body: string;
    gate: "read-only";
    technique: string;
    writer: string;
    sources: Candidate["sources"];
    evidence: Candidate["evidence"];
    approved: { by: string; at: string };
    caught: number[];
}

export const PROMOTED_DIR = join("src", "lib", "library", "promoted");

/** Writes every approved candidate as a library entry under `libraryDir` and marks it promoted; returns the files written. */
export async function promoteApproved(libraryDir: string = join(process.cwd(), PROMOTED_DIR)): Promise<string[]> {
    const written: string[] = [];
    await mkdir(libraryDir, { recursive: true });
    for (const listed of (await loadPool()).filter((item) => item.status === "approved" && item.approved)) {
        // Gate B R9 (the fresh-context review): an approval can be withdrawn and given again, so the entry is written from
        // the candidate as it is now, and only for the approval listed (not a newer one, nor none).
        const sameApproval = (current: Candidate | null): current is Candidate => current?.status === "approved" && current.approved?.at === listed.approved!.at;
        const candidate = await loadCandidate(listed.id);
        if (!sameApproval(candidate)) continue;
        const entry: PromotedEntry = {
            id: candidate.id,
            pattern: candidate.pattern,
            body: candidate.body,
            gate: candidate.gate,
            technique: candidate.technique,
            writer: candidate.writer,
            sources: candidate.sources,
            evidence: candidate.evidence,
            approved: candidate.approved!,
            caught: [...new Set(candidate.evidence.flatMap((run) => (run.bug !== undefined ? [run.bug] : [])))].sort((a, b) => a - b),
        };
        const file = join(libraryDir, `${candidate.id}.json`);
        // TFP-298 (the fresh-context review): an approval withdrawn while this ran isn't promoted.
        await writeFile(file, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
        const now = await loadCandidate(candidate.id);
        if (!sameApproval(now)) {
            await rm(file, { force: true });
            continue;
        }
        // Saved from what was just read, so evidence or a withdrawal saved meanwhile isn't written over.
        await saveCandidate({ ...now, status: "promoted", reason: `library entry ${relative(process.cwd(), file).replace(/\\/g, "/")}` });
        written.push(file);
    }
    return written;
}

/**
 * The library's promoted entries, as committed. TFP-204: generation reads them, so a file that can't be read or
 * parsed is skipped rather than failing every generation. `MRONION_LIBRARY_PROMOTED_DIR` replaces the folder;
 * tests point it at their own.
 */
export async function loadPromotedEntries(libraryDir: string = setting("LIBRARY_PROMOTED_DIR")?.trim() || join(process.cwd(), PROMOTED_DIR)): Promise<PromotedEntry[]> {
    const names = (await readdir(libraryDir).catch(() => [] as string[])).filter((name) => name.endsWith(".json")).sort();
    const entries: PromotedEntry[] = [];
    for (const name of names) {
        try {
            entries.push(JSON.parse(await readFile(join(libraryDir, name), "utf8")) as PromotedEntry);
        } catch {
            // Not an entry.
        }
    }
    return entries;
}
