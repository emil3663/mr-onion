import type { ExecutionRecord } from "./types";
import { escapeReportHtml } from "./text";

/**
 * Gate B's fix (Phase 43, owner 2026-11-16; TFP-221's finding 1): what the run's tests noted, each under its test,
 * apart from findings. A note is neither a finding nor a failure: the covered-host guard's stopped requests (and
 * TFP-220 ruling 4's "the result may not reflect the page as visitors see it"), or the read-only guard's aborted
 * beacons (TFP-199). Empty when no test noted anything.
 */
export function buildNotesHtmlSection(records: ExecutionRecord[]): string {
    const noted = records.filter((record) => (record.notes ?? []).length > 0);
    if (noted.length === 0) return "";
    const items = noted.map((record) => `
                    <li><strong>${escapeReportHtml(record.title)}</strong> (${escapeReportHtml(record.status)})
                        <ul>${(record.notes ?? []).map((note) => `<li>${escapeReportHtml(note)}</li>`).join("")}</ul>
                    </li>`).join("");
    return `<div class="section-heading">Notes from the run</div>
                <div class="issue-body">What a test recorded that is neither a finding nor a failure, such as requests a guard stopped.</div>
                <ul>${items}
                </ul>`;
}
