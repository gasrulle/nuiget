// Probes what the installed .NET SDK does to a Central Package Management (CPM) project and writes the result as
// a tracked fixture, `src/core/cli/__fixtures__/sdk-probes/<sdk>.json` (plan item P6.1, ADR-004 and its SDK probes
// supplement). Two parts:
//
// - `commands`: `dotnet package add|remove` and `dotnet restore` on the CPM input in `sdk-probes/cpm`, each in a
//   fresh copy, with the unified diff of the project and the props file against the pristine input.
// - `evaluations`: the properties run and one item run per target framework (`-getItem:PackageReference;PackageVersion`)
//   on the CPM input and on the multi-targeted input `src/core/project/__fixtures__/multitfm`, and, per input, one
//   combined run of the properties and the items without a global property (`<input>-combined`, the evaluator's first
//   run since P7.2c). Evaluation only: the multi-targeted input is not restorable under CPM (its
//   `Directory.Build.props` sets a `Version`).
//
// Usage:
//   node scripts/probe-sdk.mjs                    probe and write the fixture for the resolved SDK
//   node scripts/probe-sdk.mjs --out <file>       probe and write to <file> instead
//   node scripts/probe-sdk.mjs --check [--out f]  probe and compare with the tracked fixture of the same SDK (or the
//                                                 newest one of its major); exit 1 when the evidence differs
//
// Needs `dotnet` and `diff` on the PATH and access to nuget.org. Not meant for Windows.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FIXTURE_DIR = path.join(repoRoot, 'src', 'core', 'cli', '__fixtures__', 'sdk-probes');
const CPM_INPUT = path.join(FIXTURE_DIR, 'cpm');
const MULTITFM_INPUT = path.join(repoRoot, 'src', 'core', 'project', '__fixtures__', 'multitfm');

const PROJECT = 'App/App.csproj';
const PROPS = 'Directory.Packages.props';
export const TAIL_LINES = 10;

/** The rows of the P0.0 probe, in its order. A `continueFrom` row runs in the directory its predecessor left. */
export const COMMANDS = [
    { id: 'add-same-version', args: ['package', 'add', 'Serilog', '--version', '4.0.0', '--project', PROJECT] },
    { id: 'add-same-version-no-restore', args: ['package', 'add', 'Serilog', '--version', '4.0.0', '--project', PROJECT, '--no-restore'] },
    { id: 'add-newer-version', args: ['package', 'add', 'Serilog', '--version', '4.1.0', '--project', PROJECT] },
    { id: 'add-newer-version-no-restore', args: ['package', 'add', 'Serilog', '--version', '4.1.0', '--project', PROJECT, '--no-restore'] },
    { id: 'restore-after-no-restore-add', continueFrom: 'add-newer-version-no-restore', args: ['restore', PROJECT] },
    { id: 'add-no-version', args: ['package', 'add', 'Newtonsoft.Json', '--project', PROJECT] },
    { id: 'add-absent', args: ['package', 'add', 'Polly', '--version', '8.4.2', '--project', PROJECT] },
    { id: 'add-absent-no-restore', args: ['package', 'add', 'Polly', '--version', '8.4.2', '--project', PROJECT, '--no-restore'] },
    { id: 'restore-after-no-restore-add-absent', continueFrom: 'add-absent-no-restore', args: ['restore', PROJECT] },
    { id: 'remove', args: ['package', 'remove', 'Serilog', '--project', PROJECT] },
];

/** The properties run of ADR-004 tier 2, plus the switch that allows `VersionOverride`. */
export const EVALUATED_PROPERTIES = [
    'TargetFramework',
    'TargetFrameworks',
    'ManagePackageVersionsCentrally',
    'CentralPackageVersionOverrideEnabled',
];

/** MSBuild's well-known item metadata: derived from the identity or the defining file, or machine-specific. */
const WELL_KNOWN_METADATA = new Set([
    'FullPath', 'RootDir', 'Filename', 'Extension', 'RelativeDir', 'Directory', 'RecursiveDir',
    'ModifiedTime', 'CreatedTime', 'AccessedTime',
    'DefiningProjectDirectory', 'DefiningProjectName', 'DefiningProjectExtension',
]);

