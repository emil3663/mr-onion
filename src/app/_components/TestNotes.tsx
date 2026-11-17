import { useId } from "react";
import type { ExecutionRecord } from "@/lib/report/types";

/**
 * Phase 46 (TFP-289, Decision 6, review item 8; Phase 43 Gate B ruling 3): a test's notes in the app's report, with
 * their test, as the HTML report shows them (src/lib/report/notes.ts). A note is what a test recorded that is neither a
 * finding nor a failure: the covered-host guard's stopped requests, and with a stopped script "the result may not
 * reflect the page as visitors see it"; the read-only guard's aborted beacons. Each is shown whole, labelled as a note,
 * and counted nowhere: the screen reads `notes` as saved, and no finding count, verdict, pass ratio or Not-run count
 * reads them. A test with none shows nothing.
 */

const HELP = "What a test recorded that is neither a finding nor a failure, such as requests a guard stopped.";

/**
 * One test's notes, on its row in the Execution tab. Nothing for a test with none. The region is named for its test,
 * so a screen reader moving by landmark hears which test each belongs to (the fresh-context review).
 */
export function RecordNotes({ notes, title }: { notes: string[] | undefined; title: string }) {
    if (!notes || notes.length === 0) return null;
    return (
        <section aria-label={`Notes on ${title}`} className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Notes</h4>
            <p className="mt-1 text-xs text-sky-900">{HELP}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-700">
                {notes.map((note, index) => <li key={`${index}-${note}`} className="break-words">{note}</li>)}
            </ul>
        </section>
    );
}

/** Every noted test with its notes, for a Comprehensive run's view, as its HTML export lists them. Nothing when none. */
export function NotesFromTheRun({ records }: { records: ExecutionRecord[] }) {
    const headingId = useId();
    const noted = records.filter((record) => (record.notes ?? []).length > 0);
    if (noted.length === 0) return null;
    // The same test in two browsers is two entries: name the browser when the run had more than one.
    const browsers = new Set(records.map((record) => record.browser)).size > 1;
    return (
        <section aria-labelledby={headingId} className="rounded-[28px] border border-sky-200 bg-sky-50/60 p-5">
            <h3 id={headingId} className="text-sm font-semibold text-zinc-900">Notes from the run</h3>
            <p className="mt-1 text-xs text-zinc-600">{HELP}</p>
            <ul aria-label="Tests with notes" className="mt-3 space-y-3 text-sm">
                {noted.map((record) => (
                    <li key={`${record.id}-${record.browser}-${record.order}`}>
                        <span className="font-medium text-zinc-900">{record.title}</span> <span className="text-zinc-500">({browsers ? `${record.browser}, ` : ""}{record.status})</span>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-zinc-700">
                            {(record.notes ?? []).map((note, index) => <li key={`${index}-${note}`} className="break-words">{note}</li>)}
                        </ul>
                    </li>
                ))}
            </ul>
        </section>
    );
}
