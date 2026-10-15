import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { DotnetResult, DotnetRunOptions, DotnetRunner, Logger, MutationDecision, OperationRunContext, ProjectExecutionContext, ProjectInspector, ProjectMutator, SdkInfo } from '../contracts';
import type { InstalledResult, OperationProgress, StepOutcome } from '../../protocol/domain';
import { DefaultDotnetRunner, DotnetSpawnError, resolveDotnetExecutable, sdkInfoFromVersion } from '../cli';
import { AssetsReader, DefaultProjectMutator, ProjectContextProvider, SDK_TOO_OLD_MESSAGE, StaticProjectInspector } from '../project';
import { createScratchDir } from '../project/__fixtures__/scratch';
import { DotnetSourceProvider } from '../sources';
import { normalizeProjectPath } from '../util/paths';
import { outcomeStatus, PackageWorkflows, stepStatus, type WorkflowDeps } from './PackageWorkflows';

const sdk10 = sdkInfoFromVersion('10.0.401')!;
const sdk8 = sdkInfoFromVersion('8.0.425')!;

type Script = (args: string[]) => Partial<DotnetResult> | Promise<Partial<DotnetResult>>;

interface RunnerHooks {
    sdkVersion?: DotnetRunner['sdkVersion'];
    /** Runs after the result of a command is fixed, so an abort here leaves that command successful. */
    afterRun?: (args: string[]) => void;
}

function makeRunner(script: Script, hooks: RunnerHooks = {}): DotnetRunner & { calls: string[][]; options: DotnetRunOptions[] } {
    const calls: string[][] = [];
    const options: DotnetRunOptions[] = [];
    return {
        calls,
        options,
        async run(args, runOptions) {
            calls.push(args);
            options.push(runOptions);
            const partial = await script(args);
            const result: DotnetResult = runOptions.signal?.aborted
                ? { exitCode: -1, stdout: '', stderr: '', durationMs: 0, argv: ['dotnet', ...args], cancelled: true }
                : { exitCode: 0, stdout: '', stderr: '', durationMs: 1, argv: ['dotnet', ...args], ...partial };
            hooks.afterRun?.(args);
            return result;
        },
        sdkVersion: hooks.sdkVersion ?? (async () => sdk10),
        clearSdkCache() { /* no-op */ },
    };
}

function makeDeps(overrides: Partial<WorkflowDeps> & Pick<WorkflowDeps, 'runner'>): WorkflowDeps {
    return {
        packageDependencies: async () => new Map(),
        projectDependencies: async () => new Map(),
        mutator: admitting({ ok: true, isCpm: false }),
        contextFor: async projectPath => contextOf(projectPath),
        ...overrides,
    };
}

/** The context a decision sees: `'none'` is a context whose SDK could not be detected. */
function contextOf(projectPath: string, sdk: SdkInfo | 'none' = sdk10): ProjectExecutionContext {
    const context: ProjectExecutionContext = { projectPath, projectDir: path.dirname(projectPath), configFiles: [], sourceUrls: [], revision: 'r' };
    if (sdk !== 'none') {
        context.sdk = sdk;
    }
    return context;
}

/** A mutator that admits every edit with `decision`, and previews nothing. */
function admitting(decision: Extract<MutationDecision, { ok: true }>, preview: ProjectMutator['previewCpmImpact'] = async () => undefined) {
    return { canMutate: vi.fn<ProjectMutator['canMutate']>(async () => decision), previewCpmImpact: vi.fn<ProjectMutator['previewCpmImpact']>(preview) } satisfies ProjectMutator;
}

/** A mutator that refuses every edit with `error`. */
function refusing(error: string) {
    return { canMutate: vi.fn<ProjectMutator['canMutate']>(async () => ({ ok: false, error })), previewCpmImpact: vi.fn<ProjectMutator['previewCpmImpact']>(async () => undefined) } satisfies ProjectMutator;
}

/** The real mutator over a scripted inspection. */
function realMutator(result: (projectPath: string) => InstalledResult = projectPath => ({ projectPath, packages: [], fidelity: 'provisional', isCpm: false })) {
    const inspector = { inspect: vi.fn<ProjectInspector['inspect']>(async projectPath => result(projectPath)) };
    return { inspector, mutator: new DefaultProjectMutator({ inspector, isDirty: () => false, discoverProjects: async () => [] }) };
}

function makeContext(controller = new AbortController()): OperationRunContext & { reports: Array<Omit<OperationProgress, 'opId'>>; controller: AbortController } {
    const reports: Array<Omit<OperationProgress, 'opId'>> = [];
    return { opId: 'op-1', signal: controller.signal, report: p => { reports.push(p); }, reports, controller };
}

function fakeLogger() {
    return {
        trace: vi.fn<Logger['trace']>(),
        debug: vi.fn<Logger['debug']>(),
        info: vi.fn<Logger['info']>(),
        warn: vi.fn<Logger['warn']>(),
        error: vi.fn<Logger['error']>(),
    } satisfies Logger;
}

const isRestore = (args: string[]) => args[0] === 'restore';
const isAdd = (args: string[]) => args[0] === 'package' && args[1] === 'add';
const isRemove = (args: string[]) => args[0] === 'package' && args[1] === 'remove';
/** `package add|remove <id> --project <path>` and `restore <path>`. */
const idOf = (args: string[]) => args[2];
const projectOf = (args: string[]) => isRestore(args) ? args[1] : args[4];

const app = '/w/App/App.csproj';
const projectA = '/w/A/A.csproj';
const projectB = '/w/B/B.csproj';
/** `projectDependencies` answers with normalized paths, which differ from the given ones on Windows. */
const dependsOn = (dependent: string, dependency: string) => new Map([[normalizeProjectPath(dependent), [normalizeProjectPath(dependency)]]]);
const sdkRefusal = 'requires .NET SDK 10 or newer';

