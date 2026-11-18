import { NextRequest, NextResponse } from "next/server";
import { loadPool, poolProblems } from "@/lib/candidates/pool";
import { approveCandidate, labelRun, offeredCandidates, PromotionError, promotionVerdict, rejectCandidate } from "@/lib/candidates/promotion";

/**
 * Phase 42 (TFP-196): the candidate pool and its promotion decisions.
 *
 *   GET  /api/candidates   every candidate with its verdict on the rule, and
 *                          `offered`: the ones meeting it, for the tester's approval
 *   POST /api/candidates   { action: "approve", id, by }
 *                          { action: "reject", id, reason }
 *                          { action: "label", id, run, label: "real" | "not a defect", bug? }
 *
 * Approval only marks a candidate for its library commit, which Claude Code
 * makes (`npm run library:promote`, then a reviewed commit).
 */

export async function GET() {
    const pool = await loadPool();
    const offered = await offeredCandidates();
    return NextResponse.json({
        candidates: pool.map((candidate) => ({ ...candidate, verdict: promotionVerdict(candidate) })),
        offered: offered.map(({ candidate }) => candidate.id),
        // TFP-298: files the pool can't offer, each with why, for the screen to report.
        problems: await poolProblems(),
    });
}

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    try {
        if (body.action === "approve") {
            if (typeof body.by !== "string" || !body.by.trim()) return NextResponse.json({ error: "Type your name to approve: the approval records who made it." }, { status: 400 });
            return NextResponse.json(await approveCandidate(id, body.by.trim()));
        }
        // TFP-298: `from: "approved"` withdraws an approval, refused if it changed meanwhile.
        if (body.action === "reject") return NextResponse.json(await rejectCandidate(id, typeof body.reason === "string" ? body.reason : "", body.from === "approved" ? "approved" : undefined, typeof body.approvedAt === "string" ? body.approvedAt : undefined));
        if (body.action === "label") {
            if (body.label !== "real" && body.label !== "not a defect") return NextResponse.json({ error: 'Label it "real" or "not a defect".' }, { status: 400 });
            const bug = typeof body.bug === "number" && Number.isInteger(body.bug) && body.bug > 0 ? body.bug : undefined;
            return NextResponse.json(await labelRun(id, typeof body.run === "string" ? body.run : "", body.label, bug));
        }
        return NextResponse.json({ error: 'Choose what to do: "approve", "reject" or "label".' }, { status: 400 });
    } catch (error) {
        if (error instanceof PromotionError) return NextResponse.json({ error: error.message }, { status: 409 });
        // TFP-298: anything else (a file that couldn't be saved) in words too, not the server's error page.
        return NextResponse.json({ error: `Mr Onion couldn't save the decision (${error instanceof Error ? error.message : "an unknown error"}). Nothing was decided; try again.` }, { status: 500 });
    }
}
