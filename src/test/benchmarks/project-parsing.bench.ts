/**
 * Benchmarks for project parsing — .csproj and project.assets.json processing.
 */
import path from 'path';
import { bench, describe, vi } from 'vitest';
import { NuGetProjectService } from '../../services/NuGetProjectService';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const SAMPLE_CSPROJ = path.join(FIXTURES_DIR, 'sample.csproj');
const MULTI_VERSION_CSPROJ = path.join(FIXTURES_DIR, 'multi-version.csproj');
const ASSETS_JSON = path.join(FIXTURES_DIR, 'project.assets.json');

const projectService = new NuGetProjectService(vi.fn(async () => false));

describe('getInstalledPackages', () => {
    bench('sample.csproj (3 packages)', async () => {
        await projectService.getInstalledPackages(SAMPLE_CSPROJ);
    });

    bench('multi-version.csproj (4 packages, mixed version types)', async () => {
        await projectService.getInstalledPackages(MULTI_VERSION_CSPROJ);
    });
});

describe('getTransitivePackagesFromAssets', () => {
    bench('resolve transitive deps from project.assets.json', async () => {
        await projectService.getTransitivePackagesFromAssets(
            ASSETS_JSON,
            ['Newtonsoft.Json', 'Serilog'],
        );
    });
});

describe('getTransitivePackagesPreservingErrors', () => {
    // Fixture .csproj resolves to fixtures/obj/project.assets.json (file-system real read).
    bench('cold (cache miss, real fs)', async () => {
        // Use a fresh service per iteration so the per-instance cache stays cold.
        const svc = new NuGetProjectService(vi.fn(async () => false));
        await svc.getTransitivePackagesPreservingErrors(SAMPLE_CSPROJ);
    });

    const warmService = new NuGetProjectService(vi.fn(async () => false));
    bench('warm (cache hit)', async () => {
        await warmService.getTransitivePackagesPreservingErrors(SAMPLE_CSPROJ);
    });
});

describe('getProjectReferences', () => {
    bench('extract project references', async () => {
        await projectService.getProjectReferences(MULTI_VERSION_CSPROJ);
    });
});
