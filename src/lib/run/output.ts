import { normalizeExecutionTitle, stripAnsi } from "@/lib/report/text";
import type { ExecutionRecord, ReportArtifactItem } from "@/lib/report/types";
import { PLANNED_PLACEHOLDER, type PlannedExecutionSnapshot, type PlannedExecutionStatus, type RunJob } from "@/lib/run/jobs";

const PROGRESS_PREFIX = "MRONION_PROGRESS ";

function deriveLinkLabel(title: string) {
    const normalizedTitle = normalizeExecutionTitle(title);
    return normalizedTitle || null;
}

function updateActiveExecutions(job: RunJob) {
    job.progress.activeExecutions = [...job.activeExecutions.values()].slice(0, 3);
    job.progress.currentTestTitle = job.progress.activeExecutions[0]?.title ?? null;
    job.progress.currentLinkLabel = job.progress.activeExecutions[0]?.linkLabel ?? null;
}

function updatePlannedExecutionStatus(
    job: RunJob,
    id: string,
    status: PlannedExecutionStatus,
    duration?: number | null
) {
    const execution = job.progress.plannedExecutions.find((entry) => entry.id === id);

    if (execution) {
        execution.status = status;
        if (duration !== undefined) {
            execution.duration = duration;
        }
    }
}

/**
 * Each Playwright pass's tests, added to the run's one planned list (TFP-296): a run can be two passes (the read-only
 * units, then the serial group, TFP-156), and the second's start used to replace the first's list.
 */
function syncPlannedExecutions(job: RunJob, plannedTests: Array<{ id: string; title: string }>) {
    const uniqueExecutions = plannedTests.reduce((executions, test) => {
        if (executions.some((entry) => entry.id === test.id)) return executions;
        // A place seeded for this title, not yet taken: the reporter's test takes it, where it is in the list.
        const place = executions.find((entry) => entry.id.startsWith(PLANNED_PLACEHOLDER) && entry.title === test.title);
        if (place) {
            place.id = test.id;
            place.linkLabel = deriveLinkLabel(test.title);
            return executions;
        }
        executions.push({
            id: test.id,
            title: test.title,
            linkLabel: deriveLinkLabel(test.title),
            status: "not-run" as PlannedExecutionStatus,
            duration: null,
        });
        return executions;
    }, [...job.progress.plannedExecutions] as PlannedExecutionSnapshot[]);

    if (uniqueExecutions.length > 0) {
        job.progress.plannedExecutions = uniqueExecutions;
        job.progress.totalTests = Math.max(job.progress.totalTests, uniqueExecutions.length);
    }
}

function updateCompletedCounts(job: RunJob, status: string | undefined) {
    if (status === "passed") {
        job.progress.passedTests += 1;
        return;
    }

    if (status === "flaky") {
        job.progress.flakyTests += 1;
        return;
    }

    if (status === "skipped" || status === "interrupted") {
        job.progress.blockedTests += 1;
        return;
    }

    job.progress.failedTests += 1;
}

function mapResultStatusToPlannedStatus(status: string | undefined): PlannedExecutionStatus {
    if (status === "passed") {
        return "passed";
    }

    if (status === "flaky") {
        return "flaky";
    }

    if (status === "skipped") {
        return "blocked";
    }

    if (status === "interrupted") {
        return "interrupted";
    }

    return "failed";
}

/**
 * TFP-296 (the fresh-context review): at the run's end, the seeded places no test took (a title the reporter wrote
 * otherwise, or one no pass loaded) are dropped, so the list holds what ran. A stopped run keeps them: they are the
 * tests it didn't get to, shown Not run.
 */
export function dropUntakenPlaces(job: RunJob) {
    if (job.cancellationRequested) return;
    job.progress.plannedExecutions = job.progress.plannedExecutions.filter((entry) => !entry.id.startsWith(PLANNED_PLACEHOLDER));
}

