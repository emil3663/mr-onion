/**
 * TFP-096: parseNamedFlowLines - the "Named flows" input's parser.
 *
 * Run via:
 * node --import ./scripts/register-node-test-ts-resolver.mjs --experimental-strip-types --test src/app/_lib/derive.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { normalizeNamedFlows } from "../../lib/introspect/journeys.ts";
import { parseNamedFlowLines } from "./derive.ts";

test("one flow per line, label: /entry -> /exit", () => {
    assert.deepStrictEqual(parseNamedFlowLines("checkout: /cart -> /confirmation").flows, [
        { label: "checkout", entryPath: "/cart", exitPath: "/confirmation" },
    ]);
});

test("accepts => and the arrow character, tolerates spacing, and adds a missing leading slash", () => {
    const { flows, invalidLines } = parseNamedFlowLines("a:/x=>/y\nb :  z   \u2192   w  \n  c: /p ->/q");

    assert.deepStrictEqual(flows, [
        { label: "a", entryPath: "/x", exitPath: "/y" },
        { label: "b", entryPath: "/z", exitPath: "/w" },
        { label: "c", entryPath: "/p", exitPath: "/q" },
    ]);
    assert.deepStrictEqual(invalidLines, []);
});

test("a label may contain a comma (lists are split on newlines only)", () => {
    assert.deepStrictEqual(parseNamedFlowLines("sign up, then verify: /signup -> /welcome").flows[0].label, "sign up, then verify");
});

test("a line that is not understood is reported, not silently dropped; blank lines are ignored", () => {
    const { flows, invalidLines } = parseNamedFlowLines("ok: /a -> /b\n\nno arrow here\n: /a -> /b\nmissing: /a ->\n");

    assert.strictEqual(flows.length, 1);
    assert.deepStrictEqual(invalidLines, ["no arrow here", ": /a -> /b", "missing: /a ->"]);
});

test("empty input is no flows and no errors", () => {
    assert.deepStrictEqual(parseNamedFlowLines(""), { flows: [], invalidLines: [] });
});

// The UI parses first and the server re-validates: a parsed flow must survive
// the server's normalization unchanged, or the UI would show one thing and
// send another.
test("a parsed flow is unchanged by the server-side normalizeNamedFlows", () => {
    const { flows } = parseNamedFlowLines("login: /login -> /secure\ncheckout: cart -> confirmation");

    assert.deepStrictEqual(normalizeNamedFlows(flows), flows);
});

// TFP-097: the login block the "Authenticated Run" section builds.
import { buildLoginBlock, EMPTY_LOGIN_INPUTS } from "./derive.ts";
import { normalizeLoginConfig } from "../../lib/run/auth.ts";
import { LOGIN_CONFIG_FIELDS, LOGIN_FIELD_LABELS } from "../../lib/run/login-fields.ts";

const completeInputs = {
    ...EMPTY_LOGIN_INPUTS,
    loginUrl: " /login ",
    usernameSelector: "#username",
    passwordSelector: "#password",
    submitSelector: "button[type=submit]",
    usernameEnv: "MRONION_LOGIN_USER",
    passwordEnv: "MRONION_LOGIN_PASS",
    postLoginPath: "/dashboard",
};

test("nothing typed means no login, and no problem", () => {
    assert.deepStrictEqual(buildLoginBlock(EMPTY_LOGIN_INPUTS), { login: null, problem: "", field: null });
    assert.deepStrictEqual(buildLoginBlock({ ...EMPTY_LOGIN_INPUTS, loginUrl: "   " }), { login: null, problem: "", field: null });
});

test("what was typed becomes the login block, trimmed, with blank optional fields left out", () => {
    const { login, problem } = buildLoginBlock(completeInputs);

    assert.strictEqual(problem, "");
    assert.deepStrictEqual(login, {
        loginUrl: "/login",
        usernameSelector: "#username",
        passwordSelector: "#password",
        submitSelector: "button[type=submit]",
        usernameEnv: "MRONION_LOGIN_USER",
        passwordEnv: "MRONION_LOGIN_PASS",
        postLoginPath: "/dashboard",
    });
});

test("the block the UI builds is exactly what the server accepts - the same normalization the API request gets", () => {
    const { login } = buildLoginBlock(completeInputs);

    assert.ok(normalizeLoginConfig(login, "https://app.example.com"));
    assert.deepStrictEqual(Object.keys(login!).every((key) => (LOGIN_CONFIG_FIELDS as readonly string[]).includes(key)), true);
});

test("a credential pasted where a variable name belongs blocks the run and never becomes part of a request", () => {
    for (const pasted of ["hunter2", "Hunter2Hunter2", "correct-horse-battery", "p@ssw0rd"]) {
        for (const field of ["usernameEnv", "passwordEnv"] as const) {
            const { login, problem } = buildLoginBlock({ ...completeInputs, [field]: pasted });

            assert.strictEqual(login, null, `${field}=${pasted} must not produce a request`);
            assert.ok(problem.includes(LOGIN_FIELD_LABELS[field]) && problem.includes("upper case"));
            assert.ok(!problem.includes(pasted), "the problem message must not echo the pasted value");
        }
    }
});

test("an incomplete block is still sent, so the server's named error reaches the user instead of a silent signed-out run", () => {
    const { login, problem } = buildLoginBlock({ ...EMPTY_LOGIN_INPUTS, loginUrl: "/login" });

    assert.strictEqual(problem, "");
    assert.deepStrictEqual(login, { loginUrl: "/login" });
});

test("every field a login block accepts has a UI label, and the section has no field for a credential value", () => {
    assert.deepStrictEqual(Object.keys(LOGIN_FIELD_LABELS).sort(), [...LOGIN_CONFIG_FIELDS].sort());
    assert.ok(!Object.values(LOGIN_FIELD_LABELS).some((label) => /^(username|password)$/i.test(label)));
});

const ACCEPTS = "It accepts a full http or https address (https://shop.example.com/page), an address without http:// (read as http), or a local one with its port (localhost:3000); for several pages, one per line, all on one site.";

// Phase 40 Decision 8 (TFP-174): the URL field takes one URL, as before, or a list of pages on one site.
test("parseUrlField: one URL behaves as today; a list keeps each page's path and hash route on the first URL's origin; another origin is rejected, naming it", async () => {
    const { parseUrlField } = await import("./derive.ts");
    assert.deepEqual(parseUrlField("https://with-bugs.practicesoftwaretesting.com/#/"), { kind: "single", value: "https://with-bugs.practicesoftwaretesting.com/#/" });
    assert.deepEqual(parseUrlField("  localhost:3000/notes \n\n"), { kind: "single", value: "  localhost:3000/notes \n\n" }, "one line with blank lines is still one URL");
    assert.deepEqual(parseUrlField("https://site.example/#/contact\r\nhttps://site.example/product/1?x=2\n\nhttps://site.example/#/contact\nsite.example/a"), {
        kind: "invalid",
        message: `Base URL, line 5: http://site.example/a is on another site than line 1 (https://site.example). ${ACCEPTS}`,
    }, "a line without a protocol reads as http, so it is another origin than https");
    assert.deepEqual(parseUrlField("https://site.example/#/contact\r\nhttps://site.example/product/1?x=2\n\nhttps://site.example/#/contact\nhttps://site.example/"), {
        kind: "list",
        site: "https://site.example",
        pages: ["/#/contact", "/product/1?x=2", "/"],
        urls: ["https://site.example/#/contact", "https://site.example/product/1?x=2", "https://site.example/"],
    });
    assert.deepEqual(parseUrlField("https://site.example/a\nhttps://other.example/b"), { kind: "invalid", message: `Base URL, line 2: https://other.example/b is on another site than line 1 (https://site.example). ${ACCEPTS}` });
    assert.deepEqual(parseUrlField("https://site.example/a\njavascript:alert(1)"), { kind: "invalid", message: `Base URL, line 2: "javascript:alert(1)" isn't an http or https address. ${ACCEPTS}` });
    assert.deepEqual(parseUrlField("https://site.example/a\nhttp://[bad"), { kind: "invalid", message: `Base URL, line 2: "http://[bad" isn't a URL. ${ACCEPTS}` });
});

// Phase 46 Gate B, R11 (the owner, 2026-11-19): the Base URL's refusal names the field "Base URL", says which line is
// wrong when there are several, and says what's accepted. One line is checked too, by the rule the server reads it by
// (no scheme is http). Partitions: one line / several; not a URL / not http(s) / another site; accepted forms.
test("R11: a Base URL refusal names the field, the line when there are several, and what is accepted", async () => {
    const { parseUrlField } = await import("./derive.ts");
    assert.deepEqual(parseUrlField("http://[bad"), { kind: "invalid", message: `Base URL: "http://[bad" isn't a URL. ${ACCEPTS}` }, "one line, no line number");
    assert.deepEqual(parseUrlField("ftp://files.example.com"), { kind: "invalid", message: `Base URL: "ftp://files.example.com" isn't an http or https address. ${ACCEPTS}` });
    assert.deepEqual(parseUrlField("localhost:3000/notes"), { kind: "single", value: "localhost:3000/notes" }, "a local address with its port is accepted");
    assert.deepEqual(parseUrlField("shop.example.com"), { kind: "single", value: "shop.example.com" }, "no scheme reads as http, as the server reads it");
    assert.deepEqual(parseUrlField(""), { kind: "single", value: "" }, "empty is the form's own case, not a refusal");
    // The line as the tester sees it, blank lines counted.
    assert.equal((parseUrlField("https://a.example/x\n\n\nhttps://a.example/y\nnot a url at all") as { message: string }).message, `Base URL, line 5: "not a url at all" isn't a URL. ${ACCEPTS}`);
    assert.ok(!/baseUrl/.test(JSON.stringify(parseUrlField("http://[bad"))), "the field is named as the form names it");
});

// R11 (the fresh-context review): one line is read exactly as the server reads it (normalizeBaseUrl: a scheme only
// with "://", anything else is http), so the check and the request can't disagree; and an address that starts "http:"
// or "https:" without "//" is refused, as the server would read "https" as its host.
test("R11: one line is read as the server reads it, and a scheme without // is refused", async () => {
    const { parseUrlField, normalizeBaseUrl } = await import("./derive.ts");
    const wrongStart = (line: string) => `Base URL: "${line}" isn't a URL: an address starts with http:// or https://. ${ACCEPTS}`;
    assert.deepEqual(parseUrlField("https:shop.example.com"), { kind: "invalid", message: wrongStart("https:shop.example.com") });
    assert.deepEqual(parseUrlField("https:/shop.example.com"), { kind: "invalid", message: wrongStart("https:/shop.example.com") });
    assert.deepEqual(parseUrlField("admin:secret@staging.example.com"), { kind: "single", value: "admin:secret@staging.example.com" }, "the server reads it as http, with a login");
    // Whatever one line the check accepts, the server's reading of it is a URL, and an http or https one.
    for (const line of ["localhost:3000", "192.168.1.10:8080", "[::1]:3000", "http://localhost:3000/#/x", "bücher.example:8080", "shop.example.com", "admin:secret@staging.example.com"]) {
        assert.equal(parseUrlField(line).kind, "single", line);
        const read = normalizeBaseUrl(line);
        assert.ok(read.ok && /^https?:\/\//.test(read.value), `${line} -> ${JSON.stringify(read)}`);
    }
    // The client's own refusal, where it is still reached, says the same.
    const refused = normalizeBaseUrl("http://[bad");
    assert.equal(refused.ok ? "" : refused.message, `Base URL: "http://[bad" isn't a URL. ${ACCEPTS}`);
});
