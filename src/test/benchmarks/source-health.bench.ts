/**
 * Benchmarks for source health checking and filtering.
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

describe('source health', () => {
    bench('clearSourceErrors', () => {
        service.clearSourceErrors();
    });

    bench('getFailedSources', () => {
        service.getFailedSources();
    });
});
