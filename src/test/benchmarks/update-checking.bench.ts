/**
 * Benchmarks for update checking with varying package counts.
 */
import { beforeAll, bench, describe, vi } from 'vitest';
import { NuGetService } from '../../services/NuGetService';
import type { InstalledPackage } from '../../services/NuGetTypes';
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

function createInstalledPackages(count: number): InstalledPackage[] {
    // Only the first one will match fixtures; rest return null (testing throughput)
    return Array.from({ length: count }, (_, i) => ({
        id: i === 0 ? 'Newtonsoft.Json' : `FakePackage.${i}`,
        version: '12.0.3',
        resolvedVersion: '12.0.3',
        versionType: 'standard' as const,
    }));
}

beforeAll(() => {
    service = new NuGetService(createOutputChannel());
    disableHealthMonitor(service);
    mockServiceHttp(service);
});

describe('checkPackageUpdates', () => {
    bench('1 package', async () => {
        service.clearVersionsCache();
        await service.checkPackageUpdates(createInstalledPackages(1), false);
    });

    bench('10 packages', async () => {
        service.clearVersionsCache();
        await service.checkPackageUpdates(createInstalledPackages(10), false);
    });

    bench('50 packages', async () => {
        service.clearVersionsCache();
        await service.checkPackageUpdates(createInstalledPackages(50), false);
    });
});

describe('checkPackageUpdatesMinimal', () => {
    bench('10 packages (minimal)', async () => {
        service.clearVersionsCache();
        await service.checkPackageUpdatesMinimal(createInstalledPackages(10), false);
    });
});
