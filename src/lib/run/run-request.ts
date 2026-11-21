import type { TestAuditMode } from "@/lib/run/executor";
import { normalizeBaseUrl, normalizeContentProfile } from "@/lib/generate/normalize";
import { buildRunSelection } from "@/lib/run/selection";
import { normalizeGenerationRecord } from "@/lib/run/generation-record";
import { normalizeRunMode, RunModeError } from "@/lib/comprehensive/run-mode";

type RunMode = ReturnType<typeof normalizeRunMode>;

/**
 * POST /api/run's request, read into the run's options (TFP-235, at its verification: the route's own step, tested on
 * its own). The request is untrusted input: each field is kept only in its known shape. The login is the route's, as
 * a bad one throws a named error the route maps to its status.
 *
 * Interactive and active tests are each asked for only by `true` itself (Phase 43 Decision 4, TFP-219): "true", 1, or
 * anything else truthy asks for nothing, so a request that didn't mean it can't open the active gate.
 */

export interface RunRequestOptions {
    code: string;
    selectedPractices: string[];
    auditMode: TestAuditMode;
    baseUrl: string | undefined;
    excludeTestTitles: string[];
    includeTestTitles: string[];
    description: string;
    contentProfile: ReturnType<typeof normalizeContentProfile>;
    enableInteractive: boolean;
    generation: ReturnType<typeof normalizeGenerationRecord>;
    runMode: RunMode;
    enableActive: boolean;
    /** Read by the route, which owns its errors (normalizeLoginConfig). */
    login: unknown;
}

const strings = (input: unknown) => (Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : []);

export function readRunRequest(body: unknown): { options: RunRequestOptions } | { error: string } {
    const request = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const { code, auditMode, baseUrl, description } = request;

    if (!code || typeof code !== "string") return { error: "code is required" };

    // Phase 35 (TFP-132): absent is a Standard run, exactly as before.
    let runMode: RunMode;
    try {
        runMode = normalizeRunMode(request.runMode);
    } catch (error) {
        if (error instanceof RunModeError) return { error: error.message };
        throw error;
    }
    // Its pages, cap and worker rule are all worked out from the base URL.
    if (runMode.kind === "comprehensive" && typeof baseUrl !== "string") return { error: "baseUrl is required for a Comprehensive run" };

    const excludeTestTitles = strings(request.excludeTestTitles);
    const includeTestTitles = strings(request.includeTestTitles);
    if (buildRunSelection(code, excludeTestTitles, includeTestTitles).runnableTestCount === 0) {
        return { error: includeTestTitles.length > 0 ? "No selected tests are available to rerun." : "No remaining tests are available to continue." };
    }

    // TFP-292 (hardening of the model-written test check): http(s) only, by the shared rule; the address is kept as given.
    if (typeof baseUrl === "string" && baseUrl.trim()) {
        const read = normalizeBaseUrl(baseUrl);
        if (!read.ok) return { error: read.message };
    }
    const target = typeof baseUrl === "string" ? baseUrl : undefined;
    return {
        options: {
            code,
            selectedPractices: strings(request.selectedPractices),
            auditMode: auditMode === "deep" ? "deep" : "fast",
            baseUrl: target,
            excludeTestTitles,
            includeTestTitles,
            description: typeof description === "string" ? description : "",
            contentProfile: normalizeContentProfile(request.contentProfile),
            enableInteractive: request.enableInteractive === true,
            // Phase 34 (TFP-119): untrusted input, so only the known shape, capped.
            generation: normalizeGenerationRecord(request.generation, target),
            runMode,
            // Phase 43 (TFP-219, Decision 4): active tests only when the request asks for them, as interactive.
            enableActive: request.enableActive === true,
            login: request.login,
        },
    };
}
