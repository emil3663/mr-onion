"use client";

import { useEffect, useRef, useState } from "react";
import type { Candidate } from "@/lib/candidates/pool";
import type { PromotionVerdict } from "@/lib/candidates/promotion";

/**
 * Phase 46 (TFP-234, Decision 3, Acceptance Criteria 3): the promotion screen. It calls Phase 42's API
 * (`/api/candidates`, TFP-196) and nothing else, so the rule and its refusals stay there:
 * - it lists only the candidates the rule offers, each with its pattern, its code (read-only), its evidence in words
 *   (`promotionVerdict`'s reasons) and every site it ran on, named by host;
 * - approve (naming who approved) or reject (with a reason, which the API requires);
 * - approved candidates wait to be committed, with the next step (Gate B R7): in a checkout, `npm run library:promote`
 *   and a reviewed commit of the entries, which a coding agent can do. The app never writes into the repo.
 * TFP-298 (Gate B's walkthrough): a pool file that can't be decided (its id isn't candidateId(pattern), its file isn't
 * named for its id, or it isn't JSON) is listed under "Not offered" with why, as the API reports it; and an approval
 * still waiting can be withdrawn, with a reason, through the API's reject.
 */

type PooledCandidate = Candidate & { verdict: PromotionVerdict };


/**
 * Each site a candidate ran on, once each, in the order first seen: one per origin, as the rule counts them
 * (`promotionVerdict`'s sites), named by its host. Two origins with one host (http and https) are named by origin,
 * so the list never shows fewer sites than the rule's reason counts (found by the fresh-context review).
 */
export function hostsOf(candidate: Pick<Candidate, "evidence">): string[] {
    const origins = [...new Set(candidate.evidence.map((run) => run.origin))];
    const hostOf = (origin: string) => {
        try {
            return new URL(origin).host;
        } catch {
            return origin;
        }
    };
    const hosts = origins.map(hostOf);
    return origins.map((origin, index) => (hosts.filter((host) => host === hosts[index]).length > 1 ? origin : hosts[index]));
}

/** An API reply's error, or why there is none: a reply that isn't JSON, or no reply at all, is said so in words. */
async function replyOf(response: Response): Promise<{ data: Record<string, unknown>; error: string }> {
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (data === null) return { data: {}, error: response.ok ? "" : `Mr Onion couldn't answer (the server said ${response.status}, with no reason). Nothing was decided.` };
    return { data, error: response.ok ? "" : typeof data.error === "string" ? data.error : `Mr Onion refused it without saying why (${response.status}).` };
}

const describePattern = (candidate: Candidate) => `${candidate.pattern.name} [${candidate.pattern.type}]`;

