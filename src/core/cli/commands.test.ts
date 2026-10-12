import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
    addPackageArgs,
    listSourceArgs,
    msbuildGetArgs,
    nugetAddSourceArgs,
    nugetDisableSourceArgs,
    nugetEnableSourceArgs,
    nugetRemoveSourceArgs,
    packageSearchArgs,
    removePackageArgs,
    restoreArgs,
} from './commands';
import { InvalidArgumentError } from './validate';

const PROJECT = '/work/My App/App.csproj';
const FEED = 'https://api.nuget.org/v3/index.json';

describe('addPackageArgs', () => {
    it('builds the noun-first command with the project as an option', () => {
        expect(addPackageArgs({ projectPath: PROJECT, packageId: 'Serilog' }))
            .toEqual(['package', 'add', 'Serilog', '--project', PROJECT]);
    });

    it('appends version, source and --no-restore in that order', () => {
        expect(addPackageArgs({ projectPath: PROJECT, packageId: 'Serilog', version: '4.0.0', sourceUrl: FEED, noRestore: true }))
            .toEqual(['package', 'add', 'Serilog', '--project', PROJECT, '--version', '4.0.0', '--source', FEED, '--no-restore']);
    });

    it('never builds the verb-first form', () => {
        for (const options of [
            { projectPath: PROJECT, packageId: 'Serilog' },
            { projectPath: PROJECT, packageId: 'Serilog', version: '4.0.0', isCpm: true },
        ]) {
            const args = addPackageArgs(options);
            expect(args.slice(0, 2)).toEqual(['package', 'add']);
            expect(args).not.toContain('add package');
        }
    });

    it('cpm: addPackageArgs rejects --no-restore', () => {
        const options = { projectPath: PROJECT, packageId: 'Serilog', version: '4.0.0', noRestore: true, isCpm: true };
        expect(() => addPackageArgs(options)).toThrow(InvalidArgumentError);
        expect(() => addPackageArgs(options)).toThrow(/Central Package Management/);

        // Each flag alone is fine: a CPM add restores, and a non-CPM add may skip the restore.
        expect(addPackageArgs({ ...options, noRestore: false })).not.toContain('--no-restore');
        expect(addPackageArgs({ ...options, isCpm: false })).toContain('--no-restore');
    });

    it('keeps a path with spaces as one argument and never quotes it', () => {
        const args = addPackageArgs({ projectPath: PROJECT, packageId: 'Serilog' });
        expect(args[4]).toBe(PROJECT);
        expect(args.join('\u0000')).not.toContain('"');
    });

    it('rejects an invalid id, version, source or project path', () => {
        expect(() => addPackageArgs({ projectPath: PROJECT, packageId: 'bad id' })).toThrow(InvalidArgumentError);
        expect(() => addPackageArgs({ projectPath: PROJECT, packageId: 'Serilog', version: '>=1.0' })).toThrow(InvalidArgumentError);
        expect(() => addPackageArgs({ projectPath: PROJECT, packageId: 'Serilog', sourceUrl: 'ftp://feed.example.test' })).toThrow(InvalidArgumentError);
        expect(() => addPackageArgs({ projectPath: '', packageId: 'Serilog' })).toThrow(InvalidArgumentError);
    });
});

describe('removePackageArgs, restoreArgs and listSourceArgs', () => {
    it('builds the noun-first remove command', () => {
        expect(removePackageArgs({ projectPath: PROJECT, packageId: 'Serilog' }))
            .toEqual(['package', 'remove', 'Serilog', '--project', PROJECT]);
        expect(() => removePackageArgs({ projectPath: PROJECT, packageId: '' })).toThrow(InvalidArgumentError);
    });

    it('builds restore for one project', () => {
        expect(restoreArgs(PROJECT)).toEqual(['restore', PROJECT]);
        expect(() => restoreArgs('bad\u0000path')).toThrow(InvalidArgumentError);
    });

    it('lists sources in the detailed format', () => {
        expect(listSourceArgs()).toEqual(['nuget', 'list', 'source', '--format', 'detailed']);
    });
});

describe('packageSearchArgs', () => {
    it('asks for JSON with normal verbosity and trims the query', () => {
        expect(packageSearchArgs({ query: '  serilog  ' }))
            .toEqual(['package', 'search', 'serilog', '--format', 'json', '--verbosity', 'normal']);
    });

    it('appends sources, prerelease, exact match and take', () => {
        expect(packageSearchArgs({ query: 'serilog', sources: [FEED, '/var/feeds'], prerelease: true, exactMatch: true, take: 20 })).toEqual([
            'package', 'search', 'serilog', '--format', 'json', '--verbosity', 'normal',
            '--source', FEED, '--source', '/var/feeds', '--prerelease', '--exact-match', '--take', '20',
        ]);
    });

    it('rejects an empty, oversized or control-character query', () => {
        expect(() => packageSearchArgs({ query: '   ' })).toThrow(InvalidArgumentError);
        expect(() => packageSearchArgs({ query: 'x'.repeat(513) })).toThrow(InvalidArgumentError);
        expect(() => packageSearchArgs({ query: 'seri\nlog' })).toThrow(InvalidArgumentError);
        expect(packageSearchArgs({ query: 'x'.repeat(512) })[2]).toHaveLength(512);
    });

    it('rejects a query that the CLI would read as an option', () => {
        expect(() => packageSearchArgs({ query: '--source' })).toThrow(/would be parsed as an option/);
    });

    it('rejects a take that is not a positive integer and an invalid source', () => {
        for (const take of [0, -1, 1.5, Number.NaN]) {
            expect(() => packageSearchArgs({ query: 'serilog', take })).toThrow(InvalidArgumentError);
        }
        expect(() => packageSearchArgs({ query: 'serilog', sources: ['gopher://feed'] })).toThrow(InvalidArgumentError);
    });
});