/** Same environment as `DotnetRunner` (ADR-003), so the probe sees what the extension sees. */
const FIXED_ENV = {
    DOTNET_CLI_UI_LANGUAGE: 'en',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    NO_COLOR: '1',
    TERM: 'dumb',
};

/**
 * Replace machine paths with placeholders. `replacements` is a list of `[path, token]`; longer paths go first so a
 * probe directory inside the home directory becomes `<probe>`, not `<home>/…`.
 */
export function redact(text, replacements) {
    const ordered = replacements
        .filter(([from]) => from)
        .sort(([a], [b]) => b.length - a.length);
    let result = text;
    for (const [from, token] of ordered) {
        result = result.split(from).join(token);
    }
    return result;
}

/** The last `TAIL_LINES` lines of a command's output, without trailing whitespace. */
export function tail(text) {
    const trimmed = text.replace(/\s+$/, '');
    return trimmed === '' ? '' : trimmed.split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

/** Drop the well-known metadata of every item in an `-getItem` result. */
export function stripWellKnownMetadata(output) {
    if (!output || typeof output !== 'object' || !output.Items) {
        return output;
    }
    const items = {};
    for (const [type, list] of Object.entries(output.Items)) {
        items[type] = list.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => !WELL_KNOWN_METADATA.has(key))));
    }
    return { ...output, Items: items };
}

/** The target frameworks a properties run names: `TargetFrameworks` when set, else `TargetFramework`. */
export function targetFrameworks(properties) {
    const list = (properties.TargetFrameworks || properties.TargetFramework || '')
        .split(';')
        .map(tfm => tfm.trim())
        .filter(Boolean);
    return [...new Set(list)];
}

const added = (diff, line) => new RegExp(`^\\+\\s*${line}\\s*$`, 'm').test(diff);
const removed = (diff, line) => new RegExp(`^-\\s*${line}\\s*$`, 'm').test(diff);

/**
 * The verdict of a probe, derived from its command rows rather than written by hand. Each key names the row that
 * proves it (ADR-004 SDK probes, "Verdict recorded in the fixture"). Throws when a row is missing.
 */
export function computeVerdict(commands) {
    const row = id => {
        const found = commands.find(command => command.id === id);
        if (!found) {
            throw new Error(`probe row ${id} is missing`);
        }
        return found;
    };
    const newer = row('add-newer-version');
    const newerNoRestore = row('add-newer-version-no-restore');
    const restoreAfter = row('restore-after-no-restore-add');
    const absent = row('add-absent');
    const remove = row('remove');
    return {
        addUpdatesCentralVersion: newer.exitCode === 0
            && newer.projectDiff === ''
            && added(newer.propsDiff, '<PackageVersion Include="Serilog" Version="4\\.1\\.0" />'),
        noRestoreWritesProjectVersion: /^\+.*Version/m.test(newerNoRestore.projectDiff) || restoreAfter.exitCode !== 0,
        addWithoutCentralEntryCreatesIt: absent.exitCode === 0
            && added(absent.projectDiff, '<PackageReference Include="Polly" />')
            && added(absent.propsDiff, '<PackageVersion Include="Polly" Version="8\\.4\\.2" />'),
        removeKeepsCentralEntry: remove.exitCode === 0
            && removed(remove.projectDiff, '<PackageReference Include="Serilog" />')
            && !removed(remove.propsDiff, '<PackageVersion Include="Serilog" Version="[^"]*" />'),
    };
}

