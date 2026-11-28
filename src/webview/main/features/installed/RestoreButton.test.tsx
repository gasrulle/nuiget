import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';

/** The header's Restore Packages (UX-P5.8, G10): the one restore path of the main panel, `useRestore`. */
const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const PROJECTS = [{ name: 'App', path: A }, { name: 'Lib', path: B }];
const snapshot = (rev: number, selectedProject = A): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

function mount(): FakeHost {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={() => <p>Installed list</p>} updates={() => <p>Updates list</p>} /></StoreProvider>);
    return host;
}

async function mountReady(selectedProject = A, projects = PROJECTS): Promise<FakeHost> {
    const host = mount();
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, selectedProject)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects }, 1));
    return host;
}

const button = (): HTMLElement => screen.getByTestId('restore-button');
const said = (): HTMLElement => screen.getByTestId('status-live');
const glyph = (): string | null | undefined => button().querySelector('svg')?.getAttribute('data-codicon');

describe('the header\'s Restore Packages (UX-P5.8)', () => {
    it('restores the committed project with one ops/restore request', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        expect(button()).toHaveAccessibleName('Restore Packages');
        expect(glyph()).toBe('cloud-download');
        await user.click(button());
        expect(host.requests('ops/restore').map(request => request.payload)).toEqual([{ projectPaths: [A] }]);
        expect(glyph()).toBe('loading');
    });

    it('under All Projects restores every listed project in one request', async () => {
        const user = userEvent.setup();
        const host = await mountReady(ALL_PROJECTS);
        await user.click(button());
        expect(host.requests('ops/restore').map(request => request.payload)).toEqual([{ projectPaths: [A, B] }]);
    });

    it('a second press while the restore runs asks nothing and says so; the button keeps the focus and is never disabled', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.click(button());
        await user.click(button());
        expect(host.requests('ops/restore')).toHaveLength(1);
        expect(button()).toHaveFocus();
        expect(button()).toBeEnabled();
        expect(button()).not.toHaveAttribute('aria-disabled');
        await waitFor(() => expect(said()).toHaveTextContent('A restore of this project is running.'));
    });

    it('under All Projects a second press says the restore of these projects is running', async () => {
        const user = userEvent.setup();
        const host = await mountReady(ALL_PROJECTS);
        await user.click(button());
        await user.click(button());
        expect(host.requests('ops/restore')).toHaveLength(1);
        await waitFor(() => expect(said()).toHaveTextContent('A restore of these projects is running.'));
    });

    it('a restore the host started shows the spinner, and a press then starts nothing and says so', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await hostSays(() => host.event('ops/progress', { opId: 'elsewhere', status: 'running', kind: 'restore', projectPaths: [A], packageIds: [] }));
        expect(glyph()).toBe('loading');
        await user.click(button());
        expect(host.requests('ops/restore')).toHaveLength(0);
        await waitFor(() => expect(said()).toHaveTextContent('A restore of this project is running.'));
    });

    it('a pending selection does not move the target: the committed project is restored', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.selectOptions(screen.getByTestId('project-selector'), B);
        expect(host.requests('session/set').map(request => request.payload)).toEqual([{ selectedProject: B }]);
        await user.click(button());
        expect(host.requests('ops/restore').map(request => request.payload)).toEqual([{ projectPaths: [A] }]);
    });

    it('with no project it says no project was found and sends nothing', async () => {
        const user = userEvent.setup();
        const host = await mountReady('', []);
        await user.click(button());
        expect(host.requests('ops/restore')).toHaveLength(0);
        await waitFor(() => expect(said()).toHaveTextContent('No .NET projects found in this workspace.'));
    });

    it('before the session and the project list are known a press sends and says nothing', async () => {
        const user = userEvent.setup();
        const host = mount();
        await user.click(button());
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, ALL_PROJECTS)));
        await user.click(button());
        expect(host.requests('ops/restore')).toHaveLength(0);
        expect(said()).toHaveTextContent('');
    });

    it('a request the host fails says why', async () => {
        const user = userEvent.setup();
        const host = await mountReady();
        await user.click(button());
        await hostSays(() => host.fail(host.requests('ops/restore')[0], 'failed', 'The queue is closed'));
        await waitFor(() => expect(said()).toHaveTextContent('Restore failed: The queue is closed'));
    });

    it('sits before Refresh in the header\'s actions and has no axe violations', async () => {
        await mountReady();
        const actions = within(screen.getByTestId('main-header')).getAllByRole('button').map(element => element.getAttribute('data-testid'));
        expect(actions.indexOf('restore-button')).toBe(actions.indexOf('refresh-button') - 1);
        expect(await axe(screen.getByTestId('main-header'))).toHaveNoViolations();
    });
});
