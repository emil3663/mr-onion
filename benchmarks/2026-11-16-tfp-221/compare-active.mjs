// TFP-221: the local run with active tests on (with-bugs, through the app) against Action Gate's with-bugs run with
// the switch off, test by test, so what the open gate changed is named. Different machines (this Windows machine;
// GitHub's ubuntu-26.04), so a difference that isn't a payload test is named too, not assumed.
// Usage (from the repo root): node benchmarks/2026-11-16-tfp-221/compare-active.mjs <switchOffReport> <activeReport>
import { readFileSync } from "node:fs";

const [offPath, activePath] = process.argv.slice(2);
const load = (path) => {
    const report = JSON.parse(readFileSync(path, "utf8")).report;
    return { summary: report.summary, tests: new Map(report.execution.map((record) => [record.title, record])) };
};
const off = load(offPath);
const active = load(activePath);
const counts = (s) => `${s.planned} planned / ${s.passed} passed / ${s.failed} failed / ${s.notRun} not run / ${s.blocked} blocked`;
console.log(`switch off (Action Gate): ${counts(off.summary)}\nactive (local, the app):  ${counts(active.summary)}`);
let differences = 0;
for (const [title, record] of off.tests) {
    const other = active.tests.get(title);
    const describe = (r) => `${r.status}${r.skipReason ? ` ("${r.skipReason}")` : ""}`;
    if (!other) console.log(`- only switch off: ${title}`);
    else if (other.status !== record.status || (other.skipReason ?? "") !== (record.skipReason ?? "")) console.log(`- ${title}: ${describe(record)} -> ${describe(other)}`);
    else continue;
    differences++;
}
for (const title of active.tests.keys()) if (!off.tests.has(title)) { console.log(`- only active: ${title}`); differences++; }
console.log(`${differences} difference(s)`);
