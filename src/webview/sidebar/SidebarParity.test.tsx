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

describe('sidebar parity: chrome and indent (UX-P3.7a)', () => {
    let removeLayout: () => void;
    let removeStyles: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 240, row: 22 });
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
        // The compact row's own padding puts the name on the pane title's x (UX-P3.7a); jsdom keeps `padding-inline` as written.
        const padding = getComputedStyle(option('Serilog')).getPropertyValue('padding-inline');
        for (const carrier of ['--nuiget-row-indent', '--nuiget-pane-header-margin-x', '--nuiget-pane-header-padding-start', '--nuiget-icon-size-md']) {
            expect(padding).toContain(carrier);
        }
        // The sidebar's stylesheet sets no padding on a row option: the primitive's is the one rule (ADR-010).
        expect(readFileSync(resolve('src/webview/sidebar/sidebar.css'), 'utf-8')).not.toMatch(/\.nuiget-row-option[^{]*\{[^}]*padding/);
        // jsdom resolves no var(): the title reads the section-title type through the pane header's carrier.
        expect(screen.getByTestId('section-box-installed')).toHaveAttribute('data-variant', 'pane');
        expect(getComputedStyle(screen.getByTestId('section-header-installed').querySelector('.nuiget-section-title') as HTMLElement).textTransform).toContain('--nuiget-section-title-transform');
    });

    it('All Projects project rows are level rows of the tree in normal case, indented by workbench.tree.indent', async () => {
        const host = await mountWith([pkg('Serilog')]);
        await hostSays(() => host.event('session/changed', snapshot(2, ALL_PROJECTS)));
        const stream = host.requests('allProjects/installed')[0];
        await hostSays(() => host.chunk(stream, { kind: 'start', projects: [{ name: 'App', path: A }, { name: 'Lib', path: B }] }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: A, projectName: 'App', result: { projectPath: A, fidelity: 'authoritative', isCpm: false, packages: [pkg('Serilog')] } } }));
        await hostSays(() => host.chunk(stream, { kind: 'project', chunk: { projectPath: B, projectName: 'Lib', result: { projectPath: B, fidelity: 'authoritative', isCpm: false, packages: [pkg('Moq')] } } }));
        await hostSays(() => host.respond(stream, { projectPaths: [A, B], errored: [] }));

        // D48 (UX-P3.7c): a project is a group row of the one tree, the level variant (13/600, no transform), at level 1 with one folder.
        const row = screen.getByTestId('group-row-project-app');
        expect(row).toHaveAttribute('data-level', '1');
        expect(within(row).getByRole('treeitem')).toHaveAttribute('aria-level', '1');
        const box = within(row).getByTestId('section-header-project-app').closest('.nuiget-section-header') as HTMLElement;
        expect(box).toHaveAttribute('data-variant', 'level');
        // Its packages are one level down: the wrapper's data-level sets the indent the compact row's padding reads.
        const serilog = screen.getByTestId('package-row-serilog');
        expect(serilog).toHaveAttribute('data-level', '2');
        expect(getComputedStyle(serilog).getPropertyValue('--nuiget-row-indent')).toContain('--nuiget-tree-indent');
        expect(getComputedStyle(within(serilog).getByRole('treeitem')).getPropertyValue('padding-inline')).toContain('--nuiget-row-indent');
    });
});