describe('PackageWorkflows.single', () => {
    it('installs then restores and reports both steps', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const ctx = makeContext();
        const outcome = await workflows.single(ctx, { kind: 'install', projectPath: app, packageId: 'Newtonsoft.Json', version: '13.0.3' }, { skipRestore: false });
        expect(outcome).toMatchObject({ status: 'completed', kind: 'install', packageId: 'Newtonsoft.Json', edit: { ok: true }, restore: { ok: true } });
        expect(runner.calls[0]).toEqual(['package', 'add', 'Newtonsoft.Json', '--project', app, '--version', '13.0.3', '--no-restore']);
        expect(runner.calls[1]).toEqual(['restore', app]);
        expect(ctx.reports.map(r => r.status)).toEqual(['running', 'restoring']);
    });

    it('skips restore when the toggle is off and marks the step skipped', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(makeContext(), { kind: 'remove', projectPath: app, packageId: 'X' }, { skipRestore: true });
        expect(outcome.status).toBe('completed');
        expect(outcome.restore).toEqual({ ok: true, skipped: true });
        expect(runner.calls).toHaveLength(1);
        expect(runner.calls[0]).toEqual(['package', 'remove', 'X', '--project', app]);
    });

    it('reports a failed edit from the exit code with a summarized error and does not restore', async () => {
        const runner = makeRunner(args => isAdd(args) ? { exitCode: 1, stderr: 'error NU1101: Unable to find package Nope. No packages exist\nmore noise' } : {});
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'Nope' }, { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(outcome.edit).toEqual({ ok: false, error: 'error NU1101: Unable to find package Nope. No packages exist' });
        expect(outcome.restore).toBeUndefined();
        expect(runner.calls.some(isRestore)).toBe(false);
    });

    it('reports partial when the edit succeeds but restore fails', async () => {
        const runner = makeRunner(args => isRestore(args) ? { exitCode: 1, stderr: 'error NU1605: downgrade' } : {});
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(makeContext(), { kind: 'update', projectPath: app, packageId: 'X', version: '2.0.0' }, { skipRestore: false });
        expect(outcome.status).toBe('partial');
        expect(outcome.edit?.ok).toBe(true);
        expect(outcome.restore).toEqual({ ok: false, error: 'error NU1605: downgrade' });
        expect(outcome.message).toBe('error NU1605: downgrade');
    });

    it('rejects invalid package ids without spawning anything', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'bad id; rm -rf /' }, { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(outcome.edit?.ok).toBe(false);
        expect(runner.calls).toHaveLength(0);
    });

    it('returns cancelled when the signal aborts during the edit', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => { ctx.controller.abort(); return {}; });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(ctx, { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome.status).toBe('cancelled');
        expect(runner.calls.some(isRestore)).toBe(false);
    });

    it('returns cancelled when the signal aborts during the restore', async () => {
        const ctx = makeContext();
        const runner = makeRunner(args => { if (isRestore(args)) { ctx.controller.abort(); } return {}; });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(ctx, { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome.status).toBe('cancelled');
        expect(outcome.edit).toEqual({ ok: true });
        expect(outcome.restore).toEqual({ ok: false, error: 'cancelled' });
    });

    it('forwards the CLI transcript to onCommand', async () => {
        const runner = makeRunner(() => ({ stdout: 'ok' }));
        const onCommand = vi.fn();
        const workflows = new PackageWorkflows(makeDeps({ runner, onCommand }));
        await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: true });
        expect(onCommand).toHaveBeenCalledWith(['dotnet', 'package', 'add', 'X', '--project', app, '--no-restore'], 0, 'ok', '', 1);
    });

    it('cancel between edit and restore yields cancelled', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => ({}), { afterRun: () => { ctx.controller.abort(); } });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(ctx, { kind: 'install', projectPath: app, packageId: 'X', version: '1.0.0' }, { skipRestore: false });
        expect(outcome.status).toBe('cancelled');
        expect(outcome.edit).toEqual({ ok: true });
        expect(outcome.restore).toEqual({ ok: false, skipped: true, error: 'cancelled' });
        expect(runner.calls).toEqual([['package', 'add', 'X', '--project', app, '--version', '1.0.0', '--no-restore']]);
    });

    it('a cancel after the edit with the restore switched off is completed', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => ({}), { afterRun: () => { ctx.controller.abort(); } });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(ctx, { kind: 'install', projectPath: app, packageId: 'X', version: '1.0.0' }, { skipRestore: true });
        expect(outcome.status).toBe('completed');
        expect(outcome.edit).toEqual({ ok: true });
        expect(outcome.restore).toEqual({ ok: true, skipped: true });
        expect(runner.calls).toHaveLength(1);
        expect(ctx.reports.map(r => r.status)).toEqual(['running']);
    });

    it('a spawn rejection becomes a failed edit and nothing is thrown', async () => {
        const cause = Object.assign(new Error('spawn dotnet EACCES'), { code: 'EACCES' });
        const runner = makeRunner(() => { throw new DotnetSpawnError('Could not start "dotnet" (EACCES).', 'dotnet', cause); });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(outcome.edit).toEqual({ ok: false, error: 'Could not start "dotnet" (EACCES).' });
        expect(outcome.restore).toBeUndefined();
        expect(outcome.message).toBe('Could not start "dotnet" (EACCES).');
    });

    it('a spawn rejection of the restore leaves the edit reported and the outcome partial', async () => {
        const runner = makeRunner(args => { if (isRestore(args)) { throw new Error('spawn failed'); } return {}; });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.single(makeContext(), { kind: 'remove', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome).toMatchObject({ status: 'partial', edit: { ok: true }, restore: { ok: false, error: 'spawn failed' } });
    });

    it('reports a timed-out edit as failed and a timed-out restore as partial', async () => {
        const editTimeout = makeRunner(args => isAdd(args) ? { timedOut: true, exitCode: -1 } : {});
        const first = await new PackageWorkflows(makeDeps({ runner: editTimeout })).single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(first.status).toBe('failed');
        expect(first.edit).toEqual({ ok: false, error: 'dotnet timed out after 120s' });
        expect(editTimeout.calls.some(isRestore)).toBe(false);

        const restoreTimeout = makeRunner(args => isRestore(args) ? { timedOut: true, exitCode: -1 } : {});
        const second = await new PackageWorkflows(makeDeps({ runner: restoreTimeout })).single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(second.status).toBe('partial');
        expect(second.restore).toEqual({ ok: false, error: 'dotnet restore timed out after 120s' });
        // Both steps run with the 120 s limit; the restore limit is the CLI module's constant.
        expect(restoreTimeout.options.map(o => o.timeoutMs)).toEqual([120_000, 120_000]);
        expect(restoreTimeout.options.map(o => o.cwd)).toEqual(['/w/App', '/w/App']);
    });

    it('passes --source and hands onCommand the URL without its userinfo', async () => {
        const runner = makeRunner(() => ({}));
        const onCommand = vi.fn();
        const workflows = new PackageWorkflows(makeDeps({ runner, onCommand }));
        const sourceUrl = 'https://user:s3cret@feed.example/v3/index.json';
        await workflows.single(makeContext(), { kind: 'update', projectPath: app, packageId: 'X', version: '2.0.0', sourceUrl }, { skipRestore: true });
        expect(runner.calls[0]).toEqual(['package', 'add', 'X', '--project', app, '--version', '2.0.0', '--source', sourceUrl, '--no-restore']);
        const loggedArgv = onCommand.mock.calls[0][0] as string[];
        expect(loggedArgv).toContain('https://[REDACTED]@feed.example/v3/index.json');
        expect(loggedArgv.join(' ')).not.toContain('s3cret');
    });

    it('redacts the transcript and the reported error before they leave the workflow', async () => {
        const stderr = 'error: push failed, retry with --password hunter2\nAuthorization: Bearer abc.def.ghi';
        const runner = makeRunner(() => ({ exitCode: 1, stdout: 'feed https://bob:pw@feed.example/ rejected', stderr }));
        const onCommand = vi.fn();
        const workflows = new PackageWorkflows(makeDeps({ runner, onCommand }));
        const outcome = await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        const [, exitCode, loggedStdout, loggedStderr] = onCommand.mock.calls[0] as [string[], number, string, string, number];
        expect(exitCode).toBe(1);
        expect(loggedStdout).toBe('feed https://[REDACTED]@feed.example/ rejected');
        expect(loggedStderr).toContain('--password [REDACTED]');
        expect(loggedStderr).not.toContain('hunter2');
        expect(loggedStderr).not.toContain('abc.def.ghi');
        expect(outcome.edit?.error).toContain('--password [REDACTED]');
        expect(outcome.edit?.error).not.toContain('hunter2');
        expect(outcome.message).not.toContain('hunter2');
    });

    it('a throwing onCommand does not change the outcome', async () => {
        const runner = makeRunner(() => ({}));
        const logger = fakeLogger();
        const onCommand = vi.fn(() => { throw new Error('output channel closed, token=abc123'); });
        const workflows = new PackageWorkflows(makeDeps({ runner, onCommand, logger }));
        const outcome = await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome).toMatchObject({ status: 'completed', edit: { ok: true }, restore: { ok: true } });
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.warn.mock.calls[0][0]).toBe('Command transcript hook failed: output channel closed, token=[REDACTED]');
    });
});

