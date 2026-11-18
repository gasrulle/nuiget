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
        vi.doUnmock('../shared/store/StoreProvider');
        vi.doUnmock('../shared/bus/MessageBus');
        for (const name of ['data-look', 'data-density', 'data-uppercase-headers', 'data-always-show-header-actions']) {
            document.documentElement.removeAttribute(name);
        }
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
        // + `config/get` for `workbench.tree.indent` (P9.10).
        expect(new Set(asked)).toEqual(new Set(['session/get', 'projects/list', 'config/get', 'perf/mark']));
        expect(asked.filter(type => type === 'perf/mark')).toHaveLength(1);
        expect(asked.filter(type => type === 'config/get')).toHaveLength(1);
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

    it('the entry mounts the store without the transitive prefetch (P9.fix-1, N87) and as the sidebar surface (UX-P4.fix-11)', async () => {
        const seen: Array<{ prefetch?: boolean; surface?: string }> = [];
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
        root.id = 'sidebar-root';
        document.body.append(root);

        await act(async () => {
            await import('./index');
        });

        expect(seen.length).toBeGreaterThan(0);
        expect(seen[0]?.prefetch).toBe(false);
        // A row-menu outcome whose origin is the sidebar is said here only when the store knows its surface.
        expect(seen[0]?.surface).toBe('sidebar');
    });

    it('a config/changed event writes the host\'s look onto the document element (ADR-011 Decision 2, UX-P4.1)', async () => {
        const handlers: Array<{ type: string; handler: (payload: unknown) => void }> = [];
        vi.doMock('../shared/bus/MessageBus', async importOriginal => {
            const actual = await importOriginal<typeof import('../shared/bus/MessageBus')>();
            return {
                ...actual,
                createMessageBus: (...args: Parameters<typeof actual.createMessageBus>) => {
                    const bus = actual.createMessageBus(...args);
                    const onEvent = bus.onEvent.bind(bus);
                    bus.onEvent = ((type: string, handler: (payload: unknown) => void) => {
                        handlers.push({ type, handler });
                        return onEvent(type as never, handler as never);
                    }) as typeof bus.onEvent;
                    return bus;
                },
            };
        });
        const root = document.createElement('div');
        root.id = 'sidebar-root';
        document.body.append(root);

        await act(async () => {
            await import('./index');
        });

        const look = handlers.find(entry => entry.type === 'config/changed' && entry.handler.name === 'applyLook');
        expect(look).toBeDefined();
        await act(async () => {
            look!.handler({ searchDebounceMode: 'quicksearch', quickSearchResultsPerSource: 5, searchResultLimit: 20, enablePerformanceLogging: false, confirmUninstall: true, treeIndent: 8, look: 'modern', density: 'compact', uppercaseViewHeaders: false, alwaysShowHeaderActions: true, isWindows: false });
        });
        expect(document.documentElement.getAttribute('data-look')).toBe('modern');
        expect(document.documentElement.getAttribute('data-density')).toBe('compact');
        expect(document.documentElement.hasAttribute('data-uppercase-headers')).toBe(false);
        expect(document.documentElement.hasAttribute('data-always-show-header-actions')).toBe(true);
    });
});
