/**
 * Phase 46 (TFP-298, from Gate B's walkthrough, 2026-11-17): the pool offers no candidate whose id isn't
 * candidateId(pattern), and reports it instead; the API's refusals are in plain words; an approval can be withdrawn,
 * with a reason, through reject. On a pool in a temporary data folder.
 *
 * ISTQB techniques: equivalence partitioning over a pool file (well formed and meeting the rule; its id not the one
 * its pattern gives; its file name not its id; not JSON), and over a decision's refusals (no name, no reason, already
 * decided, not meeting the rule, no such candidate), and a state transition (candidate -> approved -> withdrawn).
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/candidates/pool-problems.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-pool-problems-"));
const savedDataDir = process.env.MRONION_DATA_DIR;
let run = 0;

const route = await import("../../app/api/candidates/route.ts");
const { NextRequest } = await import("next/server");
const { candidateId } = await import("./pool.ts");
const { promoteApproved } = await import("./promotion.ts");

beforeEach(() => {
    process.env.MRONION_DATA_DIR = join(scratch, `data-${run++}`);
    mkdirSync(join(process.env.MRONION_DATA_DIR, "candidates"), { recursive: true });
});

after(() => {
    if (savedDataDir === undefined) delete process.env.MRONION_DATA_DIR;
    else process.env.MRONION_DATA_DIR = savedDataDir;
    rmSync(scratch, { recursive: true, force: true });
});

const pattern = (name: string) => ({ kind: "element", type: "button", name });
const meeting = (name: string, id = candidateId(pattern(name) as never)) => ({
    id,
    pattern: pattern(name),
    body: "await page.goto(__PAGE__);\nawait expect(__LOCATOR__).toBeVisible();",
    gate: "read-only",
    technique: "state transition",
    writer: "claude-code",
    sources: [{ origin: "http://a.test", page: "/", at: "2026-11-01T00:00:00.000Z" }],
    evidence: ["http://a.test", "http://b.test", "http://c.test"].map((origin, index) => ({ origin, page: "/", at: `2026-11-0${index + 2}T00:00:00.000Z`, status: "Passed", run: `run-${name}-${index}` })),
    status: "candidate",
    costUsd: 0,
});
const file = (name: string, content: unknown) => writeFileSync(join(process.env.MRONION_DATA_DIR!, "candidates", name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
const read = async () => (await (await route.GET()).json()) as { candidates: Array<{ id: string }>; offered: string[]; problems: Array<{ file: string; reason: string }> };
const post = async (body: unknown) => {
    const response = await route.POST(new NextRequest(new URL("http://localhost/api/candidates"), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
    return { status: response.status, body: await response.json() };
};

test("a candidate whose id isn't candidateId(pattern), or whose file isn't its id, or unreadable, isn't offered: it's reported", async () => {
    const good = meeting("add to cart");
    file(`${good.id}.json`, good);
    const misnamed = meeting("subscribe", "walkthrough01");
    file("walkthrough01.json", misnamed);
    const misfiled = meeting("search");
    file("search.json", misfiled);
    file("broken.json", "{ not json");
    file("not-a-candidate.json", { id: "x" });

    const { offered, problems } = await read();
    assert.deepEqual(offered, [good.id], "only the well-formed one is offered");
    assert.deepEqual(problems.map((problem) => problem.file).sort(), ["broken.json", "not-a-candidate.json", "search.json", "walkthrough01.json"]);
    const reasonOf = (name: string) => problems.find((problem) => problem.file === name)!.reason;
    assert.equal(reasonOf("walkthrough01.json"), `its id, walkthrough01, isn't the one its pattern gives (${candidateId(pattern("subscribe") as never)}), so it can't be approved or rejected; save it again under that id`);
    assert.equal(reasonOf("search.json"), `its file name isn't its id: save it again as ${misfiled.id}.json`);
    assert.equal(reasonOf("broken.json"), "it can't be read as a candidate (it isn't JSON)");
    assert.equal(reasonOf("not-a-candidate.json"), "it isn't a candidate: it has no pattern");
});

test("the API's refusals on the candidate screen are in plain words", async () => {
    const two = { ...meeting("newsletter"), evidence: meeting("newsletter").evidence.slice(0, 2) };
    file(`${two.id}.json`, two);
    const offered = meeting("checkout");
    file(`${offered.id}.json`, offered);

    assert.deepEqual(await post({ action: "approve", id: offered.id, by: "" }), { status: 400, body: { error: "Type your name to approve: the approval records who made it." } });
    assert.deepEqual(await post({ action: "reject", id: offered.id, reason: " " }), { status: 409, body: { error: "Type a reason first: it is kept with the candidate." } });
    assert.deepEqual(await post({ action: "approve", id: "0123456789ab", by: "Tess" }), { status: 409, body: { error: "There is no such candidate in the pool. The list is read again." } });
    const below = await post({ action: "approve", id: two.id, by: "Tess" });
    assert.equal(below.status, 409);
    assert.match(below.body.error, /^This candidate doesn't meet the promotion rule yet: .*it ran on 2 sites \(3 needed without one\)\.$/);
    assert.equal((await post({ action: "approve", id: offered.id, by: "Tess" })).status, 200);
    assert.deepEqual(await post({ action: "approve", id: offered.id, by: "Tess" }), { status: 409, body: { error: "This candidate was already approved, so it can't be approved again." } });
});

test("an approval is withdrawn with a reason, through reject from approved: kept on record, and refused once it changed", async () => {
    const offered = meeting("compare");
    file(`${offered.id}.json`, offered);
    assert.equal((await post({ action: "approve", id: offered.id, by: "Tess" })).status, 200);
    assert.equal((await post({ action: "reject", id: offered.id, reason: "", from: "approved" })).status, 409, "a withdrawal needs its reason too");
    const withdrawn = await post({ action: "reject", id: offered.id, reason: "approved by mistake: a stand-in", from: "approved" });
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.status, "rejected");
    assert.equal(withdrawn.body.reason, "approved by mistake: a stand-in");
    assert.equal(withdrawn.body.approved.by, "Tess", "the approval it withdrew stays on record");
    assert.equal(withdrawn.body.withdrawn.reason, "approved by mistake: a stand-in");
    const { candidates } = await read();
    assert.equal((candidates as Array<{ id: string; status?: string }>).find((candidate) => candidate.id === offered.id)?.status, "rejected");
    // A second withdrawal (another tab) doesn't overwrite the first reason: the candidate is no longer approved.
    assert.deepEqual(await post({ action: "reject", id: offered.id, reason: "again", from: "approved" }), { status: 409, body: { error: "This approval was already withdrawn: the candidate is rejected now. The list is read again." } });
    assert.deepEqual(await post({ action: "reject", id: offered.id, reason: "again" }), { status: 409, body: { error: "This candidate was already rejected." } });
});

test("a misnamed or misfiled approved candidate isn't waiting, isn't promoted, and doesn't overwrite a well-formed one", async () => {
    const approvedAt = { approved: { by: "Tess", at: "2026-11-17T10:00:00.000Z" }, status: "approved" };
    file("walkthrough01.json", { ...meeting("stand-in", "walkthrough01"), ...approvedAt });
    const rejected = { ...meeting("pliers"), status: "rejected", reason: "a real rejection" };
    file(`${rejected.id}.json`, rejected);
    file("a-copy.json", { ...meeting("pliers"), ...approvedAt });

    const { candidates, problems } = await read();
    assert.deepEqual((candidates as Array<{ id: string }>).map((candidate) => candidate.id), [rejected.id], "only the well-formed file is a candidate");
    assert.deepEqual(problems.map((problem) => problem.file).sort(), ["a-copy.json", "walkthrough01.json"]);

    const library = join(process.env.MRONION_DATA_DIR!, "library");
    assert.deepEqual(await promoteApproved(library), [], "neither is promoted");
    const { candidates: after } = await read();
    assert.equal((after as Array<{ id: string; status: string; reason?: string }>)[0].status, "rejected", "the real rejection stands");
});