describe('PackageWorkflows admission (D7, D13)', () => {
    it('a refusal of the mutator is the edit\'s outcome and nothing is spawned', async () => {
        const runner = makeRunner(() => ({}));
        const mutator = refusing('refused for the test');
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator }));
        for (const kind of ['install', 'update'] as const) {
            const outcome = await workflows.single(makeContext(), { kind, projectPath: app, packageId: 'X', version: '2.0.0' }, { skipRestore: false });
            expect(outcome.status).toBe('failed');
            expect(outcome.edit).toEqual({ ok: false, error: 'refused for the test' });
            expect(outcome.restore).toBeUndefined();
            expect(outcome.message).toBe('refused for the test');
        }
        expect(mutator.canMutate).toHaveBeenCalledTimes(2);
        expect(mutator.canMutate).toHaveBeenCalledWith(contextOf(app), { kind: 'install', packageId: 'X', version: '2.0.0' });
        expect(mutator.previewCpmImpact).not.toHaveBeenCalled();
        expect(runner.calls).toEqual([]);
    });

    it('cpm: never emits --no-restore', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator: admitting({ ok: true, isCpm: true }) }));
        const options = { skipRestore: false };
        await workflows.single(makeContext(), { kind: 'install', projectPath: projectA, packageId: 'X', version: '1.0.0' }, options);
        await workflows.single(makeContext(), { kind: 'update', projectPath: projectA, packageId: 'X', version: '2.0.0' }, options);
        await workflows.single(makeContext(), { kind: 'remove', projectPath: projectA, packageId: 'X' }, options);
        await workflows.bulkInstall(makeContext(), [projectA, projectB], 'X', '1.0.0', options);
        await workflows.bulkUpdate(makeContext(), projectA, [{ id: 'X', version: '2.0.0' }, { id: 'Y', version: '2.0.0' }], options);
        await workflows.bulkRemove(makeContext(), projectA, ['X', 'Y'], options);
        await workflows.bulkUpdateAllProjects(makeContext(), [{ projectPath: projectA, packages: [{ id: 'X', version: '2.0.0' }] }, { projectPath: projectB, packages: [{ id: 'X', version: '2.0.0' }] }], options);
        await workflows.bulkRemoveAllProjects(makeContext(), [{ projectPath: projectA, packages: ['X'] }, { projectPath: projectB, packages: ['X'] }], options);
        await workflows.restore(makeContext(), [projectA, projectB]);

        expect(runner.calls.flat()).not.toContain('--no-restore');
        // Not vacuous: every CPM add and remove did run, and so did the restores.
        const adds = runner.calls.filter(isAdd);
        expect(adds).toHaveLength(8);
        for (const args of adds) {
            expect(args.slice(-2)[0]).toBe('--version');
        }
        expect(runner.calls.filter(isRemove)).toHaveLength(5);
        expect(runner.calls.filter(isRestore)).toHaveLength(13);
    });

    it('cpm: remove is allowed and followed by the restore', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator: admitting({ ok: true, isCpm: true }) }));
        const outcome = await workflows.single(makeContext(), { kind: 'remove', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome).toMatchObject({ status: 'completed', edit: { ok: true }, restore: { ok: true } });
        expect(runner.calls).toEqual([['package', 'remove', 'X', '--project', app], ['restore', app]]);
    });

    it('remove asks for no preview', async () => {
        const runner = makeRunner(() => ({}));
        const mutator = admitting({ ok: true, isCpm: true });
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator }));
        await workflows.single(makeContext(), { kind: 'remove', projectPath: app, packageId: 'X' }, { skipRestore: true });
        await workflows.bulkRemove(makeContext(), app, ['X', 'Y'], { skipRestore: true });
        expect(mutator.previewCpmImpact).not.toHaveBeenCalled();
        expect(runner.calls.filter(isRemove)).toHaveLength(3);
    });

    it('requires .NET SDK 10 or newer', async () => {
        const runner = makeRunner(() => ({}));
        const { inspector, mutator } = realMutator();
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator, contextFor: async projectPath => contextOf(projectPath, sdk8) }));
        for (const kind of ['install', 'update', 'remove'] as const) {
            const outcome = await workflows.single(makeContext(), { kind, projectPath: app, packageId: 'X', version: kind === 'remove' ? undefined : '2.0.0' }, { skipRestore: false });
            expect(outcome.status).toBe('failed');
            expect(outcome.edit?.error).toBe(sdkRefusal);
            expect(outcome.edit).toEqual({ ok: false, error: sdkRefusal });
            expect(outcome.restore).toBeUndefined();
        }
        expect(runner.calls).toEqual([]);
        // The SDK floor is decided before the project is inspected.
        expect(inspector.inspect).not.toHaveBeenCalled();
    });

    it('refuses when the SDK cannot be detected', async () => {
        const undetected = makeRunner(() => ({}));
        const first = await new PackageWorkflows(makeDeps({ runner: undetected, mutator: realMutator().mutator, contextFor: async projectPath => contextOf(projectPath, 'none') }))
            .single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(first.status).toBe('failed');
        expect(first.edit).toEqual({ ok: false, error: 'could not detect the .NET SDK for this project' });
        expect(undetected.calls).toEqual([]);

        const rejecting = makeRunner(() => ({}));
        const second = await new PackageWorkflows(makeDeps({ runner: rejecting, contextFor: async () => { throw new Error('probe crashed, apikey=abc123'); } }))
            .single(makeContext(), { kind: 'remove', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(second.status).toBe('failed');
        expect(second.edit?.error).toBe('could not build the execution context for this project: probe crashed, apikey=[REDACTED]');
        expect(rejecting.calls).toEqual([]);
    });

    it('asks for the context of the edited project', async () => {
        const contextFor = vi.fn(async (projectPath: string) => contextOf(projectPath, sdk10));
        const mutator = admitting({ ok: true, isCpm: false });
        const runner = makeRunner(() => ({}));
        await new PackageWorkflows(makeDeps({ runner, contextFor, mutator })).single(makeContext(), { kind: 'remove', projectPath: app, packageId: 'X' }, { skipRestore: true });
        expect(contextFor).toHaveBeenCalledWith(app);
        expect(mutator.canMutate.mock.calls[0][0]).toMatchObject({ projectPath: app, projectDir: path.dirname(app) });
    });

    it('refuses the edit when the project cannot be inspected', async () => {
        const runner = makeRunner(() => ({}));
        const { mutator } = realMutator(projectPath => ({ projectPath, packages: [], fidelity: 'provisional', isCpm: false, unsupported: { reason: 'parse-failed', message: 'the project file or an imported props file could not be read or parsed' } }));
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator }));
        const outcome = await workflows.single(makeContext(), { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(outcome.edit?.error).toBe('the project could not be inspected: the project file or an imported props file could not be read or parsed');
        expect(runner.calls).toEqual([]);
    });

    it('restore is gated neither by the SDK floor nor by CPM', async () => {
        const contextFor = vi.fn(async (projectPath: string) => contextOf(projectPath, sdk8));
        const mutator = admitting({ ok: true, isCpm: true });
        const runner = makeRunner(() => ({}));
        const outcome = await new PackageWorkflows(makeDeps({ runner, contextFor, mutator })).restore(makeContext(), [projectA, projectB]);
        expect(outcome.status).toBe('completed');
        expect(runner.calls).toEqual([['restore', projectA], ['restore', projectB]]);
        expect(contextFor).not.toHaveBeenCalled();
        expect(mutator.canMutate).not.toHaveBeenCalled();
        expect(mutator.previewCpmImpact).not.toHaveBeenCalled();
    });

    it('never deletes central entry on single uninstall', async () => {
        const scratch = await createScratchDir('workflows-cpm');
        try {
            const input = path.join(__dirname, '..', 'cli', '__fixtures__', 'sdk-probes', 'cpm');
            fs.cpSync(input, scratch.dir, { recursive: true });
            const project = path.join(scratch.dir, 'App', 'App.csproj');
            const props = path.join(scratch.dir, 'Directory.Packages.props');
            const before = fs.readFileSync(props);
            const mutator = new DefaultProjectMutator({ inspector: new StaticProjectInspector({ assets: new AssetsReader(), stopDirs: [scratch.dir] }), isDirty: () => false, discoverProjects: async () => [{ name: 'App.csproj', path: project }] });
            const preview = vi.spyOn(mutator, 'previewCpmImpact');
            const runner = makeRunner(() => ({}));
            const outcome = await new PackageWorkflows(makeDeps({ runner, mutator })).single(makeContext(), { kind: 'remove', projectPath: project, packageId: 'Serilog' }, { skipRestore: false });
            expect(outcome).toMatchObject({ status: 'completed', edit: { ok: true }, restore: { ok: true } });
            expect(outcome.affectedProjects).toBeUndefined();
            expect(runner.calls).toEqual([['package', 'remove', 'Serilog', '--project', project], ['restore', project]]);
            expect(preview).not.toHaveBeenCalled();
            expect(fs.readFileSync(props).equals(before)).toBe(true);
        } finally {
            await scratch.cleanup();
        }
    });

    it('cpm: a verified SDK 10 add runs without --no-restore, its preview is taken before the edit, and the consumers are restored once and listed as affectedProjects', async () => {
        const order: string[] = [];
        const runner = makeRunner(args => { order.push(args.join(' ')); return {}; });
        const mutator = admitting({ ok: true, isCpm: true }, async (_context, packageId, toVersion) => {
            order.push('preview');
            return { centralPropsPath: '/w/Directory.Packages.props', packageId, fromVersion: '1.0.0', toVersion, affectedProjects: [projectA, projectB, app, projectB] };
        });
        const ctx = makeContext();
        const outcome = await new PackageWorkflows(makeDeps({ runner, mutator })).single(ctx, { kind: 'update', projectPath: projectA, packageId: 'X', version: '2.0.0' }, { skipRestore: false });
        expect(order).toEqual(['preview', `package add X --project ${projectA} --version 2.0.0`, `restore ${projectA}`, `restore ${projectB}`, `restore ${app}`]);
        expect(outcome).toMatchObject({ status: 'completed', edit: { ok: true }, restore: { ok: true }, affectedProjects: [projectB, app] });
        expect(mutator.previewCpmImpact).toHaveBeenCalledWith(contextOf(projectA), 'X', '2.0.0');
        expect(ctx.reports.filter(r => r.status === 'restoring').map(r => r.projectPaths)).toEqual([[projectA], [projectB], [app]]);
    });

    it('cpm: a failed consumer restore ends partial and names the project', async () => {
        const runner = makeRunner(args => isRestore(args) && args[1] === projectB ? { exitCode: 1, stderr: 'error NU1101: unable to find package' } : {});
        const mutator = admitting({ ok: true, isCpm: true }, async (_context, packageId, toVersion) => ({ centralPropsPath: '/w/Directory.Packages.props', packageId, toVersion, affectedProjects: [projectA, projectB] }));
        const outcome = await new PackageWorkflows(makeDeps({ runner, mutator })).single(makeContext(), { kind: 'update', projectPath: projectA, packageId: 'X', version: '2.0.0' }, { skipRestore: false });
        expect(outcome.status).toBe('partial');
        expect(outcome.restore).toEqual({ ok: false, error: 'B.csproj: error NU1101: unable to find package' });
        expect(outcome.affectedProjects).toEqual([projectB]);
    });

    it('cpm: consumer restores follow the restore option', async () => {
        const runner = makeRunner(() => ({}));
        const mutator = admitting({ ok: true, isCpm: true }, async (_context, packageId, toVersion) => ({ centralPropsPath: '/w/Directory.Packages.props', packageId, toVersion, affectedProjects: [projectB] }));
        const outcome = await new PackageWorkflows(makeDeps({ runner, mutator })).single(makeContext(), { kind: 'update', projectPath: projectA, packageId: 'X', version: '2.0.0' }, { skipRestore: true });
        expect(outcome).toMatchObject({ status: 'completed', restore: { ok: true, skipped: true }, affectedProjects: [projectB] });
        expect(runner.calls).toEqual([['package', 'add', 'X', '--project', projectA, '--version', '2.0.0']]);
    });

    it('cpm: a preview that fails refuses the edit', async () => {
        const runner = makeRunner(() => ({}));
        const mutator = admitting({ ok: true, isCpm: true }, async () => { throw new Error('props unreadable, password=hunter2'); });
        const outcome = await new PackageWorkflows(makeDeps({ runner, mutator })).single(makeContext(), { kind: 'update', projectPath: projectA, packageId: 'X', version: '2.0.0' }, { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(outcome.edit).toEqual({ ok: false, error: 'could not preview the Central Package Management impact: props unreadable, password=[REDACTED]' });
        expect(runner.calls).toEqual([]);
    });

    it('cpm: a cancel after the edited project\'s restore marks the consumer restores skipped', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => ({}), { afterRun: args => { if (isRestore(args)) { ctx.controller.abort(); } } });
        const mutator = admitting({ ok: true, isCpm: true }, async (_context, packageId, toVersion) => ({ centralPropsPath: '/w/Directory.Packages.props', packageId, toVersion, affectedProjects: [projectB] }));
        const outcome = await new PackageWorkflows(makeDeps({ runner, mutator })).single(ctx, { kind: 'update', projectPath: projectA, packageId: 'X', version: '2.0.0' }, { skipRestore: false });
        expect(outcome.status).toBe('cancelled');
        expect(outcome.restore).toEqual({ ok: false, skipped: true, error: 'cancelled' });
        expect(runner.calls.filter(isRestore)).toEqual([['restore', projectA]]);
    });

    it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('cpm (SDK 10): an update writes the central version to Directory.Packages.props without --no-restore and a remove keeps the entry', async () => {
        const scratch = await createScratchDir('workflows-sdk');
        try {
            fs.cpSync(path.join(__dirname, '..', 'cli', '__fixtures__', 'sdk-probes', 'cpm'), scratch.dir, { recursive: true });
            const project = path.join(scratch.dir, 'App', 'App.csproj');
            const props = path.join(scratch.dir, 'Directory.Packages.props');
            const runner = new DefaultDotnetRunner({ resolveExecutable: () => resolveDotnetExecutable() });
            const contexts = new ProjectContextProvider({ runner, sources: new DotnetSourceProvider({ runner }), stopDirs: [scratch.dir] });
            const mutator = new DefaultProjectMutator({ inspector: new StaticProjectInspector({ assets: new AssetsReader(), stopDirs: [scratch.dir] }), isDirty: () => false, discoverProjects: async () => [{ name: 'App.csproj', path: project }] });
            const argv: string[][] = [];
            const workflows = new PackageWorkflows({
                runner,
                mutator,
                contextFor: async projectPath => (await contexts.get(projectPath, undefined, { configChain: false })).context,
                packageDependencies: async () => new Map(),
                projectDependencies: async () => new Map(),
                onCommand: args => { argv.push(args); },
            });

            const updated = await workflows.single(makeContext(), { kind: 'update', projectPath: project, packageId: 'Serilog', version: '4.1.0' }, { skipRestore: true });
            expect(updated.edit, updated.message).toEqual({ ok: true });
            expect(fs.readFileSync(props, 'utf8')).toContain('Include="Serilog" Version="4.1.0"');
            expect(fs.readFileSync(project, 'utf8')).not.toMatch(/Include="Serilog"[^>]*Version/);
            expect(argv.flat()).not.toContain('--no-restore');

            const removed = await workflows.single(makeContext(), { kind: 'remove', projectPath: project, packageId: 'Serilog' }, { skipRestore: true });
            expect(removed.edit, removed.message).toEqual({ ok: true });
            expect(fs.readFileSync(project, 'utf8')).not.toContain('Include="Serilog"');
            expect(fs.readFileSync(props, 'utf8')).toContain('Include="Serilog"');
        } finally {
            await scratch.cleanup();
        }
    }, 300_000);
});

