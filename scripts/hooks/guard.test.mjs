import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { decide, OWNER_SETTINGS, OWNER_SETTINGS_COMMITTED, RETIRE_SENTINEL, SENTINEL } from './guard.mjs';

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

function createRetire(lines) {
    mkdirSync(path.join(project, '.claude'), { recursive: true });
    writeFileSync(path.join(project, RETIRE_SENTINEL), `${lines.join('\n')}\n`);
}

function removeRetire() {
    rmSync(path.join(project, RETIRE_SENTINEL), { force: true });
}

function withRetire(lines, body) {
    createRetire(lines);
    try {
        body();
    } finally {
        removeRetire();
    }
}

function edit(filePath, oldString = 'a', newString = 'b') {
    return decide({ tool_name: 'Edit', tool_input: { file_path: filePath, old_string: oldString, new_string: newString } }, project);
}

function write(filePath, content = 'x') {
    return decide({ tool_name: 'Write', tool_input: { file_path: filePath, content } }, project);
}

// Hermetic by default: no git probe. The owner-settings tests pass `ownerSettingsPending` or use a real repository.
function bash(command, platform = 'linux', ownerSettingsPending = false) {
    return decide({ tool_name: 'Bash', tool_input: { command } }, project, { platform, ownerSettingsPending });
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

    it('names the consultation that is required, with both advisors', () => {
        assert.match(edit('src/core/contracts.ts'), /architecture-advisor/);
        assert.match(edit('src/core/contracts.ts'), /design-advisor/);
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

describe('owner-only configuration', () => {
    it('lists the four paths', () => {
        assert.deepEqual(OWNER_SETTINGS, ['.claude/settings.json', '.claude/settings.local.json', '.claude/launch.json', '.mcp.json']);
    });

    for (const file of OWNER_SETTINGS) {
        it(`denies Edit and Write to ${file} and tells the session to hand the owner a patch`, () => {
            assert.match(edit(file), /Hand the owner a patch/);
            assert.match(write(file), /one command that applies it/);
        });
    }

    it('denies an absolute path and a differently cased path', () => {
        assert.match(write(path.join(project, '.claude/launch.json')), /owner's configuration/);
        assert.match(edit('.Claude/Settings.JSON'), /permissions/);
        assert.match(write('.MCP.json'), /permissions/);
    });

    it('does not let the contract sentinel unlock them', () => {
        createSentinel();
        try {
            // The sentinel does unlock the frozen contract paths; the owner's settings stay denied.
            assert.equal(edit('src/core/contracts.ts'), undefined);
            for (const file of OWNER_SETTINGS) {
                assert.match(edit(file), /owner's configuration/);
                assert.match(write(file), /owner's configuration/);
                assert.match(bash(`echo x > ${file}`), /owner's configuration/);
            }
        } finally {
            removeSentinel();
        }
    });

    it('does not let the retire sentinel unlock them', () => {
        withRetire(['.claude/settings.json'], () => {
            assert.match(write('.claude/settings.json'), /owner's configuration/);
            assert.match(bash('rm .claude/settings.json'), /owner's configuration/);
        });
    });

    it('allows the other files under .claude', () => {
        assert.equal(write('.claude/agents/design-advisor.md'), undefined);
        assert.equal(write('.claude/workflows/design-judge.js'), undefined);
        assert.equal(write(RETIRE_SENTINEL), undefined);
        assert.equal(write('.claude/settings.json.patch'), undefined);
    });

    it('denies shell commands that write them', () => {
        for (const command of [
            "cat > .claude/launch.json <<'EOF'\n{}\nEOF",
            'echo "{}" >> .claude/settings.json',
            'printf x >.mcp.json',
            "sed -i '' 's/a/b/' .claude/settings.json",
            'tee .claude/settings.local.json < /dev/null',
            'cp settings.backup .claude/settings.json',
            'rm .claude/settings.local.json',
            'git checkout -- .claude/settings.json',
            'git restore .claude/launch.json',
            'node scripts/edit.mjs .claude/settings.json',
            `cat x > ${path.join(project, '.claude/settings.json')}`,
        ]) {
            assert.match(bash(command), /owner's configuration/, command);
        }
    });

    it('denies applying a patch that touches them, and allows checking it', () => {
        mkdirSync(path.join(project, 'patches'), { recursive: true });
        writeFileSync(
            path.join(project, 'patches/settings.patch'),
            '--- a/.claude/settings.json\n+++ b/.claude/settings.json\n@@ -1 +1 @@\n-{}\n+{ }\n' +
                '--- /dev/null\n+++ b/.claude/launch.json\n@@ -0,0 +1 @@\n+{}\n',
        );
        writeFileSync(path.join(project, 'patches/source.patch'), '--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-a\n+b\n');
        assert.match(bash('git apply patches/settings.patch'), /\.claude\/settings\.json/);
        assert.match(bash('git apply -R patches/settings.patch'), /permissions/);
        assert.match(bash('patch -p1 < patches/settings.patch'), /permissions/);
        assert.equal(bash('git apply --check patches/settings.patch'), undefined);
        assert.equal(bash('git apply --stat patches/settings.patch'), undefined);
        assert.equal(bash('git apply patches/source.patch'), undefined);
    });

    it('allows reading, diffing and committing them', () => {
        for (const command of [
            'cat .claude/settings.json',
            'grep -n allow .claude/settings.json',
            'python3 -m json.tool .claude/settings.json >/dev/null && echo valid',
            'git diff .claude/settings.json',
            'git diff .claude/settings.json > patches/settings.patch',
            'git add .claude/settings.json .claude/launch.json && git commit -m "chore(claude): apply the owner patch"',
            'test -f .claude/launch.json && echo present',
            'sed -n 1,20p .claude/settings.json',
        ]) {
            assert.equal(bash(command), undefined, command);
        }
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
        assert.equal(bash('git add a.ts && git commit -m "fix: y" && git push origin labs/ux'), undefined);
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

    it('denies any commit while the contract sentinel exists', () => {
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
            'git push -f origin labs/ux',
            'git push --force-with-lease origin labs/ux',
            'git push -uf origin labs/ux',
            'git push origin +labs/ux',
        ]) {
            assert.match(bash(command), /Force-pushing/, command);
        }
    });

    it('allows a push with upstream tracking', () => {
        assert.equal(bash('git push -u origin labs/ux'), undefined);
    });
});

describe('gh api', () => {
    it('allows GET requests', () => {
        for (const command of [
            'gh api repos/gasrulle/nuiget/actions/runs/1/artifacts',
            'gh api -X GET search/issues -f q=repo:gasrulle/nuiget',
            'gh api --method=get repos/gasrulle/nuiget',
            'gh api -X GET search/issues --field q=repo:gasrulle/nuiget',
            "gh api repos/gasrulle/nuiget/commits --jq '.[] | select(.x == \"-X POST\")'",
        ]) {
            assert.equal(bash(command), undefined, command);
        }
    });

    it('denies requests that change state', () => {
        for (const command of [
            'gh api -X POST repos/gasrulle/nuiget/issues -f title=t',
            'gh api repos/gasrulle/nuiget/issues -f title=t',
            'gh api --method DELETE repos/gasrulle/nuiget/actions/artifacts/1',
            'gh api -XPATCH repos/gasrulle/nuiget',
            'gh api graphql -F query=@q.graphql',
            'gh api repos/gasrulle/nuiget/issues --input body.json',
            'gh api repos/gasrulle/nuiget/issues --input=body.json',
            'gh api repos/gasrulle/nuiget/issues --field title=t',
            'gh api repos/gasrulle/nuiget/issues --raw-field title=t',
            'gh api repos/gasrulle/nuiget/issues --field=title=t',
        ]) {
            assert.match(bash(command), /GET requests only/, command);
        }
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
            assert.match(bash(command), /deleted or renamed only through/, command);
        }
    });

    it('names the retire sentinel when it does not exist', () => {
        assert.match(bash('rm src/core/a.test.ts'), new RegExp(RETIRE_SENTINEL.replace(/\./g, '\\.')));
    });

    it('allows other uses of test files and removal of other files', () => {
        assert.equal(bash('npx vitest run src/core/a.test.ts'), undefined);
        assert.equal(bash('git add src/core/a.test.ts && git status'), undefined);
        assert.equal(bash('rm -rf dist out'), undefined);
        assert.equal(bash('rm src/core/a.test.ts.snap'), undefined);
    });
});

describe('retiring tests with the sentinel', () => {
    it('allows deleting or renaming exactly the listed paths', () => {
        withRetire(['src/core/a.test.ts', 'src/core/c.test.ts'], () => {
            assert.equal(bash('rm src/core/a.test.ts'), undefined);
            assert.equal(bash('git rm -q "src/core/a.test.ts"'), undefined);
            assert.equal(bash('git mv src/core/a.test.ts src/core/c.test.ts'), undefined);
            assert.equal(bash(`rm ${path.join(project, 'src/core/a.test.ts')}`), undefined);
            assert.equal(bash('rm ./src/core/a.test.ts'), undefined);
        });
    });

    it('still denies a path the sentinel does not list', () => {
        withRetire(['src/core/a.test.ts'], () => {
            assert.match(bash('rm src/core/b.test.ts'), /Not listed there: src\/core\/b\.test\.ts/);
            assert.match(bash('rm src/core/a.test.ts src/core/b.test.ts'), /Not listed there/);
            assert.match(bash('git mv src/core/a.test.ts src/core/renamed.test.ts'), /Not listed there: src\/core\/renamed\.test\.ts/);
            assert.match(bash('rm src/core/*.test.ts'), /Not listed there/);
        });
    });

    it('compares from the project root, so a path after cd stays denied', () => {
        withRetire(['src/core/a.test.ts'], () => {
            assert.match(bash('cd src/core && rm a.test.ts'), /Not listed there/);
        });
    });

    it('ignores blank lines, comments and lines outside the project', () => {
        withRetire(['# P2.3 retires the old Row tests', '', '../elsewhere/x.test.ts', 'src/core/a.test.ts'], () => {
            assert.equal(bash('rm src/core/a.test.ts'), undefined);
            assert.match(bash(`rm ${path.join(project, '..', 'elsewhere', 'x.test.ts')}`), /Not listed there/);
        });
    });

    it('compares case-insensitively on macOS and Windows, exactly elsewhere', () => {
        withRetire(['src/Core/A.test.ts'], () => {
            assert.equal(bash('rm src/core/a.test.ts', 'darwin'), undefined);
            assert.equal(bash('rm SRC/CORE/A.test.ts', 'win32'), undefined);
            assert.match(bash('rm src/core/a.test.ts', 'linux'), /Not listed there/);
            assert.equal(bash('rm src/Core/A.test.ts', 'linux'), undefined);
        });
    });

    it('denies any commit while the sentinel exists, even an empty one', () => {
        withRetire(['src/core/a.test.ts'], () => {
            assert.match(bash('git commit -m "x"'), new RegExp(`${RETIRE_SENTINEL.replace(/\./g, '\\.')} exists`));
            assert.equal(bash('git status --short'), undefined);
        });
        withRetire([], () => {
            assert.match(bash('git commit -m "x"'), /test-retire exists/);
        });
    });

    it('allows the commit once the sentinel is gone', () => {
        withRetire(['src/core/a.test.ts'], () => {});
        assert.equal(bash('git commit -m "test: retire the old Row tests"'), undefined);
    });
});

describe("discarding the owner's uncommitted settings change", () => {
    const PENDING = /commit the owner's settings change first \(P0\.0\)/;

    it('watches the three committed settings files, not the local one', () => {
        assert.deepEqual(OWNER_SETTINGS_COMMITTED, ['.claude/settings.json', '.claude/launch.json', '.mcp.json']);
        assert.ok(OWNER_SETTINGS.includes('.claude/settings.local.json'));
    });

    it('denies commands that discard working-tree changes while the change is pending', () => {
        for (const command of [
            'git stash',
            'git stash -u',
            'git stash push -m "wip"',
            'git stash save wip',
            'git reset --hard',
            'git reset --hard origin/labs/ux',
            'git checkout .',
            'git checkout -- src/x.ts',
            'git checkout HEAD~1 -- src/x.ts',
            'git checkout -f labs/ux',
            'git restore src/x.ts',
            'git restore --staged --worktree src/x.ts',
            'git clean -fd',
            'git switch --discard-changes labs/ux',
            'git add -A && git stash',
        ]) {
            assert.match(bash(command, 'linux', true), PENDING, command);
        }
    });

    it('allows the commands that keep the working tree while the change is pending', () => {
        for (const command of [
            'git stash list',
            'git stash show -p',
            'git reset HEAD src/x.ts',
            'git restore --staged src/x.ts',
            'git checkout labs/ux',
            'git checkout -b labs/ux-probe',
            'git clean -n',
            'git status --short',
            'git add .claude/settings.json .claude/launch.json && git commit -m "chore(claude): apply the owner patch (P0.0)"',
        ]) {
            assert.equal(bash(command, 'linux', true), undefined, command);
        }
    });

    it('allows them once nothing is pending', () => {
        for (const command of ['git stash', 'git reset --hard', 'git checkout .', 'git restore src/x.ts', 'git clean -fd']) {
            assert.equal(bash(command, 'linux', false), undefined, command);
        }
    });

    it('asks git when no override is given', () => {
        const repo = mkdtempSync(path.join(tmpdir(), 'nuiget-guard-repo-'));
        const git = (...args) => {
            const result = spawnSync('git', ['-c', 'user.name=guard', '-c', 'user.email=guard@example.invalid', ...args], {
                cwd: repo,
                encoding: 'utf8',
            });
            assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
        };
        const ask = command => decide({ tool_name: 'Bash', tool_input: { command } }, repo, { platform: 'linux' });
        try {
            git('init', '-q');
            mkdirSync(path.join(repo, '.claude'), { recursive: true });
            writeFileSync(path.join(repo, '.claude/settings.json'), '{}\n');
            writeFileSync(path.join(repo, '.claude/settings.local.json'), '{}\n');
            // Forced: a global ignore may cover the local file; tracked, its change shows in git status.
            git('add', '-f', '.claude/settings.json', '.claude/settings.local.json');
            git('commit', '-q', '-m', 'init');
            assert.equal(ask('git stash'), undefined);

            writeFileSync(path.join(repo, '.claude/settings.local.json'), '{ "permissions": {} }\n');
            assert.equal(ask('git stash'), undefined, 'a change to the local settings file holds nothing');
            git('commit', '-q', '-am', 'chore: local settings');

            writeFileSync(path.join(repo, '.claude/settings.json'), '{ "permissions": {} }\n');
            assert.match(ask('git stash'), PENDING);
            assert.match(ask('git reset --hard'), PENDING);

            git('commit', '-q', '-am', 'chore: owner patch');
            assert.equal(ask('git reset --hard'), undefined);

            writeFileSync(path.join(repo, '.claude/launch.json'), '{}\n');
            assert.match(ask('git clean -fd'), PENDING);
        } finally {
            rmSync(repo, { recursive: true, force: true });
        }
    });

    it('stays silent outside a git work tree', () => {
        assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'git stash' } }, project, { platform: 'linux' }), undefined);
    });
});

describe('payloads the guard has no opinion on', () => {
    it('stays silent for other tools and incomplete payloads', () => {
        assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: 'src/core/contracts.ts' } }, project), undefined);
        assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: '.claude/settings.json' } }, project), undefined);
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

    it('denies an owner-only path from the hook process', () => {
        const result = run({ tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json', old_string: 'a', new_string: 'b' } });
        assert.equal(result.status, 0);
        assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /^nUIget guard: \.claude\/settings\.json is the owner's configuration/);
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
