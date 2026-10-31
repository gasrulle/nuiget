import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import type { OperationOutcome } from '../../protocol';
import { createFakeHost, type FakeHost } from './bus/testSupport';
import { useFirstUsefulRenderMark, useShellChrome } from './shellChrome';
import { StoreProvider } from './store/StoreProvider';

function Chrome({ shown = false }: { shown?: boolean }): React.JSX.Element {
    const { live, searchRef } = useShellChrome();
    useFirstUsefulRenderMark(shown);
    return <><input aria-label="Search" ref={searchRef} /><output data-testid="said" data-repeat={live.repeat}>{live.message}</output></>;
}

const mount = (host: FakeHost, shown = false) => <StrictMode><StoreProvider bus={host.bus}><Chrome shown={shown} /></StoreProvider></StrictMode>;
const packageId = 'Serilog';
const OUTCOME: OperationOutcome = { opId: 'op1', kind: 'remove', status: 'completed', projectPath: '/w/App/App.csproj', packageId };
const marks = (host: FakeHost): string[] => host.requests('perf/mark').map(request => request.payload.name);

describe('useShellChrome', () => {
    it('marks webviewReady once under StrictMode, and firstUsefulRender once when the list is shown and never before', () => {
        const host = createFakeHost();
        const { rerender } = render(mount(host));
        expect(marks(host)).toEqual(['webviewReady']);
        rerender(mount(host, true));
        rerender(mount(host, true));
        expect(marks(host)).toEqual(['webviewReady', 'firstUsefulRender']);
    });

    it('focuses the search box when the host asks', async () => {
        const host = createFakeHost();
        render(mount(host));
        await act(async () => {
            host.event('ui/focusSearch', {});
            await Promise.resolve();
        });
        expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
    });

    it('announces how an operation ended, once per outcome', async () => {
        const host = createFakeHost();
        render(mount(host));
        await act(async () => {
            host.event('ops/completed', OUTCOME);
            await Promise.resolve();
        });
        const said = screen.getByTestId('said');
        expect(said.textContent).not.toBe('');
        expect(said).toHaveAttribute('data-repeat', '1');
    });
});
