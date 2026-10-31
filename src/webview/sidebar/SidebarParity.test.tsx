import { act, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PROJECTS, type ExtensionConfig, type InstalledPackage, type SessionSnapshot } from '../../protocol';
import { createFakeHost, type FakeHost } from '../shared/bus/testSupport';
import { installFakeLayout, installStylesheet } from '../shared/primitives/testSupport';
import { StoreProvider } from '../shared/store/StoreProvider';
import { SidebarView } from './SidebarView';

const A = '/w/App/App.csproj';
const B = '/w/Lib/Lib.csproj';
const snapshot = (rev: number, selectedProject: string): SessionSnapshot => ({ rev, selectedProject, selectedSource: 'all', includePrerelease: false, restoreEnabled: true, origin: 'host' });
const pkg = (id: string): InstalledPackage => ({ id, version: '1.0.0', versionType: 'standard', declaration: 'project' });
const config = (treeIndent: number): ExtensionConfig => ({ searchDebounceMode: 'full', quickSearchResultsPerSource: 5, searchResultLimit: 50, enablePerformanceLogging: false, treeIndent, isWindows: false });

/** The rows' padding before their name: the section title's start (toggle padding, chevron, gap). */
const SECTION_ROW_START = 'calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2))';
const PROJECT_ROW_START = 'calc(var(--nuiget-space-2) + var(--nuiget-icon-size-md) + var(--nuiget-space-2) + var(--nuiget-tree-indent))';

const hostSays = (say: () => void): Promise<void> => act(async () => {
    say();
    await Promise.resolve();
});

/** The shared stylesheets and the sidebar's own, so computed styles reflect the cascade the sidebar ships. */
function installSidebarStylesheet(): () => void {
    const removeShared = installStylesheet();
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve('src/webview/sidebar/sidebar.css'), 'utf-8');
    document.head.appendChild(style);
    return () => {
        style.remove();
        removeShared();
    };
}

async function mountWith(packages: InstalledPackage[]): Promise<FakeHost> {
    const host = createFakeHost();
    render(<StoreProvider bus={host.bus}><SidebarView /></StoreProvider>);
    await hostSays(() => host.respond(host.requests('session/get')[0], snapshot(1, A)));
    await hostSays(() => host.respond(host.requests('projects/list')[0], { projects: [{ name: 'App', path: A }] }, 1));
    await hostSays(() => host.respond(host.requests('installed/get')[0], { projectPath: A, fidelity: 'authoritative', isCpm: false, packages }, 1));
    return host;
}

const option = (id: string): HTMLElement => within(screen.getByTestId(`package-row-${id.toLowerCase()}`)).getByRole('option');

describe('sidebar parity: chrome and indent (P9.10)', () => {
    let removeLayout: () => void;
    let removeStyles: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 24 });
        removeStyles = installSidebarStylesheet();
    });

    afterEach(() => {
        removeStyles();
        removeLayout();
    });

    it('the root carries workbench.tree.indent as --nuiget-tree-indent', async () => {
        const host = await mountWith([pkg('Serilog')]);
        expect(host.requests('config/get')).toHaveLength(1);
        await hostSays(() => host.respond(host.requests('config/get')[0], config(16)));
        expect(screen.getByTestId('nuiget-sidebar').getAttribute('style')).toContain('--nuiget-tree-indent: 16px');
        await hostSays(() => host.event('config/changed', config(20)));
        expect(screen.getByTestId('nuiget-sidebar').getAttribute('style')).toContain('--nuiget-tree-indent: 20px');
    });

    it('rows start at the section title', async () => {
        await mountWith([pkg('Serilog')]);
        expect(getComputedStyle(option('Serilog')).paddingInlineStart).toBe(SECTION_ROW_START);
        // jsdom resolves no var(): the title reads the section-title type through the pane header's carrier.
        expect(screen.getByTestId('section-box-installed')).toHaveAttribute('data-variant', 'pane');
        expect(getComputedStyle(screen.getByTestId('section-header-installed').querySelector('.nuiget-section-title') as HTMLElement).textTransform).toContain('--nuiget-section-title-transform');
    });

    it('All Projects project headers are in normal case and name their path', async () => {
        const host = await mountWith([pkg('Serilog')]);
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog')] } } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq')] } } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));

        const header = screen.getByTestId('section-header-project-app');
        expect(header).toHaveAttribute('title', A);
        // The project's context switches the group look's transform off through its carrier (DS-TYPE-5's sidebar clause is P3.7a's).
        const box = header.closest('.nuiget-section-header') as HTMLElement;
        expect(box).toHaveAttribute('data-variant', 'group');
        expect(getComputedStyle(header.querySelector('.nuiget-section-title') as HTMLElement).textTransform).toContain('--nuiget-section-title-transform');
        expect(getComputedStyle(box).getPropertyValue('--nuiget-section-title-transform')).toContain('--nuiget-group-title-transform');
        expect(getComputedStyle(header.closest('.nuiget-sidebar-project') as HTMLElement).getPropertyValue('--nuiget-group-title-transform')).toBe('none');
        const appOption = within(screen.getByTestId('sidebar-installed-list-app')).getByRole('option');
        expect(getComputedStyle(appOption).paddingInlineStart).toBe(PROJECT_ROW_START);
    });
});
