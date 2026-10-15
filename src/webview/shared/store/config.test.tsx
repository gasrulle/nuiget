import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExtensionConfig } from '../../../protocol';
import { createFakeHost, type FakeHost } from '../bus/testSupport';
import { MessageBusProvider } from '../bus/useMessageBus';
import { ConfigProvider, useConfig, type ConfigState } from './config';

const config = (changes: Partial<ExtensionConfig> = {}): ExtensionConfig => ({ searchDebounceMode: 'quicksearch', quickSearchResultsPerSource: 5, searchResultLimit: 50, enablePerformanceLogging: false, treeIndent: 16, isWindows: false, ...changes });

let slice: ConfigState;
function Config() {
    slice = useConfig();
    return <output data-testid="mode">{slice.config?.searchDebounceMode ?? 'unknown'}</output>;
}

function mount(): FakeHost {
    const host = createFakeHost();
    render(<MessageBusProvider bus={host.bus}><ConfigProvider><Config /></ConfigProvider></MessageBusProvider>);
    return host;
}

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});
const mode = (): string => screen.getByTestId('mode').textContent ?? '';

describe('config slice', () => {
    it('asks nothing until it is enabled, then config/get once', async () => {
        const host = mount();
        expect(host.requests('config/get')).toHaveLength(0);

        await act(async () => slice.enable());
        await act(async () => slice.enable());
        expect(host.requests('config/get')).toHaveLength(1);
        await hostSays(() => host.respond(host.requests('config/get')[0], config({ searchDebounceMode: 'fullsearch' })));
        expect(mode()).toBe('fullsearch');
    });

    it('config/changed replaces the value, also before enable', async () => {
        const host = mount();
        await hostSays(() => host.event('config/changed', config({ searchDebounceMode: 'fullsearch' })));
        expect(mode()).toBe('fullsearch');
        // Known already: enabling asks nothing.
        await act(async () => slice.enable());
        expect(host.requests('config/get')).toHaveLength(0);
        await hostSays(() => host.event('config/changed', config()));
        expect(mode()).toBe('quicksearch');
    });
});
