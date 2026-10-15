import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DotnetResult, DotnetRunner, DotnetRunOptions, ProjectExecutionContext } from '../contracts';
import type { InstalledPackage, InstalledResult } from '../../protocol/domain';
import { DefaultDotnetRunner, msbuildGetArgs, resolveDotnetExecutable } from '../cli';
import { normalizeProjectPath } from '../util/paths';
import { createScratchDir, fixture, writeTree } from './__fixtures__/scratch';
import { EvaluationError, MsBuildProjectEvaluator, parseJsonAfterPrefix } from './evaluator';

interface ProbeEvaluation {
    id: string;
    input: string;
    output: unknown;
}

/** The evaluations of the SDK probe (`scripts/probe-sdk.mjs`, P6.1), with the probe root of each input. */
const probe = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cli', '__fixtures__', 'sdk-probes', '10.0.401.json'), 'utf8')) as { evaluations: ProbeEvaluation[] };
const INPUT_ROOTS: Record<string, string> = {
    cpm: path.join(__dirname, '..', 'cli', '__fixtures__', 'sdk-probes', 'cpm'),
    multitfm: fixture('multitfm'),
};
const SDK_DIR = path.join(path.sep, 'opt', 'dotnet', 'sdk', '10.0.401');
const PROPERTY_ARGS = msbuildGetArgs('x', [], ['TargetFramework', 'TargetFrameworks', 'ManagePackageVersionsCentrally', 'CentralPackageVersionOverrideEnabled']).slice(3);

function probeOutput(input: string, id: string): string {
    const evaluation = probe.evaluations.find(entry => entry.input === input && entry.id === id);
    if (evaluation === undefined) {
        throw new Error(`no probe evaluation ${id}`);
    }
    // Placeholders become native paths of this machine, so the expectations can use `path.join` on every platform.
    const local = (value: unknown): unknown => {
        if (typeof value === 'string') {
            const sdk = /^<dotnet-root>\/sdk\/[^/]+\/(.*)$/.exec(value);
            if (sdk) {
                return path.join(SDK_DIR, ...sdk[1].split('/'));
            }
            return value.startsWith('<probe>/') ? path.join(INPUT_ROOTS[input], ...value.slice('<probe>/'.length).split('/')) : value;
        }
        if (Array.isArray(value)) {
            return value.map(local);
        }
        return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, local(entry)])) : value;
    };
    return JSON.stringify(local(evaluation.output), null, 2);
}

function result(stdout: string, extra: Partial<DotnetResult> = {}): DotnetResult {
    return { exitCode: 0, stdout, stderr: '', durationMs: 1, argv: [], ...extra };
}

type Answer = (args: string[], options: DotnetRunOptions) => DotnetResult | Promise<DotnetResult>;

function fakeRunner(answer: Answer): DotnetRunner & { calls: Array<{ args: string[]; options: DotnetRunOptions }> } {
    const calls: Array<{ args: string[]; options: DotnetRunOptions }> = [];
    return {
        calls,
        run: vi.fn(async (args: string[], options: DotnetRunOptions) => {
            calls.push({ args, options });
            return answer(args, options);
        }),
        sdkVersion: vi.fn(async () => undefined),
        clearSdkCache: vi.fn(),
    };
}

/** Answers like the real SDK did in the probe for `input`. */
function probeAnswer(input: string): Answer {
    return args => {
        if (args.some(arg => arg.startsWith('-getProperty:'))) {
            return result(probeOutput(input, `${input}-properties`));
        }
        const framework = args.find(arg => arg.startsWith('-p:TargetFramework='))?.slice('-p:TargetFramework='.length);
        return result(probeOutput(input, `${input}-items-${framework}`));
    };
}

function context(projectPath: string, revision = 'r1'): ProjectExecutionContext {
    return { projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision };
}

const row = (evaluated: InstalledResult, id: string): InstalledPackage[] => evaluated.packages.filter(pkg => pkg.id === id);

const ELSEWHERE = path.join(path.sep, 'elsewhere', 'Directory.Packages.props');
const cpmProject = path.join(INPUT_ROOTS.cpm, 'App', 'App.csproj');
const multitfmProject = fixture('multitfm', 'App', 'App.csproj');

