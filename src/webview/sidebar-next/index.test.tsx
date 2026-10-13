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
    });

    it('mounts the sidebar into its root, acquires the API once and asks the host for the session and the projects', async () => {
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
        expect(new Set(asked)).toEqual(new Set(['session/get', 'projects/list']));
    });

    it('does not mount itself when the page has no root element', async () => {
        await import('./index');
        expect(document.body).toBeEmptyDOMElement();
        // The API can be acquired once per page; a page that is not the sidebar's must not use that up.
        expect(acquire()).not.toHaveBeenCalled();
        expect(api().postMessage).not.toHaveBeenCalled();
    });
});
