/**
 * Benchmarks for HTTP fetch pipeline and service orchestration.
 * Mocks HTTP at the NuGetService level to measure orchestration overhead.
 */
import { beforeAll, bench, describe, vi } from 'vitest';
import { NuGetService } from '../../services/NuGetService';
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

let service: NuGetService;

beforeAll(() => {
    service = new NuGetService(createOutputChannel());
    disableHealthMonitor(service);
    mockServiceHttp(service);
});

describe('HTTP fetch pipeline', () => {
    bench('service index discovery', async () => {
        service.clearSourceErrors();
        // discoverServiceEndpoints is private; exercise via search
        await service.searchPackages('bench', ['https://api.nuget.org/v3/index.json']);
    });

    bench('sequential search + metadata + versions', async () => {
        const results = await service.searchPackages('Newtonsoft', ['https://api.nuget.org/v3/index.json']);
        if (results[0]) {
            await service.getPackageMetadata(results[0].id, results[0].version, 'https://api.nuget.org/v3/index.json');
            await service.getPackageVersions(results[0].id, 'https://api.nuget.org/v3/index.json');
        }
    });
});