describe('msbuildGetArgs', () => {
    it('joins items with commas and properties with semicolons', () => {
        expect(msbuildGetArgs(PROJECT, ['PackageReference', 'PackageVersion'], ['TargetFramework', 'TargetFrameworks'])).toEqual([
            'msbuild', PROJECT, '-nologo', '-getItem:PackageReference,PackageVersion', '-getProperty:TargetFramework;TargetFrameworks',
        ]);
    });

    it('omits empty lists and appends global properties', () => {
        expect(msbuildGetArgs(PROJECT, [], [], { TargetFramework: 'net10.0' }))
            .toEqual(['msbuild', PROJECT, '-nologo', '-p:TargetFramework=net10.0']);
        expect(msbuildGetArgs(PROJECT, ['PackageReference'], [])).toEqual(['msbuild', PROJECT, '-nologo', '-getItem:PackageReference']);
    });

    it('rejects names that are not MSBuild identifiers', () => {
        expect(() => msbuildGetArgs(PROJECT, ['Package Reference'], [])).toThrow(InvalidArgumentError);
        expect(() => msbuildGetArgs(PROJECT, [], ['Target;Framework'])).toThrow(InvalidArgumentError);
        expect(() => msbuildGetArgs(PROJECT, [], [], { 'bad-key': 'x' })).toThrow(InvalidArgumentError);
    });

    it('rejects global property values that MSBuild would split or re-parse', () => {
        for (const value of ['a;b', 'a"b', 'a\nb', 'a\rb', 'a\u0000b']) {
            expect(() => msbuildGetArgs(PROJECT, [], [], { Configuration: value })).toThrow(InvalidArgumentError);
        }
    });
});

describe('nuget source commands', () => {
    it('adds a source with a name only', () => {
        expect(nugetAddSourceArgs({ url: FEED, name: 'nuget.org' })).toEqual(['nuget', 'add', 'source', FEED, '--name', 'nuget.org']);
    });

    it('adds credentials, the clear-text flag, the config file and the insecure flag', () => {
        expect(nugetAddSourceArgs({
            url: 'http://feed.example.test/v3/index.json',
            name: 'Internal Feed',
            username: 'DOMAIN\\user',
            password: 'p"a$$ `w` !',
            storePasswordInClearText: true,
            configFile: '/work/nuget.config',
            allowInsecure: true,
        })).toEqual([
            'nuget', 'add', 'source', 'http://feed.example.test/v3/index.json', '--name', 'Internal Feed',
            '--username', 'DOMAIN\\user', '--password', 'p"a$$ `w` !', '--store-password-in-clear-text',
            '--configfile', '/work/nuget.config', '--allow-insecure-connections',
        ]);
    });

    it('emits the clear-text flag only together with a password', () => {
        expect(nugetAddSourceArgs({ url: FEED, name: 'feed', username: 'me', storePasswordInClearText: true }))
            .not.toContain('--store-password-in-clear-text');
    });

    it('rejects an invalid URL, name or credential', () => {
        expect(() => nugetAddSourceArgs({ url: 'https://feed.example.test|x', name: 'feed' })).toThrow(InvalidArgumentError);
        expect(() => nugetAddSourceArgs({ url: FEED, name: 'feed;x' })).toThrow(InvalidArgumentError);
        expect(() => nugetAddSourceArgs({ url: FEED, name: 'feed', username: 'me', password: 'line\nbreak' })).toThrow(InvalidArgumentError);
    });

    it('removes, enables and disables a source by name, with an optional config file', () => {
        expect(nugetRemoveSourceArgs({ name: 'feed' })).toEqual(['nuget', 'remove', 'source', 'feed']);
        expect(nugetEnableSourceArgs({ name: 'feed' })).toEqual(['nuget', 'enable', 'source', 'feed']);
        expect(nugetDisableSourceArgs({ name: 'feed', configFile: '/work/nuget.config' }))
            .toEqual(['nuget', 'disable', 'source', 'feed', '--configfile', '/work/nuget.config']);
        expect(() => nugetRemoveSourceArgs({ name: '' })).toThrow(InvalidArgumentError);
    });
});

describe('process boundary (ADR-003)', () => {
    it('only src/core/cli names child_process', () => {
        const coreDir = path.resolve(__dirname, '..');
        const offenders: string[] = [];
        const visit = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== '__fixtures__') {
                        visit(full);
                    }
                } else if (/\.tsx?$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('child_process')) {
                    offenders.push(path.relative(coreDir, full).split(path.sep).join('/'));
                }
            }
        };
        visit(coreDir);

        expect(offenders.length).toBeGreaterThan(0);
        expect(offenders.filter(file => !file.startsWith('cli/'))).toEqual([]);
    });
});
