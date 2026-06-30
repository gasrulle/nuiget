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

    // Stress the reverse-BFS root resolution on a dense layered DAG (many diamonds /
    // shared parents) — the small fixture above doesn't exercise the algorithm.
    const LAYERS = 6;
    const PER_LAYER = 40;
    const layerIds: string[][] = [];
    for (let l = 0; l < LAYERS; l++) {
        layerIds[l] = Array.from({ length: PER_LAYER }, (_, i) => `L${l}P${i}`);
    }
    const bigTargets: Record<string, { type: string; dependencies?: Record<string, string> }> = {};
    for (let l = 0; l < LAYERS; l++) {
        for (let i = 0; i < PER_LAYER; i++) {
            const deps: Record<string, string> = {};
            if (l < LAYERS - 1) {
                for (let k = 0; k < 3; k++) { deps[layerIds[l + 1][(i + k) % PER_LAYER]] = '1.0.0'; }
            }
            bigTargets[`${layerIds[l][i]}/1.0.0`] = { type: 'package', dependencies: l < LAYERS - 1 ? deps : undefined };
        }
    }
    const bigAssets = {
        version: 3,
        targets: { 'net8.0': bigTargets },
        projectFileDependencyGroups: { 'net8.0': layerIds[0].map(d => `${d} >= 1.0.0`) },
    };
    const bigGraphService = new NuGetProjectService(vi.fn(async () => false));
    vi.spyOn(bigGraphService as unknown as { readAssetsJson: () => Promise<unknown> }, 'readAssetsJson')
        .mockResolvedValue(bigAssets);

    bench('resolve roots — dense ~240-package layered DAG', async () => {
        await (bigGraphService as unknown as { getTransitivePackagesFromAssets: (p: string) => Promise<unknown> })
            .getTransitivePackagesFromAssets('/obj/project.assets.json');
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
