// TFP-221 (Acceptance Criterion 7): each script-payload test in the active run, with its result, its reason or failure,
// and every note the covered-host guard left (what it stopped, and why), from the run's report.json.
// Usage (from the repo root): node benchmarks/2026-11-16-tfp-221/payload-results.mjs <runDir>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [dir] = process.argv.slice(2);
const result = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(dir, "generate-meta.json"), "utf8"));
console.log(`generation: ${JSON.stringify(meta)}`);
console.log(`ownership: ${JSON.stringify(result.report.ownership)}`);
const payloads = result.report.execution.filter((record) => record.title.includes("script-shaped input is not executed"));
console.log(`\n${payloads.length} payload test(s):`);
for (const record of payloads) {
    console.log(`\n- ${record.title}\n  status: ${record.status}${record.skipReason ? `, "${record.skipReason}"` : ""}`);
    if (record.status === "Failed") console.log(`  failure: ${(record.rawMessage ?? "").split("\n").slice(0, 3).join(" | ")}`);
    const notes = [...(record.findings ?? []), ...(record.remarks ? [record.remarks] : [])].filter((text) => /covered-host guard/.test(text));
    console.log(notes.length > 0 ? notes.map((note) => `  guard: ${note}`).join("\n") : "  guard: no request stopped, no breach");
}
// Every guard note or breach anywhere in the run (only active tests run under the guard).
const anywhere = result.report.execution.filter((record) => /covered-host guard/.test(JSON.stringify(record)) && !payloads.includes(record));
console.log(`\nother tests mentioning the guard: ${anywhere.length}`);
