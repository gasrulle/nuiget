import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import type { BulkOutcome, OperationOutcome, Surface } from '../../protocol';
import { createFakeHost, type FakeHost } from './bus/testSupport';
import { useFirstUsefulRenderMark, useShellChrome } from './shellChrome';
import { useOpsActions, type OpsActions } from './store/ops';
import { StoreProvider } from './store/StoreProvider';

/** The surface's `run`, kept by the test so it can start an operation as a feature does. */
let runHere: OpsActions['run'];

function Chrome({ shown = false }: { shown?: boolean }): React.JSX.Element {
    const { live, searchRef } = useShellChrome();
    runHere = useOpsActions().run;
    useFirstUsefulRenderMark(shown);
    return <><input aria-label="Search" ref={searchRef} /><output data-testid="said" data-repeat={live.repeat}>{live.message}</output></>;
}

const mount = (host: FakeHost, shown = false, surface: Surface = 'main') => <StrictMode><StoreProvider bus={host.bus} surface={surface}><Chrome shown={shown} /></StoreProvider></StrictMode>;
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

    describe('announces an outcome on the surface that asked for it only (UX-P4.6, A10)', () => {
        const hostSays = (say: () => void): Promise<void> => act(async () => {
            say();
            await Promise.resolve();
        });
        const said = (): HTMLElement => screen.getByTestId('said');
        /** Starts an uninstall here as a feature does; the outcome is read through the request's answer. */
        const askHere = (host: FakeHost) => {
            let settled: Promise<string> = Promise.resolve('');
            act(() => {
                settled = runHere('ops/remove', { projectPath: OUTCOME.projectPath, packageId }).then(() => 'ok', (error: Error) => error.message);
            });
            return { settled, request: host.requests('ops/remove').at(-1)! };
        };

        it('announces how an operation asked here ended, once, when the event comes before the response', async () => {
            const host = createFakeHost();
            render(mount(host));
            const { settled, request } = askHere(host);
            await hostSays(() => host.chunk(request, { opId: 'op1', status: 'queued', kind: 'remove' }));
            await hostSays(() => host.event('ops/completed', OUTCOME));
            expect(said()).toHaveAttribute('data-repeat', '0');
            await hostSays(() => host.respond(request, OUTCOME));
            expect(await settled).toBe('ok');
            expect(said().textContent).not.toBe('');
            expect(said()).toHaveAttribute('data-repeat', '1');
        });

        it('announces how an operation asked here ended, once, when the response comes before the event', async () => {
            const host = createFakeHost();
            render(mount(host));
            const { settled, request } = askHere(host);
            await hostSays(() => host.respond(request, OUTCOME));
            expect(await settled).toBe('ok');
            await hostSays(() => host.event('ops/completed', OUTCOME));
            expect(said().textContent).not.toBe('');
            expect(said()).toHaveAttribute('data-repeat', '1');
        });

        it('says nothing of an operation the other surface asked for', async () => {
            const host = createFakeHost();
            render(mount(host));
            await hostSays(() => host.event('ops/progress', { opId: 'op1', status: 'running', kind: 'remove', projectPaths: [OUTCOME.projectPath], packageIds: [packageId] }));
            await hostSays(() => host.event('ops/completed', OUTCOME));
            expect(said().textContent).toBe('');
            expect(said()).toHaveAttribute('data-repeat', '0');
        });

        it('says a row-menu outcome whose origin is this surface, once, and nothing of the other surface\'s or of one without an origin (UX-P4.fix-11)', async () => {
            const host = createFakeHost();
            render(mount(host));
            // Another surface's menu, and an operation the host started with no surface to name: nothing here.
            await hostSays(() => host.event('ops/progress', { opId: 'host1', status: 'queued', kind: 'remove', projectPaths: [OUTCOME.projectPath], packageIds: [packageId] }));
            await hostSays(() => host.event('ops/completed', { ...OUTCOME, opId: 'host1', origin: 'sidebar' }));
            await hostSays(() => host.event('ops/completed', { ...OUTCOME, opId: 'host2' }));
            expect(said().textContent).toBe('');
            expect(said()).toHaveAttribute('data-repeat', '0');
            // This surface's menu: said once, though the event comes twice.
            await hostSays(() => host.event('ops/completed', { ...OUTCOME, opId: 'host3', origin: 'main' }));
            await hostSays(() => host.event('ops/completed', { ...OUTCOME, opId: 'host3', origin: 'main' }));
            expect(said().textContent).toBe('Uninstalled Serilog');
            expect(said()).toHaveAttribute('data-repeat', '1');
        });

        it('says a cancelled row-menu operation of this surface in the existing sentence (UX-P4.fix-11)', async () => {
            const host = createFakeHost();
            render(mount(host, false, 'sidebar'));
            await hostSays(() => host.event('ops/completed', { ...OUTCOME, opId: 'host4', status: 'cancelled', origin: 'sidebar' }));
            expect(said().textContent).toBe('Uninstall of Serilog was cancelled');
        });

        it('says a bulk row-menu outcome of this surface in the bulk sentence (UX-P4.fix-11)', async () => {
            const host = createFakeHost();
            render(mount(host));
            const bulk: BulkOutcome = {
                opId: 'host5', status: 'completed', restores: [],
                results: [{ ...OUTCOME, opId: 'host5', kind: 'install' }, { ...OUTCOME, opId: 'host5', kind: 'install', projectPath: '/w/Lib/Lib.csproj' }],
            };
            await hostSays(() => host.event('ops/completed', { ...bulk, origin: 'main' }));
            expect(said().textContent).toBe('Installed Serilog in 2 projects');
        });

        it('announces the same outcome twice when it is asked for twice', async () => {
            const host = createFakeHost();
            render(mount(host));
            const first = askHere(host);
            await hostSays(() => host.respond(first.request, OUTCOME));
            await first.settled;
            const second = askHere(host);
            await hostSays(() => host.respond(second.request, { ...OUTCOME, opId: 'op2' }));
            await second.settled;
            expect(said()).toHaveAttribute('data-repeat', '2');
        });
    });
});
