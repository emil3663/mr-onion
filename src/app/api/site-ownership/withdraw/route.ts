import { NextRequest, NextResponse } from "next/server";
import { confirmationStatus, originOf, withdrawConfirmation } from "@/lib/ownership/confirmation";

/**
 * Phase 43 (TFP-218, Decision 6): withdraw a site's ownership confirmation. It is kept, with its withdrawal date, as
 * evidence of what was confirmed and when; from the next run on it counts as absent.
 *
 *   POST /api/site-ownership/withdraw { baseUrl }
 */
export async function POST(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const origin = originOf(body.baseUrl);
    if (!origin) return NextResponse.json({ error: "baseUrl must be a valid http(s) URL" }, { status: 400 });
    const file = await withdrawConfirmation(origin);
    if (!file) return NextResponse.json({ error: "this site has no confirmation to withdraw, or it is already withdrawn" }, { status: 404 });
    return NextResponse.json({ origin, status: confirmationStatus(file.current), confirmation: file.current, history: file.history });
}
