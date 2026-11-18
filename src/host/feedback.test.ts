import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Emitter } from '../core/util/events';
import type { BulkOutcome, EventPayload, OperationOutcome, OperationProgress } from '../protocol';
import { queueStatusText, registerOperationFeedback, registerQueueStatus } from './feedback';

const information = vi.mocked(vscode.window.showInformationMessage);
const warning = vi.mocked(vscode.window.showWarningMessage);
const withProgress = vi.mocked(vscode.window.withProgress);
const statusMessage = vi.mocked(vscode.window.setStatusBarMessage);

const APP = '/w/App/App.csproj';
const LIB = '/w/Lib/Lib.csproj';
const single = (changes: Partial<OperationOutcome>): OperationOutcome => ({ opId: 'op-1', kind: 'install', status: 'completed', projectPath: APP, packageId: 'Serilog', version: '4.0.0', ...changes });
const bulk = (changes: Partial<BulkOutcome>): BulkOutcome => ({ opId: 'bulk-1', status: 'completed', results: [], restores: [], ...changes });

function setup() {
    const progress = new Emitter<OperationProgress>();
    const completed = new Emitter<EventPayload<'ops/completed'>>();
    const hostSubmitted = new Emitter<OperationProgress>();
    const output = { show: vi.fn() };
    const disposable = registerOperationFeedback({ onProgress: progress.event, onCompleted: completed.event, onHostSubmitted: hostSubmitted.event, output });
    return { progress, completed, hostSubmitted, output, disposable };
}

