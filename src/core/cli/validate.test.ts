import { describe, expect, it } from 'vitest';
import {
    InvalidArgumentError,
    assertCredentialValue,
    assertMsBuildName,
    assertPackageId,
    assertPath,
    assertSourceName,
    assertSourceUrl,
    assertVersion,
    isValidCredentialValue,
    isValidMsBuildName,
    isValidPackageId,
    isValidSourceName,
    isValidSourceUrl,
    isValidVersion,
} from './validate';

// The accept and reject cases are ported from the 1.x tests of the validators in `NuGetUtils`. 1.x built
// shell command strings, so it also rejected everything a shell could interpret. Arguments are argv
// entries here; the cases that existed only for the shell are inverted and say so.

describe('isValidPackageId', () => {
    it('accepts valid package IDs', () => {
        for (const id of ['Newtonsoft.Json', 'Microsoft.Extensions.Logging', 'my-package_v2', 'A', '123', 'System.Text.Json']) {
            expect(isValidPackageId(id)).toBe(true);
        }
    });

    it('rejects shell metacharacters', () => {
        for (const id of ['pkg; rm -rf /', 'pkg$(whoami)', 'pkg`id`', 'pkg|cat /etc/passwd', 'pkg&echo']) {
            expect(isValidPackageId(id)).toBe(false);
        }
    });

    it('rejects an empty string and an id over 100 characters', () => {
        expect(isValidPackageId('')).toBe(false);
        expect(isValidPackageId('a'.repeat(100))).toBe(true);
        expect(isValidPackageId('a'.repeat(101))).toBe(false);
    });

    it('rejects whitespace and special characters', () => {
        for (const id of ['my package', 'my\tpackage', 'my\npackage', 'pkg@1.0', 'pkg#tag']) {
            expect(isValidPackageId(id)).toBe(false);
        }
    });

    it('rejects quotes and markup', () => {
        for (const id of ["pkg' OR '1'='1", 'pkg"; DROP TABLE', '<script>alert(1)</script>', 'pkg<img onerror=alert(1)>']) {
            expect(isValidPackageId(id)).toBe(false);
        }
    });
});

describe('isValidVersion', () => {
    it('accepts release, prerelease, build-metadata, two-part and four-part versions', () => {
        for (const version of ['13.0.3', '1.0.0', '0.1.0', '1.0.0-beta.1', '2.0.0-rc1', '1.0.0-alpha', '2.0.0+build.123', '1.0.0-beta+sha.abc', '1.0', '1.0.0.0']) {
            expect(isValidVersion(version)).toBe(true);
        }
    });

    it('rejects an empty string', () => {
        expect(isValidVersion('')).toBe(false);
    });

    it('rejects shell metacharacters and range syntax', () => {
        for (const version of ['1.0; echo hack', '1.0$(id)', '1.0`cmd`', '1.0.0@latest', '>=1.0.0', '[1.0,2.0)', '1.0 .0']) {
            expect(isValidVersion(version)).toBe(false);
        }
    });
});

describe('isValidSourceName', () => {
    it('accepts valid source names', () => {
        for (const name of ['nuget.org', 'My Custom Feed', 'my-source_v2', 'Azure DevOps Feed']) {
            expect(isValidSourceName(name)).toBe(true);
        }
    });

    it('rejects an empty string and a name over 256 characters', () => {
        expect(isValidSourceName('')).toBe(false);
        expect(isValidSourceName('a'.repeat(256))).toBe(true);
        expect(isValidSourceName('a'.repeat(257))).toBe(false);
    });

    it('rejects shell metacharacters and special characters', () => {
        for (const name of ['feed;rm -rf', 'feed|cat', 'feed$(id)', 'feed`cmd`', 'feed&echo', 'feed@org', 'feed#1', 'feed<script>']) {
            expect(isValidSourceName(name)).toBe(false);
        }
    });
});

describe('isValidSourceUrl', () => {
    it('accepts http, https and file URLs', () => {
        for (const url of [
            'https://api.nuget.org/v3/index.json',
            'https://pkgs.dev.azure.com/org/_packaging/feed/nuget/v3/index.json',
            'http://localhost:5000/v3/index.json',
            'http://myserver:8080/nuget',
            'file:///C:/LocalPackages',
            'file:///usr/local/packages',
        ]) {
            expect(isValidSourceUrl(url)).toBe(true);
        }
    });

    it('accepts Unix-style local paths', () => {
        for (const feed of ['/usr/local/packages', '/home/user/nuget-feed', '/var/feeds']) {
            expect(isValidSourceUrl(feed)).toBe(true);
        }
    });

    it('accepts Windows drive paths, with either separator (1.x rejected them)', () => {
        for (const feed of ['C:/LocalPackages', 'C:\\LocalPackages', 'C:\\feeds', 'C:/feeds', 'd:\\Program Files (x86)\\Feeds']) {
            expect(isValidSourceUrl(feed)).toBe(true);
        }
    });

    it('accepts UNC paths (1.x rejected the backslash)', () => {
        expect(isValidSourceUrl('\\\\server\\share\\feed')).toBe(true);
        expect(isValidSourceUrl('\\\\server\\share')).toBe(true);
    });

    it('accepts URL punctuation that only a shell would care about (1.x rejected it)', () => {
        for (const url of [
            "https://www.nuget.org/api/v2/Packages(Id='Serilog',Version='4.0.0')",
            'https://feed.example.test/v3/index.json?api-version=7.1&view=release#top',
            'https://feed.example.test/path$with!marks',
            'https://evil.com$(cmd)',
        ]) {
            expect(isValidSourceUrl(url)).toBe(true);
        }
    });

    it('rejects quotes, backticks and semicolons in URLs', () => {
        for (const url of ['https://evil.com"; rm -rf /', "https://evil.com'; DROP TABLE", 'https://evil.com`id`', 'https://feed.example.test/a;b']) {
            expect(isValidSourceUrl(url)).toBe(false);
        }
    });

    it('rejects pipes, angle brackets, braces and control characters', () => {
        for (const url of [
            'https://evil.com|cmd',
            'https://evil.com>output',
            'https://evil.com<input',
            'https://evil.com{json}',
            'https://evil.com\r\n',
            'https://evil.com/a\tb',
            'https://evil.com/\u0000',
            'C:\\feeds\nmore',
        ]) {
            expect(isValidSourceUrl(url)).toBe(false);
        }
    });

    it('rejects every scheme other than http, https and file', () => {
        for (const url of ['ftp://server/feed', 'gopher://server/feed', 'javascript:alert(1)', 'data:text/plain,x', 'ssh://server/feed']) {
            expect(isValidSourceUrl(url)).toBe(false);
        }
    });

    it('rejects an empty string and a drive-relative path', () => {
        expect(isValidSourceUrl('')).toBe(false);
        expect(isValidSourceUrl('c:feeds')).toBe(false);
    });
});

