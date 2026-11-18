import { createHash } from "crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import ts from "typescript";
import { escapeForSingleQuotedString } from "@/lib/generate/mock/format";
import { dataDir } from "@/lib/storage/data-dir";

/**
 * Phase 42 (TFP-195, Decision 8): the candidate pool - gap tests generalised
 * to their component's pattern, on their way to the library. It sits in
 * Mr Onion's data folder beside the site suites, one file per pattern:
 *
 *   <data>/candidates/<id>.json
 *
 * A candidate's body has two blanks, `__PAGE__` (the page's path) and
 * `__LOCATOR__` (how to find the element), filled in for each site it runs
 * on. Its pattern is the element's kind, its type and its name, read from
 * the coverage map: two candidates for one pattern are one file, merged,
 * never kept side by side. A rejected candidate stays, with its reason, so
 * the same test isn't proposed again.
 */

export interface CandidatePattern {
    kind: "element" | "link";
    /** The element's type as the map names it ("input", "button", "link"). */
    type: string;
    /** Its name, lower-cased, spaces collapsed. */
    name: string;
}

export interface CandidateEvidence {
    origin: string;
    page: string;
    at: string;
    /** The run's verdict for it: "Passed", "Failed", "Not run"... */
    status: string;
    run: string | null;
    /** TFP-196: the run failed it as a breach of the read-only gate. */
    breach?: boolean;
    /** TFP-196: a person's label for a failure - a real defect, or not one. */
    label?: "real" | "not a defect";
    /** TFP-196: the benchmark bug the failure caught, by the answer key's number. */
    bug?: number;
}

export interface Candidate {
    id: string;
    pattern: CandidatePattern;
    body: string;
    gate: "read-only";
    technique: string;
    writer: string;
    /** Where it was written, then where else a gap test of this pattern was (merged). */
    sources: Array<{ origin: string; page: string; at: string }>;
    /** Every later run it took part in. */
    evidence: CandidateEvidence[];
    /** TFP-196: "approved" by the tester and waiting for its library commit; "promoted" once it is a library entry. */
    status: "candidate" | "approved" | "rejected" | "promoted";
    /** Why it was rejected (TFP-196), or the library entry it became. */
    reason?: string;
    /** TFP-196: who approved it, and when. */
    approved?: { by: string; at: string };
    /** TFP-298: an approval withdrawn (through reject), when and why; `approved` stays on record beside it. Written
     * before Gate B's R9 only: those candidates were rejected, and are read as they are. */
    withdrawn?: { at: string; reason: string };
    /** Gate B R9: each approval withdrawn, in order: when, why, and the approval it undid. The candidate is offered again. */
    withdrawals?: Array<{ at: string; reason: string; approved?: { by: string; at: string } }>;
    costUsd: number;
}

/** The pattern of a coverage map entry: "Rentals [link]" -> link, link, "rentals". */
export function patternOf(kind: "element" | "link", name: string): CandidatePattern {
    const type = /\[([^\]]+)\]\s*$/.exec(name)?.[1] ?? kind;
    return { kind, type, name: name.replace(/\s*\[[^\]]+\]\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase() };
}

export function candidateId(pattern: CandidatePattern): string {
    return createHash("sha256").update(JSON.stringify([pattern.kind, pattern.type, pattern.name])).digest("hex").slice(0, 12);
}

const poolDir = () => join(dataDir(), "candidates");

/**
 * The pool's candidates: the well-formed ones only (TFP-298, the fresh-context review), so the screen, promotion,
 * binding into runs and the gap writer all read the same pool. A file that isn't one is reported by poolProblems.
 */
export async function loadPool(): Promise<Candidate[]> {
    return loadDecidablePool();
}

/** TFP-298: the pool's well-formed candidates only, each from <id>.json with its id candidateId(pattern): the ones that can be decided. */
export async function loadDecidablePool(): Promise<Candidate[]> {
    const names = await readdir(poolDir()).catch(() => [] as string[]);
    const candidates: Candidate[] = [];
    for (const file of names.filter((name) => name.endsWith(".json")).sort()) {
        const text = await readFile(join(poolDir(), file), "utf8").catch(() => null);
        try {
            const candidate = text ? (JSON.parse(text) as Candidate) : null;
            if (candidate?.pattern && candidate.id === candidateId(candidate.pattern) && file === `${candidate.id}.json`) candidates.push(candidate);
        } catch {
            // Not a candidate: poolProblems reports it.
        }
    }
    return candidates;
}

/** A pool file that can't be a candidate the screen offers, and why, in words (TFP-298). */
export interface PoolProblem {
    file: string;
    reason: string;
}

/**
 * Phase 46 (TFP-298, Gate B's walkthrough): the pool's files that aren't well-formed candidates. A candidate is decided
 * by its id, read from <id>.json, and the id is candidateId(pattern); one whose id is something else, or whose file
 * isn't named for its id, would be offered and then refused at every decision. They are reported, never offered.
 */
