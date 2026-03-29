/**
 * Test helper factories for backend (Node) tests.
 * Provides mock instances of common services and contexts.
 */
import { vi } from 'vitest';
import type { OperationContext } from '../../services/NuGetOperations';

/**
 * Create a mock NuGetService with all public methods stubbed.
 * Override individual methods as needed in tests.
 */
export function createMockNuGetService(overrides?: Record<string, unknown>) {
    return {
        // Package operations
        installPackage: vi.fn(async () => true),
        updatePackage: vi.fn(async () => true),
        removePackage: vi.fn(async () => true),
        restoreProject: vi.fn(async () => undefined),
        clearNuGetHttpCache: vi.fn(async () => undefined),

        // Search & discovery
        searchPackages: vi.fn(async () => []),
        autocompletePackageId: vi.fn(async () => []),
        quickSearchGrouped: vi.fn(async () => []),

        // Package info
        getPackageVersions: vi.fn(async () => []),
        getPackageMetadata: vi.fn(async () => null),
        getPackageSize: vi.fn(async () => undefined),
        resolveIconUrl: vi.fn(async () => undefined),
        extractReadmeFromPackage: vi.fn(async () => undefined),
        fetchVulnerabilityData: vi.fn(async () => undefined),
        getVulnerabilities: vi.fn(async () => []),

        // Project info
        findProjects: vi.fn(async () => []),
        getInstalledPackages: vi.fn(async () => []),
        getResolvedVersions: vi.fn(async () => new Map()),
        getTransitivePackages: vi.fn(async () => []),
        getTransitivePackagesFromAssets: vi.fn(async () => []),
        getProjectReferences: vi.fn(async () => []),
        getProjectDependencyMap: vi.fn(async () => new Map()),
        readAssetsJson: vi.fn(async () => null),
        getOfflineMetadata: vi.fn(async () => null),

        // Sources
        getSources: vi.fn(async () => []),
        addSource: vi.fn(async () => true),
        removeSource: vi.fn(async () => true),
        enableSource: vi.fn(async () => undefined),
        disableSource: vi.fn(async () => undefined),
        clearSourceErrors: vi.fn(),

        // Health
        startSourceHealthMonitor: vi.fn(),
        stopSourceHealthMonitor: vi.fn(),
        validateAllSources: vi.fn(async () => []),
        testSourceConnectivity: vi.fn(async () => true),
        filterHealthySources: vi.fn(async () => []),
        getFailedSources: vi.fn(() => []),

        // Service discovery
        discoverServiceEndpoints: vi.fn(async () => ({})),

        // SDK version
        getSdkMajorVersion: vi.fn(async () => 8),
        useNounFirstSyntax: vi.fn(async () => false),

        // Logging
        logBulkOperationHeader: vi.fn(),

        ...overrides,
    };
}

/**
 * Create a mock OperationContext for testing operation functions.
 */
export function createMockOperationContext(overrides?: Partial<OperationContext>): OperationContext {
    return {
        nugetService: createMockNuGetService() as unknown as OperationContext['nugetService'],
        postMessage: vi.fn(),
        notifyOtherPanel: vi.fn(),
        ...overrides,
    };
}

/**
 * Create a mock LogOutputChannel for services that accept one.
 */
export function createMockOutputChannel() {
    return {
        name: 'test',
        append: vi.fn(),
        appendLine: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        replace: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        logLevel: 2,
        onDidChangeLogLevel: vi.fn(),
    };
}
