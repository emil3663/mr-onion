import { NextRequest, NextResponse } from "next/server";
import { originOf } from "@/lib/ownership/confirmation";
import { archiveRun, isValidRunId, listRunRecords, setRunPinned, sweepAutomaticArchiving } from "@/lib/run/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/runs?baseUrl=<url>: one site's saved runs. A request must name its site, and there is no form of it that
 * lists every site's (owner ruling at TFP-232's verification, 2026-11-17; Phase 46 Decision 1, review item 7): a list
 * of every run is a list of the sites tested.
 */
export async function GET(req: NextRequest) {
    const origin = originOf(req.nextUrl.searchParams.get("baseUrl"));
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL: runs are read one site at a time" }, { status: 400 });
    const records = await listRunRecords();
    return NextResponse.json({ origin, runs: records.filter((record) => originOf(record.baseUrl) === origin) });
}

export async function PATCH(req: NextRequest) {
    const { runId, pinned, archive } = await req.json().catch(() => ({}));

    if (!runId || typeof runId !== "string") {
        return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    if (!isValidRunId(runId)) {
        return NextResponse.json({ error: "runId must be a valid UUID" }, { status: 400 });
    }

    if (archive === true) {
        const record = await archiveRun(runId);

        if (!record) {
            return NextResponse.json({ error: "Run not found" }, { status: 404 });
        }

        return NextResponse.json(record);
    }

    if (typeof pinned === "boolean") {
        const record = await setRunPinned(runId, pinned);

        if (!record) {
            return NextResponse.json({ error: "Run not found" }, { status: 404 });
        }

        return NextResponse.json(record);
    }

    return NextResponse.json({ error: "pinned (boolean) or archive: true is required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const { action } = await req.json().catch(() => ({}));

    if (action !== "sweep") {
        return NextResponse.json({ error: "Only the 'sweep' action is supported" }, { status: 400 });
    }

    const archivedRunIds = await sweepAutomaticArchiving();
    return NextResponse.json({ archivedRunIds });
}
