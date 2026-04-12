/**
 * Integration tests for NuGetProjectService.
 *
 * Tests .csproj parsing, installed package extraction, and transitive dependency
 * resolution using real fixture files on disk.
 */
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NuGetProjectService } from '../../services/NuGetProjectService';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const SAMPLE_CSPROJ = path.join(FIXTURES_DIR, 'sample.csproj');
const MULTI_VERSION_CSPROJ = path.join(FIXTURES_DIR, 'multi-version.csproj');

describe('NuGetProjectService Integration', () => {
    let projectService: NuGetProjectService;

    beforeEach(() => {
        projectService = new NuGetProjectService(
            // useNounFirstSyntax — always return false (old-style dotnet CLI)
            vi.fn(async () => false),
        );
    });

    describe('getInstalledPackages (csproj parsing)', () => {
        it('should parse standard PackageReference elements from sample.csproj', async () => {
            const packages = await projectService.getInstalledPackages(SAMPLE_CSPROJ);

            expect(packages.length).toBeGreaterThanOrEqual(3);
            const ids = packages.map((p) => p.id);
            expect(ids).toContain('Newtonsoft.Json');
            expect(ids).toContain('Serilog');
            expect(ids).toContain('xunit');
        });

        it('should extract correct version numbers', async () => {
            const packages = await projectService.getInstalledPackages(SAMPLE_CSPROJ);
            const newton = packages.find((p) => p.id === 'Newtonsoft.Json');

            expect(newton).toBeDefined();
            expect(newton!.version).toBe('13.0.3');
        });

        it('should detect floating versions in multi-version.csproj', async () => {
            const packages = await projectService.getInstalledPackages(MULTI_VERSION_CSPROJ);
            const serilog = packages.find((p) => p.id === 'Serilog');

            expect(serilog).toBeDefined();
            expect(serilog!.version).toBe('4.*');
            expect(serilog!.versionType).toBe('floating');
        });

        it('should detect range versions in multi-version.csproj', async () => {
            const packages = await projectService.getInstalledPackages(MULTI_VERSION_CSPROJ);
            const fluent = packages.find((p) => p.id === 'FluentValidation');

            expect(fluent).toBeDefined();
            expect(fluent!.version).toBe('[11.0.0, 12.0.0)');
            expect(fluent!.versionType).toBe('range');
        });

        it('should handle nested Version element syntax', async () => {
            const packages = await projectService.getInstalledPackages(MULTI_VERSION_CSPROJ);
            const msLogging = packages.find(
                (p) => p.id === 'Microsoft.Extensions.Logging',
            );

            expect(msLogging).toBeDefined();
            expect(msLogging!.version).toBe('8.0.0');
        });
    });

    describe('getTransitivePackages', () => {
        it('should resolve transitive dependencies from project.assets.json', async () => {
            // getTransitivePackages looks for obj/project.assets.json relative to the project
            const result = await projectService.getTransitivePackages(SAMPLE_CSPROJ);

            expect(result.dataSourceAvailable).toBe(true);
            expect(result.frameworks.length).toBeGreaterThan(0);

            // Collect all transitive package IDs across frameworks
            const allTransitiveIds = result.frameworks.flatMap(
                (fw) => fw.packages.map((p) => p.id),
            );

            // xunit.analyzers is a transitive dependency of xunit (not direct)
            expect(allTransitiveIds).toContain('xunit.analyzers');
        });

        it('should not include direct packages as transitive', async () => {
            const result = await projectService.getTransitivePackages(SAMPLE_CSPROJ);

            const allTransitiveIds = result.frameworks.flatMap(
                (fw) => fw.packages.map((p) => p.id),
            );

            // Direct packages (Newtonsoft.Json, Serilog, xunit) should not appear as transitive
            expect(allTransitiveIds).not.toContain('Newtonsoft.Json');
            expect(allTransitiveIds).not.toContain('Serilog');
            expect(allTransitiveIds).not.toContain('xunit');
        });

        it('should return dataSourceAvailable=false when assets.json is missing', async () => {
            // Use a path where no obj/project.assets.json exists
            const result = await projectService.getTransitivePackages(
                path.join(FIXTURES_DIR, 'nonexistent', 'fake.csproj'),
            );

            expect(result.dataSourceAvailable).toBe(false);
            expect(result.frameworks).toEqual([]);
        });
    });

    describe('getProjectReferences', () => {
        it('should extract ProjectReference from multi-version.csproj', async () => {
            const refs = await projectService.getProjectReferences(MULTI_VERSION_CSPROJ);

            expect(refs.length).toBeGreaterThanOrEqual(1);
            expect(refs.some((r) => r.includes('Shared.csproj'))).toBe(true);
        });

        it('should return empty array for sample.csproj (no ProjectReferences)', async () => {
            const refs = await projectService.getProjectReferences(SAMPLE_CSPROJ);

            expect(refs).toEqual([]);
        });
    });
});
