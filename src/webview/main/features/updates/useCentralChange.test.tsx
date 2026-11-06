import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import type { SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import type { CentralUpdateRequest } from './CentralUpdateDialog';
import { useCentralChange } from './useCentralChange';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const FEED = 'https://feed.example/v3/index.json';
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const UPDATE: CentralUpdateRequest = { kind: 'update', projectPath: A, packageId: 'Newtonsoft.Json', fromVersion: '13.0.1', toVersion: '13.0.3', sourceUrl: FEED };
const INSTALL: CentralUpdateRequest = { kind: 'install', projectPath: A, packageId: 'Polly', fromVersion: '8.0.0', toVersion: '8.4.2', sourceUrl: FEED };

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** The hook under the store, its session committed on project A. */
async function mountReady() {
    const host: FakeHost = createFakeHost();
    const said: string[] = [];
    const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => <StoreProvider bus={host.bus}>{children}</StoreProvider>;
    const hook = renderHook(() => useCentralChange(message => said.push(message)), { wrapper });
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    return { host, hook, said };
}

describe('useCentralChange', () => {
    it('confirm runs ops/update for an update request and ops/install for an install request, each with the request\'s version, then closes', async () => {
        const { host, hook, said } = await mountReady();
        expect(hook.result.current.request).toBeNull();

        act(() => hook.result.current.ask(UPDATE));
        expect(hook.result.current.request).toEqual(UPDATE);
        act(() => hook.result.current.confirm());
        expect(hook.result.current.request).toBeNull();
        expect(host.requests('ops/update').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Newtonsoft.Json', version: '13.0.3', sourceUrl: FEED }]);
        expect(host.requests('ops/install')).toHaveLength(0);

        act(() => hook.result.current.ask(INSTALL));
        act(() => hook.result.current.confirm());
        expect(hook.result.current.request).toBeNull();
        expect(host.requests('ops/install').map(request => request.payload)).toEqual([{ projectPath: A, packageId: 'Polly', version: '8.4.2', sourceUrl: FEED }]);
        expect(host.requests('ops/update')).toHaveLength(1);

        // A request that got no answer is said in the live region, in the words of its kind.
        await hostSays(() => host.fail(host.requests('ops/update')[0], 'failed', 'no context'));
        await hostSays(() => host.fail(host.requests('ops/install')[0], 'failed', 'no context'));
        expect(said).toEqual(['Update of Newtonsoft.Json failed: no context', 'Install of Polly failed: no context']);
    });

    it('close sends nothing', async () => {
        const { host, hook } = await mountReady();
        act(() => hook.result.current.ask(UPDATE));
        act(() => hook.result.current.close());
        expect(hook.result.current.request).toBeNull();
        // A confirm with nothing open sends nothing either.
        act(() => hook.result.current.confirm());
        expect(host.requests('ops/update')).toHaveLength(0);
        expect(host.requests('ops/install')).toHaveLength(0);
    });

    it('a change of the committed project closes an open request', async () => {
        const { host, hook } = await mountReady();
        act(() => hook.result.current.ask(INSTALL));
        // Another flag of the same project keeps it.
        await hostSays(() => host.event('session/changed', { ...snapshot(2), includePrerelease: true }));
        expect(hook.result.current.request).toEqual(INSTALL);
        await hostSays(() => host.event('session/changed', snapshot(3, B)));
        expect(hook.result.current.request).toBeNull();
        expect(host.requests('ops/install')).toHaveLength(0);
    });
});