describe('isValidCredentialValue', () => {
    it('accepts normal usernames and passwords', () => {
        for (const value of ['user@domain.com', 'admin', 'user_name', 'user-name.123', 'MyP@ssw0rd', 'p4ss-w0rd_2024', "single'quote"]) {
            expect(isValidCredentialValue(value)).toBe(true);
        }
    });

    it('accepts a domain account and every character a shell would interpret (1.x rejected them)', () => {
        for (const value of ['DOMAIN\\user', 'pass"word', '"injected"', 'pass`id`word', 'pass$HOME', '$(cmd)', 'pass\\nword', 'pass!word', 'a b c']) {
            expect(isValidCredentialValue(value)).toBe(true);
        }
    });

    it('rejects an empty string and a value over 512 characters', () => {
        expect(isValidCredentialValue('')).toBe(false);
        expect(isValidCredentialValue('a'.repeat(512))).toBe(true);
        expect(isValidCredentialValue('a'.repeat(513))).toBe(false);
    });

    it('rejects control characters', () => {
        for (const value of ['pass\rword', 'pass\nword', 'pass\tword', 'pass\u0000word', 'pass\u007fword']) {
            expect(isValidCredentialValue(value)).toBe(false);
        }
    });
});

describe('isValidMsBuildName', () => {
    it('accepts identifiers and rejects everything else', () => {
        for (const name of ['PackageReference', 'TargetFramework', '_Private', 'A1']) {
            expect(isValidMsBuildName(name)).toBe(true);
        }
        for (const name of ['', '1Abc', 'Target-Framework', 'Target Framework', 'A;B', 'A.B']) {
            expect(isValidMsBuildName(name)).toBe(false);
        }
    });
});

describe('assert functions', () => {
    it('return the value they were given when it is valid', () => {
        expect(assertPackageId('Serilog')).toBe('Serilog');
        expect(assertVersion('4.0.0')).toBe('4.0.0');
        expect(assertSourceName('nuget.org')).toBe('nuget.org');
        expect(assertSourceUrl('C:\\feeds')).toBe('C:\\feeds');
        expect(assertCredentialValue('pass"word', 'password')).toBe('pass"word');
        expect(assertPath('/work/My App/App.csproj', 'project path')).toBe('/work/My App/App.csproj');
        expect(assertMsBuildName('PackageReference', 'item type')).toBe('PackageReference');
    });

    it('throw InvalidArgumentError that names the argument and carries the value', () => {
        let caught: unknown;
        try {
            assertPackageId('bad id');
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(InvalidArgumentError);
        expect(caught).toMatchObject({ name: 'InvalidArgumentError', argument: 'package id', value: 'bad id' });
        expect((caught as Error).message).toContain('Invalid package id "bad id"');

        expect(() => assertVersion('>=1')).toThrow(InvalidArgumentError);
        expect(() => assertSourceName('feed;x')).toThrow(InvalidArgumentError);
        expect(() => assertSourceUrl('ftp://x')).toThrow(InvalidArgumentError);
        expect(() => assertMsBuildName('a-b', 'property name')).toThrow(/Invalid property name "a-b"/);
    });

    it('never put a rejected credential into the error', () => {
        const secret = 'hunter2\nsecond line';
        let caught: unknown;
        try {
            assertCredentialValue(secret, 'password');
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(InvalidArgumentError);
        expect(caught).toMatchObject({ argument: 'password', value: '[REDACTED]' });
        expect((caught as Error).message).not.toContain('hunter2');
        expect((caught as Error).message).toContain('password');
    });

    it('accept any path except an empty one or one with control characters', () => {
        expect(assertPath('C:\\Users\\me\\My Project (old)\\App.csproj', 'project path')).toContain('My Project (old)');
        expect(() => assertPath('', 'project path')).toThrow(/Invalid project path/);
        expect(() => assertPath('a\u0000b', 'config file')).toThrow(/Invalid config file/);
        expect(() => assertPath('a\nb', 'config file')).toThrow(InvalidArgumentError);
    });
});