describe('PackageWorkflows bulk', () => {
    it('bulkUpdate orders packages dependencies-first and restores once', async () => {
        const runner = makeRunner(() => ({}));
        const packageDependencies = vi.fn(async () => new Map([['dependent', ['base']]]));
        const workflows = new PackageWorkflows(makeDeps({ runner, packageDependencies }));
        const outcome = await workflows.bulkUpdate(makeContext(), projectA, [{ id: 'Dependent', version: '2.0.0' }, { id: 'Base', version: '2.0.0' }], { skipRestore: false });
        const adds = runner.calls.filter(isAdd).map(idOf);
        expect(adds).toEqual(['Base', 'Dependent']);
        expect(runner.calls.filter(isRestore)).toHaveLength(1);
        expect(outcome.status).toBe('completed');
        expect(outcome.results).toHaveLength(2);
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: true }]);
    });

    it('bulkRemove orders dependents-first and reports partial when one removal fails', async () => {
        const runner = makeRunner(args => isRemove(args) && idOf(args) === 'Base' ? { exitCode: 1, stderr: 'error: cannot remove' } : {});
        const packageDependencies = vi.fn(async () => new Map([['dependent', ['base']]]));
        const workflows = new PackageWorkflows(makeDeps({ runner, packageDependencies }));
        const outcome = await workflows.bulkRemove(makeContext(), projectA, ['Base', 'Dependent'], { skipRestore: false });
        expect(runner.calls.filter(isRemove).map(idOf)).toEqual(['Dependent', 'Base']);
        expect(outcome.status).toBe('partial');
        expect(outcome.results.map(r => r.status)).toEqual(['completed', 'failed']);
        expect(outcome.restores).toHaveLength(1);
    });

    it('bulkInstall orders projects dependencies-first and restores each changed project', async () => {
        const runner = makeRunner(() => ({}));
        const projectDependencies = vi.fn(async () => dependsOn(projectB, projectA));
        const workflows = new PackageWorkflows(makeDeps({ runner, projectDependencies }));
        const outcome = await workflows.bulkInstall(makeContext(), [projectB, projectA], 'X', '1.0.0', { skipRestore: false });
        expect(runner.calls.filter(isAdd).map(projectOf)).toEqual([projectA, projectB]);
        expect(runner.calls.filter(isRestore).map(projectOf)).toEqual([projectA, projectB]);
        expect(runner.calls[0]).toEqual(['package', 'add', 'X', '--project', projectA, '--version', '1.0.0', '--no-restore']);
        expect(outcome.status).toBe('completed');
    });

    it('bulkInstall with every edit failing is failed and never restores', async () => {
        const runner = makeRunner(() => ({ exitCode: 1, stderr: 'error' }));
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.bulkInstall(makeContext(), [projectA, projectB], 'X', undefined, { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(runner.calls.some(isRestore)).toBe(false);
        expect(outcome.restores).toEqual([]);
    });

    it('bulkUpdateAllProjects edits all projects before restoring and keeps dependency order', async () => {
        const runner = makeRunner(() => ({}));
        const projectDependencies = vi.fn(async () => dependsOn(projectB, projectA));
        const workflows = new PackageWorkflows(makeDeps({ runner, projectDependencies }));
        const outcome = await workflows.bulkUpdateAllProjects(makeContext(), [
            { projectPath: projectB, packages: [{ id: 'X', version: '2.0.0' }] },
            { projectPath: projectA, packages: [{ id: 'X', version: '2.0.0' }, { id: 'Y', version: '1.1.0' }] },
        ], { skipRestore: false });
        const kinds = runner.calls.map(a => isRestore(a) ? 'restore' : a[1]);
        expect(kinds).toEqual(['add', 'add', 'add', 'restore', 'restore']);
        expect(runner.calls.filter(isRestore).map(projectOf)).toEqual([projectA, projectB]);
        expect(outcome.results).toHaveLength(3);
        expect(outcome.status).toBe('completed');
    });

    it('bulkRemoveAllProjects restores dependencies-first after dependents-first removals', async () => {
        const runner = makeRunner(() => ({}));
        const projectDependencies = vi.fn(async () => dependsOn(projectB, projectA));
        const workflows = new PackageWorkflows(makeDeps({ runner, projectDependencies }));
        await workflows.bulkRemoveAllProjects(makeContext(), [
            { projectPath: projectA, packages: ['X'] },
            { projectPath: projectB, packages: ['X'] },
        ], { skipRestore: false });
        expect(runner.calls.filter(isRemove).map(projectOf)).toEqual([projectB, projectA]);
        expect(runner.calls.filter(isRestore).map(projectOf)).toEqual([projectA, projectB]);
    });

    it('skipRestore marks every restore skipped', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.bulkUpdate(makeContext(), projectA, [{ id: 'X', version: '1' }], { skipRestore: true });
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: true, skipped: true }]);
        expect(outcome.status).toBe('completed');
        expect(runner.calls.some(isRestore)).toBe(false);
    });

    it('cancellation mid-sequence marks remaining edits cancelled and skips restores', async () => {
        const ctx = makeContext();
        let count = 0;
        const runner = makeRunner(() => { count++; if (count === 1) { ctx.controller.abort(); } return {}; });
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.bulkUpdate(ctx, projectA, [{ id: 'X', version: '1' }, { id: 'Y', version: '1' }], { skipRestore: false });
        expect(outcome.results.map(r => r.status)).toEqual(['cancelled', 'cancelled']);
        expect(outcome.status).toBe('cancelled');
        expect(runner.calls.some(isRestore)).toBe(false);
    });

    it('restore() restores the given projects in order and reports per project', async () => {
        const runner = makeRunner(args => projectOf(args) === projectB ? { exitCode: 1, stderr: 'error NU1301' } : {});
        const workflows = new PackageWorkflows(makeDeps({ runner }));
        const outcome = await workflows.restore(makeContext(), [projectA, projectB]);
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: true }, { projectPath: projectB, ok: false, error: 'error NU1301' }]);
        expect(outcome.results.map(r => r.status)).toEqual(['completed', 'failed']);
        expect(outcome.status).toBe('partial');
    });

    it('restore() marks the projects after an abort cancelled', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => ({}), { afterRun: () => { ctx.controller.abort(); } });
        const outcome = await new PackageWorkflows(makeDeps({ runner })).restore(ctx, [projectA, projectB]);
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: true }, { projectPath: projectB, ok: false, skipped: true, error: 'cancelled' }]);
        expect(outcome.status).toBe('cancelled');
        expect(runner.calls).toEqual([['restore', projectA]]);
    });

    it('bulk: a project the mutator refuses ends partial beside one it admits', async () => {
        const runner = makeRunner(() => ({}));
        const { mutator } = realMutator();
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator, contextFor: async projectPath => contextOf(projectPath, projectPath === projectB ? sdk8 : sdk10) }));
        const outcome = await workflows.bulkInstall(makeContext(), [projectA, projectB], 'X', '1.0.0', { skipRestore: false });
        expect(outcome.status).toBe('partial');
        expect(outcome.results.map(r => [r.projectPath, r.status])).toEqual([[projectA, 'completed'], [projectB, 'failed']]);
        expect(outcome.results[1].edit).toEqual({ ok: false, error: SDK_TOO_OLD_MESSAGE });
        expect(outcome.results[1].message).toBe(SDK_TOO_OLD_MESSAGE);
        // The refused project is neither edited nor restored; the other one runs to the end.
        expect(runner.calls).toEqual([['package', 'add', 'X', '--project', projectA, '--version', '1.0.0', '--no-restore'], ['restore', projectA]]);
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: true }]);
    });

    it('bulk: consumers are restored once after the edited projects', async () => {
        const shared = (affectedProjects: string[]) => admitting({ ok: true, isCpm: true }, async (_context, packageId, toVersion) => ({ centralPropsPath: '/w/Directory.Packages.props', packageId, toVersion, affectedProjects }));
        const runner = makeRunner(() => ({}));
        const ctx = makeContext();
        const one = await new PackageWorkflows(makeDeps({ runner, mutator: shared([projectA, projectB]) })).bulkUpdate(ctx, projectA, [{ id: 'X', version: '2.0.0' }, { id: 'Y', version: '2.0.0' }], { skipRestore: false });
        expect(one.status).toBe('completed');
        expect(runner.calls.filter(isRestore)).toEqual([['restore', projectA], ['restore', projectB]]);
        expect(one.restores).toEqual([{ projectPath: projectA, ok: true }, { projectPath: projectB, ok: true }]);
        expect(one.results.map(r => r.affectedProjects)).toEqual([[projectB], [projectB]]);
        expect(ctx.reports.filter(r => r.status === 'restoring').map(r => [r.projectPaths, r.packageIds])).toEqual([[[projectA], ['X', 'Y']], [[projectB], ['X', 'Y']]]);

        const again = makeRunner(() => ({}));
        const all = await new PackageWorkflows(makeDeps({ runner: again, mutator: shared([projectA, projectB]) })).bulkUpdateAllProjects(makeContext(), [
            { projectPath: projectA, packages: [{ id: 'X', version: '2.0.0' }] },
            { projectPath: projectB, packages: [{ id: 'X', version: '2.0.0' }] },
        ], { skipRestore: false });
        expect(all.status).toBe('completed');
        // B is an edited project of the bulk: it is restored once, as such.
        expect(again.calls.filter(isRestore)).toEqual([['restore', projectA], ['restore', projectB]]);
    });

    it('bulk: every request refused is failed and restores nothing', async () => {
        const runner = makeRunner(() => ({}));
        const workflows = new PackageWorkflows(makeDeps({ runner, mutator: refusing('refused for the test') }));
        const outcome = await workflows.bulkUpdateAllProjects(makeContext(), [
            { projectPath: projectA, packages: [{ id: 'X', version: '2.0.0' }] },
            { projectPath: projectB, packages: [{ id: 'X', version: '2.0.0' }] },
        ], { skipRestore: false });
        expect(outcome.status).toBe('failed');
        expect(outcome.results.map(r => r.status)).toEqual(['failed', 'failed']);
        expect(outcome.restores).toEqual([]);
        expect(runner.calls).toEqual([]);
    });

    it('bulk: a failed restore after completed edits is partial', async () => {
        const runner = makeRunner(args => isRestore(args) ? { exitCode: 1, stderr: 'error NU1605: downgrade' } : {});
        const outcome = await new PackageWorkflows(makeDeps({ runner })).bulkUpdate(makeContext(), projectA, [{ id: 'X', version: '2.0.0' }], { skipRestore: false });
        expect(outcome.results.map(r => r.status)).toEqual(['completed']);
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: false, error: 'error NU1605: downgrade' }]);
        expect(outcome.status).toBe('partial');
    });

    it('bulk: an abort before the restore phase marks every restore cancelled', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => ({}), { afterRun: args => { if (projectOf(args) === projectB) { ctx.controller.abort(); } } });
        const outcome = await new PackageWorkflows(makeDeps({ runner })).bulkInstall(ctx, [projectA, projectB], 'X', '1.0.0', { skipRestore: false });
        expect(outcome.results.map(r => r.status)).toEqual(['completed', 'completed']);
        expect(outcome.restores).toEqual([
            { projectPath: projectA, ok: false, skipped: true, error: 'cancelled' },
            { projectPath: projectB, ok: false, skipped: true, error: 'cancelled' },
        ]);
        expect(outcome.status).toBe('cancelled');
        expect(runner.calls.some(isRestore)).toBe(false);
    });

    it('bulk: a cancel after the last edit with the restore switched off is completed', async () => {
        const ctx = makeContext();
        const runner = makeRunner(() => ({}), { afterRun: args => { if (idOf(args) === 'Y') { ctx.controller.abort(); } } });
        const outcome = await new PackageWorkflows(makeDeps({ runner })).bulkUpdate(ctx, projectA, [{ id: 'X', version: '2.0.0' }, { id: 'Y', version: '2.0.0' }], { skipRestore: true });
        expect(outcome.results.map(r => r.status)).toEqual(['completed', 'completed']);
        expect(outcome.restores).toEqual([{ projectPath: projectA, ok: true, skipped: true }]);
        expect(outcome.status).toBe('completed');
        expect(runner.calls.some(isRestore)).toBe(false);
    });

    it('falls back to the given order and warns redacted when a dependency lookup fails', async () => {
        const runner = makeRunner(() => ({}));
        const logger = fakeLogger();
        const workflows = new PackageWorkflows(makeDeps({
            runner,
            logger,
            projectDependencies: async () => { throw new Error('graph failed for https://u:p@feed.example/'); },
            packageDependencies: async () => { throw new Error('assets unreadable'); },
        }));
        const outcome = await workflows.bulkUpdateAllProjects(makeContext(), [
            { projectPath: projectB, packages: [{ id: 'Y', version: '2.0.0' }, { id: 'X', version: '2.0.0' }] },
            { projectPath: projectA, packages: [{ id: 'X', version: '2.0.0' }] },
        ], { skipRestore: true });
        expect(outcome.status).toBe('completed');
        expect(runner.calls.map(a => [projectOf(a), idOf(a)])).toEqual([[projectB, 'Y'], [projectB, 'X'], [projectA, 'X']]);
        expect(logger.warn.mock.calls.map(call => call[0])).toEqual([
            'Project dependency ordering failed: graph failed for https://[REDACTED]@feed.example/',
            `Package dependency ordering failed for ${projectB}: assets unreadable`,
        ]);
    });
});

