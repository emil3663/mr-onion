// Phase 42 (TFP-196): the promotion step Claude Code runs. Every candidate Emil approved
// (POST /api/candidates { action: "approve" }) is written, with its evidence, as a library
// entry under src/lib/library/promoted/, and marked promoted in the pool. Then the entries
// are committed and reviewed like any code. Reads the data folder Mr Onion uses
// (MRONION_DATA_DIR, else the OS app-data folder).
// Usage (from the repo root): npm run library:promote
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { promoteApproved } = await import(pathToFileURL(join(process.cwd(), "src/lib/candidates/promotion.ts")).href);
const { poolProblems } = await import(pathToFileURL(join(process.cwd(), "src/lib/candidates/pool.ts")).href);
const written: string[] = await promoteApproved();
// TFP-298: the pool's files that aren't well-formed candidates are skipped; say which, and why.
const problems: Array<{ file: string; reason: string }> = await poolProblems();
if (problems.length > 0) console.log(`Skipped, not well-formed candidates:\n${problems.map((problem) => `  ${problem.file}: ${problem.reason}`).join("\n")}`);
console.log(written.length === 0 ? "No approved candidate is waiting for its library commit." : `Library entries written, to review and commit:\n${written.map((file) => `  ${file}`).join("\n")}`);
