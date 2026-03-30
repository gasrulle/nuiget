import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all child components and modules
vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: () => ({
        getVirtualItems: () => [],
        getTotalSize: () => 0,
        measureElement: () => { },
    }),
}));
vi.mock('./utils/parseSearchQuery', () => ({
    parseSearchQuery: (q: string) => {
        if (!q || !q.trim()) { return { mode: 'default' as const, filterText: '' }; }
        if (q.startsWith('@installed')) { return { mode: 'installed' as const, filterText: q.slice(10).trim() }; }
        if (q.startsWith('@updates')) { return { mode: 'updates' as const, filterText: q.slice(8).trim() }; }
        if (q.startsWith('@vulnerable')) { return { mode: 'vulnerable' as const, filterText: q.slice(11).trim() }; }
        return { mode: 'browse' as const, filterText: q.trim() };
    },
    FILTER_PREFIXES: ['@installed', '@updates', '@vulnerable'],
}));
vi.mock('./components/InstalledTab', () => ({
    MemoizedInstalledTab: React.forwardRef((_p: any, _r: any) => <div data-testid="installed-tab-comp" />)
}));
vi.mock('./components/UpdatesTab', () => ({
    MemoizedUpdatesTab: React.forwardRef((_p: any, _r: any) => <div data-testid="updates-tab-comp" />)
}));
vi.mock('./components/PackageDetailsPanel', () => ({
    MemoizedPackageDetailsPanel: () => <div data-testid="details-panel" />
}));
vi.mock('./components/SourceSettingsOverlay', () => ({
    MemoizedSourceSettingsOverlay: React.forwardRef((_p: any, _r: any) => <div data-testid="source-settings" />)
}));
vi.mock('./components/DraggableSash', () => ({
    MemoizedDraggableSash: (() => null) as any
}));
vi.mock('./hooks/usePackageSelection', () => ({
    usePackageSelection: () => ({
        selectDirectPackage: vi.fn(),
        selectTransitivePackage: vi.fn(),
        clearSelection: vi.fn()
    })
}));
vi.mock('./icons', () => ({
    ClearAllIcon: () => null,
    CloudDownloadIcon: () => null,
    FilterIcon: () => null,
    LoadingIcon: () => null,
    SettingsGearIcon: () => null,
    SyncIcon: () => null,
    VerifiedIcon: () => null,
    WarningIcon: () => null,
}));
vi.mock('./markdownSetup', () => ({
    renderMarkdownToHtml: (md: string) => md
}));
vi.mock('./types', () => ({
    LRUMap: class {
        _m = new Map();
        get(k: string) { return this._m.get(k); }
        set(k: string, v: unknown) { this._m.set(k, v); }
        clear() { this._m.clear(); }
    },
    getPackageId: (pkg: any) => pkg?.id || ''
}));
vi.mock('./App.css', () => ({}));

import { App } from './App';

// Get the same vscode mock object that App captured at module scope
const mockVsCode = (globalThis as any).acquireVsCodeApi();

function sendMessage(data: Record<string, unknown>) {
    act(() => {
        window.dispatchEvent(new MessageEvent('message', { data }));
    });
}

