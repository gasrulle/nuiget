import { exec } from 'child_process';
import * as fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    batchedPromiseAll,
    COMMAND_TIMEOUT,
    execWithTimeout,
    fileExists,
    isNewerVersion,
    isValidCredentialValue,
    isValidPackageId,
    isValidSourceName,
    isValidSourceUrl,
    isValidVersion,
    isVersionInRange,
    LRUMap,
    parseVersionSpec,
    topologicalSortByDependency,
} from '../services/NuGetUtils';

// Mock child_process for execWithTimeout tests
vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

// Mock fs for fileExists tests
vi.mock('fs', () => ({
    promises: {
        access: vi.fn(),
    },
    constants: {
        F_OK: 0,
    },
}));

 
const mockedExec = vi.mocked(exec) as any;
const mockedFsAccess = vi.mocked(fs.promises.access);

describe('NuGetUtils', () => {
    // ──────────────────────────────────────────────
    // isValidPackageId
    // ──────────────────────────────────────────────
    describe('isValidPackageId', () => {
        it('accepts valid package IDs', () => {
            expect(isValidPackageId('Newtonsoft.Json')).toBe(true);
            expect(isValidPackageId('Microsoft.Extensions.Logging')).toBe(true);
            expect(isValidPackageId('my-package_v2')).toBe(true);
            expect(isValidPackageId('A')).toBe(true);
            expect(isValidPackageId('123')).toBe(true);
            expect(isValidPackageId('System.Text.Json')).toBe(true);
        });

        it('rejects shell metacharacters', () => {
            expect(isValidPackageId('pkg; rm -rf /')).toBe(false);
            expect(isValidPackageId('pkg$(whoami)')).toBe(false);
            expect(isValidPackageId('pkg`id`')).toBe(false);
            expect(isValidPackageId('pkg|cat /etc/passwd')).toBe(false);
            expect(isValidPackageId('pkg&echo')).toBe(false);
        });

        it('rejects empty string', () => {
            expect(isValidPackageId('')).toBe(false);
        });

        it('rejects whitespace and special chars', () => {
            expect(isValidPackageId('my package')).toBe(false);
            expect(isValidPackageId('my\tpackage')).toBe(false);
            expect(isValidPackageId('my\npackage')).toBe(false);
            expect(isValidPackageId('pkg@1.0')).toBe(false);
            expect(isValidPackageId('pkg#tag')).toBe(false);
        });

        it('rejects SQL injection attempts', () => {
            expect(isValidPackageId("pkg' OR '1'='1")).toBe(false);
            expect(isValidPackageId('pkg"; DROP TABLE')).toBe(false);
        });

        it('rejects XSS attempts', () => {
            expect(isValidPackageId('<script>alert(1)</script>')).toBe(false);
            expect(isValidPackageId('pkg<img onerror=alert(1)>')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // isValidVersion
    // ──────────────────────────────────────────────
    describe('isValidVersion', () => {
        it('accepts valid semver versions', () => {
            expect(isValidVersion('13.0.3')).toBe(true);
            expect(isValidVersion('1.0.0')).toBe(true);
            expect(isValidVersion('0.1.0')).toBe(true);
        });

        it('accepts prerelease versions', () => {
            expect(isValidVersion('1.0.0-beta.1')).toBe(true);
            expect(isValidVersion('2.0.0-rc1')).toBe(true);
            expect(isValidVersion('1.0.0-alpha')).toBe(true);
        });

        it('accepts build metadata', () => {
            expect(isValidVersion('2.0.0+build.123')).toBe(true);
            expect(isValidVersion('1.0.0-beta+sha.abc')).toBe(true);
        });

        it('accepts two-part versions', () => {
            expect(isValidVersion('1.0')).toBe(true);
        });

        it('accepts four-part versions', () => {
            expect(isValidVersion('1.0.0.0')).toBe(true);
        });

        it('rejects empty string', () => {
            expect(isValidVersion('')).toBe(false);
        });

        it('rejects shell injection', () => {
            expect(isValidVersion('1.0; echo hack')).toBe(false);
            expect(isValidVersion('1.0$(id)')).toBe(false);
            expect(isValidVersion('1.0`cmd`')).toBe(false);
        });

        it('rejects special characters', () => {
            expect(isValidVersion('1.0.0@latest')).toBe(false);
            expect(isValidVersion('>=1.0.0')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // isValidSourceName
    // ──────────────────────────────────────────────
    describe('isValidSourceName', () => {
        it('accepts valid source names', () => {
            expect(isValidSourceName('nuget.org')).toBe(true);
            expect(isValidSourceName('My Custom Feed')).toBe(true);
            expect(isValidSourceName('my-source_v2')).toBe(true);
            expect(isValidSourceName('Azure DevOps Feed')).toBe(true);
        });

        it('rejects empty string', () => {
            expect(isValidSourceName('')).toBe(false);
        });

        it('rejects names exceeding max length', () => {
            expect(isValidSourceName('a'.repeat(256))).toBe(true);
            expect(isValidSourceName('a'.repeat(257))).toBe(false);
        });

        it('rejects shell metacharacters', () => {
            expect(isValidSourceName('feed;rm -rf')).toBe(false);
            expect(isValidSourceName('feed|cat')).toBe(false);
            expect(isValidSourceName('feed$(id)')).toBe(false);
            expect(isValidSourceName('feed`cmd`')).toBe(false);
            expect(isValidSourceName('feed&echo')).toBe(false);
        });

        it('rejects special characters', () => {
            expect(isValidSourceName('feed@org')).toBe(false);
            expect(isValidSourceName('feed#1')).toBe(false);
            expect(isValidSourceName('feed<script>')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // isValidSourceUrl
    // ──────────────────────────────────────────────
    describe('isValidSourceUrl', () => {
        it('accepts valid HTTPS URLs', () => {
            expect(isValidSourceUrl('https://api.nuget.org/v3/index.json')).toBe(true);
            expect(isValidSourceUrl('https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json')).toBe(true);
        });

        it('accepts valid HTTP URLs', () => {
            expect(isValidSourceUrl('http://localhost:5000/v3/index.json')).toBe(true);
            expect(isValidSourceUrl('http://myserver:8080/nuget')).toBe(true);
        });

        it('accepts file:// protocol', () => {
            expect(isValidSourceUrl('file:///C:/LocalPackages')).toBe(true);
            expect(isValidSourceUrl('file:///usr/local/packages')).toBe(true);
        });

        it('accepts Unix-style local paths', () => {
            expect(isValidSourceUrl('/usr/local/packages')).toBe(true);
            expect(isValidSourceUrl('/home/user/nuget-feed')).toBe(true);
        });

        it('rejects Windows drive paths (parsed as protocol)', () => {
            expect(isValidSourceUrl('C:/LocalPackages')).toBe(false);
        });

        it('rejects backslash paths (shell-dangerous)', () => {
            expect(isValidSourceUrl('C:\\LocalPackages')).toBe(false);
        });

        it('rejects shell injection in URLs', () => {
            expect(isValidSourceUrl('https://evil.com"; rm -rf /')).toBe(false);
            expect(isValidSourceUrl("https://evil.com'; DROP TABLE")).toBe(false);
            expect(isValidSourceUrl('https://evil.com`id`')).toBe(false);
            expect(isValidSourceUrl('https://evil.com$(cmd)')).toBe(false);
        });

        it('rejects SSRF-prone schemes', () => {
            expect(isValidSourceUrl('ftp://server/feed')).toBe(false);
            expect(isValidSourceUrl('gopher://server/feed')).toBe(false);
        });

        it('rejects URLs with dangerous characters', () => {
            expect(isValidSourceUrl('https://evil.com|cmd')).toBe(false);
            expect(isValidSourceUrl('https://evil.com>output')).toBe(false);
            expect(isValidSourceUrl('https://evil.com<input')).toBe(false);
            expect(isValidSourceUrl('https://evil.com{json}')).toBe(false);
            expect(isValidSourceUrl('https://evil.com\r\n')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // isValidCredentialValue
    // ──────────────────────────────────────────────
    describe('isValidCredentialValue', () => {
        it('accepts normal usernames', () => {
            expect(isValidCredentialValue('user@domain.com')).toBe(true);
            expect(isValidCredentialValue('DOMAIN\\user')).toBe(false); // backslash rejected
            expect(isValidCredentialValue('admin')).toBe(true);
            expect(isValidCredentialValue('user_name')).toBe(true);
            expect(isValidCredentialValue('user-name.123')).toBe(true);
        });

        it('accepts normal passwords', () => {
            expect(isValidCredentialValue('MyP@ssw0rd')).toBe(true);
            expect(isValidCredentialValue('p4ss-w0rd_2024')).toBe(true);
            expect(isValidCredentialValue("single'quote")).toBe(true);
        });

        it('rejects empty string', () => {
            expect(isValidCredentialValue('')).toBe(false);
        });

        it('rejects values exceeding max length', () => {
            expect(isValidCredentialValue('a'.repeat(512))).toBe(true);
            expect(isValidCredentialValue('a'.repeat(513))).toBe(false);
        });

        it('rejects double quotes (shell breakout)', () => {
            expect(isValidCredentialValue('pass"word')).toBe(false);
            expect(isValidCredentialValue('"injected"')).toBe(false);
        });

        it('rejects backticks (command substitution)', () => {
            expect(isValidCredentialValue('pass`id`word')).toBe(false);
        });

        it('rejects dollar signs (variable expansion)', () => {
            expect(isValidCredentialValue('pass$HOME')).toBe(false);
            expect(isValidCredentialValue('$(cmd)')).toBe(false);
        });

        it('rejects backslashes (escape sequences)', () => {
            expect(isValidCredentialValue('pass\\nword')).toBe(false);
        });

        it('rejects exclamation marks (history expansion)', () => {
            expect(isValidCredentialValue('pass!word')).toBe(false);
        });

        it('rejects control characters', () => {
            expect(isValidCredentialValue('pass\rword')).toBe(false);
            expect(isValidCredentialValue('pass\nword')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // parseVersionSpec
    // ──────────────────────────────────────────────
    describe('parseVersionSpec', () => {
        it('parses standard versions', () => {
            const result = parseVersionSpec('13.0.3');
            expect(result.type).toBe('standard');
            expect(result.original).toBe('13.0.3');
        });

        it('parses two-part standard versions', () => {
            expect(parseVersionSpec('1.0').type).toBe('standard');
        });

        it('parses floating wildcard versions', () => {
            const result = parseVersionSpec('10.*');
            expect(result.type).toBe('floating');
            expect(result.floatingPrefix).toBe('10');
            expect(result.floatingDepth).toBe(1);
            expect(result.isAlwaysLatest).toBe(false);
        });

        it('parses multi-part floating versions', () => {
            const result = parseVersionSpec('1.0.*');
            expect(result.type).toBe('floating');
            expect(result.floatingPrefix).toBe('1.0');
            expect(result.floatingDepth).toBe(2);
        });

        it('parses prerelease floating versions', () => {
            const result = parseVersionSpec('1.0.0-*');
            expect(result.type).toBe('floating');
        });

        it('parses pure wildcard', () => {
            const result = parseVersionSpec('*');
            expect(result.type).toBe('floating');
            expect(result.isAlwaysLatest).toBe(true);
        });

        it('parses star-dash-star wildcard', () => {
            const result = parseVersionSpec('*-*');
            expect(result.type).toBe('floating');
            expect(result.isAlwaysLatest).toBe(true);
        });

        it('parses range versions', () => {
            expect(parseVersionSpec('[1.0.0, 2.0.0)').type).toBe('range');
            expect(parseVersionSpec('(1.0.0, 2.0.0]').type).toBe('range');
            expect(parseVersionSpec('[1.0.0, 2.0.0]').type).toBe('range');
            expect(parseVersionSpec('(1.0.0, 2.0.0)').type).toBe('range');
        });

        it('parses open-ended ranges', () => {
            expect(parseVersionSpec('[1.0.0,)').type).toBe('range');
            expect(parseVersionSpec('(,2.0.0]').type).toBe('range');
            expect(parseVersionSpec('(,2.0.0)').type).toBe('range');
        });

        it('parses exact bracket versions', () => {
            const result = parseVersionSpec('[13.0.3]');
            expect(result.type).toBe('exact');
        });

        it('preserves original string', () => {
            const result = parseVersionSpec('  1.0.0  ');
            expect(result.original).toBe('  1.0.0  ');
        });
    });

    // ──────────────────────────────────────────────
    // isNewerVersion
    // ──────────────────────────────────────────────
    describe('isNewerVersion', () => {
        it('detects newer major versions', () => {
            expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true);
            expect(isNewerVersion('10.0.0', '9.0.0')).toBe(true);
        });

        it('detects newer minor versions', () => {
            expect(isNewerVersion('1.2.0', '1.1.0')).toBe(true);
            expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
        });

        it('detects newer patch versions', () => {
            expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
        });

        it('returns false for same version', () => {
            expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
        });

        it('returns false for older version', () => {
            expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
        });

        it('compares case-insensitively', () => {
            expect(isNewerVersion('1.0.0-BETA', '1.0.0-beta')).toBe(false);
        });

        it('stable is newer than prerelease of same version', () => {
            expect(isNewerVersion('1.0.0', '1.0.0-beta')).toBe(true);
            expect(isNewerVersion('1.0.0', '1.0.0-rc1')).toBe(true);
        });

        it('prerelease is older than stable of same version', () => {
            expect(isNewerVersion('1.0.0-beta', '1.0.0')).toBe(false);
        });

        it('compares prerelease segments numerically', () => {
            expect(isNewerVersion('1.0.0-beta.2', '1.0.0-beta.1')).toBe(true);
            expect(isNewerVersion('1.0.0-beta.10', '1.0.0-beta.2')).toBe(true);
        });

        it('compares prerelease segments lexicographically when non-numeric', () => {
            expect(isNewerVersion('1.0.0-rc', '1.0.0-beta')).toBe(true);
            expect(isNewerVersion('1.0.0-alpha', '1.0.0-beta')).toBe(false);
        });

        it('more prerelease segments means higher precedence', () => {
            expect(isNewerVersion('1.0.0-alpha.1', '1.0.0-alpha')).toBe(true);
            expect(isNewerVersion('1.0.0-alpha', '1.0.0-alpha.1')).toBe(false);
        });

        it('ignores build metadata in comparisons', () => {
            expect(isNewerVersion('1.0.0+build1', '1.0.0+build2')).toBe(false);
            expect(isNewerVersion('1.0.0+build2', '1.0.0+build1')).toBe(false);
        });

        it('handles different part lengths', () => {
            expect(isNewerVersion('1.0.0.1', '1.0.0')).toBe(true);
            expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // isVersionInRange
    // ──────────────────────────────────────────────
    describe('isVersionInRange', () => {
        it('returns false for empty range', () => {
            expect(isVersionInRange('1.0.0', '')).toBe(false);
        });

        it('checks inclusive lower bound', () => {
            expect(isVersionInRange('1.0.0', '[1.0.0, 2.0.0)')).toBe(true);
            expect(isVersionInRange('0.9.0', '[1.0.0, 2.0.0)')).toBe(false);
        });

        it('checks exclusive lower bound', () => {
            expect(isVersionInRange('1.0.0', '(1.0.0, 2.0.0)')).toBe(false);
            expect(isVersionInRange('1.0.1', '(1.0.0, 2.0.0)')).toBe(true);
        });

        it('checks inclusive upper bound', () => {
            expect(isVersionInRange('2.0.0', '[1.0.0, 2.0.0]')).toBe(true);
        });

        it('checks exclusive upper bound', () => {
            expect(isVersionInRange('2.0.0', '[1.0.0, 2.0.0)')).toBe(false);
            expect(isVersionInRange('1.9.9', '[1.0.0, 2.0.0)')).toBe(true);
        });

        it('handles open-ended lower bound', () => {
            expect(isVersionInRange('0.1.0', '(,2.0.0)')).toBe(true);
            expect(isVersionInRange('3.0.0', '(,2.0.0)')).toBe(false);
        });

        it('handles open-ended upper bound', () => {
            expect(isVersionInRange('5.0.0', '[1.0.0,)')).toBe(true);
            expect(isVersionInRange('0.5.0', '[1.0.0,)')).toBe(false);
        });

        it('handles exact version in brackets', () => {
            expect(isVersionInRange('1.0.0', '[1.0.0]')).toBe(true);
            expect(isVersionInRange('1.0.1', '[1.0.0]')).toBe(false);
        });

        it('treats plain version string as minimum inclusive', () => {
            expect(isVersionInRange('2.0.0', '1.0.0')).toBe(true);
            expect(isVersionInRange('1.0.0', '1.0.0')).toBe(true);
            expect(isVersionInRange('0.5.0', '1.0.0')).toBe(false);
        });

        it('handles version in the middle of range', () => {
            expect(isVersionInRange('1.5.0', '[1.0.0, 2.0.0]')).toBe(true);
        });
    });

    // ──────────────────────────────────────────────
    // LRUMap
    // ──────────────────────────────────────────────
    describe('LRUMap', () => {
        it('stores and retrieves values', () => {
            const cache = new LRUMap<string, number>(3);
            cache.set('a', 1);
            cache.set('b', 2);
            expect(cache.get('a')).toBe(1);
            expect(cache.get('b')).toBe(2);
        });

        it('returns undefined for missing keys', () => {
            const cache = new LRUMap<string, number>(3);
            expect(cache.get('missing')).toBeUndefined();
        });

        it('evicts least recently used entries', () => {
            const cache = new LRUMap<string, number>(2);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3); // should evict 'a'
            expect(cache.get('a')).toBeUndefined();
            expect(cache.get('b')).toBe(2);
            expect(cache.get('c')).toBe(3);
        });

        it('promotes accessed entries', () => {
            const cache = new LRUMap<string, number>(2);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.get('a'); // promote 'a'
            cache.set('c', 3); // should evict 'b', not 'a'
            expect(cache.get('a')).toBe(1);
            expect(cache.get('b')).toBeUndefined();
            expect(cache.get('c')).toBe(3);
        });

        it('updates existing key value and position', () => {
            const cache = new LRUMap<string, number>(2);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('a', 10); // update 'a'
            cache.set('c', 3); // should evict 'b' (oldest after update)
            expect(cache.get('a')).toBe(10);
            expect(cache.get('b')).toBeUndefined();
            expect(cache.get('c')).toBe(3);
        });

        it('reports size correctly', () => {
            const cache = new LRUMap<string, number>(5);
            expect(cache.size).toBe(0);
            cache.set('a', 1);
            expect(cache.size).toBe(1);
            cache.set('b', 2);
            expect(cache.size).toBe(2);
        });

        it('clears all entries', () => {
            const cache = new LRUMap<string, number>(5);
            cache.set('a', 1);
            cache.set('b', 2);
            cache.clear();
            expect(cache.size).toBe(0);
            expect(cache.get('a')).toBeUndefined();
        });

        it('has() checks existence', () => {
            const cache = new LRUMap<string, number>(5);
            cache.set('a', 1);
            expect(cache.has('a')).toBe(true);
            expect(cache.has('b')).toBe(false);
        });

        it('delete() removes entries', () => {
            const cache = new LRUMap<string, number>(5);
            cache.set('a', 1);
            expect(cache.delete('a')).toBe(true);
            expect(cache.get('a')).toBeUndefined();
            expect(cache.size).toBe(0);
            expect(cache.delete('nonexistent')).toBe(false);
        });

        it('handles capacity of 1', () => {
            const cache = new LRUMap<string, number>(1);
            cache.set('a', 1);
            cache.set('b', 2);
            expect(cache.get('a')).toBeUndefined();
            expect(cache.get('b')).toBe(2);
            expect(cache.size).toBe(1);
        });
    });

    // ──────────────────────────────────────────────
    // batchedPromiseAll
    // ──────────────────────────────────────────────
    describe('batchedPromiseAll', () => {
        it('processes all items', async () => {
            const items = [1, 2, 3, 4, 5];
            const results = await batchedPromiseAll(items, async (n) => n * 2);
            expect(results).toEqual([2, 4, 6, 8, 10]);
        });

        it('respects concurrency limit', async () => {
            let concurrent = 0;
            let maxConcurrent = 0;

            const items = [1, 2, 3, 4, 5, 6];
            await batchedPromiseAll(items, async (n) => {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise(r => setTimeout(r, 10));
                concurrent--;
                return n;
            }, 2);

            expect(maxConcurrent).toBeLessThanOrEqual(2);
        });

        it('handles empty array', async () => {
            const results = await batchedPromiseAll([], async (n: number) => n);
            expect(results).toEqual([]);
        });

        it('preserves order despite concurrency', async () => {
            const items = [50, 10, 30, 20, 40];
            const results = await batchedPromiseAll(items, async (n) => {
                await new Promise(r => setTimeout(r, n));
                return n;
            }, 3);
            expect(results).toEqual([50, 10, 30, 20, 40]);
        });

        it('propagates errors', async () => {
            const items = [1, 2, 3];
            await expect(
                batchedPromiseAll(items, async (n) => {
                    if (n === 2) { throw new Error('fail'); }
                    return n;
                })
            ).rejects.toThrow('fail');
        });

        it('uses default concurrency of 6', async () => {
            let concurrent = 0;
            let maxConcurrent = 0;
            const items = Array.from({ length: 12 }, (_, i) => i);

            await batchedPromiseAll(items, async (n) => {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await new Promise(r => setTimeout(r, 5));
                concurrent--;
                return n;
            });

            expect(maxConcurrent).toBeLessThanOrEqual(6);
        });

        it('handles single item', async () => {
            const results = await batchedPromiseAll([42], async (n) => n * 2);
            expect(results).toEqual([84]);
        });
    });

    // ──────────────────────────────────────────────
    // execWithTimeout
    // ──────────────────────────────────────────────
    describe('execWithTimeout', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('resolves with stdout and stderr on success', async () => {
            mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: any) => {
                cb(null, 'output', 'warning');
            });

            const result = await execWithTimeout('dotnet --version');
            expect(result).toEqual({ stdout: 'output', stderr: 'warning' });
        });

        it('rejects with error including stdout/stderr', async () => {
            mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: any) => {
                const err = new Error('command failed') as any;
                cb(err, 'partial', 'error output');
            });

            await expect(execWithTimeout('bad-command')).rejects.toMatchObject({
                message: 'command failed',
                stdout: 'partial',
                stderr: 'error output',
            });
        });

        it('accepts options object', async () => {
            mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: any) => {
                cb(null, '', '');
            });

            await execWithTimeout('cmd', { timeout: 5000, cwd: '/test' });
            expect(mockedExec).toHaveBeenCalledWith(
                'cmd',
                { timeout: 5000, cwd: '/test', maxBuffer: 10 * 1024 * 1024 },
                expect.any(Function)
            );
        });

        it('accepts legacy timeout number', async () => {
            mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: any) => {
                cb(null, '', '');
            });

            await execWithTimeout('cmd', 10000, '/dir');
            expect(mockedExec).toHaveBeenCalledWith(
                'cmd',
                { timeout: 10000, cwd: '/dir', maxBuffer: 10 * 1024 * 1024 },
                expect.any(Function)
            );
        });

        it('uses default timeout when none specified', async () => {
            mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: any) => {
                cb(null, '', '');
            });

            await execWithTimeout('cmd');
            expect(mockedExec).toHaveBeenCalledWith(
                'cmd',
                { timeout: COMMAND_TIMEOUT, cwd: undefined, maxBuffer: 10 * 1024 * 1024 },
                expect.any(Function)
            );
        });

        it('sets maxBuffer to 10 MB', async () => {
            mockedExec.mockImplementation((_cmd: string, opts: unknown, cb: any) => {
                expect((opts as any).maxBuffer).toBe(10 * 1024 * 1024);
                cb(null, '', '');
            });

            await execWithTimeout('cmd');
        });
    });

    // ──────────────────────────────────────────────
    // fileExists
    // ──────────────────────────────────────────────
    describe('fileExists', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('returns true when file exists', async () => {
            mockedFsAccess.mockResolvedValue(undefined);
            expect(await fileExists('/some/file.txt')).toBe(true);
        });

        it('returns false when file does not exist', async () => {
            mockedFsAccess.mockRejectedValue(new Error('ENOENT'));
            expect(await fileExists('/missing/file.txt')).toBe(false);
        });

        it('returns false on permission error', async () => {
            mockedFsAccess.mockRejectedValue(new Error('EACCES'));
            expect(await fileExists('/restricted/file.txt')).toBe(false);
        });
    });

    // ──────────────────────────────────────────────
    // topologicalSortByDependency
    // ──────────────────────────────────────────────
    describe('topologicalSortByDependency', () => {
        interface TestItem {
            id: string;
        }

        const getKey = (item: TestItem) => item.id.toLowerCase();

        it('sorts dependencies first (update order)', () => {
            const items: TestItem[] = [
                { id: 'A' },
                { id: 'B' },
                { id: 'C' },
            ];
            // A depends on B, B depends on C
            const deps = new Map<string, string[]>([
                ['a', ['b']],
                ['b', ['c']],
                ['c', []],
            ]);
            const selected = new Set(['a', 'b', 'c']);

            const sorted = topologicalSortByDependency(items, getKey, deps, selected, true);
            const ids = sorted.map(i => i.id);

            // C should come before B, B before A
            expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('B'));
            expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('A'));
        });

        it('sorts dependents first (removal order)', () => {
            const items: TestItem[] = [
                { id: 'A' },
                { id: 'B' },
                { id: 'C' },
            ];
            // A depends on B, B depends on C
            const deps = new Map<string, string[]>([
                ['a', ['b']],
                ['b', ['c']],
                ['c', []],
            ]);
            const selected = new Set(['a', 'b', 'c']);

            const sorted = topologicalSortByDependency(items, getKey, deps, selected, false);
            const ids = sorted.map(i => i.id);

            // A should come before B, B before C
            expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
            expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('C'));
        });

        it('handles empty items', () => {
            const sorted = topologicalSortByDependency([], getKey, new Map(), new Set(), true);
            expect(sorted).toEqual([]);
        });

        it('handles single item', () => {
            const items = [{ id: 'A' }];
            const sorted = topologicalSortByDependency(items, getKey, new Map(), new Set(['a']), true);
            expect(sorted).toEqual(items);
        });

        it('handles independent items (no dependencies)', () => {
            const items = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
            const deps = new Map<string, string[]>();
            const selected = new Set(['a', 'b', 'c']);

            const sorted = topologicalSortByDependency(items, getKey, deps, selected, true);
            expect(sorted).toHaveLength(3);
        });

        it('handles diamond dependencies', () => {
            // D depends on B and C, both B and C depend on A
            const items = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
            const deps = new Map<string, string[]>([
                ['d', ['b', 'c']],
                ['b', ['a']],
                ['c', ['a']],
                ['a', []],
            ]);
            const selected = new Set(['a', 'b', 'c', 'd']);

            const sorted = topologicalSortByDependency(items, getKey, deps, selected, true);
            const ids = sorted.map(i => i.id);

            // A should come before B and C, B and C before D
            expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
            expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
            expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
            expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
        });

        it('handles cycles gracefully (appends remaining items)', () => {
            const items = [{ id: 'A' }, { id: 'B' }];
            const deps = new Map<string, string[]>([
                ['a', ['b']],
                ['b', ['a']],
            ]);
            const selected = new Set(['a', 'b']);

            const sorted = topologicalSortByDependency(items, getKey, deps, selected, true);
            // Should still include all items (appends remaining after cycle)
            expect(sorted).toHaveLength(2);
        });

        it('ignores dependencies not in selected set', () => {
            const items = [{ id: 'A' }, { id: 'B' }];
            // A depends on C, but C is not in items or selected
            const deps = new Map<string, string[]>([
                ['a', ['c']],
                ['b', []],
            ]);
            const selected = new Set(['a', 'b']);

            const sorted = topologicalSortByDependency(items, getKey, deps, selected, true);
            expect(sorted).toHaveLength(2);
        });
    });
});
