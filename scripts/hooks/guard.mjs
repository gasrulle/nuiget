// PreToolUse guard for Claude Code sessions working on the nUIget 2.0 plan (plan §2.3, layer L2).
// Reads the hook payload on stdin. Prints a deny decision to block the tool call; prints nothing to
// leave the decision to the normal permission flow. It never prints an allow decision: that would
// skip the permission prompt and turn the guard into a way around it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SENTINEL = '.claude/.contract-change';

const CONSULT =
    'Launch the `architecture-advisor` subagent with the brief from plan §2.4 and record its answer in the ' +
    "directory's STATUS.md before going on.";

// Matches a focused or skipped test call. `.skipIf(` does not match: the paren must follow directly.
const FOCUS_OR_SKIP = /\.(only|skip)\(/g;
const TEST_SOURCE = /\.(test|spec|bench)\.[cm]?[jt]sx?$/;
const TEST_FILE_ARGUMENT = /\.test\.tsx?(?![\w.])/;

function toPosix(value) {
    return value.split(path.sep).join('/').replace(/\\/g, '/');
}

/** Project-relative POSIX path, or undefined when the file is outside the project. */
function relativeToProject(projectDir, filePath) {
    const relative = toPosix(path.relative(projectDir, path.resolve(projectDir, filePath)));
    if (relative === '' || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
        return undefined;
    }
    return relative;
}

function isFrozen(relativePath) {
    // Compared case-insensitively: macOS and Windows file systems would open the same file either way.
    const lower = relativePath.toLowerCase();
    return lower === 'src/core/contracts.ts' || lower.startsWith('src/protocol/') || lower.startsWith('docs/adr/');
}

function isTestSource(relativePath) {
    return TEST_SOURCE.test(relativePath) || relativePath.startsWith('src/test/');
}

function countFocusOrSkip(text) {
    return (text.match(FOCUS_OR_SKIP) ?? []).length;
}

function readIfPresent(file) {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        return '';
    }
}

function checkFileEdit(toolName, toolInput, projectDir, sentinelPresent) {
    const filePath = toolInput.file_path;
    if (typeof filePath !== 'string' || filePath === '') {
        return undefined;
    }
    const relativePath = relativeToProject(projectDir, filePath);
    if (relativePath === undefined) {
        return undefined;
    }

    if (isFrozen(relativePath) && !sentinelPresent) {
        return (
            `${relativePath} is a frozen contract path (plan D6). It changes only in a plan item that names it, ` +
            `while the sentinel ${SENTINEL} exists. ${CONSULT}`
        );
    }

    if (isTestSource(relativePath)) {
        const before =
            toolName === 'Write'
                ? countFocusOrSkip(readIfPresent(path.resolve(projectDir, filePath)))
                : countFocusOrSkip(String(toolInput.old_string ?? ''));
        const after = countFocusOrSkip(String((toolName === 'Write' ? toolInput.content : toolInput.new_string) ?? ''));
        if (after > before) {
            return (
                `This change adds a focused or skipped test to ${relativePath}. Tests are never skipped or ` +
                `narrowed as a workaround; a platform or environment predicate with skipIf is allowed. ${CONSULT}`
            );
        }
    }
    return undefined;
}

/** Drops here-document bodies, so text such as a commit message is not read as commands. */
function stripHereDocuments(command) {
    const lines = command.split('\n');
    const kept = [];
    let terminator;
    for (const line of lines) {
        if (terminator !== undefined) {
            if (line.trim() === terminator) {
                terminator = undefined;
            }
            continue;
        }
        kept.push(line);
        const start = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
        if (start) {
            terminator = start[2];
        }
    }
    return kept.join('\n');
}

function stripQuoted(text) {
    return text.replace(/'[^']*'/g, ' ').replace(/"(?:[^"\\]|\\.)*"/g, ' ');
}

function splitSegments(command) {
    return command
        .split(/&&|\|\||[;|\n]/)
        .map(segment => segment.trim())
        .filter(segment => segment !== '');
}

