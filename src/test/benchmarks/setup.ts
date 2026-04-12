/**
 * Shared setup for benchmark files.
 * Provides HTTP mocking helpers for service-layer benchmarks.
 * Service benchmarks mock fetchJson/fetchJsonWithDetails at the NuGetService level
 * (avoids HTTP/2 + custom HTTPS agent issues with MSW interceptors).
 */
import { vi } from 'vitest';
import type { NuGetService } from '../../services/NuGetService';
import registrationResponse from '../fixtures/registration-response.json';
import searchResponse from '../fixtures/search-response.json';
import serviceIndex from '../fixtures/service-index.json';

const versionList = { versions: ['12.0.1', '12.0.2', '12.0.3', '13.0.1', '13.0.2', '13.0.3'] };
const autocompleteData = { totalHits: 3, data: ['Newtonsoft.Json', 'Newtonsoft.Json.Bson', 'Newtonsoft.Json.Schema'] };

/**
 * Mock the private fetchJson and fetchJsonWithDetails methods on a NuGetService
 * instance so that all HTTP is replaced with fixture data.
 * Call after creating the service in beforeAll.
 */
export function mockServiceHttp(service: NuGetService): void {
    const svc = service as Record<string, unknown>;

    vi.spyOn(svc as never, 'fetchJson' as never).mockImplementation(async (url: string) => {
        const lower = url.toLowerCase();
        if (lower.includes('/query') || lower.includes('searchqueryservice')) return searchResponse;
        if (lower.includes('flatcontainer') && lower.includes('index.json')) return versionList;
        if (lower.includes('registration5-semver1')) return registrationResponse;
        if (lower.includes('autocomplete')) return autocompleteData;
        return null;
    });

    vi.spyOn(svc as never, 'fetchJsonWithDetails' as never).mockImplementation(async (url: string) => {
        // Service index discovery
        if (url.endsWith('index.json') && !url.includes('flatcontainer') && !url.includes('vulnerability')) {
            return { data: serviceIndex, error: null };
        }
        return { data: null, error: null };
    });

    vi.spyOn(svc as never, 'fetchText' as never).mockResolvedValue(null);
    vi.spyOn(svc as never, 'fetchJsonWithCompression' as never).mockResolvedValue(null);
}

/**
 * Disable background source health monitoring on a NuGetService instance.
 * Prevents timers and async HTTP work from running during bench iterations.
 */
export function disableHealthMonitor(service: NuGetService): void {
    service.startSourceHealthMonitor = () => { /* no-op for benchmarks */ };
    service.stopSourceHealthMonitor();
}
