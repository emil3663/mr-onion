/**
 * Phase 46 Gate B, R3 (the owner's re-walk, 2026-11-18): the API's field names, shown as the screen's labels.
 *
 * ISTQB techniques: equivalence partitioning (a leading field name; one that only begins like a field name; a field
 * name later in the message; a message with none) and a completeness check: every field a confirmation refusal can be
 * about has a label, so no refusal reaches the form with an API name in front.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/app/_lib/field-labels.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { CONFIRMATION_FIELDS } from "../../lib/ownership/refusal-fields.ts";
import { LOGIN_CONFIG_FIELDS } from "../../lib/run/login-fields.ts";
import { CONFIRMATION_LABELS, LOOKUP_LABELS, RUN_FORM_LABELS, withLabels } from "./field-labels.ts";

test("R3: a leading API field name is shown as its label, and only that", () => {
    assert.strictEqual(withLabels("contactEmail \"tess at example\" isn't a valid email address", CONFIRMATION_LABELS), "Contact email \"tess at example\" isn't a valid email address");
    assert.strictEqual(withLabels("expiresAt is beyond 1 year from the date confirmed", CONFIRMATION_LABELS), "Expires on is beyond 1 year from the date confirmed");
    assert.strictEqual(withLabels("hosts is missing: type each host the confirmation covers", CONFIRMATION_LABELS), "Hosts is missing: type each host the confirmation covers");
    // A hyphenated start isn't the field (the fresh-context review).
    assert.strictEqual(withLabels("name-checked hosts", CONFIRMATION_LABELS), "name-checked hosts");
    assert.strictEqual(withLabels("baseUrl must be a valid http(s) URL", LOOKUP_LABELS), "Site URL must be a valid http(s) URL");
    assert.strictEqual(withLabels("gapWriter must be one of off, claude-code, local-model", LOOKUP_LABELS), "Who writes gap tests must be one of off, claude-code, local-model");
    // Only a whole leading name: "names" isn't "name", a name later on stays, and a message with none is unchanged.
    assert.strictEqual(withLabels("names are kept", CONFIRMATION_LABELS), "names are kept");
    assert.strictEqual(withLabels("the host is name-checked", CONFIRMATION_LABELS), "the host is name-checked");
    assert.strictEqual(withLabels("\"*.shop.example.com\" is a wildcard", CONFIRMATION_LABELS), "\"*.shop.example.com\" is a wildcard");
    // An inherited property isn't a label.
    assert.strictEqual(withLabels("constructor is odd", CONFIRMATION_LABELS), "constructor is odd");
});

test("R3: with quoted, a quoted field name anywhere is shown as its label: the run's login refusals", () => {
    assert.strictEqual(withLabels("Login config: \"usernameEnv\" is required.", RUN_FORM_LABELS, { quoted: true }), "Login config: \"Username environment variable name\" is required.");
    assert.strictEqual(withLabels("Login config needs \"postLoginPath\" or \"postLoginSelector\" - something only true once signed in", RUN_FORM_LABELS, { quoted: true }), "Login config needs \"Signed-in page path\" or \"Signed-in element selector\" - something only true once signed in");
    assert.strictEqual(withLabels("baseUrl must be a valid http(s) URL", RUN_FORM_LABELS), "Base URL must be a valid http(s) URL");
    // Not without quoted, and a quoted word that isn't a field stays.
    assert.strictEqual(withLabels("Login config: \"usernameEnv\" is required.", RUN_FORM_LABELS), "Login config: \"usernameEnv\" is required.");
    assert.strictEqual(withLabels("variable \"MYAPP_TEST_PASS\" isn't set", RUN_FORM_LABELS, { quoted: true }), "variable \"MYAPP_TEST_PASS\" isn't set");
});

test("R3: every login field has its label on the run form", () => {
    for (const field of LOGIN_CONFIG_FIELDS) assert.ok(Object.hasOwn(RUN_FORM_LABELS, field), `${field} has a label`);
});

test("R3: every field a confirmation refusal can be about has a label", () => {
    for (const field of CONFIRMATION_FIELDS) assert.ok(Object.hasOwn(CONFIRMATION_LABELS, field), `${field} has a label`);
});
