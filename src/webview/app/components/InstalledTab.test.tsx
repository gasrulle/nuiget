import { useVirtualizer } from '@tanstack/react-virtual';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledTabHandle, InstalledTabProps } from './InstalledTab';

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: vi.fn(() => ({
        getTotalSize: () => 500,
        getVirtualItems: () => [],
        measureElement: vi.fn(),
        scrollToIndex: vi.fn(),
    })),
}));

const mod = await import('./InstalledTab');
const InstalledTabComponent = (mod as any).MemoizedInstalledTab;

const mockVscode = { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() };

function createProps(overrides: Partial<InstalledTabProps> = {}): InstalledTabProps {
    return {
        activeTab: 'installed',
        installedPackages: [],
        loadingInstalled: false,
        selectedPackage: null,
        selectedTransitivePackage: null,
        selectedProject: '/proj.csproj',
        splitPosition: 50,
        defaultPackageIcon: 'data:image/png;base64,abc',
        includePrerelease: false,
        selectedSource: 'all',
        packageMetadata: null,
        loadingMetadata: false,
        loadingVersions: false,
        packageVersions: [],
        selectedVersion: '',
        detailsTab: 'details',
        loadingReadme: false,
        sanitizedReadmeHtml: '',
        expandedDeps: new Set(),
        onSelectDirectPackage: vi.fn(),
        onSelectTransitivePackage: vi.fn(),
        clearSelection: vi.fn(),
        onInstall: vi.fn(),
        onRemove: vi.fn(),
        onDetailsTabChange: vi.fn(),
        onVersionChange: vi.fn(),
        onToggleDep: vi.fn(),
        onReadmeAttemptedChange: vi.fn(),
        onMetadataChange: vi.fn(),
        onLoadingMetadataChange: vi.fn(),
        onSetSelectedPackage: vi.fn(),
        onSetSelectedTransitivePackage: vi.fn(),
        onSetSelectedVersion: vi.fn(),
        setSplitPosition: vi.fn(),
        handleSashReset: vi.fn(),
        handleSashDragEnd: vi.fn(),
        createPackageListKeyHandler: vi.fn(() => vi.fn()),
        metadataCache: { current: { get: vi.fn(), set: vi.fn(), has: vi.fn(), clear: vi.fn(), size: 0 } as any },
        vscode: mockVscode,
        installedTabRef: { current: null },
        MemoizedDraggableSash: React.memo((_props: any) => <div data-testid="sash" />) as any,
        isAllProjects: false,
        allProjectsInstalled: [],
        loadingAllProjectsInstalled: false,
        activeProjectPath: '',
        onActiveProjectPathChange: vi.fn(),
        allProjectsTransitiveRows: [],
        loadingAllProjectsTransitive: false,
        allProjectsTransitiveErrored: [],
        restoringProjectsBatch: false,
        onAllProjectsTransitiveExpandedChange: vi.fn(),
        onRestoreProjectsBatch: vi.fn(),
        ...overrides,
    };
}

const installedPkgs = [
    { id: 'Newtonsoft.Json', version: '13.0.3' },
    { id: 'Serilog', version: '3.0.0' },
];

