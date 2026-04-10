import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoizedPackageDetailsPanel, PackageDetailsPanelProps } from './PackageDetailsPanel';

function createProps(overrides: Partial<PackageDetailsPanelProps> = {}): PackageDetailsPanelProps {
    return {
        selectedPackage: null,
        packageMetadata: null,
        loadingMetadata: false,
        loadingVersions: false,
        packageVersions: ['2.0.0', '1.0.0'],
        selectedVersion: '2.0.0',
        installedPackages: [],
        detailsTab: 'details',
        loadingReadme: false,
        sanitizedReadmeHtml: '',
        expandedDeps: new Set(),
        selectedProject: '/proj.csproj',
        includePrerelease: false,
        selectedSource: 'all',
        onInstall: vi.fn(),
        onRemove: vi.fn(),
        onVersionChange: vi.fn(),
        onDetailsTabChange: vi.fn(),
        onToggleDep: vi.fn(),
        onReadmeAttemptedChange: vi.fn(),
        onMetadataChange: vi.fn(),
        onLoadingMetadataChange: vi.fn(),
        metadataCache: { current: { get: vi.fn(), set: vi.fn(), has: vi.fn(), clear: vi.fn(), size: 0 } as any },
        vscode: { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() },
        ...overrides,
    };
}

const searchPkg = {
    id: 'Newtonsoft.Json', version: '13.0.3', description: 'JSON framework for .NET',
    authors: 'James Newton-King', versions: ['13.0.3', '13.0.2'], totalDownloads: 1000000,
    verified: true,
};

const meta = {
    id: 'Newtonsoft.Json', version: '13.0.3',
    description: 'JSON framework', authors: 'James Newton-King',
    license: 'MIT', projectUrl: 'https://www.newtonsoft.com/json',
    totalDownloads: 1000000, published: '2023-03-08T00:00:00Z',
    dependencies: [
        { targetFramework: 'net8.0', dependencies: [{ id: 'System.Text.Json', versionRange: '>= 8.0.0' }] }
    ],
    packageSize: 2097152,
};

