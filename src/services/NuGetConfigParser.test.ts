import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { NuGetConfigParser } from '../services/NuGetConfigParser';

// ──────────────────────────────────────────────
// Hoisted mocks: available before vi.mock factories run
// ──────────────────────────────────────────────
const { mockReadFileAsync, mockExecAsync, mockFsAccess, getNextPromisified } = vi.hoisted(() => {
    let callIndex = 0;
    const readFile = vi.fn();
    const execFn = vi.fn();
    const fsAccess = vi.fn();
    return {
        mockReadFileAsync: readFile,
        mockExecAsync: execFn,
        mockFsAccess: fsAccess,
        getNextPromisified: () => {
            callIndex++;
            return callIndex === 1 ? readFile : execFn;
        },
    };
});

vi.mock('child_process', () => ({ exec: vi.fn() }));

vi.mock('fs', () => ({
    readFile: vi.fn(),
    promises: { access: mockFsAccess },
    constants: { F_OK: 0 },
}));

// NuGetConfigParser.ts calls promisify twice at module level:
//   const readFileAsync = promisify(fs.readFile);   ← 1st
//   const execAsync     = promisify(exec);          ← 2nd
vi.mock('util', () => ({
    promisify: vi.fn(() => getNextPromisified()),
}));

// ──────────────────────────────────────────────
// XML Fixtures
// ──────────────────────────────────────────────

const FIXTURE_NUGET_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="MyFeed" value="https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json" />
    <add key="LocalFeed" value="C:\\LocalPackages" />
  </packageSources>
  <disabledPackageSources>
    <add key="LocalFeed" value="true" />
  </disabledPackageSources>
  <packageSourceCredentials>
    <MyFeed>
      <add key="Username" value="user@example.com" />
      <add key="ClearTextPassword" value="test-token" />
    </MyFeed>
  </packageSourceCredentials>
</configuration>`;

const FIXTURE_NUGET_CONFIG_ENCRYPTED = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="PrivateFeed" value="https://private.example.com/v3/index.json" />
  </packageSources>
  <packageSourceCredentials>
    <PrivateFeed>
      <add key="Username" value="admin" />
      <add key="Password" value="encrypted-value" />
    </PrivateFeed>
  </packageSourceCredentials>
</configuration>`;

const FIXTURE_NUGET_CONFIG_SINGLE_SOURCE = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>`;

const FIXTURE_NUGET_CONFIG_EMPTY = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
</configuration>`;

const FIXTURE_NUGET_CONFIG_SPACES = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="My Feed" value="https://example.com/v3/index.json" />
  </packageSources>
  <packageSourceCredentials>
    <My_x0020_Feed>
      <add key="Username" value="testuser" />
      <add key="ClearTextPassword" value="testpass" />
    </My_x0020_Feed>
  </packageSourceCredentials>
</configuration>`;

const FIXTURE_MULTI_CRED = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="FeedA" value="https://feedA.example.com/v3/index.json" />
    <add key="FeedB" value="https://feedB.example.com/v3/index.json" />
  </packageSources>
  <packageSourceCredentials>
    <FeedA>
      <add key="Username" value="userA" />
      <add key="ClearTextPassword" value="passA" />
    </FeedA>
    <FeedB>
      <add key="Username" value="userB" />
      <add key="ClearTextPassword" value="passB" />
    </FeedB>
  </packageSourceCredentials>
</configuration>`;

const CLI_OUTPUT_DETAILED = `Registered Sources:
  1.  nuget.org [Enabled]
      https://api.nuget.org/v3/index.json
  2.  MyFeed [Enabled]
      https://pkgs.dev.azure.com/myorg/_packaging/myfeed/nuget/v3/index.json
  3.  LocalFeed [Disabled]
      C:\\LocalPackages
`;

const CLI_OUTPUT_SINGLE = `Registered Sources:
  1.  nuget.org [Enabled]
      https://api.nuget.org/v3/index.json
`;

