import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceCredentials } from '../services/CredentialService';
import { CredentialService } from '../services/CredentialService';

// ──────────────────────────────────────────────
// Mocks — use vi.hoisted to make mocks available inside vi.mock factories
// ──────────────────────────────────────────────
const { mockExecAsync, mockFsAccess, mockHomedir } = vi.hoisted(() => ({
    mockExecAsync: vi.fn(),
    mockFsAccess: vi.fn(),
    mockHomedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('util', () => ({
    promisify: vi.fn(() => mockExecAsync),
}));

vi.mock('fs', () => ({
    promises: {
        access: mockFsAccess,
    },
    constants: {
        F_OK: 0,
    },
}));

vi.mock('os', () => ({
    homedir: mockHomedir,
}));

// ──────────────────────────────────────────────
// Helper: create a mock vscode LogOutputChannel
// ──────────────────────────────────────────────
function createMockOutputChannel() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    } as unknown as import('vscode').LogOutputChannel;
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('CredentialService', () => {
    let originalPlatform: PropertyDescriptor | undefined;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        CredentialService.resetInstance();
        vi.clearAllMocks();
        originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
        originalEnv = { ...process.env };
        // Default: reject all fs.access calls (no credential provider found)
        mockFsAccess.mockRejectedValue(new Error('ENOENT'));
    });

    afterEach(() => {
        // Restore process.platform
        if (originalPlatform) {
            Object.defineProperty(process, 'platform', originalPlatform);
        }
        // Restore env vars
        process.env = originalEnv;
    });

    // ──────────────────────────────────────────────
    // Singleton
    // ──────────────────────────────────────────────
    describe('singleton pattern', () => {
        it('getInstance returns same instance', () => {
            const a = CredentialService.getInstance();
            const b = CredentialService.getInstance();
            expect(a).toBe(b);
        });

        it('resetInstance creates new instance on next call', () => {
            const first = CredentialService.getInstance();
            CredentialService.resetInstance();
            const second = CredentialService.getInstance();
            expect(first).not.toBe(second);
        });
    });

    // ──────────────────────────────────────────────
    // createBasicAuthHeader (static, pure)
    // ──────────────────────────────────────────────
    describe('createBasicAuthHeader', () => {
        it('creates valid Basic auth header', () => {
            const credentials: SourceCredentials = {
                username: 'user',
                password: 'pass',
                source: 'nuget-config',
            };
            const header = CredentialService.createBasicAuthHeader(credentials);
            expect(header).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
        });

        it('handles special characters', () => {
            const credentials: SourceCredentials = {
                username: 'user@domain.com',
                password: 'p@$$w0rd!',
                source: 'credential-provider',
            };
            const header = CredentialService.createBasicAuthHeader(credentials);
            const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString();
            expect(decoded).toBe('user@domain.com:p@$$w0rd!');
        });
    });

    // ──────────────────────────────────────────────
    // getCredentials — nuget.config path
    // ──────────────────────────────────────────────
    describe('getCredentials — nuget.config credentials', () => {
        it('returns ClearTextPassword credentials from config', async () => {
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('myFeed', { username: 'admin', password: 'secret123', isEncrypted: false });

            const result = await service.getCredentials(
                'https://myfeed.example.com/v3/index.json',
                'myFeed',
                configCreds
            );

            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.username).toBe('admin');
            expect(result.credentials!.password).toBe('secret123');
            expect(result.credentials!.source).toBe('nuget-config');
        });

        it('uses VssSessionToken as default username', async () => {
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('feed', { password: 'token', isEncrypted: false });

            const result = await service.getCredentials(
                'https://feed.example.com/v3/index.json',
                'feed',
                configCreds
            );

            expect(result.credentials!.username).toBe('VssSessionToken');
        });

        it('resolves environment variables in password', async () => {
            process.env.MY_TOKEN = 'resolved-token-value';
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('envFeed', { username: 'user', password: '%MY_TOKEN%', isEncrypted: false });

            const result = await service.getCredentials(
                'https://envfeed.example.com/v3/index.json',
                'envFeed',
                configCreds
            );

            expect(result.credentials!.password).toBe('resolved-token-value');
        });

        it('does not return credentials for unresolved env vars', async () => {
            delete process.env.NONEXISTENT_VAR;
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('badFeed', { username: 'user', password: '%NONEXISTENT_VAR%', isEncrypted: false });

            const result = await service.getCredentials(
                'https://badfeed.example.com/v3/index.json',
                'badFeed',
                configCreds
            );

            // Password starts with % (unresolved), so it falls through to credential provider
            expect(result.credentials).toBeNull();
        });

        it('decrypts DPAPI password on Windows', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            mockExecAsync.mockResolvedValueOnce({ stdout: 'decrypted-password\n', stderr: '' });

            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('encFeed', { username: 'user', password: 'AQAAAA==', isEncrypted: true });

            const result = await service.getCredentials(
                'https://encfeed.example.com/v3/index.json',
                'encFeed',
                configCreds
            );

            expect(result.credentials!.password).toBe('decrypted-password');
            expect(mockExecAsync).toHaveBeenCalled();
        });

        it('skips DPAPI on non-Windows, returns raw encrypted password', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('encFeed', { username: 'user', password: 'AQAAAA==', isEncrypted: true });

            const result = await service.getCredentials(
                'https://encfeed.example.com/v3/index.json',
                'encFeed',
                configCreds
            );

            // Decryption fails on non-Windows but code returns the raw encrypted value
            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.password).toBe('AQAAAA==');
        });

        it('rejects invalid base64 but returns raw password (DPAPI not invoked)', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

            const service = CredentialService.getInstance();
            service.setOutputChannel(createMockOutputChannel());
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('badB64Feed', { username: 'user', password: 'not valid base64!!!', isEncrypted: true });

            const result = await service.getCredentials(
                'https://badb64.example.com/v3/index.json',
                'badB64Feed',
                configCreds
            );

            // Invalid base64 is rejected for DPAPI but the raw value is still returned
            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.password).toBe('not valid base64!!!');
            // Should NOT have called execAsync (DPAPI should not be invoked)
            expect(mockExecAsync).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // getCredentials — credential provider path
    // ──────────────────────────────────────────────
    describe('getCredentials — credential provider', () => {
        it('finds and uses Windows netfx credential provider', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            mockHomedir.mockReturnValue('C:\\Users\\testuser');

            // Make the netfx path accessible
            mockFsAccess.mockImplementation((p: string) => {
                if (p.includes('netfx')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });

            // Credential provider returns JSON
            mockExecAsync.mockResolvedValueOnce({
                stdout: JSON.stringify({ Username: 'azureUser', Password: 'azureToken' }),
                stderr: '',
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json');

            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.username).toBe('azureUser');
            expect(result.credentials!.password).toBe('azureToken');
            expect(result.credentials!.source).toBe('credential-provider');
        });

        it('returns provider-not-installed when no provider found', async () => {
            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).toBeNull();
            expect(result.error?.type).toBe('provider-not-installed');
        });

        it('returns provider-needs-interactive on interactive auth error', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            mockHomedir.mockReturnValue('C:\\Users\\testuser');
            mockFsAccess.mockImplementation((p: string) => {
                if (p.includes('netfx')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });

            mockExecAsync.mockRejectedValueOnce({
                stderr: 'interactive authentication required, please run device flow login',
                message: 'Command failed',
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).toBeNull();
            expect(result.error?.type).toBe('provider-needs-interactive');
            expect(result.error?.suggestedAction).toContain('interactive');
        });

        it('skips credential provider for non-Azure URLs without env config', async () => {
            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://custom.nuget.example.com/v3/index.json');

            expect(result.credentials).toBeNull();
            expect(result.error?.type).toBe('not-found');
        });

        it('uses credential provider for custom hosts via env var', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_HOSTS = 'custom.nuget.example.com';
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            mockHomedir.mockReturnValue('C:\\Users\\testuser');
            mockFsAccess.mockImplementation((p: string) => {
                if (p.includes('netfx')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });
            mockExecAsync.mockResolvedValueOnce({
                stdout: JSON.stringify({ Username: 'user', Password: 'token' }),
                stderr: '',
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://custom.nuget.example.com/v3/index.json');

            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.source).toBe('credential-provider');
        });

        it('rejects invalid URLs for credential provider', async () => {
            const service = CredentialService.getInstance();
            service.setOutputChannel(createMockOutputChannel());
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org" && echo pwned');

            expect(result.credentials).toBeNull();
            expect(result.error?.type).toBe('unknown');
        });
    });

    // ──────────────────────────────────────────────
    // getCredentials — environment variable tokens
    // ──────────────────────────────────────────────
    describe('getCredentials — environment variables', () => {
        it('uses ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN for Azure URLs', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN = 'env-access-token';

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.password).toBe('env-access-token');
            expect(result.credentials!.source).toBe('env-var');
        });

        it('uses VSS_NUGET_ACCESSTOKEN fallback', async () => {
            delete process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN;
            process.env.VSS_NUGET_ACCESSTOKEN = 'vss-token';

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.password).toBe('vss-token');
        });

        it('uses EXTERNAL_FEED_ENDPOINTS JSON', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS = JSON.stringify({
                endpointCredentials: [{
                    endpoint: 'https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json',
                    username: 'feedUser',
                    password: 'feedToken',
                }],
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).not.toBeNull();
            expect(result.credentials!.username).toBe('feedUser');
            expect(result.credentials!.password).toBe('feedToken');
            expect(result.credentials!.source).toBe('env-var');
        });

        it('ignores EXTERNAL_FEED_ENDPOINTS for non-matching URLs', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS = JSON.stringify({
                endpointCredentials: [{
                    endpoint: 'https://other-org.example.com/feed',
                    password: 'otherToken',
                }],
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            // Should not match the external feed endpoint
            expect(result.credentials).toBeNull();
        });

        it('handles malformed EXTERNAL_FEED_ENDPOINTS JSON gracefully', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_EXTERNAL_FEED_ENDPOINTS = 'not json at all';

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            // Should not crash, falls through
            expect(result.credentials).toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // Caching behavior
    // ──────────────────────────────────────────────
    describe('caching', () => {
        it('returns cached credentials on second call', async () => {
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('cached', { username: 'user', password: 'pass', isEncrypted: false });

            const first = await service.getCredentials('https://cached.example.com', 'cached', configCreds);
            const second = await service.getCredentials('https://cached.example.com', 'cached', configCreds);

            expect(first.credentials).toEqual(second.credentials);
        });

        it('clearCache clears all cached credentials', async () => {
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('cached', { username: 'user', password: 'pass', isEncrypted: false });

            await service.getCredentials('https://cached.example.com', 'cached', configCreds);
            service.clearCache();

            // After clearing, it should re-acquire (the config is still available)
            const result = await service.getCredentials('https://cached.example.com', 'cached', configCreds);
            expect(result.credentials).not.toBeNull();
        });

        it('cache is case-insensitive for URLs', async () => {
            const service = CredentialService.getInstance();
            const configCreds = new Map<string, { username?: string; password?: string; isEncrypted: boolean }>();
            configCreds.set('feed', { username: 'user', password: 'pass', isEncrypted: false });

            const first = await service.getCredentials('https://FEED.EXAMPLE.COM', 'feed', configCreds);
            const second = await service.getCredentials('https://feed.example.com', 'feed', configCreds);

            expect(first.credentials).toEqual(second.credentials);
        });
    });

    // ──────────────────────────────────────────────
    // prewarmCredentials
    // ──────────────────────────────────────────────
    describe('prewarmCredentials', () => {
        it('does not throw when warming multiple sources', () => {
            const service = CredentialService.getInstance();
            expect(() =>
                service.prewarmCredentials([
                    { url: 'https://a.example.com', name: 'a' },
                    { url: 'https://b.example.com', name: 'b' },
                ])
            ).not.toThrow();
        });
    });

    // ──────────────────────────────────────────────
    // setOutputChannel / logging
    // ──────────────────────────────────────────────
    describe('logging', () => {
        it('setOutputChannel does not throw', () => {
            const service = CredentialService.getInstance();
            expect(() => service.setOutputChannel(createMockOutputChannel())).not.toThrow();
        });
    });

    // ──────────────────────────────────────────────
    // findCredentialProvider — path discovery
    // ──────────────────────────────────────────────
    describe('findCredentialProvider (via getCredentials)', () => {
        it('finds netcore provider on Linux', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            mockHomedir.mockReturnValue('/home/testuser');

            mockFsAccess.mockImplementation((p: string) => {
                if (p.includes('netcore') && p.includes('CredentialProvider.Microsoft.dll')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });

            // Provider returns credentials
            mockExecAsync.mockResolvedValueOnce({
                stdout: JSON.stringify({ Username: 'linuxUser', Password: 'linuxToken' }),
                stderr: '',
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).not.toBeNull();
            // On Linux, .dll provider should be invoked via dotnet
            expect(mockExecAsync).toHaveBeenCalled();
            const callArg = mockExecAsync.mock.calls[0][0] as string;
            expect(callArg).toContain('dotnet');
        });

        it('uses NUGET_NETCORE_PLUGIN_PATHS env override', async () => {
            const credPath = process.platform === 'win32'
                ? 'C:\\custom\\path\\CredentialProvider.Microsoft.exe'
                : '/custom/path/CredentialProvider.Microsoft.exe';
            process.env.NUGET_NETCORE_PLUGIN_PATHS = credPath;

            mockFsAccess.mockImplementation((p: string) => {
                if (p === credPath) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });

            mockExecAsync.mockResolvedValueOnce({
                stdout: JSON.stringify({ Username: 'u', Password: 'p' }),
                stderr: '',
            });

            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');

            expect(result.credentials).not.toBeNull();
        });
    });

    // ──────────────────────────────────────────────
    // Azure Artifacts URL detection (via getCredentials behavior)
    // ──────────────────────────────────────────────
    describe('Azure Artifacts URL detection', () => {
        it('recognizes pkgs.dev.azure.com', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN = 'token';
            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json');
            expect(result.credentials).not.toBeNull();
        });

        it('recognizes .pkgs.visualstudio.com', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN = 'token';
            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://myorg.pkgs.visualstudio.com/_packaging/feed/nuget/v3/index.json');
            expect(result.credentials).not.toBeNull();
        });

        it('recognizes _packaging URLs', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN = 'token';
            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://custom.example.com/_packaging/feed/nuget/v3/index.json');
            expect(result.credentials).not.toBeNull();
        });

        it('does not recognize non-Azure URLs', async () => {
            process.env.ARTIFACTS_CREDENTIALPROVIDER_ACCESSTOKEN = 'token';
            const service = CredentialService.getInstance();
            const result = await service.getCredentials('https://www.nuget.org/api/v2/');
            expect(result.credentials).toBeNull();
        });
    });
});
