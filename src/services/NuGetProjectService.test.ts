import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ──────────────────────────────────────────────
// Hoist mocks
// ──────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
    mockExecWithTimeout: vi.fn(),
    mockFileExists: vi.fn(),
    mockFsStat: vi.fn(),
    mockFsReadFile: vi.fn(),
}));

vi.mock('./NuGetUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./NuGetUtils')>();
    return {
        ...actual,
        execWithTimeout: hoisted.mockExecWithTimeout,
        fileExists: hoisted.mockFileExists,
    };
});

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        promises: {
            ...actual.promises,
            stat: hoisted.mockFsStat,
            readFile: hoisted.mockFsReadFile,
        },
    };
});

// Import after mocks
import { NuGetProjectService } from './NuGetProjectService';

describe('NuGetProjectService', () => {
    let service: NuGetProjectService;
    let mockUseNounFirst: ReturnType<typeof vi.fn>;
    let mockEnrichMetadata: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseNounFirst = vi.fn().mockResolvedValue(false);
        mockEnrichMetadata = vi.fn().mockResolvedValue(undefined);
        service = new NuGetProjectService(mockUseNounFirst as any, mockEnrichMetadata as any);
    });

    afterEach(() => {
        service.clearAssetsCache();
    });

    // ──────────────────────────────────────────────
    // findProjects
    // ──────────────────────────────────────────────
    describe('findProjects', () => {
        it('returns empty array when no workspace folders', async () => {
            const vscode = await import('vscode');
            (vscode.workspace as any).workspaceFolders = undefined;
            const result = await service.findProjects();
            expect(result).toEqual([]);
        });

        it('finds and sorts project files', async () => {
            const vscode = await import('vscode');
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            (vscode.workspace.findFiles as any).mockResolvedValueOnce([
                { fsPath: '/workspace/B/B.csproj' },
                { fsPath: '/workspace/A/A.csproj' },
            ]);
            const result = await service.findProjects();
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('A.csproj');
            expect(result[1].name).toBe('B.csproj');
        });
    });

    // ──────────────────────────────────────────────
    // getProjectReferences
    // ──────────────────────────────────────────────
    describe('getProjectReferences', () => {
        it('parses ProjectReference elements', async () => {
            const csproj = `<Project>
  <ItemGroup>
    <ProjectReference Include="..\\Lib\\Lib.csproj" />
    <ProjectReference Include="..\\Core\\Core.csproj" />
  </ItemGroup>
</Project>`;
            hoisted.mockFsReadFile.mockResolvedValueOnce(csproj);
            const result = await service.getProjectReferences('/src/App/App.csproj');
            expect(result).toHaveLength(2);
            expect(result[0]).toContain('Lib.csproj');
            expect(result[1]).toContain('Core.csproj');
        });

        it('returns empty array on read error', async () => {
            hoisted.mockFsReadFile.mockRejectedValueOnce(new Error('ENOENT'));
            const result = await service.getProjectReferences('/missing/App.csproj');
            expect(result).toEqual([]);
        });
    });

    // ──────────────────────────────────────────────
    // getProjectDependencyMap
    // ──────────────────────────────────────────────
    describe('getProjectDependencyMap', () => {
        it('builds dependency map from project references', async () => {
            const paths = ['/src/App/App.csproj', '/src/Lib/Lib.csproj'];
            // App references Lib
            hoisted.mockFsReadFile
                .mockResolvedValueOnce(`<Project><ItemGroup><ProjectReference Include="..\\Lib\\Lib.csproj" /></ItemGroup></Project>`)
                .mockResolvedValueOnce(`<Project></Project>`);
            const map = await service.getProjectDependencyMap(paths);
            expect(map.size).toBe(2);
        });
    });

    // ──────────────────────────────────────────────
    // getInstalledPackages
    // ──────────────────────────────────────────────
    describe('getInstalledPackages', () => {
        it('parses PackageReference from csproj (primary path)', async () => {
            const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Serilog" Version="4.0.0" />
  </ItemGroup>
</Project>`;
            hoisted.mockFileExists.mockResolvedValue(false); // no lock file
            hoisted.mockFsReadFile.mockResolvedValueOnce(csproj);
            const result = await service.getInstalledPackages('/proj/App.csproj');
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('Newtonsoft.Json');
            expect(result[0].version).toBe('13.0.3');
            expect(result[1].id).toBe('Serilog');
        });

        it('calls onEnrichMetadata when not in liteMode', async () => {
            const csproj = `<Project><ItemGroup><PackageReference Include="A" Version="1.0.0" /></ItemGroup></Project>`;
            hoisted.mockFileExists.mockResolvedValue(false);
            hoisted.mockFsReadFile.mockResolvedValueOnce(csproj);
            await service.getInstalledPackages('/proj/App.csproj');
            expect(mockEnrichMetadata).toHaveBeenCalled();
        });

        it('skips enrichment in liteMode', async () => {
            const csproj = `<Project><ItemGroup><PackageReference Include="A" Version="1.0.0" /></ItemGroup></Project>`;
            hoisted.mockFileExists.mockResolvedValue(false);
            hoisted.mockFsReadFile.mockResolvedValueOnce(csproj);
            await service.getInstalledPackages('/proj/App.csproj', true);
            expect(mockEnrichMetadata).not.toHaveBeenCalled();
        });

        it('detects floating version types', async () => {
            const csproj = `<Project><ItemGroup><PackageReference Include="Pkg" Version="10.*" /></ItemGroup></Project>`;
            hoisted.mockFileExists.mockResolvedValue(false);
            hoisted.mockFsReadFile.mockResolvedValueOnce(csproj);
            const result = await service.getInstalledPackages('/proj/App.csproj', true);
            expect(result[0].versionType).toBe('floating');
        });

        it('falls back to dotnet CLI when csproj has no PackageReferences', async () => {
            hoisted.mockFileExists.mockResolvedValue(false);
            // Primary parse returns no packages
            hoisted.mockFsReadFile
                .mockResolvedValueOnce('<Project></Project>') // Primary csproj parse
                .mockResolvedValueOnce('<Project></Project>') // filesToCheck: projectPath
                .mockRejectedValueOnce(new Error('ENOENT')) // filesToCheck: Directory.Build.props
                .mockRejectedValueOnce(new Error('ENOENT')); // filesToCheck: Directory.Packages.props
            hoisted.mockExecWithTimeout.mockResolvedValueOnce({
                stdout: `   > Newtonsoft.Json    13.0.3\n`,
                stderr: '',
            });
            const result = await service.getInstalledPackages('/proj/App.csproj', true);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('Newtonsoft.Json');
        });

        it('extracts version from nested Version element', async () => {
            const csproj = `<Project>
  <ItemGroup>
    <PackageReference Include="Pkg">
      <Version>2.0.0</Version>
    </PackageReference>
  </ItemGroup>
</Project>`;
            hoisted.mockFileExists.mockResolvedValue(false);
            hoisted.mockFsReadFile.mockResolvedValueOnce(csproj);
            const result = await service.getInstalledPackages('/proj/App.csproj', true);
            expect(result[0].version).toBe('2.0.0');
        });
    });

    // ──────────────────────────────────────────────
    // getTransitivePackages
    // ──────────────────────────────────────────────
    describe('getTransitivePackages', () => {
        it('returns dataSourceAvailable=false when assets file missing', async () => {
            hoisted.mockFileExists.mockResolvedValueOnce(false);
            const result = await service.getTransitivePackages('/proj/App.csproj');
            expect(result.dataSourceAvailable).toBe(false);
            expect(result.frameworks).toEqual([]);
        });

        it('returns transitive packages from project.assets.json', async () => {
            hoisted.mockFileExists.mockResolvedValueOnce(true);
            const assetsJson = {
                version: 3,
                targets: {
                    'net8.0': {
                        'Serilog/4.0.0': {
                            type: 'package',
                            dependencies: { 'Serilog.Sinks.Console': '5.0.0' },
                        },
                        'Serilog.Sinks.Console/5.0.0': {
                            type: 'package',
                        },
                    },
                },
                projectFileDependencyGroups: {
                    'net8.0': ['Serilog >= 4.0.0'],
                },
            };
            hoisted.mockFsStat.mockResolvedValueOnce({ mtimeMs: 1000 });
            hoisted.mockFsReadFile.mockResolvedValueOnce(JSON.stringify(assetsJson));
            const result = await service.getTransitivePackages('/proj/App.csproj');
            expect(result.dataSourceAvailable).toBe(true);
            expect(result.frameworks).toHaveLength(1);
            expect(result.frameworks[0].targetFramework).toBe('net8.0');
            // Serilog.Sinks.Console is transitive (not in directDeps)
            expect(result.frameworks[0].packages).toHaveLength(1);
            expect(result.frameworks[0].packages[0].id).toBe('Serilog.Sinks.Console');
        });

        it('returns empty frameworks on parse error', async () => {
            hoisted.mockFileExists.mockResolvedValueOnce(true);
            hoisted.mockFsStat.mockRejectedValueOnce(new Error('ENOENT'));
            const result = await service.getTransitivePackages('/proj/App.csproj');
            expect(result.dataSourceAvailable).toBe(true);
            expect(result.frameworks).toEqual([]);
        });

        it('resolves the top-level root through a cyclic graph (regression: no false "unknown")', async () => {
            // D (direct) → A → X → Y, with a Y → X back-edge (cycle) and Y → T1.
            // The previous shared-`visited` recursion + id-keyed cache poisoned the cache on
            // this shape, leaving Y and T1 with an empty requiredByChain ("Required by: unknown").
            hoisted.mockFileExists.mockResolvedValueOnce(true);
            const assetsJson = {
                version: 3,
                targets: {
                    'net8.0': {
                        'D/1.0.0': { type: 'package', dependencies: { A: '1.0.0' } },
                        'A/1.0.0': { type: 'package', dependencies: { X: '1.0.0' } },
                        'X/1.0.0': { type: 'package', dependencies: { Y: '1.0.0', T2: '1.0.0' } },
                        'Y/1.0.0': { type: 'package', dependencies: { X: '1.0.0', T1: '1.0.0' } },
                        'T1/1.0.0': { type: 'package' },
                        'T2/1.0.0': { type: 'package' },
                    },
                },
                projectFileDependencyGroups: { 'net8.0': ['D >= 1.0.0'] },
            };
            hoisted.mockFsStat.mockResolvedValueOnce({ mtimeMs: 1000 });
            hoisted.mockFsReadFile.mockResolvedValueOnce(JSON.stringify(assetsJson));
            const result = await service.getTransitivePackages('/proj/App.csproj');
            const byId = Object.fromEntries(result.frameworks[0].packages.map(p => [p.id, p.requiredByChain]));
            // Every transitive package traces back to the single direct root D.
            expect(byId.Y).toEqual(['D']);
            expect(byId.T1).toEqual(['D']);
            expect(byId.T2).toEqual(['D']);
            expect(byId.X).toEqual(['D']);
            expect(byId.A).toEqual(['D']);
        });

        it('collects ALL distinct direct roots for a diamond (sorted)', async () => {
            // A and B are both direct and both depend on T → T is required by [A, B].
            hoisted.mockFileExists.mockResolvedValueOnce(true);
            const assetsJson = {
                version: 3,
                targets: {
                    'net8.0': {
                        'B/1.0.0': { type: 'package', dependencies: { T: '1.0.0' } },
                        'A/1.0.0': { type: 'package', dependencies: { T: '1.0.0' } },
                        'T/1.0.0': { type: 'package' },
                    },
                },
                projectFileDependencyGroups: { 'net8.0': ['A >= 1.0.0', 'B >= 1.0.0'] },
            };
            hoisted.mockFsStat.mockResolvedValueOnce({ mtimeMs: 1000 });
            hoisted.mockFsReadFile.mockResolvedValueOnce(JSON.stringify(assetsJson));
            const result = await service.getTransitivePackages('/proj/App.csproj');
            const t = result.frameworks[0].packages.find(p => p.id === 'T');
            expect(t?.requiredByChain).toEqual(['A', 'B']);
        });

        it('truncates requiredByChain to 5 roots and keeps the full set in fullChain', async () => {
            // Six direct packages (D1..D6) all depend on T → 6 distinct roots.
            hoisted.mockFileExists.mockResolvedValueOnce(true);
            const directIds = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
            const targets: Record<string, { type: string; dependencies?: Record<string, string> }> = {
                'T/1.0.0': { type: 'package' },
            };
            for (const d of directIds) {
                targets[`${d}/1.0.0`] = { type: 'package', dependencies: { T: '1.0.0' } };
            }
            const assetsJson = {
                version: 3,
                targets: { 'net8.0': targets },
                projectFileDependencyGroups: { 'net8.0': directIds.map(d => `${d} >= 1.0.0`) },
            };
            hoisted.mockFsStat.mockResolvedValueOnce({ mtimeMs: 1000 });
            hoisted.mockFsReadFile.mockResolvedValueOnce(JSON.stringify(assetsJson));
            const result = await service.getTransitivePackages('/proj/App.csproj');
            const t = result.frameworks[0].packages.find(p => p.id === 'T');
            expect(t?.requiredByChain).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
            expect(t?.fullChain).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
        });
    });

    // ──────────────────────────────────────────────
    // getPackageDependencies
    // ──────────────────────────────────────────────
    describe('getPackageDependencies', () => {
        it('parses dependencies from assets.json', async () => {
            const assetsJson = {
                version: 3,
                targets: {
                    'net8.0': {
                        'Serilog/4.0.0': { dependencies: { 'Serilog.Sinks.Console': '5.0.0' } },
                        'Serilog.Sinks.Console/5.0.0': {},
                    },
                },
            };
            hoisted.mockFileExists.mockResolvedValueOnce(true);
            hoisted.mockFsStat.mockResolvedValueOnce({ mtimeMs: 2000 });
            hoisted.mockFsReadFile.mockResolvedValueOnce(JSON.stringify(assetsJson));
            const result = await service.getPackageDependencies('/proj/App.csproj');
            expect(result.get('serilog')).toEqual(['serilog.sinks.console']);
            expect(result.get('serilog.sinks.console')).toEqual([]);
        });

        it('returns empty map when no assets file', async () => {
            hoisted.mockFileExists.mockResolvedValueOnce(false);
            const result = await service.getPackageDependencies('/proj/App.csproj');
            expect(result.size).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // clearAssetsCache
    // ──────────────────────────────────────────────
    describe('clearAssetsCache', () => {
        it('clears the cache so next read re-parses', async () => {
            const assetsJson = { version: 3, targets: { 'net8.0': {} } };
            hoisted.mockFileExists.mockResolvedValue(true);
            hoisted.mockFsStat.mockResolvedValue({ mtimeMs: 1000 });
            hoisted.mockFsReadFile.mockResolvedValue(JSON.stringify(assetsJson));

            await service.getPackageDependencies('/proj/App.csproj');
            // First call reads the file
            expect(hoisted.mockFsReadFile).toHaveBeenCalledTimes(1);

            // Second call uses cache (same mtime)
            await service.getPackageDependencies('/proj/App.csproj');
            expect(hoisted.mockFsReadFile).toHaveBeenCalledTimes(1);

            // After clearing, it re-reads
            service.clearAssetsCache();
            await service.getPackageDependencies('/proj/App.csproj');
            expect(hoisted.mockFsReadFile).toHaveBeenCalledTimes(2);
        });
    });
});
