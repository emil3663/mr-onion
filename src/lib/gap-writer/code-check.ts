import ts from "typescript";

/**
 * Phase 42 (TFP-202, batch 2 ruling 5): what model-written test code may use. A gap test, a pool candidate or a
 * promoted library entry is a test body a writer produced from text read from a site, and it runs in Node on the
 * local dev machine. The body is parsed (TypeScript's parser, as a function body) and its syntax tree walked, so a
 * comment doesn't count and spacing doesn't hide anything.
 *
 * TFP-292 (hardening of the model-written test check): an allowlist, in place of the list of names it refused.
 * Outside a page function, the body may name only:
 * - `page`, `expect`, the binding's placeholders (`__PAGE__`, `__LOCATOR__`), plain JavaScript values and helpers
 *   (`ALLOWED_GLOBALS`), and what it declares itself;
 * - and call only what the lists name: Playwright's page, locator, keyboard, mouse, request and response methods,
 *   `expect` and its matchers (`ALLOWED_METHODS`), and JavaScript's own (`JS_METHODS`, `ALLOWED_CALLS`, `ALLOWED_NEW`);
 *   any other call is refused, naming it.
 * Two calls are held to their arguments: `goto` only to a quoted http(s) or relative address (or `__PAGE__`), and
 * `evaluate`/`evaluateAll` only with a function written in place.
 * Inside that function the code runs in the browser, under the guard: it may use the page's own globals
 * (`BROWSER_GLOBALS`) but not the network or code built at run time (`BROWSER_FORBIDDEN`).
 * Everywhere: no import, `this`, `arguments`, computed property name (only a number may go in brackets), or a
 * prototype's or descriptor's name (`FORBIDDEN_MEMBERS`), spelled or quoted.
 * This narrows what a test can do; it is not a sandbox.
 */

const ALLOWED_GLOBALS = new Set([
    "page", "expect", "__PAGE__", "__LOCATOR__",
    "undefined", "NaN", "Infinity",
    "Math", "JSON", "Number", "String", "Boolean", "Array", "Object", "Promise", "Date", "RegExp", "Set", "Map", "URL", "Error",
    "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
]);

