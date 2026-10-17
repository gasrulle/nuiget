import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Emitter } from '../core/util/events';
import type { BulkOutcome, OperationOutcome, OperationProgress } from '../protocol';
import { registerOperationFeedback } from './feedback';

const information = vi.mocked(vscode.window.showInformationMessage);
const warning = vi.mocked(vscode.window.showWarningMessage);
const withProgress = vi.mocked(vscode.window.withProgress);

const APP = '/w/App/App.csproj';
const LIB = '/w/Lib/Lib.csproj';
const single = (changes: Partial<OperationOutcome>): OperationOutcome => ({ opId: 'op-1', kind: 'install', status: 'completed', projectPath: APP, packageId: 'Serilog', version: '4.0.0', ...changes });
const bulk = (changes: Partial<BulkOutcome>): BulkOutcome => ({ opId: 'bulk-1', status: 'completed', results: [], restores: [], ...changes });

function setup() {
    const progress = new Emitter<OperationProgress>();
    const completed = new Emitter<OperationOutcome | BulkOutcome>();
    const output = { show: vi.fn() };
    const disposable = registerOperationFeedback({ onProgress: progress.event, onCompleted: completed.event, output });
    return { progress, completed, output, disposable };
}

/** Lets the `then` of a warning's Show output button run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('operation feedback', () => {
    beforeEach(() => {
        information.mockClear();
        warning.mockClear();
        withProgress.mockClear();
    });

    afterEach(() => {
        warning.mockReset();
        warning.mockResolvedValue(undefined);
    });

    it('one toast per outcome: information on completed, warning with Show output on partial, failed and rejected, none on cancelled', () => {
        const { completed } = setup();
        completed.fire(single({ status: 'completed' }));
        completed.fire(single({ opId: 'op-2', kind: 'update', status: 'completed', affectedProjects: [LIB] }));
        completed.fire(single({ opId: 'op-3', kind: 'remove', status: 'partial', restore: { ok: false, error: 'NU1101' } }));
        completed.fire(single({ opId: 'op-4', status: 'failed', message: 'exit code 1' }));
        completed.fire(single({ opId: 'op-5', kind: 'update', status: 'rejected', message: 'the queue is full' }));
        completed.fire(single({ opId: 'op-6', status: 'cancelled' }));

        expect(information.mock.calls).toEqual([
            ['nUIget: Installed Serilog 4.0.0 in App'],
            ['nUIget: Updated Serilog to 4.0.0 in App; also restored 1 other project'],
        ]);
        expect(warning.mock.calls).toEqual([
            ['nUIget: Uninstalled Serilog from App, but the restore failed: NU1101', 'Show output'],
            ['nUIget: Install of Serilog in App failed: exit code 1', 'Show output'],
            ['nUIget: Update of Serilog in App was not started: the queue is full', 'Show output'],
        ]);
    });

    it('a failed outcome reveals the output channel and Show output reveals it for a partial one', async () => {
        const { completed, output } = setup();
        completed.fire(single({ status: 'failed', message: 'exit code 1' }));
        expect(output.show).toHaveBeenCalledTimes(1);
        expect(output.show).toHaveBeenCalledWith(true);

        warning.mockResolvedValueOnce('Show output' as never);
        completed.fire(single({ opId: 'op-2', status: 'partial', restore: { ok: false, error: 'NU1101' } }));
        await settle();
        expect(output.show).toHaveBeenCalledTimes(2);

        completed.fire(single({ opId: 'op-3', status: 'partial', restore: { ok: false, error: 'NU1101' } }));
        await settle();
        expect(output.show).toHaveBeenCalledTimes(2);
    });

    it('a bulk outcome is summarised with done, total and failed restores', () => {
        const { completed, output } = setup();
        const update = (id: string, status: OperationOutcome['status']) => single({ kind: 'update', packageId: id, status });
        completed.fire(bulk({ results: [update('Serilog', 'completed'), update('Moq', 'completed')], restores: [{ projectPath: APP, ok: true }] }));
        completed.fire(bulk({ opId: 'bulk-2', status: 'partial', results: [update('Serilog', 'completed'), update('Moq', 'failed')], restores: [{ projectPath: APP, ok: false, error: 'NU1101' }] }));
        // Every edit done, one restore failed: no "0 failed".
        completed.fire(bulk({ opId: 'bulk-3', status: 'partial', results: [update('Serilog', 'completed'), update('Moq', 'completed')], restores: [{ projectPath: APP, ok: false }, { projectPath: LIB, ok: true, skipped: true }] }));
        completed.fire(bulk({ opId: 'bulk-4', status: 'completed', results: [single({ projectPath: APP }), single({ projectPath: LIB })], restores: [] }));
        completed.fire(bulk({ opId: 'bulk-5', status: 'failed', results: [single({ kind: 'remove', status: 'failed' })], restores: [] }));
        completed.fire(bulk({ opId: 'bulk-6', status: 'rejected', message: 'the queue is full' }));
        completed.fire(bulk({ opId: 'bulk-7', status: 'completed', results: [single({ kind: 'restore', packageId: undefined })] }));

        expect(information.mock.calls).toEqual([
            ['nUIget: Updated 2 packages.'],
            ['nUIget: Installed Serilog in 2 projects.'],
            ['nUIget: Restored 1 project.'],
        ]);
        expect(warning.mock.calls.map(call => call[0])).toEqual([
            'nUIget: Updated 1 of 2 packages; 1 failed; 1 restore failed.',
            'nUIget: Updated 2 packages; 1 restore failed.',
            'nUIget: Uninstalled 0 of 1 packages; 1 failed.',
            'nUIget: The operation was not started: the queue is full',
        ]);
        expect(output.show).toHaveBeenCalledTimes(1);
    });

    it('the progress notification opens at the first report with a total, shows current of total and closes with the outcome', async () => {
        const report = vi.fn();
        let ended = false;
        withProgress.mockImplementationOnce(((_options: unknown, task: (progress: unknown, token: unknown) => Promise<void>) => task({ report }, { isCancellationRequested: false }).then(() => {
            ended = true;
        })) as never);
        const { progress, completed } = setup();

        progress.fire({ opId: 'bulk-1', status: 'running', kind: 'update', projectPaths: [APP] });
        expect(withProgress).not.toHaveBeenCalled();
        progress.fire({ opId: 'bulk-1', status: 'running', kind: 'update', current: 1, total: 2, detail: 'Serilog' });
        progress.fire({ opId: 'bulk-1', status: 'running', kind: 'update', current: 2, total: 2, detail: 'Moq' });
        progress.fire({ opId: 'bulk-1', status: 'restoring', kind: 'update', current: 1, total: 1, detail: 'App' });

        expect(withProgress).toHaveBeenCalledTimes(1);
        expect(withProgress.mock.calls[0][0]).toEqual({ location: vscode.ProgressLocation.Notification, title: 'nUIget: Updating packages', cancellable: false });
        expect(report.mock.calls.map(call => call[0])).toEqual([{ message: '1 of 2: Serilog' }, { message: '2 of 2: Moq' }, { message: 'Restoring 1 of 1: App' }]);
        expect(ended).toBe(false);

        completed.fire(bulk({ results: [single({ kind: 'update' })] }));
        await settle();
        expect(ended).toBe(true);
    });

    it('an outcome before the notification\'s task started closes it at once and dispose closes every open one', async () => {
        let start: (() => void) | undefined;
        const report = vi.fn();
        const ends: string[] = [];
        withProgress.mockImplementation(((options: { title: string }, task: (progress: unknown, token: unknown) => Promise<void>) => new Promise<void>(resolve => {
            start = () => { void task({ report }, {}).then(() => { ends.push(options.title); resolve(); }); };
        })) as never);
        try {
            const { progress, completed, disposable } = setup();
            progress.fire({ opId: 'bulk-1', status: 'running', kind: 'install', current: 1, total: 3, detail: 'App' });
            completed.fire(bulk({ results: [single({})] }));
            start?.();
            await settle();
            expect(report).toHaveBeenCalledWith({ message: '1 of 3: App' });
            expect(ends).toEqual(['nUIget: Installing packages']);

            progress.fire({ opId: 'bulk-2', status: 'running', kind: 'remove', current: 1, total: 2, detail: 'App' });
            start?.();
            disposable.dispose();
            await settle();
            expect(ends).toEqual(['nUIget: Installing packages', 'nUIget: Uninstalling packages']);
        } finally {
            withProgress.mockReset();
            withProgress.mockImplementation(((_options: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) => task({ report: vi.fn() }, { isCancellationRequested: false, onCancellationRequested: vi.fn() })) as never);
        }
    });

    it('a single operation\'s reports open no notification', () => {
        const { progress, completed } = setup();
        progress.fire({ opId: 'op-1', status: 'running', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'] });
        progress.fire({ opId: 'op-1', status: 'restoring', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'] });
        completed.fire(single({}));
        expect(withProgress).not.toHaveBeenCalled();
        expect(information).toHaveBeenCalledTimes(1);
    });
});