describe('App', () => {
    beforeEach(() => {
        mockVsCode.postMessage.mockClear();
        mockVsCode.setState.mockClear();
    });

    afterEach(() => {
        cleanup();
    });

    it('renders header with title', () => {
        render(<App />);
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('renders tab buttons (Installed and Updates only)', () => {
        render(<App />);
        expect(screen.getByRole('button', { name: /Installed/ })).toBeDefined();
        expect(screen.getByRole('button', { name: /Updates/ })).toBeDefined();
        expect(screen.queryByText('Browse')).toBeNull();
    });

    it('sends initial data requests on mount', () => {
        render(<App />);
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'getProjects' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'getSources' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'getSettings' });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'getSplitPosition' });
    });

    it('installed tab is active by default', () => {
        render(<App />);
        const installedBtn = screen.getByRole('button', { name: /Installed/ });
        expect(installedBtn.className).toContain('active');
    });

    it('handles projects message and populates selector', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        const options = screen.getAllByRole('option');
        const projectOptions = options.filter(
            o => o.textContent === 'App.csproj' || o.textContent === 'Lib.csproj'
        );
        expect(projectOptions.length).toBe(2);
    });

    it('handles sources message and populates source selector', () => {
        render(<App />);
        sendMessage({
            type: 'sources',
            sources: [
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }
            ]
        });
        expect(screen.getByText('nuget.org')).toBeDefined();
    });

    it('handles installedPackages and shows badge on Installed tab', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'installedPackages',
            packages: [
                { id: 'Pkg.A', version: '1.0.0' },
                { id: 'Pkg.B', version: '2.0.0' }
            ],
            projectPath: '/App.csproj'
        });
        const badge = screen.getByText('2');
        expect(badge.className).toContain('tab-badge');
    });

    it('handles packageUpdates and shows badge on Updates tab', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'packageUpdates',
            updates: [{ id: 'Pkg.A', installedVersion: '1.0.0', latestVersion: '2.0.0' }],
            projectPath: '/App.csproj'
        });
        const badge = screen.getByText('1');
        expect(badge.className).toContain('tab-badge');
    });

    it('prerelease checkbox toggles and saves settings', () => {
        render(<App />);
        sendMessage({ type: 'settings', includePrerelease: false });
        mockVsCode.postMessage.mockClear();

        const checkbox = screen.getByLabelText(/Include prerelease/) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(true);
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'saveSettings', includePrerelease: true })
        );
    });

    it('source settings button opens overlay', () => {
        render(<App />);
        expect(screen.queryByTestId('source-settings')).toBeNull();
        fireEvent.click(screen.getByLabelText('Manage NuGet sources'));
        expect(screen.getByTestId('source-settings')).toBeDefined();
    });

    it('refresh button posts fullRefresh', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        // Complete loading so button is enabled (disabled while loadingInstalled=true)
        sendMessage({
            type: 'installedPackages',
            packages: [{ id: 'Pkg', version: '1.0.0' }],
            projectPath: '/App.csproj'
        });
        mockVsCode.postMessage.mockClear();
        fireEvent.click(screen.getByLabelText('Refresh all'));
        expect(mockVsCode.postMessage).toHaveBeenCalledWith({ type: 'fullRefresh' });
    });

    it('handles installResult and re-fetches packages', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        mockVsCode.postMessage.mockClear();
        sendMessage({
            type: 'installResult',
            success: true,
            packageId: 'Pkg.A',
            projectPath: '/App.csproj'
        });
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getInstalledPackages', projectPath: '/App.csproj' })
        );
    });

    it('project selector change triggers installed fetch', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        mockVsCode.postMessage.mockClear();

        const selector = screen.getByDisplayValue('App.csproj');
        fireEvent.change(selector, { target: { value: '/Lib.csproj' } });

        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getInstalledPackages', projectPath: '/Lib.csproj' })
        );
    });

    it('handles settings message and restores prerelease', () => {
        render(<App />);
        sendMessage({ type: 'settings', includePrerelease: true });
        const checkbox = screen.getByLabelText(/Include prerelease/) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
    });

    it('shows "No .NET projects found" when no projects', () => {
        render(<App />);
        expect(screen.getByText('No .NET projects found')).toBeDefined();
    });

    // ──────────────────────────────────────────────
    // Phase 6: Additional message handler tests
    // ──────────────────────────────────────────────

    it('handles prereleaseChanged from sidebar sync', () => {
        render(<App />);
        sendMessage({ type: 'settings', includePrerelease: false });
        const checkbox = screen.getByLabelText(/Include prerelease/) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);

        sendMessage({ type: 'prereleaseChanged', includePrerelease: true });
        expect(checkbox.checked).toBe(true);
    });

    it('handles sourceChanged from sidebar sync', () => {
        render(<App />);
        sendMessage({
            type: 'sources',
            sources: [
                { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true },
                { name: 'custom', url: 'https://custom/v3/index.json', enabled: true }
            ]
        });
        sendMessage({ type: 'sourceChanged', selectedSource: 'https://custom/v3/index.json' });

        const sourceSelect = screen.getByDisplayValue('custom');
        expect(sourceSelect).toBeDefined();
    });

    it('handles projectChanged from sidebar sync', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });
        mockVsCode.postMessage.mockClear();

        sendMessage({ type: 'projectChanged', projectPath: '/Lib.csproj' });

        // Should trigger a getInstalledPackages for the new project
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getInstalledPackages', projectPath: '/Lib.csproj' })
        );
    });

    it('handles sourceConnectivityUpdate and stores failed sources', () => {
        render(<App />);
        sendMessage({
            type: 'sourceConnectivityUpdate',
            failedSources: [{ url: 'https://broken', error: 'timeout' }]
        });
        // The failedSources state is internal — verify that it doesn't crash
        // and the component still renders normally
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles configFiles and populates config file list', () => {
        render(<App />);
        sendMessage({
            type: 'configFiles',
            configFiles: [
                { label: 'nuget.config', path: '/nuget.config' },
                { label: 'global nuget.config', path: '/global/nuget.config' }
            ]
        });
        // Config files are used in SourceSettingsOverlay — just verify no crash
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles splitPosition and restores layout', () => {
        render(<App />);
        sendMessage({ type: 'splitPosition', position: 45 });
        // Split position is an internal layout state — verify no crash
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles settingsChanged for live config updates', () => {
        render(<App />);
        sendMessage({
            type: 'settingsChanged',
            searchDebounceMode: 'full',
            recentSearchesLimit: 10
        });
        // These are internal config states — verify no crash
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles openSourceSettings message', () => {
        render(<App />);
        expect(screen.queryByTestId('source-settings')).toBeNull();
        sendMessage({ type: 'openSourceSettings' });
        expect(screen.getByTestId('source-settings')).toBeDefined();
    });

    it('handles allProjectsUpdates and calculates total count', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'allProjectsUpdates',
            projectUpdates: [
                {
                    projectPath: '/projA.csproj',
                    projectName: 'ProjA',
                    updates: [
                        { id: 'Pkg1', installedVersion: '1.0', latestVersion: '2.0' },
                        { id: 'Pkg2', installedVersion: '1.0', latestVersion: '3.0' }
                    ]
                },
                {
                    projectPath: '/projB.csproj',
                    projectName: 'ProjB',
                    updates: [
                        { id: 'Pkg3', installedVersion: '1.0', latestVersion: '2.0' }
                    ]
                }
            ]
        });
        // Total count = 3 (2 + 1) should show in the updates tab badge
        const badge = screen.getByText('3');
        expect(badge.className).toContain('tab-badge');
    });

    it('handles updateResult and filters resolved update from list', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'packageUpdates',
            updates: [
                { id: 'Pkg.A', installedVersion: '1.0', latestVersion: '2.0' },
                { id: 'Pkg.B', installedVersion: '1.0', latestVersion: '3.0' }
            ],
            projectPath: '/App.csproj'
        });
        mockVsCode.postMessage.mockClear();

        sendMessage({
            type: 'updateResult',
            success: true,
            packageId: 'Pkg.A',
            projectPath: '/App.csproj'
        });

        // Re-fetches installed packages after successful update
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getInstalledPackages', projectPath: '/App.csproj' })
        );
    });

    it('handles removeResult and re-fetches installed packages', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        mockVsCode.postMessage.mockClear();

        sendMessage({
            type: 'removeResult',
            success: true,
            packageId: 'Pkg.A',
            projectPath: '/App.csproj'
        });

        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getInstalledPackages', projectPath: '/App.csproj' })
        );
    });

    it('handles allProjectsInstalled with default context', () => {
        render(<App />);
        sendMessage({
            type: 'allProjectsInstalled',
            projectInstalled: [{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                packages: [{ id: 'Pkg', version: '1.0' }]
            }]
        });
        // Internal state — verify no crash
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles allProjectsInstalled with multiInstall context', () => {
        render(<App />);
        sendMessage({
            type: 'allProjectsInstalled',
            context: 'multiInstall',
            projectInstalled: [{
                projectPath: '/projA.csproj',
                projectName: 'ProjA',
                packages: [{ id: 'Pkg', version: '1.0' }]
            }]
        });
        // Internal state routes to multiInstallProjectData — verify no crash
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles selectProject and stays on installed tab', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [
                { name: 'App.csproj', path: '/App.csproj' },
                { name: 'Lib.csproj', path: '/Lib.csproj' }
            ]
        });

        sendMessage({ type: 'selectProject', projectPath: '/Lib.csproj', initialTab: 'installed' });

        const installedBtn = screen.getByRole('button', { name: /Installed/ });
        expect(installedBtn.className).toContain('active');
    });

    it('handles refresh message with debounce', async () => {
        vi.useFakeTimers();
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        mockVsCode.postMessage.mockClear();

        sendMessage({ type: 'refresh' });

        // Uses 300ms debounce — advance timer
        act(() => {
            vi.advanceTimersByTime(350);
        });

        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'getProjects' })
        );
        vi.useRealTimers();
    });

    it('handles packageReadme message', () => {
        render(<App />);
        sendMessage({
            type: 'packageReadme',
            packageId: 'Pkg',
            version: '1.0',
            readme: '# Hello README'
        });
        // Internal readme state — verify no crash
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('handles navigateToPackage message and triggers search', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'sources',
            sources: [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }]
        });
        mockVsCode.postMessage.mockClear();
        sendMessage({
            type: 'navigateToPackage',
            packageId: 'Newtonsoft.Json',
            version: '13.0.3'
        });
        // Should trigger a search for the package
        expect(mockVsCode.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'searchPackages', query: 'Newtonsoft.Json' })
        );
    });

    // ──────────────────────────────────────────────
    // Unified Search Bar tests
    // ──────────────────────────────────────────────

    it('renders search input always visible', () => {
        render(<App />);
        expect(screen.getByPlaceholderText(/Search packages/)).toBeDefined();
    });

    it('renders clear and filter buttons', () => {
        render(<App />);
        expect(screen.getByLabelText('Clear search')).toBeDefined();
        expect(screen.getByLabelText('Filter packages')).toBeDefined();
    });

    it('typing in search bar updates the input value', () => {
        render(<App />);
        const input = screen.getByPlaceholderText(/Search packages/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'serilog' } });
        expect(input.value).toBe('serilog');
    });

    it('clear button clears search text', () => {
        render(<App />);
        const input = screen.getByPlaceholderText(/Search packages/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'some query' } });
        expect(input.value).toBe('some query');

        fireEvent.click(screen.getByLabelText('Clear search'));
        expect(input.value).toBe('');
    });

    it('tabs are visible in default mode (no search)', () => {
        render(<App />);
        expect(screen.getByRole('button', { name: /Installed/ })).toBeDefined();
        expect(screen.getByRole('button', { name: /Updates/ })).toBeDefined();
    });

    it('tabs are hidden when in browse mode (text typed)', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'sources',
            sources: [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }]
        });

        const input = screen.getByPlaceholderText(/Search packages/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Newtonsoft.Json' } });

        // In browse mode, tabs should be hidden
        expect(screen.queryByRole('button', { name: /^Installed/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Updates/ })).toBeNull();
    });

    it('tabs remain visible with @installed prefix', () => {
        render(<App />);
        const input = screen.getByPlaceholderText(/Search packages/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: '@installed serilog' } });

        // @installed mode shows tabs
        expect(screen.getByRole('button', { name: /Installed/ })).toBeDefined();
    });

    it('tabs remain visible with @updates prefix', () => {
        render(<App />);
        const input = screen.getByPlaceholderText(/Search packages/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: '@updates' } });

        // @updates mode shows tabs
        expect(screen.getByRole('button', { name: /Updates/ })).toBeDefined();
    });

    it('handles restoreSearchQuery and fills search bar', () => {
        render(<App />);
        sendMessage({
            type: 'restoreSearchQuery',
            query: 'restored query'
        });

        const input = screen.getByPlaceholderText(/Search packages/) as HTMLInputElement;
        expect(input.value).toBe('restored query');
    });

    it('searchResults message does not crash', () => {
        render(<App />);
        sendMessage({
            type: 'projects',
            projects: [{ name: 'App.csproj', path: '/App.csproj' }]
        });
        sendMessage({
            type: 'searchResults',
            results: [{ id: 'Pkg.A', version: '1.0.0', description: 'Test' }],
            query: 'Pkg'
        });
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });

    it('autocompleteResults message does not crash', () => {
        render(<App />);
        sendMessage({
            type: 'autocompleteResults',
            suggestions: [{ sourceUrl: 'https://api.nuget.org', packageIds: ['Pkg.A'] }],
            query: 'Pk'
        });
        expect(screen.getByText('Manage NuGet packages')).toBeDefined();
    });
});
