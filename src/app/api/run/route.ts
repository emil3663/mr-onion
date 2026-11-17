import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { normalizeLoginConfig, RunLoginError } from "@/lib/run/auth";
import { startRunJob } from "@/lib/run/executor";
import { buildRunSnapshot, runJobs } from "@/lib/run/jobs";
import type { RunStatusPayload } from "@/lib/run/jobs";
import { isValidRunId, loadRunRecord, markRunAccessed, runEvidenceDir } from "@/lib/run/persistence";
import { readRunRequest } from "@/lib/run/run-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    // TFP-235: the request read into the run's options, on its own so it is tested on its own (src/lib/run/run-request.ts).
    const read = readRunRequest(await req.json().catch(() => ({})));
    if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
    const options = read.options;

    // TFP-092: a login the request asked for must be valid and must succeed.
    // Any failure is a named error and the run does not start - never a quiet
    // fall back to unauthenticated tests.
    let job;
    try {
        const loginConfig = normalizeLoginConfig(options.login, options.baseUrl);
        job = await startRunJob(
            options.code,
            options.selectedPractices,
            options.auditMode,
            options.baseUrl,
            options.excludeTestTitles,
            options.includeTestTitles,
            options.description,
            options.contentProfile,
            options.enableInteractive,
            loginConfig,
            options.generation,
            options.runMode,
            options.enableActive
        );
    } catch (error) {
        if (error instanceof RunLoginError) {
            return NextResponse.json(
                { error: error.message, errorKind: error.kind },
                { status: error.kind === "config-invalid" ? 400 : 422 }
            );
        }

        throw error;
    }

    return NextResponse.json(job, { status: 202 });
}

export async function GET(req: NextRequest) {
    const runId = req.nextUrl.searchParams.get("runId");
    const artifactId = req.nextUrl.searchParams.get("artifactId");

    if (!runId) {
        return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    if (!isValidRunId(runId)) {
        return NextResponse.json({ error: "runId must be a valid UUID" }, { status: 400 });
    }

    const job = runJobs.get(runId);

    if (artifactId) {
        // TFP-208: a run reads as finished once its result is set, before its evidence has been moved into its
        // folder. An artifact asked for in between could name a file already moved: 404 "Artifact file is
        // unavailable" (a regression run, 2026-10-16). Wait for the save; a failed save falls through to the
        // paths as they are.
        await job?.saving?.catch(() => undefined);
        const liveArtifact = job?.artifactFiles.get(artifactId) ?? null;
        let artifact = liveArtifact;

        if (!artifact) {
            const record = await loadRunRecord(runId);
            artifact = record?.artifactFiles[artifactId] ?? null;
        }

        if (!artifact) {
            return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
        }

        const artifactPath = resolve(artifact.filePath);
        const allowedRoots = [
            ...(job ? [resolve(job.artifactDir)] : []),
            resolve(runEvidenceDir(runId)),
        ];

        if (!allowedRoots.some((root) => artifactPath.startsWith(root))) {
            return NextResponse.json({ error: "Artifact path is invalid" }, { status: 400 });
        }

        const fileBuffer = await readFile(artifactPath).catch(() => null);
        if (!fileBuffer) {
            return NextResponse.json({ error: "Artifact file is unavailable" }, { status: 404 });
        }

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": artifact.contentType,
                "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
            },
        });
    }

    if (job) {
        if (job.result) {
            await markRunAccessed(runId).catch(() => { });
        }
        return NextResponse.json(buildRunSnapshot(job));
    }

    const record = await loadRunRecord(runId);

    if (!record) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    await markRunAccessed(runId).catch(() => { });

    const snapshot: RunStatusPayload = {
        runId: record.runId,
        runStatus: record.result.runStatus,
        duration: record.result.duration,
        progress: record.result.progress,
        cancellationRequested: false,
        result: record.result,
    };

    return NextResponse.json(snapshot);
}

export async function DELETE(req: NextRequest) {
    const { runId } = await req.json().catch(() => ({ runId: null }));

    if (!runId || typeof runId !== "string") {
        return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    if (!isValidRunId(runId)) {
        return NextResponse.json({ error: "runId must be a valid UUID" }, { status: 400 });
    }

    const job = runJobs.get(runId);

    if (!job) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (job.status === "running" && job.process?.exitCode === null) {
        job.cancellationRequested = true;
        job.outputChunks.push("Cancellation requested by user.\n");
        job.process.kill("SIGTERM");
    }

    return NextResponse.json(buildRunSnapshot(job));
}