/** Lets the `then` of a warning's Show Output button run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('operation feedback', () => {
    beforeEach(() => {
        information.mockClear();
        warning.mockClear();
        withProgress.mockClear();
        statusMessage.mockClear();
    });

    afterEach(() => {
        warning.mockReset();
        warning.mockResolvedValue(undefined);
    });

    it('no toast for a single success: a warning with Show Output on partial, failed and rejected, none on cancelled (D50)', () => {
        const { completed } = setup();
        completed.fire(single({ status: 'completed' }));
        completed.fire(single({ opId: 'op-2', kind: 'update', status: 'completed', affectedProjects: [LIB] }));
        completed.fire(single({ opId: 'op-3', kind: 'remove', status: 'partial', restore: { ok: false, error: 'NU1101' } }));
        completed.fire(single({ opId: 'op-4', status: 'failed', message: 'exit code 1' }));
        completed.fire(single({ opId: 'op-5', kind: 'update', status: 'rejected', message: 'the queue is full' }));
        completed.fire(single({ opId: 'op-6', status: 'cancelled' }));
        // A host reason that ends in its own period keeps one final period (UX-P3.11b, design-advisor follow-up 2).
        completed.fire(single({ opId: 'op-7', kind: 'remove', status: 'failed', message: 'The project file is locked.' }));

        expect(information).not.toHaveBeenCalled();
        // A webview asked these: its surface says them; the host says nothing (UX-P4.7).
        expect(statusMessage).not.toHaveBeenCalled();
        expect(warning.mock.calls).toEqual([
            ['nUIget: Uninstalled Serilog from App, but the restore failed: NU1101.', 'Show Output'],
            ['nUIget: Install of Serilog in App failed: exit code 1.', 'Show Output'],
            ['nUIget: Update of Serilog in App was not started: the queue is full.', 'Show Output'],
            ['nUIget: Uninstall of Serilog from App failed: The project file is locked.', 'Show Output'],
        ]);
    });

    it('a failed outcome reveals the output channel and Show Output reveals it for a partial one', async () => {
        const { completed, output } = setup();
        completed.fire(single({ status: 'failed', message: 'exit code 1' }));
        expect(output.show).toHaveBeenCalledTimes(1);
        expect(output.show).toHaveBeenCalledWith(true);

        warning.mockResolvedValueOnce('Show Output' as never);
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
            'nUIget: The operation was not started: the queue is full.',
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

    it('a single success the host started with no origin is said in the status bar, never in a toast', () => {
        const { completed, hostSubmitted } = setup();
        hostSubmitted.fire({ opId: 'menu-1', status: 'queued', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'] });
        completed.fire(single({ opId: 'menu-1' }));
        expect(statusMessage.mock.calls).toEqual([['nUIget: Installed Serilog 4.0.0 in App.', 5000]]);
        expect(information).not.toHaveBeenCalled();
        // The id is forgotten after its outcome: the same id again (a webview's) says nothing.
        completed.fire(single({ opId: 'menu-1' }));
        expect(statusMessage).toHaveBeenCalledTimes(1);
        // A central update also restored other projects: the line says so.
        hostSubmitted.fire({ opId: 'menu-4', status: 'queued', kind: 'update', projectPaths: [APP], packageIds: ['Serilog'] });
        completed.fire(single({ opId: 'menu-4', kind: 'update', affectedProjects: [LIB] }));
        expect(statusMessage).toHaveBeenLastCalledWith('nUIget: Updated Serilog to 4.0.0 in App; also restored 1 other project.', 5000);
    });

    it('a host-started failure still warns, and a cancelled operation the host started says nothing', () => {
        const { completed, hostSubmitted } = setup();
        hostSubmitted.fire({ opId: 'menu-2', status: 'queued', kind: 'remove', projectPaths: [APP], packageIds: ['Serilog'] });
        completed.fire({ ...single({ opId: 'menu-2', kind: 'remove', status: 'failed', message: 'exit code 1' }), origin: 'main' });
        hostSubmitted.fire({ opId: 'menu-3', status: 'queued', kind: 'update', projectPaths: [APP], packageIds: ['Serilog'] });
        completed.fire({ ...single({ opId: 'menu-3', kind: 'update', status: 'cancelled' }), origin: 'sidebar' });
        expect(warning.mock.calls).toEqual([['nUIget: Uninstall of Serilog from App failed: exit code 1.', 'Show Output']]);
        expect(statusMessage).not.toHaveBeenCalled();
        expect(information).not.toHaveBeenCalled();
    });

    it('a row-menu success whose origin is a surface raises no status bar line and no toast: that surface says it (UX-P4.fix-11)', () => {
        const { completed, hostSubmitted } = setup();
        for (const origin of ['main', 'sidebar'] as const) {
            hostSubmitted.fire({ opId: `menu-${origin}`, status: 'queued', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'] });
            completed.fire({ ...single({ opId: `menu-${origin}` }), origin });
        }
        expect(statusMessage).not.toHaveBeenCalled();
        expect(information).not.toHaveBeenCalled();
        expect(warning).not.toHaveBeenCalled();
    });

    it('a one-project restore keeps its summary toast', () => {
        const { completed } = setup();
        completed.fire(bulk({ opId: 'restore-1', status: 'completed', results: [single({ opId: 'restore-1', kind: 'restore', packageId: undefined, version: undefined })], restores: [{ projectPath: APP, ok: true }] }));
        expect(information.mock.calls).toEqual([['nUIget: Restored 1 project.']]);
    });

    it('the status bar names what runs and how many wait (UX-P4.7)', () => {
        const report = (changes: Partial<OperationProgress>): OperationProgress => ({ opId: 'op', status: 'running', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'], ...changes });
        expect(queueStatusText({ active: 0, pending: 0 }, undefined)).toBeUndefined();
        expect(queueStatusText({ active: 1, pending: 0 }, undefined)).toBe('$(sync~spin) nUIget: operation running');
        expect(queueStatusText({ active: 1, pending: 0 }, report({}))).toBe('$(sync~spin) nUIget: Installing Serilog');
        expect(queueStatusText({ active: 1, pending: 2 }, report({ kind: 'update' }))).toBe('$(sync~spin) nUIget: Updating Serilog, 2 queued');
        expect(queueStatusText({ active: 1, pending: 0 }, report({ kind: 'remove', packageIds: ['Serilog', 'Moq'] }))).toBe('$(sync~spin) nUIget: Uninstalling packages');
        expect(queueStatusText({ active: 1, pending: 0 }, report({ projectPaths: [APP, LIB] }))).toBe('$(sync~spin) nUIget: Installing packages');
        expect(queueStatusText({ active: 1, pending: 0 }, report({ kind: 'update', total: 3 }))).toBe('$(sync~spin) nUIget: Updating packages');
        expect(queueStatusText({ active: 1, pending: 1 }, report({ kind: 'restore', packageIds: undefined }))).toBe('$(sync~spin) nUIget: Restoring projects, 1 queued');
        expect(queueStatusText({ active: 0, pending: 1 }, undefined)).toBe('$(sync~spin) nUIget: operation running, 1 queued');
    });

    it('a single operation\'s reports open no notification', () => {
        const { progress, completed } = setup();
        progress.fire({ opId: 'op-1', status: 'running', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'] });
        progress.fire({ opId: 'op-1', status: 'restoring', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'] });
        completed.fire(single({}));
        expect(withProgress).not.toHaveBeenCalled();
        // D50: a single success raises no toast (UX-P4.7).
        expect(information).not.toHaveBeenCalled();
    });
});

describe('the queue\'s status bar item (UX-P4.7)', () => {
    function status() {
        const changed = new Emitter<{ active: number; pending: number }>();
        const progress = new Emitter<OperationProgress>();
        const completed = new Emitter<OperationOutcome | BulkOutcome>();
        const statusBar = { text: '', show: vi.fn(), hide: vi.fn() };
        const disposable = registerQueueStatus({ statusBar, onDidChange: changed.event, onProgress: progress.event, onCompleted: completed.event });
        return { changed, progress, completed, statusBar, disposable };
    }
    const report = (opId: string, changes: Partial<OperationProgress> = {}): OperationProgress => ({ opId, status: 'running', kind: 'install', projectPaths: [APP], packageIds: ['Serilog'], ...changes });

    it('names the running operation from its report and the waiting count, and hides when idle', () => {
        const { changed, progress, completed, statusBar } = status();
        changed.fire({ active: 1, pending: 0 });
        expect(statusBar.text).toBe('$(sync~spin) nUIget: operation running');
        progress.fire(report('a'));
        expect(statusBar.text).toBe('$(sync~spin) nUIget: Installing Serilog');
        changed.fire({ active: 1, pending: 1 });
        expect(statusBar.text).toBe('$(sync~spin) nUIget: Installing Serilog, 1 queued');
        // A restore step names no package: the operation keeps its kind and package.
        progress.fire(report('a', { status: 'restoring', packageIds: undefined, kind: undefined }));
        expect(statusBar.text).toBe('$(sync~spin) nUIget: Installing Serilog, 1 queued');
        completed.fire(single({ opId: 'a' }));
        expect(statusBar.text).toBe('$(sync~spin) nUIget: operation running, 1 queued');
        changed.fire({ active: 0, pending: 0 });
        expect(statusBar.hide).toHaveBeenCalled();
    });

    it('keeps the next operation\'s report when it arrives before the change and the old outcome', () => {
        const { changed, progress, completed, statusBar } = status();
        changed.fire({ active: 1, pending: 1 });
        progress.fire(report('a'));
        // The queue starts B and B reports before A's change and outcome fire.
        progress.fire(report('b', { kind: 'remove', packageIds: ['Moq'] }));
        changed.fire({ active: 1, pending: 0 });
        completed.fire(single({ opId: 'a' }));
        expect(statusBar.text).toBe('$(sync~spin) nUIget: Uninstalling Moq');
    });
});
