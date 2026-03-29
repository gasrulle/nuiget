import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child components
vi.mock('../app/components/DraggableSash', () => ({
    MemoizedDraggableSash: (() => null) as any
}));
vi.mock('../app/icons', () => ({
    AllProjectsIcon: () => null,
    ArrowUpIcon: () => null,
    ClearAllIcon: () => null,
    FilterIcon: () => null,
    SingleProjectIcon: () => null,
}));
vi.mock('./components/PackageRow', () => ({
    PackageRow: (props: any) => (
        <div data-testid={`package-row-${props.packageId}`} data-context={props.context}>
            {props.packageId}
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

    it('shows all-projects toggle for multi-project workspace', () => {
        render(<SidebarApp />);
        sendMessage({ type: 'state', selectedProject: '/App.csproj' });
        sendMessage({
            type: 'projects', projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        expect(screen.getAllByTitle('Load all projects').length).toBeGreaterThanOrEqual(1);
    });
});
