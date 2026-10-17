import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/** The API object the frontend test setup hands out for `acquireVsCodeApi()`. */
const acquire = (): Mock => (globalThis as unknown as { acquireVsCodeApi: Mock }).acquireVsCodeApi;
const api = (): { postMessage: Mock } => acquire()() as { postMessage: Mock };

describe('main panel 2.0 entry', () => {
    beforeEach(() => {
        vi.resetModules();
        api().postMessage.mockClear();
        acquire().mockClear();
    });

    afterEach(() => {
        cleanup();
        document.body.replaceChildren();
        vi.doUnmock('./MainShell');
        vi.doUnmock('../shared/store/StoreProvider');
        vi.restoreAllMocks();
    });

    it('mounts the shell into its root, acquires the API once, asks the host for the session, the projects and the settings, and marks webviewReady', async () => {
        const root = document.createElement('div');
        root.id = 'root';
        document.body.append(root);

        await act(async () => {
            await import('./index');
        });

        expect(acquire()).toHaveBeenCalledTimes(1);
        expect(root).toContainElement(screen.getByTestId('nuiget-app'));
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
        expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
        expect(screen.getByTestId('status-live')).toBeInTheDocument();
        const asked = api().postMessage.mock.calls.map(([message]) => message as { kind: string; type?: string }).filter(message => message.kind === 'request').map(message => message.type);
        // The search feature enables the config and sources slices on mount: config needs no session; sources/list follows the first snapshot (useSearchTyping.test.tsx, sources.test.tsx). perf/mark webviewReady is sent once from MainShell (N81); layout/get reads the kept split once from MainShell (P9.7).
        expect(new Set(asked)).toEqual(new Set(['session/get', 'projects/list', 'config/get', 'layout/get', 'perf/mark']));
        expect(asked.filter(type => type === 'perf/mark')).toHaveLength(1);
        expect(asked.filter(type => type === 'layout/get')).toHaveLength(1);
        const mark = api().postMessage.mock.calls.map(([message]) => message as { kind: string; type?: string; payload?: { name?: string } }).find(message => message.kind === 'request' && message.type === 'perf/mark');
        expect(mark?.payload?.name).toBe('webviewReady');
    });

    it('does not mount itself when the page has no root element', async () => {
        await import('./index');
        expect(document.body).toBeEmptyDOMElement();
        // The API can be acquired once per page; a page that is not the panel's must not use that up.
        expect(acquire()).not.toHaveBeenCalled();
        expect(api().postMessage).not.toHaveBeenCalled();
    });

    it('a crash in the shell renders Reload and reports the error through the bus', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.doMock('./MainShell', () => ({ MainShell: () => { throw new Error('boom'); } }));
        const root = document.createElement('div');
        root.id = 'root';
        document.body.append(root);

        await act(async () => {
            await import('./index');
        });

        expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
        const reports = api().postMessage.mock.calls
            .map(([message]) => message as { kind: string; type?: string; payload?: { message?: string; stack?: string } })
            .filter(message => message.kind === 'request' && message.type === 'ui/reportError');
        expect(reports.length).toBeGreaterThan(0);
        expect(reports[0].payload?.message).toBe('boom');
        expect(reports[0].payload?.stack).toContain('boom');
    });

    it('the entry mounts the store with the transitive prefetch (P9.fix-1, N87)', async () => {
        const seen: Array<{ prefetch?: boolean }> = [];
        vi.doMock('../shared/store/StoreProvider', async importOriginal => {
            const actual = await importOriginal<typeof import('../shared/store/StoreProvider')>();
            return {
                StoreProvider: (props: Parameters<typeof actual.StoreProvider>[0]) => {
                    seen.push(props);
                    return <actual.StoreProvider {...props} />;
                },
            };
        });
        const root = document.createElement('div');
        root.id = 'root';
        document.body.append(root);

        await act(async () => {
            await import('./index');
        });

        expect(seen.length).toBeGreaterThan(0);
        expect(seen[0]?.prefetch).not.toBe(false);
    });
});
