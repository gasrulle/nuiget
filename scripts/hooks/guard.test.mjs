import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { decide, SENTINEL } from './guard.mjs';

const GUARD = fileURLToPath(new URL('./guard.mjs', import.meta.url));

// Built by concatenation so this file never contains the literal the guard refuses to add.
const FOCUSED = 'it.' + 'only(';
const SKIPPED = 'describe.' + 'skip(';
const CONDITIONAL = 'it.' + 'skipIf(';

let project;

function createSentinel() {
    mkdirSync(path.join(project, '.claude'), { recursive: true });
    writeFileSync(path.join(project, SENTINEL), 'P0.5\n');
}

function removeSentinel() {
    rmSync(path.join(project, SENTINEL), { force: true });
}

function edit(filePath, oldString = 'a', newString = 'b') {
    return decide({ tool_name: 'Edit', tool_input: { file_path: filePath, old_string: oldString, new_string: newString } }, project);
}

function write(filePath, content = 'x') {
    return decide({ tool_name: 'Write', tool_input: { file_path: filePath, content } }, project);
}

function bash(command) {
    return decide({ tool_name: 'Bash', tool_input: { command } }, project);
}

before(() => {
    project = mkdtempSync(path.join(tmpdir(), 'nuiget-guard-'));
});

after(() => {
    rmSync(project, { recursive: true, force: true });
});

describe('frozen contract paths', () => {
    const frozen = ['src/core/contracts.ts', 'src/protocol/domain.ts', 'src/protocol/nested/x.ts', 'docs/adr/000-policy.md'];

    for (const file of frozen) {
        it(`denies Edit and Write to ${file} without the sentinel`, () => {
            assert.match(edit(file), /frozen contract path/);
            assert.match(write(file), /frozen contract path/);
        });
    }

    it('denies an absolute path and a differently cased path to the same file', () => {
        assert.match(edit(path.join(project, 'src/core/contracts.ts')), /frozen contract path/);
        assert.match(edit('Docs/ADR/000-policy.md'), /frozen contract path/);
    });

    it('names the consultation that is required', () => {
        assert.match(edit('src/core/contracts.ts'), /architecture-advisor/);
    });

    it('allows the same edits while the sentinel exists', () => {
        createSentinel();
        try {
            for (const file of frozen) {
                assert.equal(edit(file), undefined);
                assert.equal(write(file), undefined);
            }
        } finally {
            removeSentinel();
        }
    });

    it('allows neighbours of frozen paths and files outside the project', () => {
        assert.equal(edit('src/core/contracts.test.ts'), undefined);
        assert.equal(edit('src/core/cli/sdk.ts'), undefined);
        assert.equal(edit('docs/plans/STATUS.md'), undefined);
        assert.equal(edit(path.join(tmpdir(), 'elsewhere', 'docs', 'adr', 'x.md')), undefined);
    });
});

describe('focused and skipped tests', () => {
    it('denies an Edit that adds one to a test file', () => {
        assert.match(edit('src/core/a.test.ts', "it('x', () => {", `${FOCUSED}'x', () => {`), /focused or skipped test/);
        assert.match(edit('src/webview/b.test.tsx', 'describe(', SKIPPED), /focused or skipped test/);
        assert.match(edit('src/test/helpers/c.ts', 'x', `x ${FOCUSED}`), /focused or skipped test/);
    });

    it('allows an Edit that keeps or removes an existing one', () => {
        assert.equal(edit('src/core/a.test.ts', `${FOCUSED}'x'`, `${FOCUSED}'renamed'`), undefined);
        assert.equal(edit('src/core/a.test.ts', `${FOCUSED}'x'`, "it('x'"), undefined);
    });

    it('allows a conditional skip', () => {
        assert.equal(edit('src/core/a.test.ts', "it('x'", `${CONDITIONAL}process.platform === 'win32')('x'`), undefined);
    });

    it('denies a Write that adds one compared with the file on disk', () => {
        const file = 'src/core/written.test.ts';
        assert.match(write(file, `${FOCUSED}'x', () => {});\n`), /focused or skipped test/);

        mkdirSync(path.join(project, 'src/core'), { recursive: true });
        writeFileSync(path.join(project, file), `${SKIPPED}'old', () => {});\n`);
        assert.equal(write(file, `${SKIPPED}'old', () => {});\nit('new', () => {});\n`), undefined);
        assert.match(write(file, `${SKIPPED}'old', () => {});\n${FOCUSED}'new', () => {});\n`), /focused or skipped test/);
    });

    it('ignores files that are not tests', () => {
        assert.equal(edit('src/core/reader.ts', 'x', 'reader.' + 'skip(4)'), undefined);
        assert.equal(write('docs/notes.md', `Never write ${FOCUSED} in a test.`), undefined);
    });
});

