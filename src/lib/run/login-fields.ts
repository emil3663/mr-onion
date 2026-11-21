// The shape of a run's login block, kept free of any server-only import so the
// browser UI (TFP-097) and the server (auth.ts) validate against one
// definition. docs/AUTOMATED_ACCOUNT_SETUP.md documents exactly these, and
// setup-doc.test.ts fails if the two drift.

// The only fields a login block may carry.
export const LOGIN_CONFIG_FIELDS = [
    "loginUrl",
    "usernameSelector",
    "passwordSelector",
    "submitSelector",
    "usernameEnv",
    "passwordEnv",
    "postLoginPath",
    "postLoginSelector",
] as const;

export type LoginConfigField = (typeof LOGIN_CONFIG_FIELDS)[number];

// What the UI calls each field. The setup doc's field table lists these
// beside the real field names, so a user can find the field they are looking
// at; setup-doc.test.ts checks every label appears there.
export const LOGIN_FIELD_LABELS: Record<LoginConfigField, string> = {
    loginUrl: "Login URL",
    usernameSelector: "Username field selector",
    passwordSelector: "Password field selector",
    submitSelector: "Submit button selector",
    usernameEnv: "Username environment variable name",
    passwordEnv: "Password environment variable name",
    postLoginPath: "Signed-in page path",
    postLoginSelector: "Signed-in element selector",
};

// Upper-case letters, digits and underscores: the convention every variable in
// this repo's .env files already follows. Stricter than the OS allows on
// purpose (TFP-093): a credential pasted where a NAME belongs - the exact
// mistake this field invites - is usually mixed-case or has punctuation, so
// it is refused before it is ever looked up, and never echoed back in a
// "variable X is not set" message. The UI applies the same rule so a pasted
// password never even leaves the browser.
export const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export const ENV_NAME_RULE_MESSAGE =
    "must be the NAME of an environment variable in upper case (letters, digits, underscore - e.g. MRONION_LOGIN_PASS), not a credential value.";

// TFP-293: a login reads only variables named for logins, so a login setting can't point at any other variable the
// server or the job has. Both names start with this, in the app, the CLI and the Action alike; there is no fallback
// for a name without it. Checked after ENV_NAME_PATTERN, so a pasted credential still gets that message.
export const LOGIN_ENV_PREFIX = "MRONION_LOGIN_";

/** The example each field's refusal gives. */
export const LOGIN_ENV_EXAMPLES = { usernameEnv: "MRONION_LOGIN_USER", passwordEnv: "MRONION_LOGIN_PASS" } as const;

export function hasLoginEnvPrefix(name: string): boolean {
    return name.startsWith(LOGIN_ENV_PREFIX) && name.length > LOGIN_ENV_PREFIX.length;
}

export function loginEnvPrefixMessage(field: keyof typeof LOGIN_ENV_EXAMPLES): string {
    return `must start with ${LOGIN_ENV_PREFIX} (for example ${LOGIN_ENV_EXAMPLES[field]}): a login reads only variables named for logins.`;
}
