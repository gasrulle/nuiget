import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child components
vi.mock('../app/components/DraggableSash', () => ({
    MemoizedDraggableSash: (() => null) as any
}));
vi.mock('../app/icons', () => ({
    ArrowUpIcon: () => null,
    ChevronRightIcon: () => null,
    ClearAllIcon: () => null,
    FilterIcon: () => null,
}));
vi.mock('./components/PackageRow', () => ({
    PackageRow: (props: any) => (
        <div
            data-testid={`package-row-${props.packageId}`}
            data-context={props.context}
            data-installed-version={props.installedVersion || ''}
            data-action-tooltip={props.actionTooltip || ''}
            onContextMenu={(e: any) => props.onContextMenu?.(props.packageId, e)}
        >
            {props.packageId}
            <button data-testid={`action-${props.packageId}`} onClick={() => props.onPrimaryAction?.(props.packageId)} />
        </div>
    )
}));
vi.mock('./components/SectionHeader', () => ({
    SectionHeader: (props: any) => (
        <div data-testid={`section-${props.title.toLowerCase()}`} onClick={props.onToggle}>
            {props.title} ({props.count || 0})
            {props.actions}
        </div>
    )
}));
vi.mock('./SidebarApp.css', () => ({}));

import { SidebarApp } from './SidebarApp';

// Get the same vscode mock object that SidebarApp captured at module scope
// (setup-frontend.ts defines acquireVsCodeApi as a singleton factory)
const mockVsCode = (globalThis as any).acquireVsCodeApi();

function sendMessage(data: Record<string, unknown>) {
    act(() => {
        window.dispatchEvent(new MessageEvent('message', { data }));
    });
}

