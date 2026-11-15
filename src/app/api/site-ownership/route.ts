import { NextRequest, NextResponse } from "next/server";
import { CONFIRMATION_WORDING, confirmationStatus, loadOwnership, originOf, saveConfirmation, validateConfirmation } from "@/lib/ownership/confirmation";

/**
 * Phase 43 (TFP-218, Decision 13): a site's ownership confirmation, by its origin. API only; the screen comes from
 * the app-screens record (Phase 46). Stored in the local data folder (src/lib/ownership/confirmation.ts).
 *
 *   GET  /api/site-ownership?baseUrl=<url>            the confirmation, its status, its history, and the wording to show
 *   POST /api/site-ownership { baseUrl, hosts, basis, wording, name, contactEmail, expiresAt?, scopes? }
 *                                                     create or replace it; refused with every reason when invalid
 *   POST /api/site-ownership/withdraw { baseUrl }     withdraw it, keeping it with its withdrawal date
 */

export async function GET(req: NextRequest) {
    const origin = originOf(req.nextUrl.searchParams.get("baseUrl"));
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL" }, { status: 400 });
    const file = await loadOwnership(origin);
    return NextResponse.json({ origin, status: confirmationStatus(file.current), confirmation: file.current, history: file.history, wording: CONFIRMATION_WORDING });
}

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const origin = originOf(body.baseUrl);
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL" }, { status: 400 });
    const result = await validateConfirmation(origin, body);
    if ("refused" in result) return NextResponse.json({ error: "the confirmation was refused", reasons: result.refused }, { status: 400 });
    const file = await saveConfirmation(origin, result.confirmation);
    return NextResponse.json({ origin, status: confirmationStatus(file.current), confirmation: file.current, history: file.history });
}
