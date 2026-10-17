/**
 * Credential redaction for everything that reaches a log: CLI argv, CLI output, HTTP headers and
 * URLs. Patterns err on the side of redacting too much; a log line is never worth a leaked token.
 */

const REDACTED = '[REDACTED]';

// `scheme://user:pass@host` and `scheme://token@host`; the whole userinfo is a secret.
const URL_USERINFO = /(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi;

// Secret-bearing query-string parameters, keeping the parameter name.
const QUERY_SECRET = /([?&](?:password|passwd|pwd|api[-_]?key|apikey|token|access[-_]?token|auth[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|secret|sig|signature|sas)=)([^&\s#"']+)/gi;

// `--password x`, `-p x`, `--api-key x`, `-k x` and their `=` forms, with quoted values taken
// whole. `-p:` (MSBuild property) is excluded because the colon form never matches `(\s+|=)`.
const CLI_SECRET_ARG = /(?<![\w-])(--password|--api-key|--apikey|-p|-k)(\s+|=)(?:"[^"]*"|'[^']*'|[^\s"']+)/gi;

// Header values; `[:=]` also covers `Authorization=Basic ...` style dumps, and a closing quote after the name of a
// quoted JSON key (`"Authorization":"…"`, N56).
const HEADER_SECRET = /\b(Authorization|Proxy-Authorization|X-Api-Key|X-NuGet-ApiKey|X-NuGet-Session|Cookie|Set-Cookie)['"]?\s*[:=]\s*([^\r\n]+)/gi;

// `apikey=...`, `password: ...`, `secret = ...` anywhere in free text (JSON, XML, logs), also as a quoted JSON key
// (`"Password":"…"`, N56). A value stops before `}`, so a second pass leaves the closing brace of a JSON object.
const KEY_VALUE_SECRET = /\b(api[-_]?key|apikey|access[-_]?token|auth[-_]?token|refresh[-_]?token|bearer|password|passwd|pwd|secret|credential|token)\b['"]?\s*[=:]\s*['"]?([^\s'"<>,;}]+)['"]?/gi;

// nuget.config credential elements that show up in verbose CLI output, as `key=value` text or XML.
const NUGET_CONFIG_SECRET = /\b(ClearTextPassword|Password|EncryptedPassword)\b['"]?\s*[=:]\s*['"]?([^\s'"<>}]+)['"]?/gi;
const NUGET_CONFIG_XML_SECRET = /(<add\s+key\s*=\s*"(?:ClearTextPassword|Password|EncryptedPassword|ApiKey)"\s+value\s*=\s*")([^"]*)(")/gi;

// Three base64url segments starting with `eyJ` (`{"`) — a JWT header.
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;

// Well-known token formats: GitHub PATs and nuget.org API keys (`oy2` + 43 lowercase alphanumerics).
const KNOWN_TOKENS = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|oy2[a-z0-9]{43})\b/g;

/** Redact credentials, tokens and passwords from free text before it is logged. */
export function redact(text: string): string {
    if (!text) {
        return text;
    }
    return text
        .replace(URL_USERINFO, `$1${REDACTED}@`)
        .replace(QUERY_SECRET, `$1${REDACTED}`)
        .replace(HEADER_SECRET, `$1: ${REDACTED}`)
        .replace(CLI_SECRET_ARG, `$1$2${REDACTED}`)
        .replace(NUGET_CONFIG_XML_SECRET, `$1${REDACTED}$3`)
        .replace(KEY_VALUE_SECRET, `$1=${REDACTED}`)
        .replace(NUGET_CONFIG_SECRET, `$1=${REDACTED}`)
        .replace(JWT, REDACTED)
        .replace(KNOWN_TOKENS, REDACTED);
}

const SECRET_OPTIONS = new Set(['--password', '--api-key', '--apikey', '-p', '-k']);
const SECRET_OPTION_ASSIGNMENT = /^(--password|--api-key|--apikey|-p|-k)=/i;

/**
 * Redact an argv array positionally: the value following `--password`/`-p`/`--api-key`/`-k`
 * (or embedded after `=`) is replaced whole, so secrets containing spaces cannot leak through
 * a space-joined log line. Every element is additionally run through `redact()`.
 */
export function redactArgv(argv: readonly string[]): string[] {
    const result: string[] = [];
    let valueIsSecret = false;
    for (const arg of argv) {
        if (valueIsSecret) {
            result.push(REDACTED);
            valueIsSecret = false;
            continue;
        }
        if (SECRET_OPTIONS.has(arg.toLowerCase())) {
            result.push(arg);
            valueIsSecret = true;
            continue;
        }
        const assignment = SECRET_OPTION_ASSIGNMENT.exec(arg);
        if (assignment) {
            result.push(`${assignment[1]}=${REDACTED}`);
            continue;
        }
        result.push(redact(arg));
    }
    return result;
}
