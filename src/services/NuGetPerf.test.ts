import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { startTimer, isPerfEnabled, _setEnabledForTests } from './NuGetPerf';

function makeChannel() {
    return {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        append: vi.fn(),
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        replace: vi.fn(),
        name: 'test',
        logLevel: 1,
        onDidChangeLogLevel: vi.fn(),
    } as unknown as vscode.LogOutputChannel & { info: ReturnType<typeof vi.fn>, debug: ReturnType<typeof vi.fn> };
}

describe('NuGetPerf', () => {
    beforeEach(() => {
        _setEnabledForTests(false);
    });

    it('is a no-op when disabled', () => {
        const channel = makeChannel();
        _setEnabledForTests(false, channel);
        expect(isPerfEnabled()).toBe(false);

        const t = startTimer('test.op');
        t.mark('phase1');
        t.end({ count: 5 });

        expect((channel as any).info).not.toHaveBeenCalled();
        expect((channel as any).debug).not.toHaveBeenCalled();
    });

    it('logs total wall time on end() when enabled', () => {
        const channel = makeChannel();
        _setEnabledForTests(true, channel);

        const t = startTimer('myOp');
        t.end({ count: 3 });

        expect((channel as any).info).toHaveBeenCalledTimes(1);
        const arg = (channel as any).info.mock.calls[0][0] as string;
        expect(arg).toMatch(/^\[perf\] myOp \d+\.\dms count=3$/);
    });

    it('logs sub-phase deltas on mark()', () => {
        const channel = makeChannel();
        _setEnabledForTests(true, channel);

        const t = startTimer('myOp');
        t.mark('a');
        t.mark('b');
        t.end();

        expect((channel as any).debug).toHaveBeenCalledTimes(2);
        expect((channel as any).debug.mock.calls[0][0]).toMatch(/myOp a \d+\.\dms/);
    });

    it('omits folder tag for single-root workspace', () => {
        const channel = makeChannel();
        _setEnabledForTests(true, channel);
        // Default mock has 1 workspace folder
        const t = startTimer('op', '/test-workspace/proj.csproj');
        t.end();
        const msg = (channel as any).info.mock.calls[0][0] as string;
        // Should only contain the [perf] tag, no folder tag like [test-workspace]
        expect(msg).toMatch(/^\[perf\] op /);
        expect(msg).not.toContain('[test-workspace]');
    });

    it('emits folder tag for multi-root workspace', () => {
        const channel = makeChannel();
        _setEnabledForTests(true, channel);

        const originalFolders = (vscode.workspace as any).workspaceFolders;
        (vscode.workspace as any).workspaceFolders = [
            { uri: vscode.Uri.file('/repoA'), name: 'repoA', index: 0 },
            { uri: vscode.Uri.file('/repoB'), name: 'repoB', index: 1 },
        ];
        (vscode.workspace as any).getWorkspaceFolder = vi.fn(() => ({ name: 'repoB', index: 1, uri: vscode.Uri.file('/repoB') }));

        try {
            const t = startTimer('op', '/repoB/some.csproj');
            t.end();
            const msg = (channel as any).info.mock.calls[0][0] as string;
            expect(msg).toContain('[repoB]');
        } finally {
            (vscode.workspace as any).workspaceFolders = originalFolders;
            delete (vscode.workspace as any).getWorkspaceFolder;
        }
    });
});
