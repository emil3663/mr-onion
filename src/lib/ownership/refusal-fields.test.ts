/**
 * Phase 46 Gate B, R2 (the owner's re-walk, 2026-11-18): each of the API's confirmation refusals is matched to the form
 * field it is about, so the form shows it beside that field.
 *
 * ISTQB techniques: equivalence partitioning (a refusal for each request field; a host's, quoted or "each host"; one
 * about no field) and a completeness check on the source: every refusal `validateConfirmation` can give maps to a
 * field, so a reworded refusal can't drop out of its field unnoticed.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/ownership/refusal-fields.test.ts
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hostNotUsedReason } from "./messages.ts";
import { refusalField } from "./refusal-fields.ts";

test("R2: each refusal the API gives is matched to its field", () => {
    const cases: Array<[string, string | null]> = [
        ["hosts is missing: type each host the confirmation covers", "hosts"],
        ["each host must be typed: an empty one was given", "hosts"],
        ["\"*.shop.example.com\" is a wildcard: type each host in full (Decision 2)", "hosts"],
        [hostNotUsedReason("cdn.example.net"), "hosts"],
        ["basis is missing or unknown: it must be one of owner, written-permission", "basis"],
        ["wording isn't the confirmation text for this basis: show the current text and send it back unchanged", "wording"],
        ["name is missing: the name of the person who confirms", "name"],
        ["contactEmail \"tess at example\" isn't a valid email address", "contactEmail"],
        ["expiresAt is beyond 1 year from the date confirmed (at most 2027-11-18T00:00:00.000Z)", "expiresAt"],
        ["scopes must be { active: true|false, load: true|false }", "scopes"],
        ["the server answered 500, with no reason given", null],
        ["Mr Onion didn't answer, so nothing was saved. Try again.", null],
        // A word that isn't a field, though it begins like one.
        ["names are kept", null],
    ];
    for (const [reason, field] of cases) assert.strictEqual(refusalField(reason), field, reason);
});

test("R2: every refusal validateConfirmation can give maps to a field", () => {
    const source = readFileSync(join(import.meta.dirname, "confirmation.ts"), "utf8");
    // The refusals as written: refused.push("...") and hostRefusal's returned strings, template literals included.
    const hostRefusal = /function hostRefusal\([\s\S]*?\n\}/.exec(source)?.[0] ?? "";
    assert.ok(hostRefusal, "found hostRefusal in the source");
    const refusals = [
        ...source.matchAll(/refused\.push\(\s*(["`])((?:\\.|(?!\1).)*)\1/g),
        ...hostRefusal.matchAll(/return\s+(["`])((?:\\.|(?!\1).)*)\1;/g),
    ].map((match) => match[2].replace(/\$\{[^}]*\}/g, "x").replace(/\\"/g, "\""));
    assert.ok(refusals.length >= 10, `found the refusals in the source (${refusals.length})`);
    for (const text of refusals) assert.notStrictEqual(refusalField(text), null, `"${text}" maps to no field`);
});