describe('git commands', () => {
    it('allows ordinary commits and pushes', () => {
        assert.equal(bash('git commit -q -m "feat: x"'), undefined);
        assert.equal(bash('git add a.ts && git commit -m "fix: y" && git push origin labs/2.0'), undefined);
        assert.equal(bash('git -C sub commit --amend'), undefined);
    });

    it('denies a commit that skips verification', () => {
        assert.match(bash('git commit --no-verify -m "x"'), /skip verification/);
        assert.match(bash('git commit -n -m "x"'), /skip verification/);
        assert.match(bash('git add . && git commit -anm "x"'), /skip verification/);
        assert.match(bash('GIT_AUTHOR_NAME=a git -c core.editor=true commit --no-verify'), /skip verification/);
    });

    it('does not read a commit message as flags', () => {
        assert.equal(bash('git commit -m "docs: explain why --no-verify and -n are denied"'), undefined);
        assert.equal(bash("git commit -q -m \"$(cat <<'EOF'\nchore: guard\n\ngit commit --no-verify is denied; git push --force too\nEOF\n)\""), undefined);
    });

    it('denies any commit while the sentinel exists', () => {
        createSentinel();
        try {
            assert.match(bash('git commit -m "x"'), /sentinel/);
            assert.equal(bash('git status --short'), undefined);
        } finally {
            removeSentinel();
        }
    });

    it('denies force pushes in every spelling', () => {
        for (const command of [
            'git push --force',
            'git push -f origin labs/2.0',
            'git push --force-with-lease origin labs/2.0',
            'git push -uf origin labs/2.0',
            'git push origin +labs/2.0',
        ]) {
            assert.match(bash(command), /Force-pushing/, command);
        }
    });

    it('allows a push with upstream tracking', () => {
        assert.equal(bash('git push -u origin labs/2.0'), undefined);
    });
});

describe('deleting or renaming tests', () => {
    it('denies rm, mv, unlink, git rm and git mv of a test file', () => {
        for (const command of [
            'rm src/core/a.test.ts',
            'rm -f "src/webview/b.test.tsx"',
            'git rm src/core/a.test.ts',
            'git mv src/core/a.test.ts src/core/b.test.ts',
            'mv src/core/a.test.ts /tmp/',
            'unlink src/core/a.test.ts',
            'cd src/core && git rm a.test.ts',
            '(cd src && rm core/a.test.ts)',
        ]) {
            assert.match(bash(command), /never deleted or renamed/, command);
        }
    });

    it('allows other uses of test files and removal of other files', () => {
        assert.equal(bash('npx vitest run src/core/a.test.ts'), undefined);
        assert.equal(bash('git add src/core/a.test.ts && git status'), undefined);
        assert.equal(bash('rm -rf dist out'), undefined);
        assert.equal(bash('rm src/core/a.test.ts.snap'), undefined);
    });
});

describe('payloads the guard has no opinion on', () => {
    it('stays silent for other tools and incomplete payloads', () => {
        assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: 'src/core/contracts.ts' } }, project), undefined);
        assert.equal(decide({ tool_name: 'Edit' }, project), undefined);
        assert.equal(decide({ tool_name: 'Bash', tool_input: {} }, project), undefined);
        assert.equal(decide({}, project), undefined);
    });
});

describe('the hook process', () => {
    function run(payload) {
        return spawnSync(process.execPath, [GUARD], {
            input: typeof payload === 'string' ? payload : JSON.stringify(payload),
            encoding: 'utf8',
            env: { ...process.env, CLAUDE_PROJECT_DIR: project },
        });
    }

    it('prints a deny decision and exits 0', () => {
        const result = run({ tool_name: 'Write', tool_input: { file_path: 'docs/adr/009-catalog.md', content: 'x' } });
        assert.equal(result.status, 0);
        const output = JSON.parse(result.stdout).hookSpecificOutput;
        assert.equal(output.hookEventName, 'PreToolUse');
        assert.equal(output.permissionDecision, 'deny');
        assert.match(output.permissionDecisionReason, /^nUIget guard: docs\/adr\/009-catalog\.md is a frozen contract path/);
    });

    it('prints nothing when it has no objection', () => {
        const result = run({ tool_name: 'Bash', tool_input: { command: 'ls' } });
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
    });

    it('uses the payload cwd when CLAUDE_PROJECT_DIR is not set', () => {
        const env = { ...process.env };
        delete env.CLAUDE_PROJECT_DIR;
        const result = spawnSync(process.execPath, [GUARD], {
            input: JSON.stringify({ cwd: project, tool_name: 'Edit', tool_input: { file_path: path.join(project, 'src/protocol/a.ts') } }),
            encoding: 'utf8',
            env,
        });
        assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    });

    it('denies when the payload cannot be read', () => {
        const result = run('not json');
        assert.equal(result.status, 0);
        assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /could not evaluate/);
    });
});
