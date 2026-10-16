import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { installFakeLayout } from '../shared/primitives/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { readLayout, SidebarView, type ViewStateStore } from './SidebarView';

const A = '/w/App/App.csproj';
const snapshot = (rev: number): SessionSnapshot => ({ rev, selectedProject: A, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

function storeWith(initial: unknown): ViewStateStore & { setState: ReturnType<typeof vi.fn> } {
    let state = initial;
    return { getState: () => state, setState: vi.fn((next: unknown) => { state = next; }) };
}

async function mount(store?: ViewStateStore): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView viewState={store} /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    return host;
}

const sash = (): HTMLElement | null => screen.queryByTestId('sash');
const shareOf = (testKey: string): string | undefined => {
    const section = screen.getByTestId(`section-header-${testKey}`).closest('section') as HTMLElement;
    return section.style.getPropertyValue('--nuiget-sidebar-share') || undefined;
};

describe('sidebar layout', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('both sections open: a sash between them shares the height, and the keyboard moves it', async () => {
        const user = userEvent.setup();
        const store = storeWith(undefined);
        await mount(store);
        expect(sash()).toHaveAttribute('role', 'separator');
        expect(sash()).toHaveAccessibleName('Resize the Installed and Updates sections');
        expect(shareOf('installed')).toBe('50');
        expect(shareOf('updates')).toBe('50');

        (sash() as HTMLElement).focus();
        await user.keyboard('{ArrowDown}');
        expect(Number(shareOf('installed'))).toBeGreaterThan(50);
        expect(Number(shareOf('installed')) + Number(shareOf('updates'))).toBe(100);
        expect(store.setState).toHaveBeenLastCalledWith({ layout: { split: Number(shareOf('installed')), installedExpanded: true, updatesExpanded: true } });
    });

    it('a collapsed section takes no share and the sash goes; the layout is kept in the view state and restored', async () => {
        const user = userEvent.setup();
        const store = storeWith({ other: 'kept', layout: { split: 30, installedExpanded: true, updatesExpanded: true } });
        await mount(store);
        expect(shareOf('installed')).toBe('30');

        await user.click(screen.getByTestId('section-header-updates'));
        expect(sash()).toBeNull();
        expect(shareOf('installed')).toBeUndefined();
        expect(store.setState).toHaveBeenLastCalledWith({ other: 'kept', layout: { split: 30, installedExpanded: true, updatesExpanded: false } });
    });

    it('a filter mode shows one section without the sash', async () => {
        const user = userEvent.setup();
        await mount(storeWith(undefined));
        await user.type(screen.getByTestId('sidebar-search-input'), '@installed ');
        expect(sash()).toBeNull();
    });

    it('readLayout falls back to the default for missing or broken state and clamps the split', () => {
        expect(readLayout(undefined)).toEqual({ split: 50, installedExpanded: true, updatesExpanded: true });
        expect(readLayout(storeWith('nonsense'))).toEqual({ split: 50, installedExpanded: true, updatesExpanded: true });
        expect(readLayout(storeWith({ layout: { split: 95, updatesExpanded: false } }))).toEqual({ split: 80, installedExpanded: true, updatesExpanded: false });
        expect(readLayout({ getState: () => { throw new Error('no state'); }, setState: () => undefined })).toEqual({ split: 50, installedExpanded: true, updatesExpanded: true });
    });
});
