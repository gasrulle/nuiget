import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type InstalledResult, type ProjectTransitiveChunk, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { aggregateTransitive, describeOrigins } from './AllProjectsTransitiveSection';
import { InstalledTab } from './InstalledTab';

const A = '/w1/App/App.csproj';
const B = '/w1/Lib/Lib.csproj';
const C = '/w2/Tool/Tool.csproj';
const snapshot = (rev: number, selectedProject = ALL_PROJECTS): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string, version = '1.0.0'): InstalledPackage => ({ id, version, versionType: 'standard', declaration: 'project' });
const installed = (projectPath: string, packages: InstalledPackage[]): InstalledResult => ({ projectPath, fidelity: 'authoritative', isCpm: false, packages });
const PROJECTS = [{ name: 'App', path: A, workspaceFolder: 'w1' }, { name: 'Lib', path: B, workspaceFolder: 'w1' }, { name: 'Tool', path: C, workspaceFolder: 'w2' }];

// The bundled default icon the host puts on the root; `defaultPackageIcon()` keeps the first value it finds.
const DEFAULT_ICON = 'https://file+.vscode-resource.vscode-cdn.net/ext/resources/package-icon.png';
document.body.setAttribute('data-package-icon', DEFAULT_ICON);

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

async function mountAll(projects = PROJECTS): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects }, 1));
    const stream = host.requests('allProjects/installed')[0];
    await hostSays(() => host.chunk(stream, { kind: 'start', projects }));
    for (const project of projects) {
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: project.path, projectName: project.name, workspaceFolder: project.workspaceFolder, result: installed(project.path, [pkg('Serilog')]) } }));
    }
    await hostSays(() => host.respond(stream, { projectPaths: projects.map(project => project.path), errored: [] }));
    return host;
}

const transitiveChunk = (projectPath: string, projectName: string, frameworks: ProjectTransitiveChunk['frameworks'], dataSourceAvailable = true): ProjectTransitiveChunk => ({ projectPath, projectName, frameworks, dataSourceAvailable });

