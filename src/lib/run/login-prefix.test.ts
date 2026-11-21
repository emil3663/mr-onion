/**
 * TFP-293: a login reads only environment variables named for logins. Both names (`usernameEnv`, `passwordEnv`) must
 * start with MRONION_LOGIN_, in the app, the CLI and the Action alike, with no fallback for an unprefixed name. A name
 * without it is refused before anything runs, naming the field, the prefix and an example.
 *
 * ISTQB technique: equivalence partitioning of a variable name (prefixed; unprefixed; the prefix alone; the prefix in
 * another case or in the middle of the name), for each of the two fields, through each way a login arrives: the
 * server's check (normalizeLoginConfig), the app's run request (POST /api/run), the CLI's config file (buildConfig) and
 * the app's own form check (buildLoginBlock), which names the field the problem is under.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/lib/run/login-prefix.test.ts
 */
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const scratch = mkdtempSync(join(tmpdir(), "mr-onion-login-prefix-"));
process.env.MRONION_RUNS_ROOT = join(scratch, "runs");
process.env.MRONION_DATA_DIR = join(scratch, "data");
after(() => rmSync(scratch, { recursive: true, force: true }));

const { normalizeLoginConfig, RunLoginError } = await import("./auth.ts");
const { buildConfig, ConfigError } = await import("../../cli/config.ts");
const { buildLoginBlock, EMPTY_LOGIN_INPUTS } = await import("../../app/_lib/derive.ts");
const runRoute = await import("../../app/api/run/route.ts");
const { NextRequest } = await import("next/server");

const BASE = "http://localhost:3000";
const login = {
    loginUrl: "/login",
    usernameSelector: "#email",
    passwordSelector: "#password",
    submitSelector: "button[type=submit]",
    usernameEnv: "MRONION_LOGIN_USER",
    passwordEnv: "MRONION_LOGIN_PASS",
    postLoginPath: "/account",
};
const EXAMPLE = { usernameEnv: "MRONION_LOGIN_USER", passwordEnv: "MRONION_LOGIN_PASS" } as const;
const FIELDS = ["usernameEnv", "passwordEnv"] as const;
/** Names a login may not read: no prefix, the prefix alone, another case, the prefix not at the start. */
const UNPREFIXED = ["SITE_LOGIN_USER", "MRONION_LOGIN_", "MRONION_Login_USER", "APP_MRONION_LOGIN_USER"];

/** The server's refusal, as the API sends it. */
const refusal = (field: (typeof FIELDS)[number]) => `Login config: "${field}" must start with MRONION_LOGIN_ (for example ${EXAMPLE[field]}): a login reads only variables named for logins.`;

test("TFP-293: the server reads a prefixed name, and refuses any other, for both fields", () => {
    assert.ok(normalizeLoginConfig(login, BASE), "MRONION_LOGIN_USER and MRONION_LOGIN_PASS are read as before");
    for (const field of FIELDS) {
        for (const name of UNPREFIXED) {
            assert.throws(
                () => normalizeLoginConfig({ ...login, [field]: name }, BASE),
                // A name that looks like one gets the prefix's refusal (which never repeats the name); one that doesn't,
                // the name rule's, as before (a pasted credential is never echoed).
                (error: unknown) => error instanceof RunLoginError && error.kind === "config-invalid" && (/^[A-Z_][A-Z0-9_]*$/.test(name) ? error.message === refusal(field) : /NAME of an environment variable/.test(error.message)),
                `${field}: ${name}`
            );
        }
    }
});

test("TFP-293: the app's run request refuses an unprefixed name before anything runs", async () => {
    for (const field of FIELDS) {
        const response = await runRoute.POST(new NextRequest(new URL("http://localhost/api/run"), {
            method: "POST",
            body: JSON.stringify({ code: "test('fixture one', async () => {});", baseUrl: BASE, login: { ...login, [field]: "SITE_LOGIN_USER" } }),
            headers: { "content-type": "application/json" },
        }));
        assert.equal(response.status, 400, field);
        assert.deepEqual(await response.json(), { error: refusal(field), errorKind: "config-invalid" }, field);
    }
});

test("TFP-293: the CLI's config file refuses an unprefixed name, naming the login", () => {
    assert.ok(buildConfig({}, { url: BASE, login }, process.cwd()).login, "a prefixed login is read as before");
    for (const field of FIELDS) {
        assert.throws(
            () => buildConfig({}, { url: BASE, login: { ...login, [field]: "SITE_LOGIN_USER" } }, process.cwd()),
            (error: unknown) => error instanceof ConfigError && error.field === "login" && error.message === `login: ${refusal(field)}`,
            field
        );
    }
});

test("TFP-293: the app's form names the field the problem is under, with the prefix and an example", () => {
    const inputs = { ...EMPTY_LOGIN_INPUTS, ...login };
    assert.deepEqual(buildLoginBlock(inputs), { login, problem: "", field: null });
    assert.deepEqual(buildLoginBlock({ ...inputs, usernameEnv: "SITE_LOGIN_USER" }), {
        login: null,
        problem: `"Username environment variable name" must start with MRONION_LOGIN_ (for example MRONION_LOGIN_USER): a login reads only variables named for logins.`,
        field: "usernameEnv",
    });
    assert.deepEqual(buildLoginBlock({ ...inputs, passwordEnv: "SITE_LOGIN_PASS" }), {
        login: null,
        problem: `"Password environment variable name" must start with MRONION_LOGIN_ (for example MRONION_LOGIN_PASS): a login reads only variables named for logins.`,
        field: "passwordEnv",
    });
});