/** Plain calls a body may make by name, besides its own functions. */
const ALLOWED_CALLS = new Set(["expect", "Number", "String", "Boolean", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI"]);

/** Constructors a body may call with `new`. */
const ALLOWED_NEW = new Set(["RegExp", "Set", "Map", "Date", "URL", "Error", "Array"]);

/** Playwright's methods a test body may call: reading and using the page, never files, downloads or other pages. */
const PLAYWRIGHT_METHODS = [
    // Getting around the page under test.
    "goto", "reload", "goBack", "goForward", "waitForLoadState", "waitForURL", "waitForTimeout", "url", "title",
    // Finding elements.
    "locator", "getByRole", "getByText", "getByLabel", "getByPlaceholder", "getByAltText", "getByTitle", "getByTestId",
    "first", "last", "nth", "filter", "and", "or", "all", "count",
    // Using them.
    "click", "dblclick", "hover", "focus", "blur", "fill", "clear", "press", "pressSequentially", "type", "check", "uncheck",
    "setChecked", "selectOption", "selectText", "tap", "dragTo", "scrollIntoViewIfNeeded", "waitFor", "dispatchEvent",
    // Reading them.
    "isVisible", "isHidden", "isEnabled", "isDisabled", "isChecked", "isEditable", "textContent", "innerText", "innerHTML",
    "inputValue", "getAttribute", "boundingBox", "allTextContents", "allInnerTexts", "ariaSnapshot",
    // Running a function in the page (its argument checked below).
    "evaluate", "evaluateAll",
    // Events, the keyboard and the mouse.
    "on", "once", "off", "down", "up", "insertText", "move", "wheel",
    // Responses and requests (page.request.get, a response, a request the page sent).
    "get", "ok", "status", "statusText", "headers", "headerValue", "text", "json", "method", "resourceType", "postData", "isNavigationRequest",
    // expect: expect.soft, expect.poll, and its matchers (any name to..., below).
    "soft", "poll",
];

/** JavaScript's own methods on strings, arrays, numbers, promises, sets, maps, dates, Math, JSON and Object. */
const JS_METHODS = [
    "map", "some", "every", "find", "findIndex", "findLast", "findLastIndex", "includes", "indexOf", "lastIndexOf", "slice",
    "splice", "join", "split", "trim", "trimStart", "trimEnd", "toLowerCase", "toUpperCase", "replace", "replaceAll",
    "startsWith", "endsWith", "match", "matchAll", "test", "exec", "search", "push", "pop", "shift", "unshift", "forEach",
    "reduce", "reduceRight", "sort", "reverse", "concat", "flat", "flatMap", "at", "fill", "keys", "values", "entries",
    "fromEntries", "from", "isArray", "of", "localeCompare", "padStart", "padEnd", "repeat", "charAt", "charCodeAt",
    "codePointAt", "normalize", "substring", "toFixed", "toPrecision", "toString", "valueOf", "toISOString", "getTime",
    "now", "parse", "stringify", "abs", "min", "max", "round", "floor", "ceil", "trunc", "sign", "sqrt", "pow", "random",
    "then", "catch", "finally", "resolve", "allSettled", "race", "any", "has", "add", "delete", "size", "set", "isInteger",
    "isFinite", "isNaN",
];

const ALLOWED_METHODS = new Set([...PLAYWRIGHT_METHODS, ...JS_METHODS]);

/** Names a test body never uses as a member or a key, spelled or quoted. */
const FORBIDDEN_MEMBERS = new Set([
    "constructor", "__proto__", "prototype", "getPrototypeOf", "setPrototypeOf", "getOwnPropertyDescriptor",
    "getOwnPropertyDescriptors", "getOwnPropertyNames", "defineProperty", "defineProperties", "__defineGetter__",
    "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "call", "apply", "bind",
]);

/** The page's own globals a page function may use. */
const BROWSER_GLOBALS = new Set([
    ...ALLOWED_GLOBALS, "document", "window", "location", "navigator", "getComputedStyle", "Node", "Element", "HTMLElement",
    "HTMLInputElement", "HTMLAnchorElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLFormElement", "NodeFilter",
    "CSS", "innerWidth", "innerHeight", "scrollX", "scrollY", "devicePixelRatio", "matchMedia", "performance",
]);

/** In a page function, as a name or a member: no network of its own and no code built at run time. */
const BROWSER_FORBIDDEN = new Set([
    "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "fetchLater", "eval", "Function", "Worker",
    "SharedWorker", "WebAssembly", "importScripts", "open", "postMessage", "serviceWorker", "setTimeout", "setInterval",
]);

/** A string standing for a property's name: `{ 'a': x }`, or `const { 'a': x } = y`. */
function namesProperty(node: ts.Node): boolean {
    const parent = node.parent;
    return (ts.isPropertyAssignment(parent) && parent.name === node) || (ts.isBindingElement(parent) && parent.propertyName === node);
}

/** An identifier that is a name being referred to, not a property's name, a declaration's name or a label. */
function isReference(node: ts.Identifier): boolean {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
    if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isBindingElement(parent)) && parent.name === node) return false;
    if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) return false;
    if (ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent) || ts.isTypeQueryNode(parent)) return false;
    return true;
}

/** Every name the body declares: variables (destructured too), functions, parameters and catch clauses. */
function declaredNames(root: ts.Node): Set<string> {
    const names = new Set<string>();
    const addBinding = (name: ts.BindingName) => {
        if (ts.isIdentifier(name)) names.add(name.text);
        else for (const element of name.elements) if (!ts.isOmittedExpression(element)) addBinding(element.name);
    };
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) || ts.isParameter(node)) addBinding(node.name);
        else if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) names.add(node.name.text);
        ts.forEachChild(node, visit);
    };
    visit(root);
    return names;
}