// ──────────────────────────────────────────────
describe('NuGetConfigParser', () => {
    let parser: NuGetConfigParser;
    const origPlatform = process.platform;
    const origProfile = process.env.USERPROFILE;
    const origHome = process.env.HOME;

    beforeEach(() => {
        vi.clearAllMocks();
        parser = new NuGetConfigParser();
        // Restore platform/env defaults
        Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
        if (origProfile !== undefined) {
            process.env.USERPROFILE = origProfile;
        }
        if (origHome !== undefined) {
            process.env.HOME = origHome;
        }
        // Default workspace
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/test-workspace' }, name: 'test-workspace', index: 0 },
        ];
    });

    // ──────────────────────────────────────────────
    // findCredentialsForSource (pure, no I/O)
    // ──────────────────────────────────────────────
    describe('findCredentialsForSource', () => {
        const makeCreds = (entries: [string, { username?: string; password?: string; isEncrypted: boolean }][]) =>
            new Map(entries);

        it('finds exact match', () => {
            const creds = makeCreds([
                ['MyFeed', { username: 'user', password: 'pass', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'MyFeed');
            expect(result).toEqual({ username: 'user', password: 'pass', isEncrypted: false });
        });

        it('returns undefined when no match', () => {
            const creds = makeCreds([
                ['OtherFeed', { password: 'pass', isEncrypted: false }],
            ]);
            expect(parser.findCredentialsForSource(creds, 'MyFeed')).toBeUndefined();
        });

        it('matches _x0020_ encoded names', () => {
            const creds = makeCreds([
                ['My_x0020_Feed', { username: 'user', password: 'pass', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'My Feed');
            expect(result).toEqual({ username: 'user', password: 'pass', isEncrypted: false });
        });

        it('matches underscore-encoded names', () => {
            const creds = makeCreds([
                ['My_Feed', { username: 'user', password: 'pass', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'My Feed');
            expect(result).toEqual({ username: 'user', password: 'pass', isEncrypted: false });
        });

        it('matches case-insensitively', () => {
            const creds = makeCreds([
                ['myfeed', { username: 'user', password: 'pass', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'MyFeed');
            expect(result).toEqual({ username: 'user', password: 'pass', isEncrypted: false });
        });

        it('prefers exact match over encoded match', () => {
            const creds = makeCreds([
                ['My Feed', { username: 'exact', password: 'pass1', isEncrypted: false }],
                ['My_x0020_Feed', { username: 'encoded', password: 'pass2', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'My Feed');
            expect(result?.username).toBe('exact');
        });

        it('returns undefined for empty credentials map', () => {
            const creds = makeCreds([]);
            expect(parser.findCredentialsForSource(creds, 'AnyFeed')).toBeUndefined();
        });

        it('handles credential with only password (no username)', () => {
            const creds = makeCreds([
                ['TokenFeed', { password: 'token-value', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'TokenFeed');
            expect(result).toEqual({ password: 'token-value', isEncrypted: false });
            expect(result?.username).toBeUndefined();
        });

        it('handles multiple spaces in name', () => {
            const creds = makeCreds([
                ['My_x0020_Custom_x0020_Feed', { username: 'user', password: 'pass', isEncrypted: false }],
            ]);
            const result = parser.findCredentialsForSource(creds, 'My Custom Feed');
            expect(result).toEqual({ username: 'user', password: 'pass', isEncrypted: false });
        });
    });

    // ──────────────────────────────────────────────
    // getConfigFilePaths (synchronous, no I/O)
    // ──────────────────────────────────────────────
    describe('getConfigFilePaths', () => {
        it('returns AppData user config on Windows', () => {
            Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
            process.env.USERPROFILE = 'C:\\Users\\TestUser';

            const paths = parser.getConfigFilePaths();
            const userPath = paths.find(p => p.label.includes('User'));
            expect(userPath).toBeDefined();
            expect(userPath!.path).toContain('AppData');
            expect(userPath!.path).toContain('NuGet.Config');
        });

        it('returns .nuget user config on non-Windows', () => {
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
            process.env.HOME = '/home/testuser';
            process.env.USERPROFILE = '';

            const paths = parser.getConfigFilePaths();
            const userPath = paths.find(p => p.label === 'User');
            expect(userPath).toBeDefined();
            expect(userPath!.path).toContain('.nuget');
        });

        it('includes workspace-level configs', () => {
            (vscode.workspace as any).workspaceFolders = [
                { uri: { fsPath: '/my/workspace' }, name: 'workspace', index: 0 },
            ];

            const paths = parser.getConfigFilePaths();
            const workspacePath = paths.find(p => p.label.includes('Workspace'));
            expect(workspacePath).toBeDefined();
            expect(workspacePath!.path).toContain('nuget.config');
        });

        it('includes multiple workspace folders', () => {
            (vscode.workspace as any).workspaceFolders = [
                { uri: { fsPath: '/ws/projectA' }, name: 'projectA', index: 0 },
                { uri: { fsPath: '/ws/projectB' }, name: 'projectB', index: 1 },
            ];

            const paths = parser.getConfigFilePaths();
            const wsPaths = paths.filter(p => p.label.includes('Workspace'));
            expect(wsPaths).toHaveLength(2);
            expect(wsPaths[0].label).toContain('projectA');
            expect(wsPaths[1].label).toContain('projectB');
        });

        it('returns empty when no user profile and no workspace', () => {
            process.env.USERPROFILE = '';
            process.env.HOME = '';
            (vscode.workspace as any).workspaceFolders = undefined;

            const paths = parser.getConfigFilePaths();
            expect(paths).toEqual([]);
        });
    });

    // ──────────────────────────────────────────────
    // getSources — CLI path
    // ──────────────────────────────────────────────
    describe('getSources', () => {
        it('parses sources from dotnet CLI output', async () => {
            mockExecAsync.mockResolvedValue({ stdout: CLI_OUTPUT_DETAILED, stderr: '' });
            // No config files found for config map
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            const sources = await parser.getSources();
            expect(sources).toHaveLength(3);

            expect(sources[0].name).toBe('nuget.org');
            expect(sources[0].url).toBe('https://api.nuget.org/v3/index.json');
            expect(sources[0].enabled).toBe(true);

            expect(sources[1].name).toBe('MyFeed');
            expect(sources[1].enabled).toBe(true);

            expect(sources[2].name).toBe('LocalFeed');
            expect(sources[2].enabled).toBe(false);
        });

        it('adds configFile from config map when config exists', async () => {
            mockExecAsync.mockResolvedValue({ stdout: CLI_OUTPUT_SINGLE, stderr: '' });
            // findNuGetConfigs: first candidate exists
            mockFsAccess.mockImplementation((filePath: string) => {
                if (filePath.includes('nuget.config') || filePath.includes('NuGet.Config')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });
            // parseConfigFile reads content
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG_SINGLE_SOURCE);

            const sources = await parser.getSources();
            expect(sources).toHaveLength(1);
            expect(sources[0].name).toBe('nuget.org');
            // configFile should be populated from the config map
            expect(sources[0].configFile).toBeDefined();
        });

        it('falls back to file parsing when CLI fails', async () => {
            mockExecAsync.mockRejectedValue(new Error('dotnet not found'));
            // findNuGetConfigs: one config exists
            mockFsAccess.mockImplementation((filePath: string) => {
                if (filePath.includes('nuget.config')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG_SINGLE_SOURCE);

            const sources = await parser.getSources();
            expect(sources).toHaveLength(1);
            expect(sources[0].name).toBe('nuget.org');
            expect(sources[0].url).toBe('https://api.nuget.org/v3/index.json');
        });

        it('falls back to file parsing when CLI returns no sources', async () => {
            mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
            mockFsAccess.mockImplementation((filePath: string) => {
                if (filePath.includes('nuget.config')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG);

            const sources = await parser.getSources();
            expect(sources.length).toBeGreaterThan(0);
        });

        it('returns empty array when CLI fails and no config files', async () => {
            mockExecAsync.mockRejectedValue(new Error('dotnet not found'));
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            const sources = await parser.getSources();
            expect(sources).toEqual([]);
        });

        it('parses disabled sources from config file fallback', async () => {
            mockExecAsync.mockRejectedValue(new Error('CLI error'));
            mockFsAccess.mockImplementation((filePath: string) => {
                if (filePath.includes('nuget.config')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG);

            const sources = await parser.getSources();
            const localFeed = sources.find(s => s.name === 'LocalFeed');
            expect(localFeed).toBeDefined();
            expect(localFeed!.enabled).toBe(false);
        });

        it('uses workspace folder cwd for CLI command', async () => {
            (vscode.workspace as any).workspaceFolders = [
                { uri: { fsPath: '/my/project' }, name: 'project', index: 0 },
            ];
            mockExecAsync.mockResolvedValue({ stdout: CLI_OUTPUT_SINGLE, stderr: '' });
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            await parser.getSources();
            expect(mockExecAsync).toHaveBeenCalledWith(
                'dotnet nuget list source --format detailed',
                expect.objectContaining({ cwd: '/my/project' }),
            );
        });
    });

    // ──────────────────────────────────────────────
    // getCredentials
    // ──────────────────────────────────────────────
    describe('getCredentials', () => {
        /** Sets up mockFsAccess to resolve for nuget config paths, reject others */
        const setupConfigAccess = (...patterns: string[]) => {
            mockFsAccess.mockImplementation((filePath: string) => {
                if (patterns.some(p => filePath.includes(p))) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('ENOENT'));
            });
        };

        it('parses ClearTextPassword credentials', async () => {
            setupConfigAccess('nuget.config');
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG);

            const creds = await parser.getCredentials();
            const myFeed = creds.get('MyFeed');
            expect(myFeed).toBeDefined();
            expect(myFeed!.username).toBe('user@example.com');
            expect(myFeed!.password).toBe('test-token');
            expect(myFeed!.isEncrypted).toBe(false);
        });

        it('parses encrypted Password credentials', async () => {
            setupConfigAccess('nuget.config', 'NuGet.Config');
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG_ENCRYPTED);

            const creds = await parser.getCredentials();
            const privateFeed = creds.get('PrivateFeed');
            expect(privateFeed).toBeDefined();
            expect(privateFeed!.username).toBe('admin');
            expect(privateFeed!.password).toBe('encrypted-value');
            expect(privateFeed!.isEncrypted).toBe(true);
        });

        it('parses multiple source credentials', async () => {
            setupConfigAccess('nuget.config');
            mockReadFileAsync.mockResolvedValue(FIXTURE_MULTI_CRED);

            const creds = await parser.getCredentials();
            expect(creds.size).toBe(2);
            expect(creds.get('FeedA')?.username).toBe('userA');
            expect(creds.get('FeedB')?.username).toBe('userB');
        });

        it('returns empty map when no config files found', async () => {
            mockFsAccess.mockRejectedValue(new Error('ENOENT'));

            const creds = await parser.getCredentials();
            expect(creds.size).toBe(0);
        });

        it('returns empty map when config has no credentials section', async () => {
            setupConfigAccess('nuget.config');
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG_SINGLE_SOURCE);

            const creds = await parser.getCredentials();
            expect(creds.size).toBe(0);
        });

        it('returns empty map for empty config', async () => {
            setupConfigAccess('nuget.config');
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG_EMPTY);

            const creds = await parser.getCredentials();
            expect(creds.size).toBe(0);
        });

        it('handles config with _x0020_ encoded source name', async () => {
            setupConfigAccess('nuget.config');
            mockReadFileAsync.mockResolvedValue(FIXTURE_NUGET_CONFIG_SPACES);

            const creds = await parser.getCredentials();
            expect(creds.has('My_x0020_Feed')).toBe(true);
            expect(creds.get('My_x0020_Feed')?.username).toBe('testuser');
            expect(creds.get('My_x0020_Feed')?.password).toBe('testpass');
        });

        it('handles read error gracefully', async () => {
            setupConfigAccess('nuget.config');
            mockReadFileAsync.mockRejectedValue(new Error('EACCES'));

            const creds = await parser.getCredentials();
            expect(creds.size).toBe(0);
        });

        it('first config file wins (NuGet precedence)', async () => {
            // Two config files found
            mockFsAccess.mockResolvedValue(undefined);
            let callCount = 0;
            mockReadFileAsync.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // First config found: FeedA with userFirst
                    return Promise.resolve(`<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSourceCredentials>
    <FeedA>
      <add key="Username" value="userFirst" />
      <add key="ClearTextPassword" value="passFirst" />
    </FeedA>
  </packageSourceCredentials>
</configuration>`);
                }
                // Second config: same FeedA with userSecond
                return Promise.resolve(`<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSourceCredentials>
    <FeedA>
      <add key="Username" value="userSecond" />
      <add key="ClearTextPassword" value="passSecond" />
    </FeedA>
  </packageSourceCredentials>
</configuration>`);
            });

            const creds = await parser.getCredentials();
            // First config wins
            expect(creds.get('FeedA')?.username).toBe('userFirst');
        });
    });

    // ──────────────────────────────────────────────
    // constructor
    // ──────────────────────────────────────────────
    describe('constructor', () => {
        it('creates instance without error', () => {
            const p = new NuGetConfigParser();
            expect(p).toBeInstanceOf(NuGetConfigParser);
        });

        it('exposes all public methods', () => {
            expect(typeof parser.findCredentialsForSource).toBe('function');
            expect(typeof parser.getConfigFilePaths).toBe('function');
            expect(typeof parser.getSources).toBe('function');
            expect(typeof parser.getCredentials).toBe('function');
        });
    });
});