export function finalizeInterruptedPlannedExecutions(job: RunJob) {
    let interruptedCount = 0;

    for (const execution of job.progress.plannedExecutions) {
        if (execution.status === "running") {
            execution.status = "interrupted";
            interruptedCount += 1;
        }
    }

    if (interruptedCount > 0) {
        job.progress.blockedTests += interruptedCount;
    }
}

function handleProgressEvent(job: RunJob, line: string) {
    if (!line.startsWith(PROGRESS_PREFIX)) {
        return false;
    }

    const payload = line.slice(PROGRESS_PREFIX.length);

    try {
        const event = JSON.parse(payload) as
            | { type: "begin"; total: number; tests?: Array<{ id: string; title: string }> }
            | { type: "test-begin"; id: string; title: string }
            | { type: "test-end"; id: string; title: string; status?: string; duration?: number };

        if (event.type === "begin") {
            job.progress.totalTests = Math.max(job.progress.totalTests, event.total || 0);
            syncPlannedExecutions(job, event.tests ?? []);
            return true;
        }

        if (event.type === "test-begin") {
            if (!job.activeExecutions.has(event.id)) {
                job.progress.startedTests += 1;
            }

            job.activeExecutions.set(event.id, {
                id: event.id,
                title: event.title,
                linkLabel: deriveLinkLabel(event.title),
            });
            updatePlannedExecutionStatus(job, event.id, "running", null);
            // Gate B R10: when it began, for the overlay's "running for" (kept when it ends).
            const began = job.progress.plannedExecutions.find((entry) => entry.id === event.id);
            if (began) began.startedAt = Date.now();
            updateActiveExecutions(job);
            return true;
        }

        if (event.type === "test-end") {
            if (job.activeExecutions.has(event.id)) {
                job.activeExecutions.delete(event.id);
            }

            job.progress.completedTests += 1;
            job.progress.lastCompletedTitle = event.title;
            job.progress.lastCompletedId = event.id;
            updatePlannedExecutionStatus(job, event.id, mapResultStatusToPlannedStatus(event.status), event.duration ?? null);
            updateCompletedCounts(job, event.status);
            updateActiveExecutions(job);
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

export function appendProcessOutput(job: RunJob, chunk: string, flush = false) {
    if (!chunk && !flush) {
        return;
    }

    const sanitizedChunk = stripAnsi(chunk);
    const combinedOutput = `${job.pendingOutput}${sanitizedChunk}`;
    const endsWithLineBreak = /\r?\n$/.test(combinedOutput);
    const lines = combinedOutput.split(/\r?\n/);
    const rawLines = endsWithLineBreak || flush ? lines.filter(Boolean) : lines.slice(0, -1).filter(Boolean);

    job.pendingOutput = endsWithLineBreak || flush ? "" : lines.at(-1) ?? "";

    for (const line of rawLines) {
        if (!handleProgressEvent(job, line)) {
            job.outputChunks.push(`${line}\n`);
        }
    }
}

export function collectArtifactFiles(records: ExecutionRecord[]) {
    const artifactFiles = new Map<string, { filePath: string; fileName: string; contentType: string }>();

    for (const record of records) {
        for (const artifact of record.artifacts) {
            artifactFiles.set(artifact.artifactId, {
                filePath: artifact.filePath,
                fileName: artifact.fileName,
                contentType: artifact.contentType,
            });
        }
    }

    return artifactFiles;
}

export function withArtifactDownloadPath(item: ReportArtifactItem, runId: string): ReportArtifactItem {
    return {
        ...item,
        downloadPath: `/api/run?runId=${encodeURIComponent(runId)}&artifactId=${encodeURIComponent(item.artifactId)}`,
    };
}

export function buildConsoleSummary(records: ExecutionRecord[], duration: number) {
    const lines = [`Executed ${records.length} test results in ${duration}ms.`];

    for (const record of records) {
        lines.push(
            `[${record.browser}] ${record.status} ${record.area} > ${record.title} (${record.duration}ms)`
        );
    }

    return lines.join("\n");
}