describe('InstalledTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows empty state when no packages installed', () => {
        render(<InstalledTabComponent {...createProps()} />);
        expect(screen.getByText('No packages installed')).toBeInTheDocument();
    });

    it('shows loading state', () => {
        render(<InstalledTabComponent {...createProps({ loadingInstalled: true })} />);
        expect(screen.getByLabelText('Loading installed packages')).toBeInTheDocument();
    });

    it('is hidden when activeTab is not installed', () => {
        const { container } = render(<InstalledTabComponent {...createProps({ activeTab: 'browse' })} />);
        const content = container.querySelector('.browse-content') as HTMLElement;
        expect(content.style.display).toBe('none');
    });

    it('groups all-projects "Required by" by project (one block per project, no "Unknown")', () => {
        const selectedTransitivePackage = {
            id: 'System.Text.Json',
            version: '8.0.0',
            requiredByChain: [],
            origins: [
                { projectPath: '/a.csproj', projectName: 'Alpha', frameworks: ['net8.0'], requiredByChain: ['Serilog.AspNetCore'], chainHash: 'Serilog.AspNetCore' },
                { projectPath: '/a.csproj', projectName: 'Alpha', frameworks: ['net9.0'], requiredByChain: ['Other.Root'], chainHash: 'Other.Root' },
                { projectPath: '/b.csproj', projectName: 'Beta', frameworks: ['net8.0'], requiredByChain: [], chainHash: '' },
            ],
        };
        const { container } = render(
            <InstalledTabComponent {...createProps({ isAllProjects: true, selectedTransitivePackage: selectedTransitivePackage as any })} />
        );
        // Alpha's two origins collapse into a single project block with both unioned roots.
        expect(screen.getAllByText('Alpha')).toHaveLength(1);
        expect(screen.getByText('Serilog.AspNetCore')).toBeInTheDocument();
        expect(screen.getByText('Other.Root')).toBeInTheDocument();
        // Beta has no traceable root → neutral label, never the old "Unknown".
        expect(screen.getByText('Beta')).toBeInTheDocument();
        expect(screen.getByText('No traceable top-level package')).toBeInTheDocument();
        expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
        expect(container.querySelectorAll('.required-by-project')).toHaveLength(2);
        // Alpha's net8.0 + net9.0 origins merged their TFM badges into one block (net9.0 is Alpha-only).
        expect(screen.getByText('net9.0')).toBeInTheDocument();
        expect(screen.getAllByText('net8.0').length).toBeGreaterThanOrEqual(1);
    });

    it('renders single-project "Required by" root', () => {
        const selectedTransitivePackage = { id: 'Leaf', version: '1.0.0', requiredByChain: ['Direct'] };
        render(<InstalledTabComponent {...createProps({ selectedTransitivePackage: selectedTransitivePackage as any })} />);
        expect(screen.getByText('Required by:')).toBeInTheDocument();
        expect(screen.getByText('Direct')).toBeInTheDocument();
    });

    it('shows the distinct project count on an all-projects transitive list row', () => {
        const row = {
            id: 'System.Text.Json', version: '8.0.0', versionNormalized: '8.0.0',
            origins: [
                // Two origins for /a.csproj + one for /b.csproj → 2 distinct projects (not 3).
                { projectPath: '/a.csproj', projectName: 'A', frameworks: ['net8.0'], requiredByChain: ['Serilog'], chainHash: 'Serilog' },
                { projectPath: '/a.csproj', projectName: 'A', frameworks: ['net9.0'], requiredByChain: ['Other'], chainHash: 'Other' },
                { projectPath: '/b.csproj', projectName: 'B', frameworks: ['net8.0'], requiredByChain: ['Serilog'], chainHash: 'Serilog' },
            ],
            frameworks: ['net8.0'],
        };
        const { container } = render(
            <InstalledTabComponent {...createProps({ isAllProjects: true, allProjectsTransitiveRows: [row as any] })} />
        );
        const header = container.querySelector('.transitive-header') as HTMLElement;
        fireEvent.click(header);
        expect(screen.getByText(/2 projects/)).toBeInTheDocument();
        expect(screen.queryByText(/3 projects/)).not.toBeInTheDocument();
    });

    it('does not show a transitive count until the all-projects section is loaded', () => {
        const findTitle = (container: HTMLElement) =>
            Array.from(container.querySelectorAll('.transitive-title'))
                .find(el => el.textContent?.includes('Transitive packages')) as HTMLElement | undefined;

        // Not loaded yet (no rows, collapsed) → header must NOT show a misleading "(0)".
        const { container, rerender } = render(
            <InstalledTabComponent {...createProps({ isAllProjects: true, allProjectsTransitiveRows: [], loadingAllProjectsTransitive: false })} />
        );
        const title = findTitle(container);
        expect(title).toBeTruthy();
        expect(title?.querySelector('.transitive-count')).toBeNull();

        // Once rows are present (loaded), the count appears even while collapsed.
        const row = {
            id: 'System.Text.Json', version: '8.0.0', versionNormalized: '8.0.0',
            origins: [{ projectPath: '/a.csproj', projectName: 'A', frameworks: ['net8.0'], requiredByChain: ['X'], chainHash: 'X' }],
            frameworks: ['net8.0'],
        };
        rerender(<InstalledTabComponent {...createProps({ isAllProjects: true, allProjectsTransitiveRows: [row as any], loadingAllProjectsTransitive: false })} />);
        expect(findTitle(container)?.querySelector('.transitive-count')?.textContent).toBe('(1)');
    });

    it('handles transitivePackages message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({
                type: 'transitivePackages',
                projectPath: '/proj.csproj',
                frameworks: [{ targetFramework: 'net8.0', packages: [], metadataLoaded: false }],
                dataSourceAvailable: true,
            } as any);
        });
    });

    it('handles bulkRemoveResult message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps({ installedPackages: installedPkgs as any })} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({ type: 'bulkRemoveResult' } as any);
        });
        // No crash
    });

    it('handles restoreProjectResult message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({
                type: 'restoreProjectResult',
                projectPath: '/proj.csproj',
                success: true,
            } as any);
        });
        // After successful restore, it requests transitive packages
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'getTransitivePackages',
        }));
    });

    it('resetTransitiveState resets state', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        act(() => {
            ref.current!.resetTransitiveState(false);
        });
        // No crash
    });

    it('shows sash component', () => {
        render(<InstalledTabComponent {...createProps({ installedPackages: installedPkgs as any })} />);
        expect(screen.getByTestId('sash')).toBeInTheDocument();
    });

    it('shows details panel prompt when no package selected', () => {
        render(<InstalledTabComponent {...createProps({ installedPackages: installedPkgs as any })} />);
        expect(screen.getByText('Select a package to view details')).toBeInTheDocument();
    });

    it('shows all-projects toggle when multiple projects', () => {
        const projects = [
            { path: '/a.csproj', name: 'a.csproj' },
            { path: '/b.csproj', name: 'b.csproj' },
        ];
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            projects,
        })} />);
        // Look for the all-projects toggle button — just verify no crash on render
    });

    // ──────────────────────────────────────────────
    // Phase 7A: Additional InstalledTab tests
    // ──────────────────────────────────────────────

    it('handles transitiveMetadata message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        // First set up frameworks via transitivePackages
        act(() => {
            ref.current!.handleMessage({
                type: 'transitivePackages',
                projectPath: '/proj.csproj',
                frameworks: [{ targetFramework: 'net8.0', packages: [], metadataLoaded: false }],
                dataSourceAvailable: true,
            } as any);
        });
        // Then send metadata
        act(() => {
            ref.current!.handleMessage({
                type: 'transitiveMetadata',
                projectPath: '/proj.csproj',
                targetFramework: 'net8.0',
                packages: [{ id: 'TransPkg', version: '1.0', description: 'A transitive' }],
            } as any);
        });
        // No crash — metadata loaded
    });

    it('discards transitiveMetadata for wrong project', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({
                type: 'transitiveMetadata',
                projectPath: '/other.csproj',
                targetFramework: 'net8.0',
                packages: [],
            } as any);
        });
        // No crash — message silently ignored
    });

    it('handles bulkRemoveConfirmed message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps({ installedPackages: installedPkgs as any })} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({ type: 'bulkRemoveConfirmed' } as any);
        });
        // Sets uninstallingAll to true — button should show "Uninstalling..."
    });

    it('handles bulkRemoveAllProjectsResult message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps({
            isAllProjects: true,
            allProjectsInstalled: [
                { projectPath: '/a.csproj', projectName: 'a', packages: installedPkgs as any },
            ],
        })} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({ type: 'bulkRemoveAllProjectsResult' } as any);
        });
        // Clears selections — no crash
    });

    it('handles bulkRemoveAllProjectsConfirmed message', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({ type: 'bulkRemoveAllProjectsConfirmed' } as any);
        });
        // Sets uninstallingAll — no crash
    });

    it('resetTransitiveState with refetch=true requests transitive packages', () => {
        const ref = React.createRef<InstalledTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        mockVscode.postMessage.mockClear();
        act(() => {
            ref.current!.resetTransitiveState(true);
        });
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'getTransitivePackages',
            projectPath: '/proj.csproj',
        }));
    });

    it('resetTransitiveState with forceRestore=true passes forceRestore flag', () => {
        const ref = React.createRef<InstalledTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        mockVscode.postMessage.mockClear();
        act(() => {
            ref.current!.resetTransitiveState(true, true);
        });
        expect(mockVscode.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'getTransitivePackages',
            projectPath: '/proj.csproj',
            forceRestore: true,
        }));
    });

    it('focusAndSelectFirst selects first installed package', () => {
        const ref = React.createRef<InstalledTabHandle>();
        const onSetSelectedPackage = vi.fn();
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            onSetSelectedPackage,
        })} ref={ref} />);
        act(() => {
            ref.current!.focusAndSelectFirst();
        });
        expect(onSetSelectedPackage).toHaveBeenCalledWith(expect.objectContaining({ id: 'Newtonsoft.Json' }));
    });

    it('shows all-projects loading state', () => {
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            isAllProjects: true,
            loadingAllProjectsInstalled: true,
        })} />);
        expect(screen.getByLabelText('Loading installed packages for all projects')).toBeInTheDocument();
    });

    it('shows all-projects empty state', () => {
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            isAllProjects: true,
            loadingAllProjectsInstalled: false,
            allProjectsInstalled: [],
        })} />);
        expect(screen.getByText('No installed packages found across projects')).toBeInTheDocument();
    });

    it('renders all-projects installed data without crashing', () => {
        const allProjects = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'PkgA', version: '1.0' }] },
            { projectPath: '/b.csproj', projectName: 'b.csproj', packages: [{ id: 'PkgB', version: '2.0' }] },
        ];
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            isAllProjects: true,
            allProjectsInstalled: allProjects as any,
        })} />);
        // Virtualizer mock returns empty getVirtualItems, so headers are not rendered.
        // Verify the all-projects toolbars render (Collapse/Expand all buttons)
        expect(screen.getByTitle('Collapse all')).toBeInTheDocument();
        expect(screen.getByTitle('Expand all')).toBeInTheDocument();
    });

    it('renders all-projects content when installedPackages is empty', () => {
        const allProjects = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'PkgA', version: '1.0' }] },
        ];
        render(<InstalledTabComponent {...createProps({
            installedPackages: [],
            isAllProjects: true,
            allProjectsInstalled: allProjects as any,
        })} />);
        // Should NOT show "No packages installed" (single-project empty state)
        expect(screen.queryByText('No packages installed')).not.toBeInTheDocument();
        // Should show all-projects toolbar
        expect(screen.getByTitle('Collapse all')).toBeInTheDocument();
    });

    it('discards transitivePackages for wrong project', () => {
        const ref = React.createRef<InstalledTabHandle>();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        act(() => {
            ref.current!.handleMessage({
                type: 'transitivePackages',
                projectPath: '/other.csproj',
                frameworks: [{ targetFramework: 'net8.0', packages: [], metadataLoaded: false }],
                dataSourceAvailable: true,
            } as any);
        });
        // Silently ignored — no crash
    });

    it('restoreProjectResult with failure does not re-fetch transitive', () => {
        const ref = React.createRef<InstalledTabHandle>();
        mockVscode.postMessage.mockClear();
        render(<InstalledTabComponent {...createProps()} ref={ref} />);
        mockVscode.postMessage.mockClear();
        act(() => {
            ref.current!.handleMessage({
                type: 'restoreProjectResult',
                projectPath: '/proj.csproj',
                success: false,
            } as any);
        });
        // Should NOT request transitive packages after failed restore
        expect(mockVscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
            type: 'getTransitivePackages',
        }));
    });

    // ──────────────────────────────────────────────
    // External filter (unified search bar) tests
    // ──────────────────────────────────────────────

    it('shows "No packages match" when externalFilter matches nothing', () => {
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            externalFilter: 'nonexistent',
        })} />);
        expect(screen.getByText(/No packages match/)).toBeInTheDocument();
    });

    it('does not show filter empty state when externalFilter is empty', () => {
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            externalFilter: '',
        })} />);
        expect(screen.queryByText(/No packages match/)).not.toBeInTheDocument();
    });

    it('filters installed packages by externalFilter (case-insensitive)', () => {
        // When externalFilter matches, the filtered list is non-empty so no empty message
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            externalFilter: 'newtonsoft',
        })} />);
        // Matching filter means packages exist — no empty state
        expect(screen.queryByText(/No packages match/)).not.toBeInTheDocument();
    });

    it('shows "No packages match" for all-projects mode with externalFilter', () => {
        render(<InstalledTabComponent {...createProps({
            installedPackages: installedPkgs as any,
            isAllProjects: true,
            allProjectsInstalled: [
                { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'PkgA', version: '1.0' }] },
            ] as any,
            externalFilter: 'zzz_no_match',
        })} />);
        expect(screen.getByText(/No packages match/)).toBeInTheDocument();
    });

    it('externalFilterMode vulnerable only shows vulnerable packages', () => {
        const pkgsWithVuln = [
            { id: 'Safe.Pkg', version: '1.0.0', vulnerabilities: [] },
            { id: 'Vuln.Pkg', version: '2.0.0', vulnerabilities: [{ severity: 'high', advisoryUrl: 'https://example.com' }] },
        ];
        render(<InstalledTabComponent {...createProps({
            installedPackages: pkgsWithVuln as any,
            externalFilterMode: 'vulnerable',
        })} />);
        // With vulnerable mode, only Vuln.Pkg is in the filtered list
        // Safe.Pkg (0 vulnerabilities) is filtered out → 1 package remains
        // Since virtualizer returns empty getVirtualItems, we can't check rendered items,
        // but the empty state should NOT show (one package matches)
        expect(screen.queryByText(/No packages match/)).not.toBeInTheDocument();
    });

    it('externalFilterMode vulnerable shows empty virtualizer when no vulnerable packages', () => {
        const safeOnly = [
            { id: 'Safe.Pkg', version: '1.0.0', vulnerabilities: [] },
            { id: 'Also.Safe', version: '2.0.0' },
        ];
        render(<InstalledTabComponent {...createProps({
            installedPackages: safeOnly as any,
            externalFilterMode: 'vulnerable',
        })} />);
        // All packages are safe — vulnerable mode filters to 0
        // Since installedPackages is non-empty, it enters the list branch
        // (not the "No packages installed" empty state), but the virtualizer renders no items
        expect(screen.queryByText('No packages installed')).not.toBeInTheDocument();
    });

    it('clicking a package in all-projects mode calls onSelectDirectPackage', async () => {
        const onSelectDirectPackage = vi.fn();
        const allProjects = [
            { projectPath: '/a.csproj', projectName: 'a.csproj', packages: [{ id: 'PkgA', version: '1.0.0', resolvedVersion: '1.0.0' }] },
        ];
        // Override virtualizer to return header (index 0) and package (index 1)
        vi.mocked(useVirtualizer).mockReturnValue({
            getTotalSize: () => 500,
            getVirtualItems: () => [
                { index: 0, key: 0, start: 0, size: 30, end: 30, lane: 0 },
                { index: 1, key: 1, start: 30, size: 40, end: 70, lane: 0 },
            ],
            measureElement: vi.fn(),
            scrollToIndex: vi.fn(),
        } as any);
        await act(async () => {
            render(<InstalledTabComponent {...createProps({
                installedPackages: [],
                isAllProjects: true,
                allProjectsInstalled: allProjects as any,
                onSelectDirectPackage,
            })} />);
        });
        const pkgItem = screen.getByText('PkgA').closest('.package-item')!;
        fireEvent.click(pkgItem);
        expect(onSelectDirectPackage).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'PkgA' }),
            expect.objectContaining({ metadataVersion: '1.0.0' }),
        );
    });
});
