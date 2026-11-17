import { NextRequest, NextResponse } from "next/server";
import { originOf } from "@/lib/ownership/confirmation";
import { savedSuitesOf } from "@/lib/site-suites/by-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 46 (TFP-232, review item 6): a site's saved suites, each with when it was last run, for the site lookup.
 * By site only (Decision 1): a request must name its site, and there is no form of it that lists every site.
 *
 *   GET /api/site-suites?baseUrl=<url>    { origin, suites: [{ runType, area?, practices, auditMode, savedAt, tests, lastRun }] }
 */
export async function GET(req: NextRequest) {
    const origin = originOf(req.nextUrl.searchParams.get("baseUrl"));
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL" }, { status: 400 });
    return NextResponse.json({ origin, suites: await savedSuitesOf(origin) });
}