describe('PackageWorkflows progress', () => {
    it('single reports carry the request kind, project and package', async () => {
        const ctx = makeContext();
        await new PackageWorkflows(makeDeps({ runner: makeRunner(() => ({})) })).single(ctx, { kind: 'install', projectPath: app, packageId: 'X' }, { skipRestore: false });
        expect(ctx.reports).toEqual([
            { status: 'running', kind: 'install', projectPaths: [app], packageIds: ['X'], detail: 'Installing X' },
            { status: 'restoring', kind: 'install', projectPaths: [app], packageIds: ['X'], detail: 'App.csproj' },
        ]);
    });

    it('a bulk opens with every project and package of the batch and restores list the edited ids', async () => {
        const ctx = makeContext();
        const runner = makeRunner(args => isAdd(args) && projectOf(args) === projectA && idOf(args) === 'Y' ? { exitCode: 1, stderr: 'error' } : {});
        await new PackageWorkflows(makeDeps({ runner })).bulkUpdateAllProjects(ctx, [
            { projectPath: projectA, packages: [{ id: 'X', version: '2.0.0' }, { id: 'Y', version: '2.0.0' }] },
            { projectPath: projectB, packages: [{ id: 'X', version: '2.0.0' }] },
        ], { skipRestore: false });
        expect(ctx.reports).toEqual([
            { status: 'running', kind: 'update', projectPaths: [projectA, projectB], packageIds: ['X', 'Y'] },
            { status: 'running', kind: 'update', projectPaths: [projectA], packageIds: ['X'], current: 1, total: 3, detail: 'A.csproj: X' },
            { status: 'running', kind: 'update', projectPaths: [projectA], packageIds: ['Y'], current: 2, total: 3, detail: 'A.csproj: Y' },
            { status: 'running', kind: 'update', projectPaths: [projectB], packageIds: ['X'], current: 3, total: 3, detail: 'B.csproj: X' },
            { status: 'restoring', kind: 'update', projectPaths: [projectA], packageIds: ['X'], current: 1, total: 2, detail: 'A.csproj' },
            { status: 'restoring', kind: 'update', projectPaths: [projectB], packageIds: ['X'], current: 2, total: 2, detail: 'B.csproj' },
        ]);
    });

    it('every report of every workflow carries kind, projectPaths and packageIds', async () => {
        const ctx = makeContext();
        const workflows = new PackageWorkflows(makeDeps({ runner: makeRunner(() => ({})) }));
        const options = { skipRestore: false };
        await workflows.single(ctx, { kind: 'update', projectPath: app, packageId: 'X', version: '2.0.0' }, options);
        await workflows.single(ctx, { kind: 'remove', projectPath: app, packageId: 'X' }, options);
        await workflows.bulkInstall(ctx, [projectA, projectB], 'X', '1.0.0', options);
        await workflows.bulkUpdate(ctx, projectA, [{ id: 'X', version: '2.0.0' }], options);
        await workflows.bulkRemove(ctx, projectA, ['X', 'Y'], options);
        await workflows.bulkRemoveAllProjects(ctx, [{ projectPath: projectA, packages: ['X'] }], options);
        await workflows.restore(ctx, [projectA, projectB]);

        expect(ctx.reports.length).toBeGreaterThan(20);
        for (const report of ctx.reports) {
            expect(report.kind).toBeDefined();
            expect(Array.isArray(report.projectPaths)).toBe(true);
            expect(Array.isArray(report.packageIds)).toBe(true);
        }
        expect([...new Set(ctx.reports.map(r => r.kind))]).toEqual(['update', 'remove', 'install', 'restore']);
        // Only the explicit restore workflow reports the kind `restore`, and it names no package.
        expect(ctx.reports.filter(r => r.kind === 'restore')).toEqual([
            { status: 'restoring', kind: 'restore', projectPaths: [projectA], packageIds: [], current: 1, total: 2, detail: 'A.csproj' },
            { status: 'restoring', kind: 'restore', projectPaths: [projectB], packageIds: [], current: 2, total: 2, detail: 'B.csproj' },
        ]);
    });
});