function words(segment) {
    return segment
        .split(/\s+/)
        .map(word => word.replace(/^[({]+/, '').replace(/[)}]+$/, ''))
        .filter(word => word !== '');
}

/** The git subcommand of a segment such as `git -C dir commit -m x`, or undefined. */
function gitSubcommand(segmentWords) {
    const start = segmentWords.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
    if (start === -1 || segmentWords[start] !== 'git') {
        return undefined;
    }
    for (let index = start + 1; index < segmentWords.length; index++) {
        const word = segmentWords[index];
        if (word === '-C' || word === '-c') {
            index++;
            continue;
        }
        if (!word.startsWith('-')) {
            return { name: word, rest: segmentWords.slice(index + 1) };
        }
    }
    return undefined;
}

function hasShortFlag(rest, letter) {
    return rest.some(word => /^-[A-Za-z]+$/.test(word) && word.includes(letter));
}

function checkBash(toolInput, sentinelPresent) {
    if (typeof toolInput.command !== 'string') {
        return undefined;
    }
    const command = stripHereDocuments(toolInput.command);

    // Flags are read with quoted text removed, so a commit message that mentions a flag is not a flag.
    for (const segment of splitSegments(stripQuoted(command))) {
        const git = gitSubcommand(words(segment));
        if (git?.name === 'commit') {
            if (sentinelPresent) {
                return (
                    `The sentinel ${SENTINEL} exists. Finish the contract change, delete the sentinel, then commit ` +
                    '(plan D6).'
                );
            }
            if (git.rest.includes('--no-verify') || hasShortFlag(git.rest, 'n')) {
                return `Commits must run their hooks; do not skip verification. ${CONSULT}`;
            }
        }
        if (git?.name === 'push') {
            const forced =
                git.rest.some(word => word.startsWith('--force')) ||
                hasShortFlag(git.rest, 'f') ||
                git.rest.some(word => word.startsWith('+'));
            if (forced) {
                return `Force-pushing is not allowed on this repository. Fix forward in a new commit. ${CONSULT}`;
            }
        }
    }

    // File arguments are read with quotes kept: a quoted test path is still a test path.
    for (const segment of splitSegments(command)) {
        const segmentWords = words(segment.replace(/['"]/g, ''));
        const git = gitSubcommand(segmentWords);
        const start = segmentWords.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
        const program = start === -1 ? undefined : segmentWords[start];
        const removesOrRenames =
            program === 'rm' || program === 'mv' || program === 'unlink' || git?.name === 'rm' || git?.name === 'mv';
        if (removesOrRenames && segmentWords.some(word => TEST_FILE_ARGUMENT.test(word))) {
            return `Test files are never deleted or renamed unless the plan item names them. ${CONSULT}`;
        }
    }
    return undefined;
}

/**
 * Decides one PreToolUse call. Returns the reason to deny it, or undefined to stay out of the way.
 * `projectDir` is the repository root; `input` is the hook payload.
 */
export function decide(input, projectDir) {
    const toolName = input?.tool_name;
    const toolInput = input?.tool_input;
    if (typeof toolName !== 'string' || toolInput === null || typeof toolInput !== 'object') {
        return undefined;
    }
    const sentinelPresent = existsSync(path.join(projectDir, SENTINEL));
    if (toolName === 'Edit' || toolName === 'Write') {
        return checkFileEdit(toolName, toolInput, projectDir, sentinelPresent);
    }
    if (toolName === 'Bash') {
        return checkBash(toolInput, sentinelPresent);
    }
    return undefined;
}

function denial(reason) {
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `nUIget guard: ${reason}`,
        },
    });
}

function main() {
    let reason;
    try {
        const input = JSON.parse(readFileSync(0, 'utf8'));
        const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
        reason = decide(input, projectDir);
    } catch (error) {
        // A guard that cannot decide denies: letting the call through would be a silent hole.
        reason = `the guard could not evaluate this call (${error instanceof Error ? error.message : String(error)}).`;
    }
    if (reason !== undefined) {
        process.stdout.write(`${denial(reason)}\n`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
