// TFP-221 (Phase 43, Acceptance Criterion 6): Action Gate's runs with the active switch off, compared test by test
// with Phase 43's base (benchmarks/2026-11-15-phase-43-base/, Action Gate on 202a17a). Each test is matched by its
// title (unique in every report), and every difference is named: a test only on one side, a status that changed, or
// a Not run reason that changed.
// Usage (from the repo root): node benchmarks/2026-11-16-tfp-221/compare.mjs <baseDir> <newDir>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [baseDir, newDir] = process.argv.slice(2);
// The clean copy's records have ULIDs (26 characters of Crockford base 32), new each time its database is seeded, and
// they appear in titles (a product page, a category's checkbox id). They are matched as <id>; the count says how many.
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g;
let renamed = 0;
const key = (title) => title.replace(ULID, () => "<id>");
const load = (dir, copy) => {
    const report = JSON.parse(readFileSync(join(dir, copy, "report.json"), "utf8")).report;
    const tests = new Map(report.execution.map((record) => [key(record.title), record]));
    if (tests.size !== report.execution.length) throw new Error(`${dir}/${copy}: titles aren't unique once ids are masked`);
    return { summary: report.summary, tests };
};
const counts = (s) => `${s.planned} planned / ${s.passed} passed / ${s.failed} failed / ${s.notRun} not run / ${s.blocked} blocked`;

let differences = 0;
for (const copy of ["clean", "with-bugs"]) {
    const base = load(baseDir, copy);
    const now = load(newDir, copy);
    console.log(`\n## ${copy}\nbase: ${counts(base.summary)}\nnow:  ${counts(now.summary)}`);
    const lines = [];
    renamed = 0;
    for (const [title, record] of base.tests) {
        const other = now.tests.get(title);
        if (other && other.title !== record.title) renamed++;
        if (!other) lines.push(`only in the base: ${title} (${record.status})`);
        else if (other.status !== record.status) lines.push(`status: ${title}: ${record.status} -> ${other.status}${other.skipReason ? ` ("${other.skipReason}")` : ""}${other.status === "Failed" ? ` [${(other.rawMessage ?? "").split("\n")[0].slice(0, 200)}]` : ""}`);
        else if (key(other.skipReason ?? "") !== key(record.skipReason ?? "")) lines.push(`Not run reason: ${title}: "${record.skipReason ?? ""}" -> "${other.skipReason ?? ""}"`);
    }
    for (const [title, record] of now.tests) if (!base.tests.has(title)) lines.push(`only now: ${title} (${record.status})`);
    console.log(`matched ${base.tests.size} of ${now.tests.size} by title; ${renamed} of them only once their record ids were masked`);
    console.log(lines.length === 0 ? "identical, test by test (status and Not run reason)" : lines.map((line) => `- ${line}`).join("\n"));
    differences += lines.length;
}
console.log(`\n${differences} difference(s)`);