/** Paths under the SDK directory carry the patch version; the comparison ignores it. */
function withoutSdkPatch(value) {
    return JSON.parse(JSON.stringify(value ?? null).replace(/<dotnet-root>\/sdk\/[^/"]+\//g, '<dotnet-root>/sdk/<version>/'));
}

/**
 * What two probes must agree on: per command the exit code and both diffs, the evaluations, and the verdict
 * computed from the commands. Output tails (timings, vulnerability feed URLs), the SDK patch, the date and the
 * platform are left out.
 */
export function projection(probe) {
    return {
        commands: probe.commands.map(({ id, continueFrom, argv, exitCode, projectDiff, propsDiff }) => ({
            id, continueFrom, argv, exitCode, projectDiff, propsDiff,
        })),
        evaluations: (probe.evaluations ?? []).map(({ id, argv, exitCode, output }) => ({
            id, argv, exitCode, output: withoutSdkPatch(output),
        })),
        verdict: computeVerdict(probe.commands),
    };
}

/** Differences between two probes, one line per differing leaf; empty when they agree. */
export function compareProbes(actual, expected) {
    const differences = [];
    const walk = (a, e, at) => {
        if (a !== null && e !== null && typeof a === 'object' && typeof e === 'object') {
            const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
            for (const key of keys) {
                walk(a[key], e[key], `${at}${Array.isArray(e) ? `[${key}]` : `.${key}`}`);
            }
            return;
        }
        if (a !== e) {
            differences.push(`${at}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
        }
    };
    walk(projection(actual), projection(expected), 'probe');
    return differences;
}

function versionParts(version) {
    return version.split(/[.-]/).slice(0, 3).map(Number);
}

/**
 * The tracked fixture a probe of `sdk` is compared with: the file of that exact version, else the newest file of the
 * same major. `undefined` when the major has no fixture.
 */
export function pickFixture(sdk, files) {
    const exact = `${sdk}.json`;
    if (files.includes(exact)) {
        return exact;
    }
    const [major] = versionParts(sdk);
    const sameMajor = files
        .filter(file => file.endsWith('.json') && versionParts(file.slice(0, -'.json'.length))[0] === major)
        .sort((a, b) => {
            const pa = versionParts(a.slice(0, -5));
            const pb = versionParts(b.slice(0, -5));
            return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
        });
    return sameMajor.at(-1);
}

function run(file, args, cwd) {
    const result = spawnSync(file, args, {
        cwd,
        env: { ...process.env, ...FIXED_ENV },
        encoding: 'utf8',
        shell: false,
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) {
        throw new Error(`${file} ${args.join(' ')}: ${result.error.message}`);
    }
    return { exitCode: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** The installed SDK that a directory resolves, and the dotnet root it lives in. */
function resolveSdk(cwd) {
    const version = run('dotnet', ['--version'], cwd).stdout.trim();
    const line = run('dotnet', ['--list-sdks'], cwd).stdout
        .split(/\r?\n/)
        .find(entry => entry.startsWith(`${version} [`));
    if (!/^\d+\.\d+\.\d+/.test(version) || !line) {
        throw new Error(`cannot resolve the SDK: dotnet --version printed ${JSON.stringify(version)}`);
    }
    const sdkDir = line.slice(line.indexOf('[') + 1, line.lastIndexOf(']'));
    return { version, dotnetRoot: path.dirname(sdkDir) };
}

function unifiedDiff(before, after, label) {
    const result = run('diff', ['-u', '--label', `a/${label}`, '--label', `b/${label}`, before, after], process.cwd());
    if (result.exitCode > 1) {
        throw new Error(`diff ${label}: ${result.stderr}`);
    }
    return result.stdout;
}

function copyInput(from, to) {
    fs.cpSync(from, to, { recursive: true, filter: source => !source.split(path.sep).includes('obj') });
}

/** Run the whole probe in a temporary directory and return the fixture object. */
export function runProbe({ today = new Date() } = {}) {
    const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-sdk-probe-')));
    try {
        const pristine = path.join(work, 'pristine');
        copyInput(CPM_INPUT, pristine);
        const { version, dotnetRoot } = resolveSdk(pristine);
        const roots = [[dotnetRoot, '<dotnet-root>'], [os.homedir(), '<home>']];
        try {
            roots.push([fs.realpathSync(dotnetRoot), '<dotnet-root>']);
        } catch {
            // The listed root does not exist as a real path; the listed spelling is redacted alone.
        }

        const directories = new Map();
        const commands = COMMANDS.map(({ id, continueFrom, args }) => {
            let dir = continueFrom ? directories.get(continueFrom) : undefined;
            if (!dir) {
                dir = path.join(work, id);
                copyInput(CPM_INPUT, dir);
            }
            directories.set(id, dir);
            const result = run('dotnet', args, dir);
            const clean = text => redact(text, [[dir, '<probe>'], ...roots]);
            return {
                id,
                ...(continueFrom ? { continueFrom } : {}),
                argv: ['dotnet', ...args],
                exitCode: result.exitCode,
                stdoutTail: clean(tail(result.stdout)),
                projectDiff: clean(unifiedDiff(path.join(pristine, PROJECT), path.join(dir, PROJECT), PROJECT)),
                propsDiff: clean(unifiedDiff(path.join(pristine, PROPS), path.join(dir, PROPS), PROPS)),
            };
        });

        const evaluations = [];
        for (const [input, from] of [['cpm', CPM_INPUT], ['multitfm', MULTITFM_INPUT]]) {
            const dir = path.join(work, `evaluate-${input}`);
            copyInput(from, dir);
            const evaluate = (id, args) => {
                const result = run('dotnet', args, dir);
                const text = redact(result.stdout, [[dir, '<probe>'], ...roots]);
                let output;
                try {
                    output = stripWellKnownMetadata(JSON.parse(text));
                } catch {
                    output = tail(text);
                }
                evaluations.push({ id, input, argv: ['dotnet', ...args], exitCode: result.exitCode, output });
                return output;
            };
            const properties = evaluate(`${input}-properties`, [
                'msbuild', PROJECT, `-getProperty:${EVALUATED_PROPERTIES.join(';')}`, '-nologo',
            ]);
            for (const tfm of targetFrameworks(properties?.Properties ?? {})) {
                evaluate(`${input}-items-${tfm}`, [
                    'msbuild', PROJECT, '-getItem:PackageReference;PackageVersion', `-property:TargetFramework=${tfm}`, '-nologo',
                ]);
            }
            evaluate(`${input}-combined`, [
                'msbuild', PROJECT, `-getProperty:${EVALUATED_PROPERTIES.join(';')}`, '-getItem:PackageReference;PackageVersion', '-nologo',
            ]);
        }

        return {
            sdk: version,
            probedOn: today.toISOString().slice(0, 10),
            platform: `${process.platform}-${process.arch}`,
            commands,
            evaluations,
            verdict: computeVerdict(commands),
        };
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

function main(argv) {
    const check = argv.includes('--check');
    const outIndex = argv.indexOf('--out');
    const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
    if (outIndex >= 0 && !out) {
        console.error('probe-sdk: --out needs a file');
        return 2;
    }

    const probe = runProbe();
    const target = out ? path.resolve(out) : check ? undefined : path.join(FIXTURE_DIR, `${probe.sdk}.json`);
    if (target) {
        fs.writeFileSync(target, `${JSON.stringify(probe, null, 2)}\n`, 'utf8');
        console.log(`probe-sdk: SDK ${probe.sdk} on ${probe.platform} → ${path.relative(process.cwd(), target)}`);
    }
    console.log(`probe-sdk: verdict ${JSON.stringify(probe.verdict)}`);
    if (!check) {
        return 0;
    }

    const fixture = pickFixture(probe.sdk, fs.readdirSync(FIXTURE_DIR));
    if (!fixture) {
        console.error(`probe-sdk: no tracked fixture for SDK major ${versionParts(probe.sdk)[0]} in ${path.relative(process.cwd(), FIXTURE_DIR)}`);
        return 2;
    }
    const expected = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, fixture), 'utf8'));
    const differences = compareProbes(probe, expected);
    if (differences.length > 0) {
        console.error(`probe-sdk: SDK ${probe.sdk} differs from the tracked fixture ${fixture}:`);
        for (const difference of differences) {
            console.error(`  ${difference}`);
        }
        return 1;
    }
    console.log(`probe-sdk: SDK ${probe.sdk} agrees with the tracked fixture ${fixture}`);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