export async function poolProblems(): Promise<PoolProblem[]> {
    const names = await readdir(poolDir()).catch(() => [] as string[]);
    const problems: PoolProblem[] = [];
    for (const file of names.filter((name) => name.endsWith(".json")).sort()) {
        const text = await readFile(join(poolDir(), file), "utf8").catch(() => null);
        let candidate: Candidate | null = null;
        try {
            candidate = text ? (JSON.parse(text) as Candidate) : null;
        } catch {
            candidate = null;
        }
        if (!candidate || typeof candidate !== "object") {
            problems.push({ file, reason: "it can't be read as a candidate (it isn't JSON)" });
            continue;
        }
        if (!candidate.pattern) {
            problems.push({ file, reason: "it isn't a candidate: it has no pattern" });
            continue;
        }
        const expected = candidateId(candidate.pattern);
        if (candidate.id !== expected) {
            problems.push({ file, reason: `its id, ${candidate.id}, isn't the one its pattern gives (${expected}), so it can't be approved or rejected; save it again under that id` });
        } else if (file !== `${candidate.id}.json`) {
            problems.push({ file, reason: `its file name isn't its id: save it again as ${candidate.id}.json` });
        }
    }
    return problems;
}

export async function loadCandidate(id: string): Promise<Candidate | null> {
    if (!/^[0-9a-f]{12}$/.test(id)) return null;
    const text = await readFile(join(poolDir(), `${id}.json`), "utf8").catch(() => null);
    try {
        return text ? (JSON.parse(text) as Candidate) : null;
    } catch {
        return null;
    }
}

export async function saveCandidate(candidate: Candidate): Promise<void> {
    await mkdir(poolDir(), { recursive: true });
    const file = join(poolDir(), `${candidate.id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(candidate, null, 2), "utf8");
    await rename(`${file}.tmp`, file);
}

/**
 * Adds a generalised gap test to the pool. A pattern already there is the
 * same candidate: the new site is added to its sources, and its body kept
 * (merged, not kept side by side). A rejected pattern stays rejected.
 */
export async function addToPool(candidate: Omit<Candidate, "id" | "evidence" | "status">): Promise<{ candidate: Candidate; merged: boolean }> {
    const id = candidateId(candidate.pattern);
    const existing = await loadCandidate(id);
    if (existing) {
        const merged = { ...existing, sources: [...existing.sources, ...candidate.sources.filter((source) => !existing.sources.some((known) => known.origin === source.origin && known.page === source.page))] };
        await saveCandidate(merged);
        return { candidate: merged, merged: true };
    }
    const created: Candidate = { ...candidate, id, evidence: [], status: "candidate" };
    await saveCandidate(created);
    return { candidate: created, merged: false };
}

/** The active candidate for a pattern, if the pool has one (rejected and promoted ones aren't run as candidates; approved ones still are, until their commit). */
export function matchingCandidate(pool: Candidate[], pattern: CandidatePattern): Candidate | null {
    const id = candidateId(pattern);
    return pool.find((candidate) => candidate.id === id && (candidate.status === "candidate" || candidate.status === "approved")) ?? null;
}

/** Whether the pool has the pattern at all, in any state: then no new candidate is proposed for it. */
export function poolHas(pool: Candidate[], pattern: CandidatePattern): boolean {
    const id = candidateId(pattern);
    return pool.some((candidate) => candidate.id === id);
}

/**
 * The body bound to one site: its page's path and the element's locator in the blanks.
 *
 * TFP-197 (found in its first real run): `__PAGE__` is written two ways. TFP-194's stand-in wrote it inside a
 * string (`page.goto('__PAGE__')`); Claude Code wrote it as an expression (`page.goto(__PAGE__)`), which the
 * plain substitution turned into `page.goto(/)`, so every candidate failed its bound-back run. The body's syntax
 * tree tells the two apart: a bare `__PAGE__` becomes the path as a quoted string, one inside a string or a
 * template becomes the path's text. `__LOCATOR__` is always an expression.
 */
export function bindCandidate(candidate: Pick<Candidate, "body">, page: string, locator: string): string {
    const prefix = "async function __candidate__() {\n";
    const source = ts.createSourceFile("candidate.ts", `${prefix}${candidate.body}\n}`, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const bare: number[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === "__PAGE__") bare.push(node.getStart(source) - prefix.length);
        ts.forEachChild(node, visit);
    };
    visit(source);
    let body = candidate.body;
    for (const at of bare.sort((a, b) => b - a)) body = `${body.slice(0, at)}'${escapeForSingleQuotedString(page)}'${body.slice(at + "__PAGE__".length)}`;
    return body.split("__PAGE__").join(page.replace(/\\/g, "\\\\").replace(/['"`]/g, "\\$&")).split("__LOCATOR__").join(locator);
}

export async function recordEvidence(id: string, evidence: CandidateEvidence): Promise<void> {
    const candidate = await loadCandidate(id);
    if (!candidate) return;
    await saveCandidate({ ...candidate, evidence: [...candidate.evidence, evidence] });
}
