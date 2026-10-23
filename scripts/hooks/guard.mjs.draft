// PreToolUse guard for Claude Code sessions working on the nUIget plans (plan §2.3, layer L2).
// Reads the hook payload on stdin. Prints a deny decision to block the tool call; prints nothing to
// leave the decision to the normal permission flow. It never prints an allow decision: that would
// skip the permission prompt and turn the guard into a way around it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SENTINEL = '.claude/.contract-change';
// Lists, one per line, the exact test paths the current plan item retires (deletes or renames).
export const RETIRE_SENTINEL = '.claude/.test-retire';

// The sessions' own permissions and launch configuration: only the owner changes them, through a patch. Not part of
// isFrozen on purpose: the contract sentinel unlocks frozen paths, and nothing unlocks these.
export const OWNER_SETTINGS = ['.claude/settings.json', '.claude/settings.local.json', '.claude/launch.json', '.mcp.json'];
// The owner settings the bundled patch changes and P0.0 commits. `.claude/settings.local.json` is the owner's local,
// never committed file, so a change to it must not hold the discard check below.
export const OWNER_SETTINGS_COMMITTED = ['.claude/settings.json', '.claude/launch.json', '.mcp.json'];

const CONSULT =
    'Launch the `architecture-advisor` subagent, or the `design-advisor` subagent for a design question, with the ' +
    "brief from the UX plan's §2.4 (docs/plans/RUN-ux.md names the plan) and paste its answer verbatim into the " +
    "directory's STATUS.md before going on.";