describe('main panel: All Projects', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 600, row: 44 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('several workspace folders: a heading per folder over its projects, the project headers one level down', async () => {
        await mountAll();
        const w1 = screen.getByRole('region', { name: 'Workspace folder w1' });
        const w2 = screen.getByRole('region', { name: 'Workspace folder w2' });
        expect(within(w1).getByRole('heading', { level: 2, name: 'w1' })).toBeInTheDocument();
        expect(within(w1).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([expect.stringContaining('App'), expect.stringContaining('Lib')]);
        expect(within(w2).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual([expect.stringContaining('Tool')]);
    });

    it('all-projects installed row shows icon from metadata chunk', async () => {
        const projects = PROJECTS.slice(0, 2);
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects }, 1));
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects }));
        for (const project of projects) {
            await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: project.path, projectName: project.name, workspaceFolder: project.workspaceFolder, result: installed(project.path, [pkg('Serilog')]) } }));
        }
        // A metadata chunk counts only before the answer of its request.
        const DATA = 'data:image/png;base64,AAAA';
        await hostSays(() => host.chunk(stream, { kind: 'metadata', projectPath: A, packages: [{ id: 'Serilog', version: '1.0.0', iconUrl: DATA, authors: 'Serilog Contributors', verified: true }] }));
        await hostSays(() => host.respond(stream, { projectPaths: projects.map(project => project.path), errored: [] }));

        const row = (list: string): HTMLElement => within(screen.getByTestId(`installed-list-${list}`)).getByTestId('package-row-serilog');
        expect(row('app').querySelector('.nuiget-row-icon img')).toHaveAttribute('src', DATA);
        expect(within(row('app')).getByRole('option')).toHaveAccessibleDescription(/Verified/);
        expect(row('lib').querySelector('.nuiget-row-icon img')).toHaveAttribute('src', DEFAULT_ICON);
        expect(within(row('lib')).getByRole('option')).not.toHaveAccessibleDescription(/Verified/);
    });

    it('one workspace folder: no folder heading, the project headers stay at level 2', async () => {
        await mountAll(PROJECTS.slice(0, 2));
        expect(screen.queryByRole('region', { name: /Workspace folder/ })).toBeNull();
        expect(screen.getByTestId('section-header-project-app').closest('h2')).not.toBeNull();
    });

    it('the transitive section aggregates every project once opened, and offers Restore for the projects not restored', async () => {
        const user = userEvent.setup();
        const host = await mountAll(PROJECTS.slice(0, 2));
        expect(host.requests('allProjects/transitive')).toHaveLength(0);

        await user.click(screen.getByTestId('section-header-transitive'));
        const stream = host.requests('allProjects/transitive')[0];
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(A, 'App', [{ targetFramework: 'net8.0', packages: [{ id: 'Serilog.Core', version: '1.0.0', requiredByChain: ['Serilog'] }] }]) }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(B, 'Lib', [], false) }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));

        const list = screen.getByTestId('transitive-list');
        expect(within(list).getAllByRole('option')).toHaveLength(1);
        expect(within(list).getByRole('option')).toHaveAccessibleDescription('App: required by Serilog');
        expect(screen.getByTestId('transitive-restore-banner')).toHaveTextContent('Not restored, so their transitive packages are not known: Lib.');
        await user.click(within(screen.getByTestId('transitive-restore-banner')).getByRole('button', { name: 'Restore' }));
        expect(host.requests('ops/restore').map(request => request.payload)).toEqual([{ projectPaths: [B] }]);

        // Closing keeps what was listed; a restore's invalidation asks again.
        await user.click(screen.getByTestId('section-header-transitive'));
        await hostSays(() => host.invalidate([[resourceKeys.transitive(B), 2]]));
        expect(host.requests('allProjects/transitive')).toHaveLength(2);
    });

    it('an sdk-too-old project lists its packages read-only under the Unsupported banner and takes no bulk selection', async () => {
        const user = userEvent.setup();
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: PROJECTS }, 1));
        await hostSays(() => host.respond(host.requests('installed/get')[0], { ...installed(A, [pkg('Serilog'), pkg('Moq')]), unsupported: { reason: 'sdk-too-old', message: 'requires .NET SDK 10 or newer' } }, 1));

        expect(screen.getByText('Unsupported project: requires .NET SDK 10 or newer')).toBeInTheDocument();
        const list = screen.getByTestId('installed-list');
        expect(within(list).getAllByRole('option')).toHaveLength(2);
        expect(within(list).queryAllByTestId('row-action-uninstall')).toHaveLength(0);
        await user.click(screen.getByTestId('select-all-button'));
        expect(screen.getByTestId('uninstall-selected-button')).toHaveTextContent('Uninstall selected (0)');
    });

    it('a packages.config project is a section with the banner and no list, in its folder', async () => {
        const host = createFakeHost();
        render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} /></StoreProvider>);
        await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1)));
        await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: PROJECTS }, 1));
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: PROJECTS }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', workspaceFolder: 'w1', result: installed(A, [pkg('Serilog')]) } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', workspaceFolder: 'w1', result: { ...installed(B, []), unsupported: { reason: 'packages-config', message: 'packages.config projects are not supported' } } } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: C, projectName: 'Tool', workspaceFolder: 'w2', result: installed(C, [pkg('xunit')]) } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B, C], errored: [] }));

        const w1 = screen.getByRole('region', { name: 'Workspace folder w1' });
        const lib = within(w1).getByTestId('section-header-project-lib');
        // The badge is in the header's actions beside the toggle; the toggle carries no count of 0.
        expect(lib.closest('.nuiget-section-header')).toHaveTextContent('Unsupported');
        expect(lib).toHaveAccessibleName('Lib');
        expect(within(w1).getByText('Unsupported project: packages.config projects are not supported')).toBeInTheDocument();
        expect(screen.queryByTestId('installed-list-lib')).toBeNull();
        expect(screen.queryByText('No packages installed.')).toBeNull();
        expect(screen.getByTestId('installed-list-app')).toBeInTheDocument();
    });

    it('has no axe violations with folders and the transitive section open', async () => {
        const user = userEvent.setup();
        const host = await mountAll();
        await user.click(screen.getByTestId('section-header-transitive'));
        await hostSays(() => host.respond(host.requests('allProjects/transitive')[0], { projectPaths: [], errored: [] }));
        expect(await axe(document.body)).toHaveNoViolations();
    });
});

describe('aggregateTransitive', () => {
    it('one row per id and version without regard to case; frameworks with the same roots merge into one origin', () => {
        const rows = aggregateTransitive([
            transitiveChunk(A, 'App', [
                { targetFramework: 'net8.0', packages: [{ id: 'Serilog.Core', version: '1.0.0', requiredByChain: ['Serilog'] }] },
                { targetFramework: 'net6.0', packages: [{ id: 'serilog.core', version: '1.0.0', requiredByChain: ['Serilog'] }, { id: 'Serilog.Core', version: '2.0.0', requiredByChain: [] }] },
            ]),
            transitiveChunk(B, 'Lib', [{ targetFramework: 'net8.0', packages: [{ id: 'Serilog.Core', version: '1.0.0', requiredByChain: ['A', 'B'], fullChain: ['A', 'B', 'C'] }] }]),
        ]);

        expect(rows.map(row => `${row.id}@${row.version}`)).toEqual(['Serilog.Core@1.0.0', 'Serilog.Core@2.0.0']);
        expect(rows[0].origins).toEqual([
            { projectPath: A, projectName: 'App', frameworks: ['net8.0', 'net6.0'], roots: ['Serilog'] },
            { projectPath: B, projectName: 'Lib', frameworks: ['net8.0'], roots: ['A', 'B', 'C'] },
        ]);
        expect(describeOrigins(rows[0].origins)).toBe('App: required by Serilog; Lib: required by A, B, C');
        expect(describeOrigins(rows[1].origins)).toBe('App: no traceable top-level package');
    });
});
