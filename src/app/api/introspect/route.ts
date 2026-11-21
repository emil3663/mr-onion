import { NextRequest, NextResponse } from "next/server";
import { findForeignPath, foreignPathMessage } from "@/lib/introspect/paths";
import { inspectSite } from "@/lib/pipeline/inspect";
// TFP-292 (hardening of the model-written test check): the one reading of a run's Base URL, in place of this route's
// own copy (the same default, http(s) only).
import { normalizeBaseUrl } from "@/lib/generate/normalize";

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }

    const { baseUrl, paths, namedFlows } = body;

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

    if (!normalizedBaseUrl.ok) {
        return NextResponse.json({ error: normalizedBaseUrl.message }, { status: 400 });
    }

    // Phase 40 Decision 8 (TFP-174): a page on another origin is rejected before inspection, naming it.
    const foreign = findForeignPath(normalizedBaseUrl.value, paths);
    if (foreign) {
        return NextResponse.json({ error: foreignPathMessage(normalizedBaseUrl.value, foreign) }, { status: 400 });
    }

    // Phase 47 (TFP-245): the inspection is in src/lib/pipeline, shared with the CLI.
    return NextResponse.json(await inspectSite(normalizedBaseUrl.value, paths, namedFlows));
}
