// TFP-221: what the covered-host guard stopped, for each payload test. The guard's notes are Playwright annotations,
// which Mr Onion's report doesn't carry (found by this measurement), and a run keeps Playwright's own JSON report
// only while it runs. So the three payload tests of the active run's saved suite are run again, alone, against the
// with-bugs copy started fresh, with the settings that run gave them (the gate open on localhost), and each test's
// status, reason and guard notes are read from Playwright's JSON report.
// Usage (from the repo root): node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types <this> <suite> <out>
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { runPlaywrightSpec } = await import(pathToFileURL(join(root, "src/test-support/playwright-cli.ts")).href);
const [suitePath, outPath] = process.argv.slice(2);
const code = await readFile(suitePath, "utf8");
const { report } = await runPlaywrightSpec(code, "tfp221-guard-notes", ["--grep=script-shaped input is not executed", "--workers=1", "--timeout=30000"], {
    MRONION_ACTIVE: "1",
    MRONION_ACTIVE_GATE: "open",
    MRONION_ACTIVE_HOSTS: "localhost",
    MRONION_INTERACTIVE: "0",
});
type Spec = { title: string; tests: Array<{ annotations?: Array<{ type: string; description?: string }>; results: Array<{ status: string; error?: { message?: string } }> }> };
type Suite = { specs: Spec[]; suites?: Suite[] };
const lines: string[] = [];
const walk = (suites: Suite[]) => suites.forEach((suite) => {
    for (const spec of suite.specs) {
        for (const t of spec.tests) {
            const result = t.results.at(-1);
            const skip = (t.annotations ?? []).find((a) => a.type === "skip")?.description;
            const notes = (t.annotations ?? []).filter((a) => a.type === "note" && a.description?.startsWith("covered-host guard")).map((a) => a.description);
            const failure = result?.error?.message?.split("\n")[0];
            lines.push(`- ${spec.title}\n  status: ${result?.status}${skip ? `, "${skip}"` : ""}${failure ? `\n  failure: ${failure}` : ""}\n  guard notes: ${notes.length > 0 ? notes.join(" | ") : "none (nothing stopped)"}`);
        }
    }
    walk(suite.suites ?? []);
});
walk(report.suites);
const text = `${lines.length} payload test(s), run again alone with the gate open on localhost:\n${lines.join("\n")}\n`;
await writeFile(outPath, text, "utf8");
console.log(text);