/** Properties and items written as the msbuild JSON output. */
function properties(values: Record<string, string>): string {
    return JSON.stringify({ Properties: { TargetFramework: '', TargetFrameworks: '', ManagePackageVersionsCentrally: '', CentralPackageVersionOverrideEnabled: '', ...values } });
}
function items(references: Array<Record<string, string>>, versions: Array<Record<string, string>> = []): string {
    return JSON.stringify({ Items: { PackageReference: references, PackageVersion: versions } });
}

describe('MsBuildProjectEvaluator', () => {
    it('runs the properties run, then one item run per target framework, in the project directory, bound to no caller signal', async () => {
        const runner = fakeRunner(probeAnswer('multitfm'));
        const signal = new AbortController().signal;
        await new MsBuildProjectEvaluator({ runner }).evaluate(context(multitfmProject), signal);
        expect(runner.calls.map(call => call.args)).toEqual([
            ['msbuild', multitfmProject, '-nologo', ...PROPERTY_ARGS],
            msbuildGetArgs(multitfmProject, ['PackageReference', 'PackageVersion'], [], { TargetFramework: 'net8.0' }),
            msbuildGetArgs(multitfmProject, ['PackageReference', 'PackageVersion'], [], { TargetFramework: 'netstandard2.0' }),
        ]);
        for (const call of runner.calls) {
            expect(call.options).toMatchObject({ cwd: path.dirname(multitfmProject) });
            expect(call.options.signal).toBeUndefined();
            expect(call.options.timeoutMs).toBeGreaterThan(0);
        }
    });

    it('a cancellation by one caller does not cancel a later caller of the same revision: the runs continue and the second caller gets the result without a new run', async () => {
        let release!: () => void;
        const held = new Promise<void>(resolve => {
            release = resolve;
        });
        const answer = probeAnswer('multitfm');
        // Like DefaultDotnetRunner, a run whose signal is aborted ends as cancelled.
        const runner = fakeRunner(async (args, options) => {
            if (runner.calls.length === 1) {
                await held;
            }
            return options.signal?.aborted ? result('', { cancelled: true }) : answer(args, options);
        });
        const evaluator = new MsBuildProjectEvaluator({ runner });
        const first = new AbortController();
        const firstResult = evaluator.evaluate(context(multitfmProject), first.signal);
        first.abort();
        const secondResult = evaluator.evaluate(context(multitfmProject), new AbortController().signal);
        release();

        const [one, two] = await Promise.all([firstResult, secondResult]);
        expect(two).toBe(one);
        expect(two.fidelity).toBe('authoritative');
        expect(runner.calls).toHaveLength(3);
        expect(runner.calls.every(call => call.options.signal === undefined)).toBe(true);
    });

    it('a caller whose signal is already aborted starts no run and is not cached', async () => {
        const runner = fakeRunner(probeAnswer('cpm'));
        const evaluator = new MsBuildProjectEvaluator({ runner });
        const controller = new AbortController();
        controller.abort();
        await expect(evaluator.evaluate(context(cpmProject), controller.signal)).rejects.toBeInstanceOf(EvaluationError);
        expect(runner.calls).toHaveLength(0);
        expect(evaluator.cachedFidelity(cpmProject)).toBeUndefined();
        await expect(evaluator.evaluate(context(cpmProject))).resolves.toMatchObject({ fidelity: 'authoritative' });
        expect(runner.calls.length).toBeGreaterThan(0);
    });

    it('cpm: a versionless reference takes the central version and names Directory.Packages.props', async () => {
        const evaluated = await new MsBuildProjectEvaluator({ runner: fakeRunner(probeAnswer('cpm')) }).evaluate(context(cpmProject));
        const props = path.join(INPUT_ROOTS.cpm, 'Directory.Packages.props');
        expect(evaluated).toEqual({
            projectPath: cpmProject,
            fidelity: 'authoritative',
            isCpm: true,
            centralPropsPath: props,
            packages: [
                { id: 'Newtonsoft.Json', version: '13.0.3', versionType: 'standard', declaration: 'central', definedIn: props },
                { id: 'Serilog', version: '4.0.0', versionType: 'standard', declaration: 'central', definedIn: props },
            ],
        });
    });

    it('multitfm: StyleCop from Directory.Build.props is props in every framework, NETStandard.Library is implicit and netstandard2.0 only, System.Text.Json is project and netstandard2.0 only, Serilog is central-override 3.1.1, Newtonsoft.Json is central 13.0.3', async () => {
        const evaluated = await new MsBuildProjectEvaluator({ runner: fakeRunner(probeAnswer('multitfm')) }).evaluate(context(multitfmProject));
        const props = fixture('multitfm', 'Directory.Packages.props');
        expect(evaluated).toMatchObject({ projectPath: multitfmProject, fidelity: 'authoritative', isCpm: true, centralPropsPath: props });
        expect(evaluated.unsupported).toBeUndefined();
        expect(row(evaluated, 'StyleCop.Analyzers')).toEqual([
            { id: 'StyleCop.Analyzers', version: '1.2.0-beta.556', versionType: 'standard', declaration: 'props', definedIn: fixture('multitfm', 'Directory.Build.props') },
        ]);
        expect(row(evaluated, 'NETStandard.Library')).toEqual([{
            id: 'NETStandard.Library',
            version: '2.0.3',
            versionType: 'standard',
            declaration: 'props',
            definedIn: path.join(SDK_DIR, 'Sdks', 'Microsoft.NET.Sdk', 'targets', 'Microsoft.NET.Sdk.DefaultItems.props'),
            isImplicit: true,
            targetFrameworks: ['netstandard2.0'],
        }]);
        expect(row(evaluated, 'System.Text.Json')).toEqual([
            { id: 'System.Text.Json', version: '8.0.5', versionType: 'standard', declaration: 'project', targetFrameworks: ['netstandard2.0'] },
        ]);
        expect(row(evaluated, 'Serilog')).toEqual([{ id: 'Serilog', version: '3.1.1', versionType: 'standard', declaration: 'central-override' }]);
        expect(row(evaluated, 'Newtonsoft.Json')).toEqual([{ id: 'Newtonsoft.Json', version: '13.0.3', versionType: 'standard', declaration: 'central', definedIn: props }]);
        expect(evaluated.packages.map(pkg => pkg.id)).toHaveLength(5);
    });

    it('an override is unresolved when overrides are switched off', async () => {
        const runner = fakeRunner(args => args.some(arg => arg.startsWith('-getProperty:'))
            ? result(properties({ TargetFramework: 'net8.0', ManagePackageVersionsCentrally: 'true', CentralPackageVersionOverrideEnabled: 'false' }))
            : result(items([{ Identity: 'Serilog', VersionOverride: '3.1.1', DefiningProjectFullPath: cpmProject }], [{ Identity: 'Serilog', Version: '4.0.0', DefiningProjectFullPath: ELSEWHERE }])));
        const evaluated = await new MsBuildProjectEvaluator({ runner }).evaluate(context(cpmProject));
        expect(evaluated.packages).toEqual([{ id: 'Serilog', version: '', versionType: 'unresolved', declaration: 'unresolved' }]);
    });

    it('a property in a version or an override, and a reference without any version, is unresolved', async () => {
        const runner = fakeRunner(args => args.some(arg => arg.startsWith('-getProperty:'))
            ? result(properties({ TargetFramework: 'net8.0' }))
            : result(items([{ Identity: 'A', Version: '$(AVersion)' }, { Identity: 'B' }, { Identity: 'C', Version: '[1.0,2.0)' }])));
        const evaluated = await new MsBuildProjectEvaluator({ runner }).evaluate(context(cpmProject));
        expect(evaluated.isCpm).toBe(false);
        expect(evaluated.centralPropsPath).toBeUndefined();
        expect(evaluated.packages).toEqual([
            { id: 'A', version: '', versionType: 'unresolved', declaration: 'unresolved' },
            { id: 'B', version: '', versionType: 'unresolved', declaration: 'unresolved' },
            { id: 'C', version: '[1.0,2.0)', versionType: 'range', declaration: 'project' },
        ]);
    });

    it('one framework runs once, none runs once without a framework property', async () => {
        const one = fakeRunner(args => args.some(arg => arg.startsWith('-getProperty:')) ? result(properties({ TargetFramework: 'net8.0' })) : result(items([{ Identity: 'A', Version: '1.0.0' }])));
        const single = await new MsBuildProjectEvaluator({ runner: one }).evaluate(context(cpmProject));
        expect(one.calls).toHaveLength(2);
        expect(one.calls[1].args).toContain('-p:TargetFramework=net8.0');
        expect(single.packages).toEqual([{ id: 'A', version: '1.0.0', versionType: 'standard', declaration: 'project' }]);

        const none = fakeRunner(args => args.some(arg => arg.startsWith('-getProperty:')) ? result(properties({})) : result(items([{ Identity: 'A', Version: '1.0.0' }])));
        const unframed = await new MsBuildProjectEvaluator({ runner: none }).evaluate(context(cpmProject));
        expect(none.calls).toHaveLength(2);
        expect(none.calls[1].args.some(arg => arg.startsWith('-p:'))).toBe(false);
        expect(unframed.packages).toEqual([{ id: 'A', version: '1.0.0', versionType: 'standard', declaration: 'project' }]);
    });

    it('the same reference with different versions per framework is two rows', async () => {
        const runner = fakeRunner(args => {
            if (args.some(arg => arg.startsWith('-getProperty:'))) {
                return result(properties({ TargetFrameworks: 'net8.0;net9.0' }));
            }
            return result(items([{ Identity: 'A', Version: args.includes('-p:TargetFramework=net8.0') ? '8.0.0' : '9.0.0' }, { Identity: 'B', Version: '1.0.0' }]));
        });
        const evaluated = await new MsBuildProjectEvaluator({ runner }).evaluate(context(cpmProject));
        expect(evaluated.packages).toEqual([
            { id: 'A', version: '8.0.0', versionType: 'standard', declaration: 'project', targetFrameworks: ['net8.0'] },
            { id: 'B', version: '1.0.0', versionType: 'standard', declaration: 'project' },
            { id: 'A', version: '9.0.0', versionType: 'standard', declaration: 'project', targetFrameworks: ['net9.0'] },
        ]);
    });

    it('caches by revision: one evaluation for concurrent and later calls of one revision, a new revision evaluates again, cachedFidelity reports authoritative once an entry exists', async () => {
        const runner = fakeRunner(probeAnswer('cpm'));
        const evaluator = new MsBuildProjectEvaluator({ runner });
        expect(evaluator.cachedFidelity(cpmProject)).toBeUndefined();
        const [first, second] = await Promise.all([evaluator.evaluate(context(cpmProject)), evaluator.evaluate(context(cpmProject))]);
        expect(second).toBe(first);
        expect(await evaluator.evaluate(context(cpmProject))).toBe(first);
        expect(runner.calls).toHaveLength(2);
        expect(evaluator.cachedFidelity(cpmProject)).toBe('authoritative');
        // The key is the normalized path: another spelling of the same project shares the entry.
        expect(evaluator.cachedFidelity(normalizeProjectPath(cpmProject))).toBe('authoritative');

        const next = await evaluator.evaluate(context(cpmProject, 'r2'));
        expect(next).not.toBe(first);
        expect(next).toEqual(first);
        expect(runner.calls).toHaveLength(4);
    });

    it('a nonzero exit, a timeout, a cancellation and output without JSON reject and are not cached', async () => {
        const failures: Array<Partial<DotnetResult>> = [
            { exitCode: 1, stderr: 'error MSB1009: Project file does not exist.' },
            { exitCode: 0, timedOut: true },
            { exitCode: 0, cancelled: true },
            { exitCode: 0, stdout: 'net8.0' },
        ];
        for (const failure of failures) {
            const warn = vi.fn();
            let fail = true;
            const runner = fakeRunner((args, options) => fail ? result('', failure) : probeAnswer('cpm')(args, options));
            const evaluator = new MsBuildProjectEvaluator({ runner, logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() } });
            await expect(evaluator.evaluate(context(cpmProject))).rejects.toBeInstanceOf(EvaluationError);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(evaluator.cachedFidelity(cpmProject)).toBeUndefined();
            fail = false;
            await expect(evaluator.evaluate(context(cpmProject))).resolves.toMatchObject({ fidelity: 'authoritative' });
        }
    });

    it('parses the JSON after prefix lines', async () => {
        expect(parseJsonAfterPrefix('﻿warn : something first\r\n  {\r\n  "Properties": { "TargetFramework": "net8.0" }\r\n}\r\n')).toEqual({ Properties: { TargetFramework: 'net8.0' } });
        expect(parseJsonAfterPrefix('net8.0\n')).toBeUndefined();
        expect(parseJsonAfterPrefix('{ not json')).toBeUndefined();
        expect(parseJsonAfterPrefix('[]')).toBeUndefined();

        const runner = fakeRunner(args => args.some(arg => arg.startsWith('-getProperty:'))
            ? result(`MSBuild version 18.9.11\n${properties({ TargetFramework: 'net8.0' })}`)
            : result(`\n${items([{ Identity: 'A', Version: '1.0.0' }])}`));
        const evaluated = await new MsBuildProjectEvaluator({ runner }).evaluate(context(cpmProject));
        expect(evaluated.packages).toEqual([{ id: 'A', version: '1.0.0', versionType: 'standard', declaration: 'project' }]);
    });

    it('isCpm and centralPropsPath come from the properties and the PackageVersion items, else from the nearest props file', async () => {
        const scratch = await createScratchDir('evaluator');
        try {
            await writeTree(scratch.dir, { 'Directory.Packages.props': '<Project />', [path.join('App', 'App.csproj')]: '<Project />' });
            const project = path.join(scratch.dir, 'App', 'App.csproj');
            const answer = (versions: Array<Record<string, string>>, cpm: string): Answer => args => args.some(arg => arg.startsWith('-getProperty:'))
                ? result(properties({ TargetFramework: 'net8.0', ManagePackageVersionsCentrally: cpm }))
                : result(items([{ Identity: 'A', VersionOverride: '2.0.0' }], versions));

            const fromItems = await new MsBuildProjectEvaluator({ runner: fakeRunner(answer([{ Identity: 'A', Version: '1.0.0', DefiningProjectFullPath: ELSEWHERE }], 'true')), stopDirs: [scratch.dir] }).evaluate(context(project));
            expect(fromItems).toMatchObject({ isCpm: true, centralPropsPath: ELSEWHERE });
            expect(fromItems.packages).toEqual([{ id: 'A', version: '2.0.0', versionType: 'standard', declaration: 'central-override' }]);

            const fromFile = await new MsBuildProjectEvaluator({ runner: fakeRunner(answer([], 'true')), stopDirs: [scratch.dir] }).evaluate(context(project));
            expect(fromFile).toMatchObject({ isCpm: true, centralPropsPath: path.join(scratch.dir, 'Directory.Packages.props') });

            const notCpm = await new MsBuildProjectEvaluator({ runner: fakeRunner(answer([], 'false')), stopDirs: [scratch.dir] }).evaluate(context(project));
            expect(notCpm.isCpm).toBe(false);
            expect(notCpm.centralPropsPath).toBeUndefined();
            // Without CPM a VersionOverride means nothing, and the reference has no version of its own.
            expect(notCpm.packages).toEqual([{ id: 'A', version: '', versionType: 'unresolved', declaration: 'unresolved' }]);
        } finally {
            await scratch.cleanup();
        }
    });

    it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('evaluates the multitfm fixture with the real SDK', async () => {
        const real = new DefaultDotnetRunner({ resolveExecutable: () => resolveDotnetExecutable() });
        const run = vi.spyOn(real, 'run');
        const evaluator = new MsBuildProjectEvaluator({ runner: real, stopDirs: [fixture('multitfm')] });
        const evaluated = await evaluator.evaluate(context(multitfmProject));
        expect(evaluated).toMatchObject({ fidelity: 'authoritative', isCpm: true });
        expect(normalizeProjectPath(evaluated.centralPropsPath ?? '')).toBe(normalizeProjectPath(fixture('multitfm', 'Directory.Packages.props')));
        const [styleCop] = row(evaluated, 'StyleCop.Analyzers');
        expect(styleCop).toMatchObject({ version: '1.2.0-beta.556', declaration: 'props' });
        expect(normalizeProjectPath(styleCop.definedIn ?? '')).toBe(normalizeProjectPath(fixture('multitfm', 'Directory.Build.props')));
        expect(styleCop.targetFrameworks).toBeUndefined();
        const [netStandard] = row(evaluated, 'NETStandard.Library');
        expect(netStandard).toMatchObject({ declaration: 'props', isImplicit: true, targetFrameworks: ['netstandard2.0'] });
        expect(netStandard.definedIn?.endsWith('Microsoft.NET.Sdk.DefaultItems.props')).toBe(true);
        expect(row(evaluated, 'System.Text.Json')).toEqual([{ id: 'System.Text.Json', version: '8.0.5', versionType: 'standard', declaration: 'project', targetFrameworks: ['netstandard2.0'] }]);
        expect(row(evaluated, 'Serilog')).toEqual([{ id: 'Serilog', version: '3.1.1', versionType: 'standard', declaration: 'central-override' }]);
        expect(row(evaluated, 'Newtonsoft.Json')).toMatchObject([{ version: '13.0.3', declaration: 'central' }]);

        const runs = run.mock.calls.length;
        await evaluator.evaluate(context(multitfmProject));
        expect(run.mock.calls.length).toBe(runs);
    }, 60_000);
});