// Matches a focused or skipped test call. `.skipIf(` does not match: the paren must follow directly.
const FOCUS_OR_SKIP = /\.(only|skip)\(/g;
const TEST_SOURCE = /\.(test|spec|bench)\.[cm]?[jt]sx?$/;
const TEST_FILE_ARGUMENT = /\.test\.tsx?(?![\w.])/;

// Programs that only read the files they name (a redirection is checked on its own); any other program that names
// an owner-only path is denied.
const READ_ONLY_PROGRAMS = new Set([
    'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'wc', 'ls', 'stat', 'file', 'diff', 'cmp',
    'jq', 'shasum', 'sha256sum', 'md5', 'md5sum', 'od', 'xxd', 'echo', 'printf', 'test', '[', 'realpath', 'readlink',
    'basename', 'dirname', 'cut',
]);
// Git subcommands that leave a named working-tree file as it is. `add` and `commit` record the owner's change.
const READ_ONLY_GIT = new Set(['diff', 'show', 'log', 'status', 'blame', 'ls-files', 'cat-file', 'check-ignore', 'add', 'commit']);

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

function isOwnerSettings(relativePath) {
    return OWNER_SETTINGS.includes(relativePath.toLowerCase());
}

function ownerSettingsMessage(relativePath) {
    return (
        `${relativePath} is the owner's configuration. Hand the owner a patch and the one command that applies it; ` +
        'a session never edits its own permissions.'
    );
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

/** True when the platform's file system treats two paths that differ only in case as one file. */
function caseInsensitive(platform) {
    return platform === 'darwin' || platform === 'win32';
}

/**
 * The project-relative test paths listed in the retire sentinel, or undefined when it does not exist. Blank lines
 * and lines starting with `#` are ignored; lines outside the project are dropped.
 */
function readRetireList(projectDir, platform) {
    const file = path.join(projectDir, RETIRE_SENTINEL);
    if (!existsSync(file)) {
        return undefined;
    }
    const listed = new Set();
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const entry = line.trim();
        if (entry === '' || entry.startsWith('#')) {
            continue;
        }
        const relative = relativeToProject(projectDir, entry);
        if (relative !== undefined) {
            listed.add(caseInsensitive(platform) ? relative.toLowerCase() : relative);
        }
    }
    return listed;
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

    if (isOwnerSettings(relativePath)) {
        return ownerSettingsMessage(relativePath);
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

/** The program of a segment, skipping leading `NAME=value` assignments. */
function programOf(segmentWords) {
    const start = segmentWords.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
    return start === -1 ? { name: undefined, rest: [] } : { name: segmentWords[start], rest: segmentWords.slice(start + 1) };
}

function hasShortFlag(rest, letter) {
    return rest.some(word => /^-[A-Za-z]+$/.test(word) && word.includes(letter));
}

/** Words that a redirection writes to: `> f`, `>> f`, `2> f`, `&> f`, `>| f`, or `>f` written together. */
function redirectTargets(segmentWords) {
    const targets = [];
    for (let index = 0; index < segmentWords.length; index++) {
        const match = /^(?:\d|&)?>>?\|?(.*)$/.exec(segmentWords[index]);
        if (!match) {
            continue;
        }
        if (match[1] !== '') {
            targets.push(match[1]);
        } else if (index + 1 < segmentWords.length) {
            targets.push(segmentWords[index + 1]);
        }
    }
    return targets;
}

/** The owner-only path a patch file touches, or undefined. */
function patchTouchesOwnerSettings(projectDir, patchFile) {
    const text = readIfPresent(path.resolve(projectDir, patchFile));
    for (const line of text.split(/\r?\n/)) {
        const header = /^(?:---|\+\+\+) (?:[ab]\/)?(\S+)/.exec(line) ?? /^diff --git a\/(\S+) b\//.exec(line);
        if (header && isOwnerSettings(header[1])) {
            return header[1];
        }
    }
    return undefined;
}

/** A reason to deny a segment that would change an owner-only file, or undefined. */
function checkOwnerSettingsBash(segmentWords, projectDir) {
    const ownerPath = word => {
        const relative = relativeToProject(projectDir, word);
        return relative !== undefined && isOwnerSettings(relative) ? relative : undefined;
    };

    for (const target of redirectTargets(segmentWords)) {
        const hit = ownerPath(target);
        if (hit) {
            return ownerSettingsMessage(hit);
        }
    }

    const program = programOf(segmentWords);
    const git = gitSubcommand(segmentWords);

    // `git apply` and `patch` name the patch, not the files it changes: read the patch.
    const applies = git?.name === 'apply' || program.name === 'patch';
    if (applies) {
        const rest = git?.name === 'apply' ? git.rest : program.rest;
        const dryRun = rest.some(word => ['--check', '--stat', '--numstat', '--summary', '--dry-run'].includes(word));
        if (!dryRun) {
            const inputs = rest.filter(word => !word.startsWith('-') && !/^(?:\d|&)?[<>]/.test(word));
            const fromFlag = rest
                .map((word, index) => (word === '-i' ? rest[index + 1] : word.startsWith('--input=') ? word.slice(8) : undefined))
                .filter(word => word !== undefined);
            const fromStdin = rest.map((word, index) => (word === '<' ? rest[index + 1] : undefined)).filter(Boolean);
            for (const patchFile of [...inputs, ...fromFlag, ...fromStdin]) {
                const hit = patchTouchesOwnerSettings(projectDir, patchFile);
                if (hit) {
                    return ownerSettingsMessage(hit);
                }
            }
        }
    }

    const named = segmentWords.map(ownerPath).find(hit => hit !== undefined);
    if (named === undefined) {
        return undefined;
    }
    if (git !== undefined) {
        return READ_ONLY_GIT.has(git.name) ? undefined : ownerSettingsMessage(named);
    }
    const readOnly =
        READ_ONLY_PROGRAMS.has(program.name) ||
        (program.name === 'sed' && !program.rest.some(word => /^(?:-[A-Za-z]*i|--in-place)/.test(word))) ||
        (program.name === 'python3' && program.rest[0] === '-m' && program.rest[1] === 'json.tool');
    return readOnly ? undefined : ownerSettingsMessage(named);
}

/** A reason to deny a `gh api` call that is not a plain GET, or undefined. */
function checkGhApi(segmentWords) {
    const program = programOf(segmentWords);
    if (program.name !== 'gh' || program.rest[0] !== 'api') {
        return undefined;
    }
    const rest = program.rest.slice(1);
    let method;
    let fields = false;
    for (let index = 0; index < rest.length; index++) {
        const word = rest[index];
        if (word === '-X' || word === '--method') {
            method = rest[index + 1];
        } else if (word.startsWith('--method=')) {
            method = word.slice(9);
        } else if (/^-X./.test(word)) {
            method = word.slice(2);
        } else if (word === '--input' || word.startsWith('--input=')) {
            return '`gh api --input` sends a request body; sessions use `gh api` for GET requests only.';
        } else if (/^(?:-f|-F|--field|--raw-field)(?:=|$)/.test(word) || /^-[fF]./.test(word)) {
            fields = true;
        }
    }
    const effective = (method ?? (fields ? 'POST' : 'GET')).toUpperCase();
    return effective === 'GET'
        ? undefined
        : `\`gh api\` with method ${effective} changes GitHub state; sessions use \`gh api\` for GET requests only.`;
}

/**
 * True when one of the owner's settings files has an uncommitted change: the owner applied the bundled patch and the
 * P0.0 commit has not recorded it yet. Outside a git work tree, or when git cannot run, there is nothing to protect.
 */
function probeOwnerSettingsPending(projectDir) {
    const result = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...OWNER_SETTINGS_COMMITTED], {
        cwd: projectDir,
        encoding: 'utf8',
        timeout: 5000,
    });
    return result.status === 0 && result.stdout.trim() !== '';
}

/** True when a git command would discard uncommitted working-tree changes or untracked files. */
function discardsWorkingTree(git) {
    const flags = git.rest.filter(word => word.startsWith('-'));
    const operands = git.rest.filter(word => !word.startsWith('-'));
    switch (git.name) {
        case 'stash':
            // `git stash`, `git stash -u`, `git stash push|save`; `list`, `show`, `drop`, `apply` leave the files alone.
            return operands.length === 0 || operands[0] === 'push' || operands[0] === 'save';
        case 'reset':
            return flags.includes('--hard');
        case 'checkout':
            return (
                git.rest.includes('--') ||
                git.rest.includes('.') ||
                flags.includes('--force') ||
                hasShortFlag(git.rest, 'f')
            );
        case 'restore': {
            const stagedOnly =
                (flags.includes('--staged') || hasShortFlag(git.rest, 'S')) &&
                !flags.includes('--worktree') &&
                !hasShortFlag(git.rest, 'W');
            return !stagedOnly;
        }
        case 'clean':
            return (
                (flags.includes('--force') || hasShortFlag(git.rest, 'f')) &&
                !flags.includes('--dry-run') &&
                !hasShortFlag(git.rest, 'n')
            );
        case 'switch':
            return flags.some(word => word === '--discard-changes' || word === '--force') || hasShortFlag(git.rest, 'f');
        default:
            return false;
    }
}

function checkBash(toolInput, projectDir, sentinelPresent, retireList, platform, ownerSettingsPending) {
    if (typeof toolInput.command !== 'string') {
        return undefined;
    }
    const command = stripHereDocuments(toolInput.command);

    // Flags are read with quoted text removed, so a commit message that mentions a flag is not a flag.
    for (const segment of splitSegments(stripQuoted(command))) {
        const segmentWords = words(segment);
        const git = gitSubcommand(segmentWords);
        if (git?.name === 'commit') {
            if (sentinelPresent) {
                return (
                    `The sentinel ${SENTINEL} exists. Finish the contract change, delete the sentinel, then commit ` +
                    '(plan D6).'
                );
            }
            if (retireList !== undefined) {
                return (
                    `The sentinel ${RETIRE_SENTINEL} exists. Finish retiring the tests it lists, delete the sentinel, ` +
                    'then commit.'
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
        if (git !== undefined && discardsWorkingTree(git) && ownerSettingsPending()) {
            return (
                `The owner's settings change (${OWNER_SETTINGS_COMMITTED.join(', ')}) is applied but not committed, and ` +
                `\`git ${git.name}\` here would discard it: commit the owner's settings change first (P0.0).`
            );
        }
        const ghApi = checkGhApi(segmentWords);
        if (ghApi !== undefined) {
            return ghApi;
        }
    }

    // File arguments are read with quotes kept: a quoted path is still a path.
    for (const segment of splitSegments(command)) {
        const segmentWords = words(segment.replace(/['"]/g, ''));

        const ownerSettings = checkOwnerSettingsBash(segmentWords, projectDir);
        if (ownerSettings !== undefined) {
            return ownerSettings;
        }

        const git = gitSubcommand(segmentWords);
        const program = programOf(segmentWords).name;
        const removesOrRenames =
            program === 'rm' || program === 'mv' || program === 'unlink' || git?.name === 'rm' || git?.name === 'mv';
        const testWords = removesOrRenames ? segmentWords.filter(word => TEST_FILE_ARGUMENT.test(word)) : [];
        if (testWords.length === 0) {
            continue;
        }
        // Paths are resolved from the project root; after a `cd` they do not match the list and stay denied.
        const unlisted = testWords.filter(word => {
            const relative = relativeToProject(projectDir, word);
            const key = relative !== undefined && caseInsensitive(platform) ? relative.toLowerCase() : relative;
            return retireList === undefined || key === undefined || !retireList.has(key);
        });
        if (unlisted.length > 0) {
            const notListed = retireList === undefined ? '' : ` Not listed there: ${unlisted.join(', ')}.`;
            return (
                `Test files are deleted or renamed only through the ${RETIRE_SENTINEL} sentinel, which lists exactly ` +
                `the paths the plan item names (ADR-010).${notListed} ${CONSULT}`
            );
        }
    }
    return undefined;
}

/**
 * Decides one PreToolUse call. Returns the reason to deny it, or undefined to stay out of the way.
 * `projectDir` is the repository root; `input` is the hook payload; `options.platform` (default `process.platform`)
 * decides whether retired test paths are compared case-insensitively (macOS, Windows); `options.ownerSettingsPending`
 * (default: ask `git status`) says whether the owner's settings change is applied but not committed.
 */
export function decide(input, projectDir, options = {}) {
    const toolName = input?.tool_name;
    const toolInput = input?.tool_input;
    if (typeof toolName !== 'string' || toolInput === null || typeof toolInput !== 'object') {
        return undefined;
    }
    const platform = options.platform ?? process.platform;
    const sentinelPresent = existsSync(path.join(projectDir, SENTINEL));
    if (toolName === 'Edit' || toolName === 'Write') {
        return checkFileEdit(toolName, toolInput, projectDir, sentinelPresent);
    }
    if (toolName === 'Bash') {
        const pending =
            typeof options.ownerSettingsPending === 'boolean'
                ? () => options.ownerSettingsPending
                : () => probeOwnerSettingsPending(projectDir);
        return checkBash(toolInput, projectDir, sentinelPresent, readRetireList(projectDir, platform), platform, pending);
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