const isPageFunction = (node: ts.Node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** An address `goto` may take: relative, or http(s). */
const navigable = (address: string) => !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(address.trim()) || /^https?:\/\//i.test(address.trim());

/** Why the body is refused, naming the construct, or null when it keeps to the allowlist. */
export function forbiddenConstruct(body: string): string | null {
    const source = ts.createSourceFile("__mrOnion_body__.ts", `async function __body__() {\n${body}\n}`, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const declared = declaredNames(source);
    declared.delete("__body__");
    let found: string | null = null;

    const visit = (node: ts.Node, inPage: boolean): void => {
        if (found) return;
        if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node)) found = "an import";
        else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found = "import(...)";
        else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) found = "import.meta";
        else if (node.kind === ts.SyntaxKind.ThisKeyword) found = "this";
        else if (ts.isElementAccessExpression(node) && !ts.isNumericLiteral(node.argumentExpression)) found = "a computed property name (only a number may go in brackets)";
        else if (ts.isComputedPropertyName(node) && !ts.isNumericLiteral(node.expression)) found = "a computed property name (only a number may go in brackets)";
        else if (ts.isStringLiteralLike(node) && namesProperty(node) && (FORBIDDEN_MEMBERS.has(node.text) || (inPage && BROWSER_FORBIDDEN.has(node.text)))) found = `'${node.text}'`;
        else if (ts.isIdentifier(node)) {
            const parent = node.parent;
            const asMember = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isBindingElement(parent) && parent.propertyName === node)
                || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) || ts.isShorthandPropertyAssignment(parent);
            if (asMember && FORBIDDEN_MEMBERS.has(node.text)) found = node.text;
            else if (inPage && BROWSER_FORBIDDEN.has(node.text)) found = node.text;
            else if (node.text === "arguments") found = "arguments";
            else if (isReference(node) && !declared.has(node.text) && !(inPage ? BROWSER_GLOBALS : ALLOWED_GLOBALS).has(node.text)) found = node.text;
        } else if (!inPage && ts.isPropertyAccessExpression(node) && node.name.text === "request") {
            // `x.request.get(...)` is a GET through Playwright's API client; any other use of it is not.
            const parent = node.parent;
            const isGet = ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "get" && ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
            if (!isGet) found = "a request other than GET (request.get only)";
        } else if (!inPage && ts.isNewExpression(node)) {
            const name = ts.isIdentifier(node.expression) ? node.expression.text : null;
            if (!name || !ALLOWED_NEW.has(name)) found = `new ${name ?? "(an expression)"}, not on the list a test body may use`;
        } else if (!inPage && ts.isCallExpression(node)) {
            found = refusedCall(node, declared);
            if (!found && isEvaluateCall(node)) {
                // The page function runs in the browser: its own rules.
                ts.forEachChild(node.expression, (child) => visit(child, false));
                for (const argument of node.arguments) visit(argument, isPageFunction(argument));
                return;
            }
        }
        if (!found) ts.forEachChild(node, (child) => visit(child, inPage));
    };
    visit(source, false);
    return found;
}

const isEvaluateCall = (node: ts.CallExpression) => ts.isPropertyAccessExpression(node.expression) && ["evaluate", "evaluateAll"].includes(node.expression.name.text);

/** A call outside a page function: why it is refused, or null. */
function refusedCall(node: ts.CallExpression, declared: Set<string>): string | null {
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
        return declared.has(callee.text) || ALLOWED_CALLS.has(callee.text) ? null : `${callee.text}(), not on the list a test body may call`;
    }
    if (!ts.isPropertyAccessExpression(callee)) return "a call to something the check can't name";
    const method = callee.name.text;
    // expect's matchers: toBeVisible, toHaveText, not.toBe ...
    if (!ALLOWED_METHODS.has(method) && !/^to[A-Z]\w*$/.test(method)) return `${method}(), not on the list a test body may call`;
    if (method === "goto") {
        const [address] = node.arguments;
        const literal = address && (ts.isStringLiteral(address) || ts.isNoSubstitutionTemplateLiteral(address)) ? address.text : null;
        const placeholder = address && ts.isIdentifier(address) && address.text === "__PAGE__";
        if (!placeholder && (literal === null || !navigable(literal))) return "goto to an address that isn't a quoted http(s) or relative one";
    }
    if (method === "evaluate" || method === "evaluateAll") {
        const [fn] = node.arguments;
        if (!fn || !isPageFunction(fn)) return `${method} given something other than a function`;
    }
    return null;
}