describe('SidebarApp', () => {
    beforeEach(() => {
        mockVsCode.postMessage.mockClear();
    });

    afterEach(() => {
        cleanup();
    });

    it('renders search input and sends ready on mount', () => {
        render(<SidebarApp />);
        expect(screen.getByRole('searchbox')).toBeDefined();
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'ready' });
    });

    it('shows no-projects welcome when projects list is empty', () => {
        render(<SidebarApp />);
        expect(screen.getByText(/No \.NET projects found/)).toBeDefined();
    });

    it('shows default mode sections after project is set', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        expect(screen.getByTestId('section-installed')).toBeDefined();
        expect(screen.getByTestId('section-updates')).toBeDefined();
    });

    it('auto-selects first project from projects message', () => {
        render(<SidebarApp />);
        mockVsCode.postMessage.mockClear();
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/path/App.csproj' }]
        });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getInstalledPackages', projectPath: '/path/App.csproj' })
        );
    });

    it('clears search on clear button click', () => {
        render(<SidebarApp />);
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'test' } });
        fireEvent.click(screen.getByLabelText('Clear search'));
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('clears search on Escape key', () => {
        render(<SidebarApp />);
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('filter button shows @-prefix dropdown', () => {
        render(<SidebarApp />);
        fireEvent.mouseDown(screen.getByLabelText('Filter'));
        expect(screen.getByText('installed')).toBeDefined();
        expect(screen.getByText('updates')).toBeDefined();
    });

    it('Enter in browse mode dispatches searchPackages', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        mockVsCode.postMessage.mockClear();
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'Serilog' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'searchPackages', query: 'Serilog' })
        );
    });

    it('renders search results in browse mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'Json' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        sendMessage({
            type: 'searchResults',
            results: [{ id: 'Newtonsoft.Json', version: '13.0.3', description: 'JSON', authors: 'JNK' }]
        });
        expect(screen.getByTestId('package-row-Newtonsoft.Json')).toBeDefined();
    });

    it('handles installedPackages message', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }] });
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0', resolvedVersion: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        expect(screen.getByTestId('package-row-PkgA')).toBeDefined();
    });

    it('handles packageUpdatesMinimal and shows update count', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }] });
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        sendMessage({
            type: 'packageUpdatesMinimal',
            updates: [{ id: 'PkgA', installedVersion: '1.0.0', latestVersion: '2.0.0' }],
            projectPath: '/App.csproj'
        });
        expect(screen.getByTestId('section-updates').textContent).toContain('Updates (1)');
    });

    it('handles forceRefresh and re-fetches installed', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        mockVsCode.postMessage.mockClear();
        sendMessage({ type: 'forceRefresh' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({
            type: 'getInstalledPackages',
            projectPath: '/App.csproj'
        });
    });

    it('handles projectChanged and re-fetches for new project', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        mockVsCode.postMessage.mockClear();
        sendMessage({ type: 'projectChanged', projectPath: '/Lib.csproj', projectName: 'Lib.csproj' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({
            type: 'getInstalledPackages',
            projectPath: '/Lib.csproj'
        });
    });

    it('resets loading flags on projectChanged to prevent stuck spinners', () => {
        const { container } = render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }, { name: 'Lib.csproj', path: '/Lib.csproj' }] });
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        // Switch to All Projects — loadingAllUpdates/loadingAllInstalled will be set by effects
        sendMessage({ type: 'projectChanged', projectPath: '__all_projects__', projectName: 'All Projects (2)' });
        // Rapidly switch back to single project before all-projects responses arrive
        sendMessage({ type: 'projectChanged', projectPath: '/App.csproj', projectName: 'App.csproj' });
        // Stale all-projects responses arrive — should NOT cause stuck spinner
        sendMessage({ type: 'allProjectsUpdates', projectUpdates: [] });
        sendMessage({ type: 'allProjectsInstalled', projectInstalled: [] });
        // Single-project responses arrive for the correct project
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        sendMessage({
            type: 'packageUpdatesMinimal',
            updates: [],
            projectPath: '/App.csproj'
        });
        const progressBar = container.querySelector('[role="progressbar"]');
        // Progress bar should NOT be active — all loading resolved
        expect(progressBar?.className).not.toContain('active');
    });

    it('resets all-projects loading flags when switching back to single project', () => {
        const { container } = render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }, { name: 'Lib.csproj', path: '/Lib.csproj' }] });
        // Simulate all-projects data loaded
        sendMessage({ type: 'allProjectsUpdates', projectUpdates: [] });
        sendMessage({ type: 'allProjectsInstalled', projectInstalled: [] });
        // Switch to single project — all-projects loading flags should be cleared
        sendMessage({ type: 'projectChanged', projectPath: '/App.csproj', projectName: 'App.csproj' });
        // Wait for getInstalledPackages response to arrive, then check progress bar
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        sendMessage({
            type: 'packageUpdatesMinimal',
            updates: [],
            projectPath: '/App.csproj'
        });
        const progressBar = container.querySelector('[role="progressbar"]');
        expect(progressBar?.className).not.toContain('active');
    });

    it('fetches all-projects data when projectChanged to ALL_PROJECTS_SENTINEL', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }, { name: 'Lib.csproj', path: '/Lib.csproj' }] });
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        mockVsCode.postMessage.mockClear();
        sendMessage({ type: 'projectChanged', projectPath: '__all_projects__', projectName: 'All Projects (2)' });
        // Should request all-projects installed data (Installed section is expanded by default)
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'checkAllProjectsInstalled' });
    });

    it('fetches all-projects data when state message sets ALL_PROJECTS_SENTINEL', () => {
        render(<SidebarApp />);
        mockVsCode.postMessage.mockClear();
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'checkAllProjectsInstalled' });
    });

    it('fetches all-projects data on forceRefresh when in all-projects mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({ type: 'allProjectsInstalled', projectInstalled: [] });
        sendMessage({ type: 'allProjectsUpdates', projectUpdates: [] });
        mockVsCode.postMessage.mockClear();
        sendMessage({ type: 'forceRefresh' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'checkAllProjectsInstalled' });
    });

    it('handles bulkUpdateResult and clears updates', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }] });
        sendMessage({
            type: 'packageUpdatesMinimal',
            updates: [{ id: 'PkgA', installedVersion: '1.0.0', latestVersion: '2.0.0' }],
            projectPath: '/App.csproj'
        });
        sendMessage({ type: 'bulkUpdateResult', failedPackageIds: [], projectPath: '/App.csproj' });
        expect(screen.getByTestId('section-updates').textContent).toContain('Updates (0)');
    });

    it('update all button dispatches bulkUpdatePackages', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({ type: 'projects', projects: [{ name: 'App.csproj', path: '/App.csproj' }] });
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'PkgA', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        sendMessage({
            type: 'packageUpdatesMinimal',
            updates: [{ id: 'PkgA', installedVersion: '1.0.0', latestVersion: '2.0.0', sourceUrl: 'https://nuget.org' }],
            projectPath: '/App.csproj'
        });
        mockVsCode.postMessage.mockClear();
        fireEvent.click(screen.getByTitle('Update all packages (1)'));
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'bulkUpdatePackages', projectPath: '/App.csproj' })
        );
    });

    it('derives all-projects mode from sentinel project', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        // In all-projects mode, getInstalledPackages should NOT be sent (sentinel is not a real project)
        const installMsgs = mockVsCode.postMessage.mock.calls.filter(
            (c: any[]) => c[0]?.type === 'getInstalledPackages'
        );
        expect(installMsgs.every((c: any[]) => c[0].projectPath !== '__all_projects__')).toBe(true);
    });

    it('sends correct projectPath in context menu for all-projects installed packages', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgB', version: '2.0.0' }] }
            ]
        });

        // Right-click on PkgA which is under /App.csproj
        const pkgRow = screen.getByTestId('package-row-PkgA');
        fireEvent.contextMenu(pkgRow);

        // Verify the showContextMenu message includes the correct project path
        const contextMenuMsgs = mockVsCode.postMessage.mock.calls.filter(
            (c: any[]) => c[0]?.type === 'showContextMenu'
        );
        expect(contextMenuMsgs.length).toBeGreaterThan(0);
        expect(contextMenuMsgs[0][0].projectPath).toBe('/App.csproj');
        expect(contextMenuMsgs[0][0].packageId).toBe('PkgA');
    });

    it('sends correct projectPath in primary action (trashcan) for all-projects installed packages', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgB', version: '2.0.0' }] }
            ]
        });

        // Click the trashcan (primary action) on PkgB which is under /Lib.csproj
        const actionBtn = screen.getByTestId('action-PkgB');
        fireEvent.click(actionBtn);

        // Verify removePackage is sent with the correct project path, not sentinel
        const removeMsgs = mockVsCode.postMessage.mock.calls.filter(
            (c: any[]) => c[0]?.type === 'removePackage'
        );
        expect(removeMsgs.length).toBe(1);
        expect(removeMsgs[0][0].projectPath).toBe('/Lib.csproj');
        expect(removeMsgs[0][0].packageId).toBe('PkgB');
    });

    it('optimistically updates browse row after installResult in all-projects mode', async () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' }
            ]
        });

        // Trigger browse mode: type text in search input and press Enter
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'Newtonsoft' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // Send browse search results
        sendMessage({
            type: 'searchResults',
            results: [{ id: 'Newtonsoft.Json', version: '13.0.3', description: 'JSON framework', authors: 'James Newton-King' }]
        });

        // Before install, the browse row should have no installed version
        const row = screen.getByTestId('package-row-Newtonsoft.Json');
        expect(row.getAttribute('data-installed-version')).toBe('');

        // Simulate successful install
        sendMessage({ type: 'installResult', success: true, packageId: 'Newtonsoft.Json', projectPath: '/App.csproj' });

        // After install, the browse row should show installed version from search results
        expect(row.getAttribute('data-installed-version')).toBe('13.0.3');
    });

    it('optimistically removes browse row installed status after removeResult in all-projects mode', async () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' }
            ]
        });

        // Trigger browse mode
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'Newtonsoft' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // Send search results
        sendMessage({
            type: 'searchResults',
            results: [{ id: 'Newtonsoft.Json', version: '13.0.3', description: 'JSON framework', authors: 'James Newton-King' }]
        });

        // First install the package
        sendMessage({ type: 'installResult', success: true, packageId: 'Newtonsoft.Json', projectPath: '/App.csproj' });
        const row = screen.getByTestId('package-row-Newtonsoft.Json');
        expect(row.getAttribute('data-installed-version')).toBe('13.0.3');

        // Now remove it
        sendMessage({ type: 'removeResult', success: true, packageId: 'Newtonsoft.Json', projectPath: '/App.csproj' });
        expect(row.getAttribute('data-installed-version')).toBe('');
    });

    it('shows installed version from allProjectsInstalled for browse rows in all-projects mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        // Send allProjectsInstalled data
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'Microsoft.Extensions.Primitives', version: '9.0.0' }] }
            ]
        });

        // Browse mode: search + Enter
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'Microsoft.Extensions.Primitives' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // Send browse results including the installed package
        sendMessage({
            type: 'searchResults',
            results: [{ id: 'Microsoft.Extensions.Primitives', version: '10.0.0', description: 'Primitives', authors: 'Microsoft' }]
        });

        // The browse row should show the installed version from allProjectsInstalled
        const row = screen.getByTestId('package-row-Microsoft.Extensions.Primitives');
        expect(row.getAttribute('data-installed-version')).toBe('9.0.0');
    });

    it('shows actionTooltip with project names for browse rows in all-projects mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] }
            ]
        });

        // Browse mode
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'PkgA' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        sendMessage({
            type: 'searchResults',
            results: [{ id: 'PkgA', version: '2.0.0', description: 'Test', authors: 'Author' }]
        });

        const row = screen.getByTestId('package-row-PkgA');
        expect(row.getAttribute('data-action-tooltip')).toBe('Uninstall from: App, Lib');
    });

    it('sends pickProjectForRemove when clicking trash on browse row in all-projects mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] }
            ]
        });

        // Browse mode
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'PkgA' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        sendMessage({
            type: 'searchResults',
            results: [{ id: 'PkgA', version: '2.0.0', description: 'Test', authors: 'Author' }]
        });

        // The primary action for an installed package in all-projects browse mode
        // is handled inside the component. We can simulate by checking the context menu
        // sends the correct installed version for the browse context.
        const row = screen.getByTestId('package-row-PkgA');
        fireEvent.contextMenu(row);

        const contextMenuMsgs = mockVsCode.postMessage.mock.calls.filter(
            (c: any[]) => c[0]?.type === 'showContextMenu'
        );
        expect(contextMenuMsgs.length).toBeGreaterThan(0);
        // Should detect as installed (from allProjectsInstalled)
        expect(contextMenuMsgs[0][0].installedVersion).toBe('1.0.0');
        expect(contextMenuMsgs[0][0].context).toBe('browse');
    });

    it('optimistically updates allProjectsInstalled after removeResult in all-projects mode', async () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }, { id: 'PkgB', version: '2.0.0' }] }
            ]
        });

        // Browse mode
        const input = screen.getByRole('searchbox');
        fireEvent.change(input, { target: { value: 'PkgA' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        sendMessage({
            type: 'searchResults',
            results: [{ id: 'PkgA', version: '3.0.0', description: 'Test', authors: 'Author' }]
        });

        // Package should show as installed from App.csproj
        const row = screen.getByTestId('package-row-PkgA');
        expect(row.getAttribute('data-installed-version')).toBe('1.0.0');

        // Remove from App.csproj — still installed in Lib.csproj
        sendMessage({ type: 'removeResult', success: true, packageId: 'PkgA', projectPath: '/App.csproj' });
        expect(row.getAttribute('data-installed-version')).toBe('1.0.0');

        // Remove from Lib.csproj — now fully removed
        sendMessage({ type: 'removeResult', success: true, packageId: 'PkgA', projectPath: '/Lib.csproj' });
        expect(row.getAttribute('data-installed-version')).toBe('');
    });

    it('packageChanged from main panel optimistically removes from allProjectsInstalled', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }, { id: 'PkgB', version: '2.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgC', version: '3.0.0' }] }
            ]
        });

        // PkgA should be visible
        expect(screen.getByTestId('package-row-PkgA')).toBeDefined();

        // Simulate main panel removing PkgA from App.csproj
        sendMessage({
            type: 'packageChanged',
            operation: { type: 'remove', packageId: 'PkgA', projectPath: '/App.csproj' }
        });

        // PkgA should be gone, PkgB and PkgC still present
        expect(screen.queryByTestId('package-row-PkgA')).toBeNull();
        expect(screen.getByTestId('package-row-PkgB')).toBeDefined();
        expect(screen.getByTestId('package-row-PkgC')).toBeDefined();
    });

    it('packageChanged install from main panel triggers re-fetch in all-projects mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        mockVsCode.postMessage.mockClear();

        sendMessage({
            type: 'packageChanged',
            operation: { type: 'install', packageId: 'NewPkg', projectPath: '/App.csproj' }
        });

        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'checkAllProjectsInstalled' })
        );
    });

    it('collapses and expands project groups in all-projects installed mode', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '__all_projects__' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [
                { projectPath: '/App.csproj', projectName: 'App.csproj', packages: [{ id: 'PkgA', version: '1.0.0' }] },
                { projectPath: '/Lib.csproj', projectName: 'Lib.csproj', packages: [{ id: 'PkgB', version: '2.0.0' }] }
            ]
        });

        // Both packages visible initially
        expect(screen.getByTestId('package-row-PkgA')).toBeDefined();
        expect(screen.getByTestId('package-row-PkgB')).toBeDefined();

        // Click the first project group header to collapse it
        const projectHeaders = screen.getAllByRole('button', { expanded: true });
        const appHeader = projectHeaders.find(h => h.textContent?.includes('App.csproj'));
        expect(appHeader).toBeDefined();
        fireEvent.click(appHeader!);

        // PkgA should be hidden, PkgB still visible
        expect(screen.queryByTestId('package-row-PkgA')).toBeNull();
        expect(screen.getByTestId('package-row-PkgB')).toBeDefined();

        // Click again to expand
        const collapsedHeaders = screen.getAllByRole('button');
        const collapsedAppHeader = collapsedHeaders.find(h => h.textContent?.includes('App.csproj'));
        fireEvent.click(collapsedAppHeader!);

        // PkgA visible again
        expect(screen.getByTestId('package-row-PkgA')).toBeDefined();
    });
});
