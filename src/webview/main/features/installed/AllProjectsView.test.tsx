import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, resourceKeys, type InstalledPackage, type InstalledResult, type ProjectTransitiveChunk, type SessionSnapshot } from '../../../../protocol';
import { createFakeHost, type FakeHost } from '../../../shared/bus/testSupport';
import { axeRuleOutcome, installFakeLayout } from '../../../shared/primitives/testSupport';
import { StoreProvider } from '../../../shared/store/StoreProvider';
import { MainShell } from '../../MainShell';
import { DetailsPane } from '../details/DetailsPane';
import { aggregateTransitive, describeOrigins } from './transitiveAggregate';
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

async function mountAll(projects = PROJECTS, withDetails = false): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><MainShell installed={view => <InstalledTab {...view} />} {...(withDetails ? { details: view => <DetailsPane {...view} /> } : {})} /></StoreProvider>);
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

    const treeitem = (testId: string): Element | null | undefined => screen.queryByTestId(testId)?.querySelector('[role="treeitem"]');

    const groupRows = (): string[] => [...screen.getByTestId('installed-list').querySelectorAll<HTMLElement>('[data-row-kind="group"]')].map(row => (row.dataset.testid ?? '').replace('group-row-', ''));

    it('several workspace folders: a level-1 group row per folder, the project group rows at level 2 and their packages at level 3', async () => {
        await mountAll();
        for (const folder of ['w1', 'w2']) {
            expect(treeitem(`group-row-folder-${folder}`)).toHaveAttribute('aria-level', '1');
        }
        for (const project of ['app', 'lib', 'tool']) {
            expect(treeitem(`group-row-project-${project}`)).toHaveAttribute('aria-level', '2');
        }
        expect(within(screen.getByTestId('installed-list')).getAllByRole('treeitem', { name: /^Serilog/ }).map(row => row.getAttribute('aria-level'))).toEqual(['3', '3', '3']);
        // Membership is the tree's order: each folder over its own projects.
        expect(groupRows()).toEqual(['folder-w1', 'project-app', 'project-lib', 'folder-w2', 'project-tool', 'transitive']);
    });

    it('collapsing a folder group row hides its projects and packages; a project name repeated gets its own group row', async () => {
        const user = userEvent.setup();
        const D = '/w1/Other/App.csproj';
        const E = '/w1/Third/App.csproj';
        await mountAll([...PROJECTS, { name: 'App', path: D, workspaceFolder: 'w1' }, { name: 'App', path: E, workspaceFolder: 'w1' }]);
        expect(groupRows()).toEqual(['folder-w1', 'project-app', 'project-lib', 'project-w1/app', `project-${E.toLowerCase()}`, 'folder-w2', 'project-tool', 'transitive']);
        (treeitem('group-row-folder-w1') as HTMLElement).focus();
        await user.keyboard('{Enter}');
        expect(treeitem('group-row-folder-w1')).toHaveAttribute('aria-expanded', 'false');
        expect(groupRows()).toEqual(['folder-w1', 'folder-w2', 'project-tool', 'transitive']);
        expect(within(screen.getByTestId('installed-list')).getAllByRole('treeitem', { name: /^Serilog/ })).toHaveLength(1);
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

        const [app, lib] = within(screen.getByTestId('installed-list')).getAllByTestId('package-row-serilog');
        expect(app.querySelector('.nuiget-row-icon img')).toHaveAttribute('src', DATA);
        expect(within(app).getByRole('treeitem')).toHaveAccessibleDescription(/Verified/);
        expect(lib.querySelector('.nuiget-row-icon img')).toHaveAttribute('src', DEFAULT_ICON);
        expect(within(lib).getByRole('treeitem')).not.toHaveAccessibleDescription(/Verified/);
    });

    it('all-projects transitive details lists one block per project', async () => {
        const user = userEvent.setup();
        const host = await mountAll([...PROJECTS.slice(0, 2), PROJECTS[2]], true);
        await user.click(screen.getByTestId('section-header-transitive'));
        const stream = host.requests('allProjects/transitive')[0];
        const core = (roots: string[]) => [{ targetFramework: 'net8.0', packages: [{ id: 'Serilog.Core', version: '1.0.0', requiredByChain: roots }] }];
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(A, 'App', core(['Serilog'])) }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(B, 'Lib', core(['Serilog.Sinks.File'])) }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(C, 'Tool', core([])) }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B, C], errored: [] }));

        const row = screen.getByTestId('package-row-serilog.core');
        expect(row.querySelector('.nuiget-row-badges')).toHaveTextContent('3 projects');
        const asks = host.requests('transitive/metadata').filter(request => request.payload.packages.some(entry => entry.id === 'Serilog.Core'));
        expect(asks.map(request => request.payload)).toEqual([{ packages: [{ id: 'Serilog.Core', version: '1.0.0' }] }]);
        await hostSays(() => host.respond(asks[0], { metadata: [{ id: 'Serilog.Core', version: '1.0.0', iconUrl: 'data:image/png;base64,AAAA', authors: 'Serilog Contributors', verified: true }] }));
        expect(row.querySelector('.nuiget-row-icon img')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
        const option = within(row).getByRole('treeitem');
        expect(option).toHaveAccessibleDescription(/Verified/);

        await user.click(option);
        const details = screen.getByTestId('transitive-details');
        const blocks = within(details).getAllByRole('heading', { level: 4 }).map(heading => heading.textContent);
        expect(blocks).toEqual(['App', 'Lib', 'Tool']);
        // Each block's heading is a level box of the measurements (UX-P0.10).
        expect(within(details).getAllByRole('heading', { level: 4 }).map(heading => [heading.dataset.testid, heading.dataset.variant])).toEqual([
            ['section-box-required-by-app', 'level'], ['section-box-required-by-lib', 'level'], ['section-box-required-by-tool', 'level'],
        ]);
        expect(details).toHaveTextContent('AppSerilog');
        expect(details).toHaveTextContent('LibSerilog.Sinks.File');
        expect(details).toHaveTextContent('ToolNo traceable top-level package');
        expect(host.requests('package/metadata')).toHaveLength(0);
    });

    it('one workspace folder: no folder group row; the project group rows are level 1', async () => {
        await mountAll(PROJECTS.slice(0, 2));
        expect(screen.queryByTestId('group-row-folder-w1')).toBeNull();
        expect(treeitem('group-row-project-app')).toHaveAttribute('aria-level', '1');
    });

    it('the Transitive group row aggregates every project once expanded, and the banner above the tree offers Restore for the projects not restored', async () => {
        const user = userEvent.setup();
        const host = await mountAll(PROJECTS.slice(0, 2));
        expect(host.requests('allProjects/transitive')).toHaveLength(0);
        // One tree: the aggregate's group row follows the project group rows (P9.fix-2, D48).
        expect(groupRows()).toEqual(['project-app', 'project-lib', 'transitive']);

        await user.click(screen.getByTestId('section-header-transitive'));
        const stream = host.requests('allProjects/transitive')[0];
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(A, 'App', [{ targetFramework: 'net8.0', packages: [{ id: 'Serilog.Core', version: '1.0.0', requiredByChain: ['Serilog'] }] }]) }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: transitiveChunk(B, 'Lib', [], false) }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));

        const rows = screen.getByTestId('installed-list').querySelectorAll('[data-testid="group-row-transitive"] ~ .nuiget-row:not([data-row-kind="group"]) .nuiget-row-option');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveAccessibleDescription(/App: required by Serilog/);
        expect(screen.getByTestId('transitive-restore-banner')).toHaveTextContent('Not restored, so their transitive packages are not known: Lib.');
        expect(screen.getByTestId('installed-list').contains(screen.getByTestId('transitive-restore-banner'))).toBe(false);
        expect(screen.getByTestId('transitive-restore-banner').compareDocumentPosition(screen.getByTestId('installed-list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
        expect(list.querySelectorAll('.nuiget-row-option')).toHaveLength(2);
        expect(within(list).queryAllByTestId('row-action-uninstall')).toHaveLength(0);
        await user.click(screen.getByTestId('select-all-button'));
        expect(screen.getByTestId('uninstall-selected-button')).toHaveTextContent('Uninstall selected (0)');
    });

    it('a packages.config project is a group row with the Unsupported badge and no rows; its banner names it above the tree', async () => {
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

        const tree = screen.getByTestId('installed-list');
        const lib = within(tree).getByTestId('group-row-project-lib');
        // The badge is on the group row; the row carries no count of 0.
        expect(lib).toHaveTextContent('Unsupported');
        expect(lib.querySelector('[role="treeitem"]')).toHaveAccessibleName(/^Lib(?! 0)/);
        expect(within(lib).queryByText('0')).toBeNull();
        const banner = screen.getByText('Unsupported project Lib: packages.config projects are not supported');
        expect(tree.contains(banner)).toBe(false);
        expect(banner.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(tree.querySelectorAll('.nuiget-row-option')).toHaveLength(2);
        expect(screen.queryByText('No packages installed.')).toBeNull();
    });

    it('has no axe violations with folders and the Transitive group row expanded', async () => {
        const user = userEvent.setup();
        const host = await mountAll();
        await user.click(screen.getByTestId('section-header-transitive'));
        await hostSays(() => host.respond(host.requests('allProjects/transitive')[0], { projectPaths: [], errored: [] }));
        const results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(['aria-allowed-attr', 'aria-required-children', 'aria-required-parent', 'nested-interactive'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes', 'passes']);
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
