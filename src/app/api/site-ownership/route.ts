import { NextRequest, NextResponse } from "next/server";
import { CONFIRMATION_WORDING, confirmationStatus, LEGAL_NOTE, loadOwnership, maskedOwnership, originOf, saveConfirmation, validateConfirmation } from "@/lib/ownership/confirmation";

/**
 * Phase 43 (TFP-218, Decision 13): a site's ownership confirmation, by its origin. API only; the screen comes from
 * the app-screens record (Phase 46). Stored in the local data folder (src/lib/ownership/confirmation.ts).
 *
 *   GET  /api/site-ownership?baseUrl=<url>            the confirmation, its status, its history, the wording to show and the legal note
 *   POST /api/site-ownership { baseUrl, hosts, basis, wording, name, contactEmail, expiresAt?, scopes? }
 *                                                     create or replace it; refused with every reason when invalid
 *   POST /api/site-ownership/withdraw { baseUrl }     withdraw it, keeping it with its withdrawal date
 *
 * Every response masks the contact email, in the confirmation and its history (Phase 46, TFP-232, review item 2): the
 * full address is in the local file only. A POST still takes it in full.
 */

export async function GET(req: NextRequest) {
    const origin = originOf(req.nextUrl.searchParams.get("baseUrl"));
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL" }, { status: 400 });
    const file = await loadOwnership(origin);
    const shown = maskedOwnership(file);
    return NextResponse.json({ origin, status: confirmationStatus(file.current), confirmation: shown.current, history: shown.history, wording: CONFIRMATION_WORDING, legalNote: LEGAL_NOTE });
}

export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const origin = originOf(body.baseUrl);
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL" }, { status: 400 });
    const result = await validateConfirmation(origin, body);
    if ("refused" in result) return NextResponse.json({ error: "the confirmation was refused", reasons: result.refused }, { status: 400 });
    const file = await saveConfirmation(origin, result.confirmation);
    const shown = maskedOwnership(file);
    return NextResponse.json({ origin, status: confirmationStatus(file.current), confirmation: shown.current, history: shown.history });
}
