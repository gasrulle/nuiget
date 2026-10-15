// Times the dotnet commands the 2.0 extension runs, on the e2e project and on a multi-targeted copy of it, and writes
// the timings as JSON (plan item P7.2a; the baseline in `docs/perf-baseline.md` comes from the CI job `perf`). Rows:
//
// - `sdk-probe`: `dotnet --version`, the first dotnet call of the run (the CI job has no warm-up step before it).
// - `config-paths`: `dotnet nuget config paths` in the e2e project (the unit cost of finding N72).
// - `restore-cold-*`: the first restore into empty `NUGET_PACKAGES` and `NUGET_HTTP_CACHE_PATH` folders;
//   `restore-warm-multi`: the same restore again with `obj/` deleted and the folders kept.
// - `evaluate-*`: the evaluator's properties run and one item run per target framework on the restored projects, as
//   the SDK probe writes them; `evaluate-combined-single` asks for properties and items in one run (timing only).
//
// Usage:
//   node scripts/perf-baseline.mjs                  write out/perf/perf-baseline.json
//   node scripts/perf-baseline.mjs --out <file>     write <file> instead
//   node scripts/perf-baseline.mjs --summary <file> also append a Markdown table to <file> (the job summary in CI)
//
// Needs `dotnet` on the PATH and access to nuget.org. A command that exits non-zero is recorded and the run goes on;
// the script then exits 1.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(repoRoot, 'src', 'test', 'e2e', 'fixtures');
const SINGLE_INPUT = path.join(FIXTURES, 'e2e-workspace');
const SINGLE_PROJECT = 'TestProject.csproj';
const MULTI_INPUT = path.join(FIXTURES, 'perf-multitfm');
const MULTI_PROJECT = 'MultiTfm.csproj';
const MULTI_FRAMEWORKS = ['net8.0', 'netstandard2.0'];
const DEFAULT_OUT = path.join(repoRoot, 'out', 'perf', 'perf-baseline.json');

/** Same environment as `DotnetRunner` (ADR-003) and `scripts/probe-sdk.mjs`. */
const FIXED_ENV = {
    DOTNET_CLI_UI_LANGUAGE: 'en',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    NO_COLOR: '1',
    TERM: 'dumb',
};

/** The evaluator's four properties (`src/core/project/evaluator.ts`). */
const PROPERTIES = '-getProperty:TargetFramework;TargetFrameworks;ManagePackageVersionsCentrally;CentralPackageVersionOverrideEnabled';
const ITEMS = '-getItem:PackageReference;PackageVersion';

function copyInput(from, to) {
    fs.cpSync(from, to, { recursive: true, filter: source => !source.split(path.sep).includes('obj') });
}

/** A project copy with its own empty package and HTTP cache folders. */
function scenario(work, name, input) {
    const dir = path.join(work, name);
    copyInput(input, dir);
    const packages = path.join(work, `${name}-packages`);
    const httpCache = path.join(work, `${name}-http-cache`);
    fs.mkdirSync(packages);
    fs.mkdirSync(httpCache);
    return { dir, env: { NUGET_PACKAGES: packages, NUGET_HTTP_CACHE_PATH: httpCache } };
}

/** Run the whole measurement in a temporary directory and return the result object. */
export function runBaseline({ today = new Date() } = {}) {
    const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nuiget-perf-')));
    try {
        const single = scenario(work, 'single', SINGLE_INPUT);
        const multi = scenario(work, 'multi', MULTI_INPUT);
        const rows = [];
        const outputs = new Map();
        const time = (id, { dir, env }, args) => {
            const start = performance.now();
            const result = spawnSync('dotnet', args, {
                cwd: dir,
                env: { ...process.env, ...FIXED_ENV, ...env },
                encoding: 'utf8',
                shell: false,
                maxBuffer: 64 * 1024 * 1024,
            });
            const ms = Math.round(performance.now() - start);
            const exitCode = result.error ? -1 : result.status ?? -1;
            rows.push({ id, argv: ['dotnet', ...args], cwd: dir.split(work).join('<probe>'), exitCode, ms });
            if (exitCode !== 0) {
                const detail = result.error ? result.error.message : `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split(/\r?\n/).slice(-5).join('\n');
                console.error(`perf-baseline: ${id} exited with ${exitCode}\n${detail.split(work).join('<probe>')}`);
            }
            outputs.set(id, result.stdout ?? '');
        };

        time('sdk-probe', single, ['--version']);
        time('config-paths', single, ['nuget', 'config', 'paths']);
        time('restore-cold-single', single, ['restore', SINGLE_PROJECT]);
        time('restore-cold-multi', multi, ['restore', MULTI_PROJECT]);
        fs.rmSync(path.join(multi.dir, 'obj'), { recursive: true, force: true });
        time('restore-warm-multi', multi, ['restore', MULTI_PROJECT]);
        time('evaluate-properties-multi', multi, ['msbuild', MULTI_PROJECT, PROPERTIES, '-nologo']);
        for (const tfm of MULTI_FRAMEWORKS) {
            time(`evaluate-items-multi-${tfm}`, multi, ['msbuild', MULTI_PROJECT, ITEMS, `-property:TargetFramework=${tfm}`, '-nologo']);
        }
        time('evaluate-properties-single', single, ['msbuild', SINGLE_PROJECT, PROPERTIES, '-nologo']);
        time('evaluate-items-single', single, ['msbuild', SINGLE_PROJECT, ITEMS, '-property:TargetFramework=net8.0', '-nologo']);
        time('evaluate-combined-single', single, ['msbuild', SINGLE_PROJECT, PROPERTIES, ITEMS, '-property:TargetFramework=net8.0', '-nologo']);

        return {
            sdk: outputs.get('sdk-probe').trim(),
            platform: `${process.platform}-${process.arch}`,
            measuredOn: today.toISOString(),
            rows,
        };
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

/** The result as a Markdown section for a job summary. */
export function summaryMarkdown(baseline) {
    return [
        '## Perf baseline (informational)',
        '',
        `SDK ${baseline.sdk} on ${baseline.platform}, ${baseline.measuredOn}.`,
        '',
        '| id | exit | ms |',
        '|----|-----:|---:|',
        ...baseline.rows.map(row => `| ${row.id} | ${row.exitCode} | ${row.ms} |`),
        '',
    ].join('\n');
}

function option(argv, name) {
    const index = argv.indexOf(name);
    if (index < 0) {
        return { present: false };
    }
    return { present: true, value: argv[index + 1] };
}

function main(argv) {
    const out = option(argv, '--out');
    const summary = option(argv, '--summary');
    if ((out.present && !out.value) || (summary.present && !summary.value)) {
        console.error('perf-baseline: --out and --summary need a file');
        return 2;
    }

    const baseline = runBaseline();
    const target = out.present ? path.resolve(out.value) : DEFAULT_OUT;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    if (summary.present) {
        fs.appendFileSync(summary.value, `${summaryMarkdown(baseline)}\n`, 'utf8');
    }
    for (const row of baseline.rows) {
        console.log(`${row.id.padEnd(36)} exit ${String(row.exitCode).padStart(3)} ${String(row.ms).padStart(7)} ms`);
    }
    console.log(`perf-baseline: SDK ${baseline.sdk} on ${baseline.platform} → ${path.relative(process.cwd(), target)}`);
    return baseline.rows.every(row => row.exitCode === 0) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
