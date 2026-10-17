import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/** The API object the frontend test setup hands out for `acquireVsCodeApi()`. */
const acquire = (): Mock => (globalThis as unknown as { acquireVsCodeApi: Mock }).acquireVsCodeApi;
const api = (): { postMessage: Mock } => acquire()() as { postMessage: Mock };

describe('sidebar 2.0 entry', () => {
    beforeEach(() => {
        vi.resetModules();
        api().postMessage.mockClear();
        acquire().mockClear();
    });

    afterEach(() => {
        cleanup();
        document.body.replaceChildren();
        vi.doUnmock('./SidebarView');
        vi.restoreAllMocks();
    });

    it('mounts the sidebar into its root, acquires the API once, asks the host for the session and the projects, and marks webviewReady', async () => {
        const root = document.createElement('div');
        root.id = 'sidebar-root';
        document.body.append(root);

        await act(async () => {
            await import('./index');
        });

        expect(acquire()).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('nuiget-sidebar')).toBeInTheDocument();
        expect(root).toContainElement(screen.getByTestId('sidebar-search-input'));
        expect(screen.getByTestId('section-header-installed')).toBeInTheDocument();
        expect(screen.getByTestId('status-live')).toBeInTheDocument();
        const asked = api().postMessage.mock.calls.map(([message]) => message as { kind: string; type?: string }).filter(message => message.kind === 'request').map(message => message.type);
        expect(new Set(asked)).toEqual(new Set(['session/get', 'projects/list', 'perf/mark']));
        expect(asked.filter(type => type === 'perf/mark')).toHaveLength(1);
        const mark = api().postMessage.mock.calls.map(([message]) => message as { kind: string; type?: string; payload?: { name?: string } }).find(message => message.kind === 'request' && message.type === 'perf/mark');
        expect(mark?.payload?.name).toBe('webviewReady');
    });

    it('does not mount itself when the page has no root element', async () => {
        await import('./index');
        expect(document.body).toBeEmptyDOMElement();
        // The API can be acquired once per page; a page that is not the sidebar's must not use that up.
        expect(acquire()).not.toHaveBeenCalled();
        expect(api().postMessage).not.toHaveBeenCalled();
    });

    it('a crash in the shell renders Reload and reports the error through the bus', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.doMock('./SidebarView', () => ({ SidebarView: () => { throw new Error('boom'); } }));
        const root = document.createElement('div');
        root.id = 'sidebar-root';
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
});
