/**
 * Benchmarks for queryAllProjectsTransitive orchestration overhead.
 *
 * Scope: measures only the cost of streaming N project chunks through `batchedPromiseAll`
 * (concurrency 4), abort-signal checks, and callback fan-out. `findProjects()` and
 * `getTransitivePackagesPreservingErrors()` are mocked, so this does NOT measure assets.json
 * parsing, chain resolution, or filesystem I/O — those dominate real-world runtime.
 *
 * Use this bench to catch regressions in the orchestration layer (e.g. accidental
 * concurrency=1, redundant allocations in the loop). For end-to-end transitive perf,
 * add a separate bench that exercises the project service.
 */
import { beforeAll, bench, describe, vi } from 'vitest';
import { queryAllProjectsTransitive, type ProjectTransitiveChunk } from '../../services/NuGetOperations';
import { NuGetService } from '../../services/NuGetService';
import type { Project, TransitivePackagesResult } from '../../services/NuGetTypes';
import { disableHealthMonitor, mockServiceHttp } from './setup';

vi.mock('../../services/NuGetConfigParser', () => ({
    NuGetConfigParser: class {
        async getSources() {
            return [{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }];
        }
        async getCredentials() { return new Map(); }
    },
}));

function createOutputChannel() {
    return {
        name: 'Bench', append: vi.fn(), appendLine: vi.fn(), clear: vi.fn(),
        show: vi.fn(), hide: vi.fn(), dispose: vi.fn(), replace: vi.fn(),
        trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        logLevel: 1, onDidChangeLogLevel: vi.fn(),
    } as unknown as import('vscode').LogOutputChannel;
}

function createProjects(count: number): Project[] {
    return Array.from({ length: count }, (_, i) => ({
        path: `/repo/proj${i}/proj${i}.csproj`,
        name: `proj${i}`,
        workspaceFolder: '/repo',
    }));
}

function createTransitiveResult(projectIndex: number): TransitivePackagesResult {
    return {
        frameworks: [{
            targetFramework: 'net8.0',
            packages: Array.from({ length: 15 }, (_, i) => ({
                id: `Pkg.${projectIndex}.${i}`,
                version: '1.0.0',
                requiredByChain: [`Top.${projectIndex}.${i % 3}`, `Pkg.${projectIndex}.${i}`],
            })),
        }],
        dataSourceAvailable: true,
    };
}

let service: NuGetService;
let projectCount = 0;

beforeAll(() => {
    service = new NuGetService(createOutputChannel());
    disableHealthMonitor(service);
    mockServiceHttp(service);

    vi.spyOn(service, 'findProjects').mockImplementation(async () => createProjects(projectCount));
    vi.spyOn(service, 'getTransitivePackagesPreservingErrors').mockImplementation(async (projectPath: string) => {
        const match = /proj(\d+)/.exec(projectPath);
        const idx = match ? parseInt(match[1], 10) : 0;
        return createTransitiveResult(idx);
    });
});

async function run(count: number): Promise<void> {
    projectCount = count;
    const chunks: ProjectTransitiveChunk[] = [];
    await queryAllProjectsTransitive(service, {
        onStart: () => { /* no-op */ },
        onProject: (chunk) => { chunks.push(chunk); },
    });
}

describe('queryAllProjectsTransitive orchestration overhead', () => {
    bench('5 projects', async () => { await run(5); });
    bench('20 projects', async () => { await run(20); });
    bench('50 projects', async () => { await run(50); });
});