describe('PackageDetailsPanel', () => {
    describe('empty state', () => {
        it('shows empty message when no package selected', () => {
            render(<MemoizedPackageDetailsPanel {...createProps()} />);
            expect(screen.getByText('Select a package to view details')).toBeInTheDocument();
        });
    });

    describe('package header', () => {
        it('shows package name', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({ selectedPackage: searchPkg })} />);
            expect(screen.getByText('Newtonsoft.Json')).toBeInTheDocument();
        });

        it('shows Install button for non-installed package', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, selectedVersion: '13.0.3',
            })} />);
            expect(screen.getByText('Install')).toBeInTheDocument();
        });

        it('shows Uninstall button for installed package', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                installedPackages: [{ id: 'Newtonsoft.Json', version: '13.0.3' }],
            })} />);
            expect(screen.getByText('Uninstall')).toBeInTheDocument();
        });

        it('shows Update button when newer version selected', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.3',
                packageVersions: ['13.0.3', '13.0.2'],
                installedPackages: [{ id: 'Newtonsoft.Json', version: '13.0.2' }],
            })} />);
            expect(screen.getByText('Update')).toBeInTheDocument();
        });

        it('shows Downgrade button when older version selected', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.2',
                packageVersions: ['13.0.3', '13.0.2'],
                installedPackages: [{ id: 'Newtonsoft.Json', version: '13.0.3' }],
            })} />);
            expect(screen.getByText('Downgrade')).toBeInTheDocument();
        });
    });

    describe('version selector', () => {
        it('shows Loading... when versions are loading', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, loadingVersions: true,
            })} />);
            expect(screen.getByText('Loading...')).toBeInTheDocument();
        });

        it('renders version options', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                packageVersions: ['13.0.3', '13.0.2'],
            })} />);
            const options = screen.getAllByRole('option');
            expect(options).toHaveLength(2);
        });

        it('calls onInstall when Install button clicked', () => {
            const onInstall = vi.fn();
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, selectedVersion: '13.0.3', onInstall,
            })} />);
            fireEvent.click(screen.getByText('Install'));
            expect(onInstall).toHaveBeenCalledWith('Newtonsoft.Json', '13.0.3');
        });

        it('calls onRemove when Uninstall button clicked', () => {
            const onRemove = vi.fn();
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, onRemove,
                installedPackages: [{ id: 'Newtonsoft.Json', version: '13.0.3' }],
            })} />);
            fireEvent.click(screen.getByText('Uninstall'));
            expect(onRemove).toHaveBeenCalledWith('Newtonsoft.Json');
        });

        it('disables Uninstall for implicit packages', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                installedPackages: [{ id: 'Newtonsoft.Json', version: '13.0.3', isImplicit: true }],
            })} />);
            expect(screen.getByText('Uninstall')).toBeDisabled();
        });

        it('disables Install button when all-projects mode is active', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.3',
                selectedProject: '__all_projects__',
            })} />);
            const btn = screen.getByText('Install');
            expect(btn).toBeDisabled();
            expect(btn).toHaveAttribute('title', 'Select a specific project or use Multi Install below');
        });

        it('enables Install button in all-projects mode when activeProjectPath is set', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.3',
                selectedProject: '__all_projects__',
                activeProjectPath: '/App.csproj',
            })} />);
            const btn = screen.getByText('Install');
            expect(btn).not.toBeDisabled();
        });

        it('enables Update button in all-projects mode when activeProjectPath is set and version differs', () => {
            const onInstall = vi.fn();
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: { id: 'Newtonsoft.Json', version: '13.0.2' },
                installedPackages: [{ id: 'Newtonsoft.Json', version: '13.0.2' }],
                selectedVersion: '13.0.3',
                packageVersions: ['13.0.3', '13.0.2'],
                selectedProject: '__all_projects__',
                activeProjectPath: '/App.csproj',
                onInstall,
            })} />);
            const btn = screen.getByText('Update');
            expect(btn).not.toBeDisabled();
            fireEvent.click(btn);
            expect(onInstall).toHaveBeenCalledWith('Newtonsoft.Json', '13.0.3');
        });

        it('disables button when selected version matches installed in allProjectsInstalled', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.3',
                packageVersions: ['13.0.3', '13.0.2'],
                selectedProject: '__all_projects__',
                activeProjectPath: '/App.csproj',
                allProjectsInstalled: [{ projectPath: '/App.csproj', projectName: 'App', packages: [{ id: 'Newtonsoft.Json', version: '13.0.3' }] }],
            })} />);
            const btn = screen.getByText('Update');
            expect(btn).toBeDisabled();
            expect(btn).toHaveAttribute('title', 'Already at this version');
        });

        it('shows Update button via allProjectsInstalled when newer version selected', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.3',
                packageVersions: ['13.0.3', '13.0.2'],
                selectedProject: '__all_projects__',
                activeProjectPath: '/App.csproj',
                allProjectsInstalled: [{ projectPath: '/App.csproj', projectName: 'App', packages: [{ id: 'Newtonsoft.Json', version: '13.0.2' }] }],
            })} />);
            expect(screen.getByText('Update')).not.toBeDisabled();
        });

        it('shows Uninstall button for package installed via allProjectsInstalled', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                selectedVersion: '13.0.3',
                selectedProject: '__all_projects__',
                activeProjectPath: '/App.csproj',
                allProjectsInstalled: [{ projectPath: '/App.csproj', projectName: 'App', packages: [{ id: 'Newtonsoft.Json', version: '13.0.3' }] }],
            })} />);
            expect(screen.getByText('Uninstall')).toBeInTheDocument();
        });
    });

    describe('details tab', () => {
        it('shows description from metadata', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                packageMetadata: meta as any,
            })} />);
            expect(screen.getByText('JSON framework')).toBeInTheDocument();
        });

        it('shows verified badge', () => {
            const { container } = render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
            })} />);
            expect(container.querySelector('.verified-badge')).toBeInTheDocument();
        });

        it('shows license', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, packageMetadata: meta as any,
            })} />);
            expect(screen.getByText('MIT')).toBeInTheDocument();
        });

        it('shows project URL', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, packageMetadata: meta as any,
            })} />);
            expect(screen.getByText('https://www.newtonsoft.com/json')).toBeInTheDocument();
        });

        it('shows published date', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, packageMetadata: meta as any,
            })} />);
            expect(screen.getByText('2023-03-08')).toBeInTheDocument();
        });

        it('shows package size formatted', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, packageMetadata: meta as any,
            })} />);
            expect(screen.getByText('2.0 MB')).toBeInTheDocument();
        });

        it('shows loading state', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, loadingMetadata: true,
            })} />);
            expect(screen.getByText('Loading package details...')).toBeInTheDocument();
        });

        it('shows offline indicator', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                packageMetadata: { ...meta, offline: true } as any,
            })} />);
            expect(screen.getByText(/Offline/)).toBeInTheDocument();
        });
    });

    describe('dependencies', () => {
        it('shows dependency groups', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, packageMetadata: meta as any,
            })} />);
            expect(screen.getByText('net8.0')).toBeInTheDocument();
        });

        it('toggles dependency group on click', () => {
            const onToggleDep = vi.fn();
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, packageMetadata: meta as any, onToggleDep,
            })} />);
            fireEvent.click(screen.getByText('net8.0'));
            expect(onToggleDep).toHaveBeenCalledWith('0-net8.0');
        });

        it('shows dependency items when expanded', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                packageMetadata: meta as any,
                expandedDeps: new Set(['0-net8.0']),
            })} />);
            expect(screen.getByText('System.Text.Json')).toBeInTheDocument();
            expect(screen.getByText('>= 8.0.0')).toBeInTheDocument();
        });
    });

    describe('readme tab', () => {
        it('switches to readme tab on click', () => {
            const onDetailsTabChange = vi.fn();
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, onDetailsTabChange,
            })} />);
            fireEvent.click(screen.getByText('Readme'));
            expect(onDetailsTabChange).toHaveBeenCalledWith('readme');
        });

        it('shows loading readme state', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, detailsTab: 'readme', loadingReadme: true,
            })} />);
            expect(screen.getByText('Loading readme from package...')).toBeInTheDocument();
        });

        it('renders readme HTML', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, detailsTab: 'readme',
                sanitizedReadmeHtml: '<p>Hello World</p>',
            })} />);
            expect(screen.getByText('Hello World')).toBeInTheDocument();
        });

        it('shows no readme message', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, detailsTab: 'readme',
            })} />);
            expect(screen.getByText('No readme available for this package')).toBeInTheDocument();
        });
    });

    describe('floating/range versions', () => {
        it('shows floating badge for floating version', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: { id: 'Pkg', version: '10.*' },
                installedPackages: [{ id: 'Pkg', version: '10.*', versionType: 'floating' as const, resolvedVersion: '10.2.0' }],
            })} />);
            expect(screen.getByText('Floating')).toBeInTheDocument();
            expect(screen.getByText('10.*')).toBeInTheDocument();
            expect(screen.getByText('10.2.0')).toBeInTheDocument();
        });

        it('disables version selector for floating versions', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: { id: 'Pkg', version: '10.*' },
                installedPackages: [{ id: 'Pkg', version: '10.*', versionType: 'floating' as const }],
                packageVersions: ['10.2.0'],
            })} />);
            const selectors = screen.getAllByRole('combobox');
            const versionSelector = selectors.find(s => s.getAttribute('title')?.includes('disabled'));
            expect(versionSelector).toBeDisabled();
        });

        it('shows info notice for floating/range versions', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: { id: 'Pkg', version: '10.*' },
                installedPackages: [{ id: 'Pkg', version: '10.*', versionType: 'floating' as const }],
            })} />);
            expect(screen.getByText(/edit the .csproj file/)).toBeInTheDocument();
        });
    });

    describe('vulnerabilities', () => {
        it('shows vulnerability warnings', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg,
                packageMetadata: {
                    ...meta,
                    vulnerabilities: [{ advisoryUrl: 'https://example.com/advisory', severity: 'High' }],
                } as any,
            })} />);
            expect(screen.getByText('High')).toBeInTheDocument();
            expect(screen.getByText('Advisory')).toBeInTheDocument();
        });
    });

    describe('report abuse link', () => {
        it('shows report abuse link for nuget.org source', () => {
            render(<MemoizedPackageDetailsPanel {...createProps({
                selectedPackage: searchPkg, selectedSource: 'https://api.nuget.org/v3/index.json',
            })} />);
            expect(screen.getByText('Report this package')).toBeInTheDocument();
        });
    });
});