describe('stepStatus and outcomeStatus', () => {
    const ok: StepOutcome = { ok: true };
    const skipped: StepOutcome = { ok: true, skipped: true };
    const failed: StepOutcome = { ok: false, error: 'error NU1101' };
    const cancelled: StepOutcome = { ok: false, error: 'cancelled' };
    const cancelledBeforeStart: StepOutcome = { ok: false, skipped: true, error: 'cancelled' };

    it.each([
        ['a successful step', ok, 'completed'],
        ['a step skipped by option', skipped, 'completed'],
        ['a failed step', failed, 'failed'],
        ['a failed step without a message', { ok: false }, 'failed'],
        ['a cancelled step', cancelled, 'cancelled'],
        ['a step cancelled before it started', cancelledBeforeStart, 'cancelled'],
    ] as const)('stepStatus: %s', (_name, step, expected) => {
        expect(stepStatus(step)).toBe(expected);
    });

    it.each([
        ['edit ok, restore ok', ok, ok, 'completed'],
        ['edit ok, restore skipped by option', ok, skipped, 'completed'],
        ['edit ok, no restore step', ok, undefined, 'completed'],
        ['edit ok, restore failed', ok, failed, 'partial'],
        ['edit ok, restore cancelled', ok, cancelled, 'cancelled'],
        ['edit ok, cancelled before the restore', ok, cancelledBeforeStart, 'cancelled'],
        ['edit failed', failed, undefined, 'failed'],
        ['edit cancelled', cancelled, undefined, 'cancelled'],
        ['edit failed wins over a restore result', failed, ok, 'failed'],
    ] as const)('outcomeStatus: %s', (_name, edit, restore, expected) => {
        expect(outcomeStatus(edit, restore)).toBe(expected);
    });
});