export function PromotionScreen() {
    const [candidates, setCandidates] = useState<PooledCandidate[] | null>(null);
    const [offered, setOffered] = useState<string[]>([]);
    const [problems, setProblems] = useState<Array<{ file: string; reason: string }>>([]);
    const [withdrawReasons, setWithdrawReasons] = useState<Record<string, string>>({});
    const [loadError, setLoadError] = useState("");
    const [approver, setApprover] = useState("");
    // R5: the name used, shown as "Approving as <name> (change)"; change brings the field back, focused.
    const [approverSet, setApproverSet] = useState(false);
    const [editApprover, setEditApprover] = useState(0);
    const approverField = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (editApprover > 0) approverField.current?.focus();
    }, [editApprover]);
    // The fresh-context review: once used, focus goes to the line (a status), not lost with the form that went.
    const [usedApprover, setUsedApprover] = useState(0);
    const approvingLine = useRef<HTMLParagraphElement>(null);
    useEffect(() => {
        if (usedApprover > 0) approvingLine.current?.focus();
    }, [usedApprover]);
    const takeApprover = () => {
        if (!approver.trim()) return;
        setApproverSet(true);
        setUsedApprover((count) => count + 1);
    };
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [refusals, setRefusals] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState("");

    // Read from the API on open, and again after each decision (the pool as saved, never the screen's own copy).
    const [reads, setReads] = useState(0);
    useEffect(() => {
        let current = true;
        fetch("/api/candidates", { cache: "no-store" })
            .then(async (response) => {
                const { data, error } = await replyOf(response);
                if (error) throw new Error(`The candidates couldn't be read: ${error}.`);
                if (!current) return;
                setCandidates(Array.isArray(data.candidates) ? (data.candidates as PooledCandidate[]) : []);
                setOffered(Array.isArray(data.offered) ? (data.offered as string[]) : []);
                setProblems(Array.isArray(data.problems) ? (data.problems as Array<{ file: string; reason: string }>) : []);
                setLoadError("");
            })
            .catch((error: unknown) => {
                if (!current) return;
                setLoadError(error instanceof TypeError ? "The candidates couldn't be read: Mr Onion didn't answer." : error instanceof Error ? error.message : "The candidates couldn't be read.");
            });
        return () => {
            current = false;
        };
    }, [reads]);

    // One decision at a time, on any candidate: every Approve and Reject is disabled while one is with the API
    // (the fresh-context review: approving one and rejecting another, or the same one, could race).
    const decide = async (id: string, body: Record<string, string>) => {
        if (busy) return;
        setBusy(id);
        let refusal = "";
        try {
            const response = await fetch("/api/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
            // Refusals come from the API, shown as returned (Decision 2's pattern): the screen doesn't repeat the rules.
            refusal = (await replyOf(response)).error;
        } catch {
            refusal = "Mr Onion didn't answer, so nothing was decided. Try again.";
        } finally {
            setRefusals((current) => ({ ...current, [id]: refusal }));
            // R9 (the fresh-context review): a decision made clears its reasons, so an approval given again doesn't
            // start with the last withdrawal's reason typed in.
            if (!refusal) {
                setReasons((current) => ({ ...current, [id]: "" }));
                setWithdrawReasons((current) => ({ ...current, [id]: "" }));
            }
            // Read back after every answer, refused or not: a refusal may mean it was decided elsewhere.
            setReads((count) => count + 1);
            setBusy("");
        }
    };

    const offeredCandidates = (candidates ?? []).filter((candidate) => offered.includes(candidate.id));
    const waiting = (candidates ?? []).filter((candidate) => candidate.status === "approved");
    const withdrawnBelowRule = (candidates ?? []).filter((candidate) => candidate.status === "candidate" && (candidate.withdrawals?.length ?? 0) > 0 && !offered.includes(candidate.id));

    return (
        <div className="space-y-8">
            {loadError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{loadError}</p> : null}

            <section aria-labelledby="offered-heading" className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 id="offered-heading" className="text-lg font-semibold text-zinc-950">Offered for promotion</h2>
                <p className="mt-1 text-sm text-zinc-600">
                    Only candidates that meet the promotion rule are offered: they passed the gates on every run, and either caught a real defect or ran on 3 sites with no unlabelled failure.
                </p>
                {/* R5 (the owner's re-walk, 2026-11-18): the approver's name once, at the top, for every Approve below. */}
                {approverSet && approver.trim() ? (
                    <p ref={approvingLine} tabIndex={-1} role="status" data-testid="approving-as" className="mt-4 text-sm text-zinc-800 focus:outline-none">
                        Approving as <strong>{approver.trim()}</strong>{" "}
                        (<button
                            type="button"
                            aria-label="change the approver's name"
                            onClick={() => {
                                setApproverSet(false);
                                setEditApprover((count) => count + 1);
                            }}
                            className="font-medium text-indigo-700 underline underline-offset-2"
                        >
                            change
                        </button>)
                    </p>
                ) : (
                    <form
                        className="mt-4 flex flex-wrap items-end gap-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            takeApprover();
                        }}
                    >
                        <label className="block text-sm font-medium text-zinc-700">
                            Your name, for an approval
                            <input
                                ref={approverField}
                                value={approver}
                                // R6, from the owner's check in Chrome (2026-11-19): it offered saved addresses; off, as the
                                // confirmation's name, which passed.
                                autoComplete="off"
                                onChange={(event) => setApprover(event.target.value)}
                                className="mt-1 block w-72 rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                            />
                        </label>
                        <button type="submit" disabled={!approver.trim()} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50">
                            Use this name
                        </button>
                    </form>
                )}
                {candidates === null && !loadError ? <p role="status" className="mt-4 text-sm text-zinc-500">Reading the candidates...</p> : null}
                {candidates !== null && offeredCandidates.length === 0 ? <p className="mt-4 text-sm text-zinc-600">No candidate meets the rule yet.</p> : null}
                <ul className="mt-4 space-y-6">
                    {offeredCandidates.map((candidate) => (
                        <li key={candidate.id} aria-label={`Candidate ${describePattern(candidate)}`} className="rounded-2xl border border-zinc-200 p-4">
                            <h3 id={`candidate-${candidate.id}`} className="text-base font-semibold text-zinc-900">{describePattern(candidate)}</h3>
                            <p className="text-xs text-zinc-500">{candidate.pattern.kind} pattern · candidate {candidate.id} · {candidate.technique}</p>
                            {/* R9 (the owner's re-walk, 2026-11-18): a withdrawn approval brings it back here, the withdrawal shown. */}
                            {candidate.withdrawals?.length ? (
                                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                    <p className="font-medium">Its approval was withdrawn before:</p>
                                    <ul aria-label="Approvals withdrawn" className="mt-1 list-disc pl-5">
                                        {candidate.withdrawals.map((entry, index) => (
                                            <li key={`${index}-${entry.at}`}>
                                                Withdrawn on {entry.at.slice(0, 10)}
                                                {entry.approved ? `, approved by ${entry.approved.by} on ${entry.approved.at.slice(0, 10)}` : ""}: {entry.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            <h4 className="mt-3 text-sm font-medium text-zinc-700">Evidence</h4>
                            <ul className="list-disc pl-5 text-sm text-zinc-700">
                                {candidate.verdict.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                            <h4 className="mt-3 text-sm font-medium text-zinc-700">Sites it ran on</h4>
                            <ul aria-label="Sites it ran on" className="flex flex-wrap gap-2 text-sm">
                                {hostsOf(candidate).map((host) => <li key={host} className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-xs text-zinc-800">{host}</li>)}
                            </ul>
                            <h4 className="mt-3 text-sm font-medium text-zinc-700">Its code</h4>
                            <pre aria-label="Its code" tabIndex={0} className="mt-1 max-h-72 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">{candidate.body}</pre>
                            {/* R5: Approve on its own; the reason to reject beside Reject only, apart from it. */}
                            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                                <button
                                    type="button"
                                    disabled={busy !== ""}
                                    aria-describedby={`candidate-${candidate.id}`}
                                    // The fresh-context review: an Approve takes the name in the field as the one used, so the line at
                                    // the top always shows who approved.
                                    onClick={() => {
                                        if (approver.trim() && !approverSet) setApproverSet(true);
                                        void decide(candidate.id, { action: "approve", by: approver.trim() });
                                    }}
                                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                    Approve
                                </button>
                                <div role="group" aria-label="Reject this candidate" className="flex min-w-0 flex-1 items-end justify-end gap-2 border-l border-zinc-200 pl-4">
                                    <label className="min-w-0 flex-1 text-sm text-zinc-700 sm:max-w-72">
                                        Reason to reject
                                        <input
                                            value={reasons[candidate.id] ?? ""}
                                            // R6 (Gate B re-walk, 2026-11-18): no autofill.
                                            autoComplete="off"
                                            onChange={(event) => setReasons((current) => ({ ...current, [candidate.id]: event.target.value }))}
                                            className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        disabled={busy !== ""}
                                        aria-describedby={`candidate-${candidate.id}`}
                                        onClick={() => void decide(candidate.id, { action: "reject", reason: reasons[candidate.id] ?? "" })}
                                        className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                            {refusals[candidate.id] ? <p role="alert" className="mt-3 text-sm text-rose-700">{refusals[candidate.id]}</p> : null}
                        </li>
                    ))}
                </ul>
                {/* R9 (the fresh-context review): a candidate whose approval was withdrawn comes back here even when it no
                    longer meets the rule (a failure since its approval may be why), so the withdrawal is still shown. */}
                {withdrawnBelowRule.length > 0 ? (
                    <>
                        <h3 className="mt-6 text-base font-semibold text-zinc-900">Withdrawn, and below the promotion rule now</h3>
                        <ul className="mt-2 space-y-4">
                            {withdrawnBelowRule.map((candidate) => (
                                <li key={candidate.id} aria-label={`Withdrawn candidate ${describePattern(candidate)}`} className="rounded-2xl border border-zinc-200 p-4">
                                    <p className="text-sm font-semibold text-zinc-900">{describePattern(candidate)}</p>
                                    <ul aria-label="Why it isn't offered for approval" className="mt-1 list-disc pl-5 text-sm text-zinc-700">
                                        {candidate.verdict.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                                    </ul>
                                    <ul aria-label="Approvals withdrawn" className="mt-2 list-disc pl-5 text-sm text-amber-950">
                                        {(candidate.withdrawals ?? []).map((entry, index) => (
                                            <li key={`${index}-${entry.at}`}>
                                                Withdrawn on {entry.at.slice(0, 10)}
                                                {entry.approved ? `, approved by ${entry.approved.by} on ${entry.approved.at.slice(0, 10)}` : ""}: {entry.reason}
                                            </li>
                                        ))}
                                    </ul>
                                    <div role="group" aria-label="Reject this candidate" className="mt-3 flex items-end gap-2">
                                        <label className="min-w-0 flex-1 text-sm text-zinc-700 sm:max-w-72">
                                            Reason to reject
                                            <input
                                                value={reasons[candidate.id] ?? ""}
                                                autoComplete="off"
                                                onChange={(event) => setReasons((current) => ({ ...current, [candidate.id]: event.target.value }))}
                                                className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            disabled={busy !== ""}
                                            onClick={() => void decide(candidate.id, { action: "reject", reason: reasons[candidate.id] ?? "" })}
                                            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                    {refusals[candidate.id] ? <p role="alert" className="mt-2 text-sm text-rose-700">{refusals[candidate.id]}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </>
                ) : null}
            </section>

            {problems.length > 0 ? (
                <section aria-labelledby="not-offered-heading" className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6">
                    <h2 id="not-offered-heading" className="text-lg font-semibold text-zinc-950">Not offered</h2>
                    <p className="mt-1 text-sm text-zinc-600">Files in the candidate pool that can&apos;t be approved or rejected as they are, and why.</p>
                    <ul className="mt-3 space-y-1 text-sm text-zinc-800">
                        {problems.map((problem) => <li key={problem.file}><span className="font-mono text-xs">{problem.file}</span>: {problem.reason}</li>)}
                    </ul>
                </section>
            ) : null}

            <section aria-labelledby="waiting-heading" className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 id="waiting-heading" className="text-lg font-semibold text-zinc-950">Waiting to be committed</h2>
                <p className="mt-1 text-sm text-zinc-600">Approved candidates become library entries through a reviewed commit. Mr Onion never writes into the repository itself.</p>
                {waiting.length === 0 ? <p className="mt-4 text-sm text-zinc-600">Nothing is waiting.</p> : (
                    <>
                        <p data-testid="next-step" className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                            {/* R7 (the owner's re-walk, 2026-11-18): the next step in the owner's words, for anyone with a checkout; the
                                command and the folder set as code. */}
                            Next step: in your Mr Onion checkout, run <code className="font-mono text-xs">npm run library:promote</code> and commit the new entries under <code className="font-mono text-xs">src/lib/library/promoted/</code>, reviewed like any code. A coding agent can do this for you.
                        </p>
                        <ul className="mt-4 space-y-2 text-sm text-zinc-800">
                            {waiting.map((candidate) => (
                                <li key={candidate.id} aria-label={`Waiting: ${describePattern(candidate)}`} className="rounded-2xl border border-zinc-200 p-3">
                                    <span id={`waiting-${candidate.id}`}><strong>{describePattern(candidate)}</strong>, approved by {candidate.approved?.by ?? "?"} on {candidate.approved?.at.slice(0, 10) ?? "?"}</span>
                                    {/* TFP-298: withdrawing an approval is the API's reject, with its reason kept. */}
                                    {/* R5 (the fresh-context review): grouped like the reject pair, and kept on one line. */}
                                    <div role="group" aria-label="Withdraw this approval" className="mt-2 flex items-end gap-2">
                                        <label className="min-w-0 flex-1 text-sm text-zinc-700 sm:max-w-72">
                                            Reason to withdraw
                                            <input
                                                value={withdrawReasons[candidate.id] ?? ""}
                                                autoComplete="off"
                                                onChange={(event) => setWithdrawReasons((current) => ({ ...current, [candidate.id]: event.target.value }))}
                                                className="mt-1 block w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            disabled={busy !== ""}
                                            aria-describedby={`waiting-${candidate.id}`}
                                            onClick={() => void decide(candidate.id, { action: "reject", from: "approved", reason: withdrawReasons[candidate.id] ?? "", ...(candidate.approved ? { approvedAt: candidate.approved.at } : {}) })}
                                            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                                        >
                                            Withdraw approval
                                        </button>
                                    </div>
                                    {refusals[candidate.id] ? <p role="alert" className="mt-2 text-sm text-rose-700">{refusals[candidate.id]}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </section>
        </div>
    );
}
