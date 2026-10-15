import { readFileSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DotnetResult, DotnetRunner, OutboundPolicy } from '../contracts';
import type { NuGetSource } from '../../protocol/domain';
import { DefaultDotnetRunner, packageSearchArgs } from '../cli';
import { createScratchDir, type ScratchDir } from '../project/__fixtures__/scratch';
import { DefaultSearchClient, cliSourceFor, extractCliSearchOutput, groupExactMatchEntries } from './search';
import { FakeTransport, fail, json, ok, silentLogger } from './testSupport';
import type { ResolvedSource, ServiceEndpoints } from './types';

interface Capture {
    id: string;
    argv: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
    synthetic?: boolean;
}

const FIXTURE = JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', 'cli-search', '10.0.401.json'), 'utf8')) as { commands: Capture[] };
const capture = (id: string): Capture => {
    const found = FIXTURE.commands.find(command => command.id === id);
    if (!found) {
        throw new Error(`no capture ${id}`);
    }
    return found;
};

const CWD = '/work/app';
const NUGET_ORG: NuGetSource = { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true };
const MISSING_PATH: NuGetSource = { name: 'Local feed', url: '/nonexistent/feed', enabled: true, isLocal: true };

function source(name: string, endpoints: ServiceEndpoints = { searchQueryService: `https://${name}.example/query` }, authHeader?: string): ResolvedSource {
    return { source: { name, url: `https://${name}.example/v3/index.json`, enabled: true }, endpoints, authHeader };
}

function entry(id: string, version: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { id, version, versions: [{ version }], description: `${id} description`, authors: ['Someone'], totalDownloads: 1, ...extra };
}

const allowAll: OutboundPolicy = { allowedSourcesFor: (_id, candidates) => candidates };

function runner(answer: (argv: string[]) => DotnetResult | Promise<DotnetResult>): DotnetRunner & { run: ReturnType<typeof vi.fn> } {
    return {
        run: vi.fn(async (argv: string[]) => answer(argv)),
        sdkVersion: vi.fn(async () => undefined),
        clearSdkCache: vi.fn(),
    };
}

function answer(id: string): (argv: string[]) => DotnetResult {
    const recorded = capture(id);
    return argv => ({ exitCode: recorded.exitCode, stdout: recorded.stdout, stderr: recorded.stderr, durationMs: 1, argv });
}

function client(transport: FakeTransport, cli = runner(answer('nuget-org-take-2')), policy: OutboundPolicy = allowAll, logger = silentLogger): DefaultSearchClient {
    return new DefaultSearchClient({ transport, runner: cli, policy, logger });
}

const noApi = new FakeTransport(() => fail('network'));

function query(request: string): URLSearchParams {
    return new URL(request).searchParams;
}

describe('DefaultSearchClient', () => {
    it('extracts the JSON document after info and warn prefix lines (synthetic fixture built from the tracked SDK probe)', () => {
        const synthetic = capture('prefix-lines-synthetic');
        expect(synthetic.synthetic).toBe(true);
        expect(synthetic.stdout.startsWith('info : X.509')).toBe(true);
        expect(() => JSON.parse(synthetic.stdout)).toThrow();

        const output = extractCliSearchOutput(synthetic.stdout);

        expect(output?.searchResult?.map(result => result.sourceName)).toEqual(['/nonexistent/feed', 'nuget.org']);
        expect(output?.searchResult?.[1].packages?.map(pkg => pkg.id)).toEqual(['Newtonsoft.Json', 'Newtonsoft.Json.Bson']);
    });

    it('parses the pure-JSON stdout of SDK 10.0.401 on macOS, where no prefix line appears', () => {
        const captured = FIXTURE.commands.filter(command => !command.synthetic);
        expect(captured).toHaveLength(7);
        for (const command of captured) {
            expect(command.stdout.startsWith('{'), command.id).toBe(true);
            expect(extractCliSearchOutput(command.stdout), command.id).toEqual(JSON.parse(command.stdout));
        }
        expect(extractCliSearchOutput(String.fromCharCode(0xfeff) + capture('nuget-org-take-2').stdout)?.searchResult).toHaveLength(1);
    });

    it('answers undefined for stdout without a document and for a document without searchResult', () => {
        expect(extractCliSearchOutput('')).toBeUndefined();
        expect(extractCliSearchOutput('warn : something\ninfo : nothing else\n')).toBeUndefined();
        expect(extractCliSearchOutput('{"version":2,"problems":[]}')).toBeUndefined();
        expect(extractCliSearchOutput('{"version":2,"searchResult":{}}')).toBeUndefined();
        expect(extractCliSearchOutput('info : start\n{"version":2,"searchResult":[')).toBeUndefined();
        expect(extractCliSearchOutput('[{"searchResult":[]}]')).toBeUndefined();
        expect(extractCliSearchOutput('info : start\n{ "searchResult": [ broken ] }')).toBeUndefined();
    });

    it('groups --exact-match entries by id with versions descending and the highest as version', () => {
        const packages = extractCliSearchOutput(capture('nuget-org-exact-match').stdout)?.searchResult?.[0].packages ?? [];
        expect(packages).toHaveLength(53);

        const [row, ...rest] = groupExactMatchEntries(packages);

        expect(rest).toEqual([]);
        expect(row).toMatchObject({ id: 'Newtonsoft.Json', version: '13.0.4', description: '', authors: '' });
        expect(row.versions).toHaveLength(53);
        expect(row.versions.slice(0, 3)).toEqual(['13.0.4', '13.0.3', '13.0.2']);
        expect(row.versions.at(-1)).toBe('3.5.8');
        expect(row).not.toHaveProperty('totalDownloads');

        expect(groupExactMatchEntries([
            { id: 'Contoso.Lib', version: '1.0.0' },
            { id: 'contoso.lib', version: '2.0.0-beta' },
            { id: 'Contoso.Lib', version: '1.10.0', totalDownloads: 7 },
            { id: 'Contoso.Lib' },
            { version: '9.0.0' },
        ])).toEqual([{ id: 'Contoso.Lib', version: '2.0.0-beta', versions: ['2.0.0-beta', '1.10.0', '1.0.0'], description: '', authors: '', totalDownloads: 7 }]);
    });

    it('never passes --take together with --exact-match', async () => {
        const cli = runner(answer('nuget-org-exact-match'));

        const exact = await client(noApi, cli).search([], [NUGET_ORG], { query: 'Newtonsoft.Json', includePrerelease: false, take: 20, exactMatch: true }, CWD);

        const exactArgv = cli.run.mock.calls[0][0] as string[];
        expect(exactArgv).toContain('--exact-match');
        expect(exactArgv).not.toContain('--take');
        expect(cli.run.mock.calls[0][1]).toMatchObject({ cwd: CWD });
        expect(exact.results).toHaveLength(1);
        expect(exact.results[0]).toMatchObject({ version: '13.0.4', sourceUrl: NUGET_ORG.url });
        expect(exact.results[0].versions).toHaveLength(53);

        cli.run.mockImplementation(async (argv: string[]) => answer('nuget-org-take-2')(argv));
        await client(noApi, cli).search([], [NUGET_ORG], { query: 'Newtonsoft.Json', includePrerelease: false, take: 20 }, CWD);
        const plainArgv = cli.run.mock.calls[1][0] as string[];
        expect(plainArgv).not.toContain('--exact-match');
        expect(plainArgv.slice(plainArgv.indexOf('--take'))).toEqual(['--take', '20']);
    });

    it('reports sourcesUnavailable for a per-source problem with exit code 0 and keeps the other source\'s rows', async () => {
        const outcome = await client(noApi, runner(answer('nuget-org-plus-missing-path'))).search([], [NUGET_ORG, MISSING_PATH], { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 }, CWD);

        expect(outcome.sourcesUnavailable).toBe(true);
        expect(outcome.results.map(row => [row.id, row.version, row.authors, row.totalDownloads, row.sourceUrl])).toEqual([
            ['Newtonsoft.Json', '13.0.4', 'dotnetfoundation, jamesnk, newtonsoft', 9325394018, NUGET_ORG.url],
            ['Newtonsoft.Json.Bson', '1.0.3', 'dotnetfoundation, jamesnk, newtonsoft', 1414154725, NUGET_ORG.url],
        ]);

        const clean = await client(noApi, runner(answer('nuget-org-take-2'))).search([], [NUGET_ORG], { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 }, CWD);
        expect(clean.sourcesUnavailable).toBe(false);
        expect(clean.results).toHaveLength(2);
    });

    it('reports sourcesUnavailable for the top-level HTTP refusal with exit code 1 and no rows', async () => {
        const plain: NuGetSource = { name: 'plain', url: 'http://does-not-exist.invalid/v3/index.json', enabled: true };

        const outcome = await client(noApi, runner(answer('http-source-refused-exit-1'))).search([], [plain], { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 }, CWD);

        expect(capture('http-source-refused-exit-1').exitCode).toBe(1);
        expect(outcome).toEqual({ results: [], sourcesUnavailable: true });
    });

    it('reports sourcesUnavailable when the CLI cannot be started, times out or is cancelled, and caches nothing', async () => {
        const good = answer('nuget-org-take-2');
        const outcomes: Array<(argv: string[]) => DotnetResult | Promise<DotnetResult>> = [
            () => Promise.reject(new Error('spawn dotnet ENOENT')),
            argv => ({ ...good(argv), timedOut: true }),
            argv => ({ ...good(argv), cancelled: true }),
            argv => ({ ...good(argv), exitCode: 1, stdout: '' }),
            good,
        ];
        let call = 0;
        const cli = runner(argv => outcomes[call++](argv));
        const search = client(noApi, cli);
        const options = { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 };

        for (let i = 0; i < 4; i++) {
            await expect(search.search([], [NUGET_ORG], options, CWD)).resolves.toEqual({ results: [], sourcesUnavailable: true });
        }
        const recovered = await search.search([], [NUGET_ORG], options, CWD);

        expect(recovered.sourcesUnavailable).toBe(false);
        expect(recovered.results).toHaveLength(2);
        expect(cli.run).toHaveBeenCalledTimes(5);

        await expect(search.search([], [NUGET_ORG], { ...options, query: '-flag' }, CWD)).resolves.toEqual({ results: [], sourcesUnavailable: true });
        expect(cli.run).toHaveBeenCalledTimes(5);
    });

    it('maps sourceName to the fallback source by name or by url to fill sourceUrl', async () => {
        const sources: NuGetSource[] = [
            { name: 'NuGet.ORG', url: 'https://api.nuget.org/v3/index.json', enabled: true },
            { name: 'Local feed', url: '/nonexistent/feed', enabled: true, isLocal: true },
            { name: 'Slashed', url: 'https://feed.example/v3/index.json/', enabled: true },
        ];
        expect(cliSourceFor('nuget.org', sources)).toBe(sources[0]);
        expect(cliSourceFor('/nonexistent/feed', sources)).toBe(sources[1]);
        expect(cliSourceFor('https://FEED.example/v3/index.json', sources)).toBe(sources[2]);
        expect(cliSourceFor('unknown', sources)).toBeUndefined();
        const byCase: NuGetSource[] = [{ name: 'upper', url: '/Feeds/A', enabled: true, isLocal: true }, { name: 'lower', url: '/feeds/a', enabled: true, isLocal: true }];
        expect(cliSourceFor('/feeds/a', byCase)).toBe(byCase[1]);

        const plain: NuGetSource = { name: 'plain', url: 'http://does-not-exist.invalid/v3/index.json', enabled: true };
        const named = await client(noApi, runner(answer('nuget-org-take-2'))).search([], [plain, sources[0]], { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 }, CWD);
        expect(named.results.map(row => row.sourceUrl)).toEqual([sources[0].url, sources[0].url]);

        const unknown = await client(noApi, runner(answer('nuget-org-take-2'))).search([], [plain], { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 }, CWD);
        expect(unknown.results.map(row => row.sourceUrl)).toEqual([undefined, undefined]);
    });

    it('merges API sources by id keeping the first-listed source\'s entry and CLI rows only for new ids', async () => {
        const first = source('first');
        const second = source('second');
        const transport = new FakeTransport(request => request.url.startsWith('https://first.')
            ? json({ data: [entry('Shared.Lib', '1.0.0', { totalDownloads: 1 }), entry('First.Only', '1.0.0')] })
            : json({ data: [entry('shared.lib', '9.0.0', { totalDownloads: 1000 }), entry('Second.Only', '1.0.0')] }));

        const outcome = await client(transport, runner(answer('nuget-org-take-2'))).search([first, second], [NUGET_ORG], { query: 'lib', includePrerelease: false, take: 20 }, CWD);

        expect(outcome.sourcesUnavailable).toBe(false);
        expect(outcome.results.map(row => row.id).sort()).toEqual(['First.Only', 'Newtonsoft.Json', 'Newtonsoft.Json.Bson', 'Second.Only', 'Shared.Lib']);
        expect(outcome.results.find(row => row.id.toLowerCase() === 'shared.lib')).toMatchObject({ id: 'Shared.Lib', version: '1.0.0', totalDownloads: 1, sourceUrl: first.source.url });

        const cliOverlap = new FakeTransport(() => json({ data: [entry('Newtonsoft.Json', '12.0.0')] }));
        const overlap = await client(cliOverlap, runner(answer('nuget-org-take-2'))).search([first], [NUGET_ORG], { query: 'json', includePrerelease: false, take: 20 }, CWD);
        expect(overlap.results.filter(row => row.id === 'Newtonsoft.Json')).toEqual([expect.objectContaining({ version: '12.0.0', sourceUrl: first.source.url })]);

        const oneDown = new FakeTransport(request => request.url.startsWith('https://first.') ? json({ data: [entry('First.Only', '1.0.0')] }) : fail('timeout'));
        const partial = await client(oneDown).search([first, second], [], { query: 'lib', includePrerelease: false, take: 20 }, CWD);
        expect(partial).toEqual({ results: [expect.objectContaining({ id: 'First.Only' })], sourcesUnavailable: true });
    });

    it('sorts by relevance only when two or more origins contributed rows', async () => {
        const feedOrder = [entry('Contoso.Exact.Helpers', '1.0.0', { totalDownloads: 5 }), entry('Exact', '1.0.0', { totalDownloads: 0 })];
        const single = new FakeTransport(() => json({ data: feedOrder }));
        const one = await client(single).search([source('a')], [], { query: 'exact', includePrerelease: false, take: 20 }, CWD);
        expect(one.results.map(row => row.id)).toEqual(['Contoso.Exact.Helpers', 'Exact']);

        const secondEmpty = new FakeTransport(request => request.url.startsWith('https://a.') ? json({ data: feedOrder }) : json({ data: [] }));
        const stillOne = await client(secondEmpty).search([source('a'), source('b')], [], { query: 'exact', includePrerelease: false, take: 20 }, CWD);
        expect(stillOne.results.map(row => row.id)).toEqual(['Contoso.Exact.Helpers', 'Exact']);

        const two = new FakeTransport(request => request.url.startsWith('https://a.') ? json({ data: feedOrder }) : json({ data: [entry('Other', '1.0.0', { totalDownloads: 99 })] }));
        const both = await client(two).search([source('a'), source('b')], [], { query: 'exact', includePrerelease: false, take: 20 }, CWD);
        expect(both.results.map(row => row.id)).toEqual(['Exact', 'Contoso.Exact.Helpers', 'Other']);
    });

    it('caps merged results to take after the merge', async () => {
        const transport = new FakeTransport(request => {
            const name = new URL(request.url).hostname.split('.')[0];
            return json({ data: [1, 2, 3].map(n => entry(`${name}.Package${n}`, '1.0.0')) });
        });

        const outcome = await client(transport).search([source('a'), source('b')], [], { query: 'package', includePrerelease: false, take: 4 }, CWD);

        expect(outcome.results).toHaveLength(4);
        expect(transport.urls().map(url => query(url).get('take'))).toEqual(['4', '4']);
    });

    it('sends a free-text query to every source and filters nothing by policy', async () => {
        const policy = { allowedSourcesFor: vi.fn((_id: string, candidates: NuGetSource[]) => candidates.slice(0, 0)) };
        const transport = new FakeTransport(() => json({ data: [] }));
        const cli = runner(answer('nuget-org-take-2'));

        await client(transport, cli, policy).search([source('a'), source('b')], [NUGET_ORG, MISSING_PATH], { query: 'Contoso Logging', includePrerelease: true, take: 10 }, CWD);

        expect(policy.allowedSourcesFor).not.toHaveBeenCalled();
        expect(transport.urls()).toHaveLength(2);
        for (const url of transport.urls()) {
            expect(query(url).get('q')).toBe('Contoso Logging');
            expect(query(url).get('prerelease')).toBe('true');
            expect(query(url).get('semVerLevel')).toBe('2.0.0');
        }
        const argv = cli.run.mock.calls[0][0] as string[];
        expect(argv).toEqual(expect.arrayContaining(['--source', NUGET_ORG.url, '--source', MISSING_PATH.url, '--prerelease']));
    });

    it('sends packageid: queries for exactMatch only to sources the policy allows, on the API and CLI paths', async () => {
        const allowed = new Set(['https://a.example/v3/index.json', MISSING_PATH.url]);
        const policy = { allowedSourcesFor: vi.fn((_id: string, candidates: NuGetSource[]) => candidates.filter(candidate => allowed.has(candidate.url))) };
        const transport = new FakeTransport(() => json({ data: [] }));
        const cli = runner(answer('https-unresolvable-source'));

        await client(transport, cli, policy).search([source('a'), source('b')], [NUGET_ORG, MISSING_PATH], { query: 'Contoso.Lib', includePrerelease: false, take: 10, exactMatch: true }, CWD);

        expect(policy.allowedSourcesFor).toHaveBeenCalledWith('Contoso.Lib', expect.any(Array));
        expect(transport.urls()).toHaveLength(1);
        expect(transport.urls()[0].startsWith('https://a.example/query')).toBe(true);
        expect(query(transport.urls()[0]).get('q')).toBe('packageid:Contoso.Lib');
        const argv = cli.run.mock.calls[0][0] as string[];
        expect(argv).toContain(MISSING_PATH.url);
        expect(argv).not.toContain(NUGET_ORG.url);

        allowed.clear();
        await client(transport, cli, policy).search([source('a')], [NUGET_ORG], { query: 'Contoso.Lib', includePrerelease: false, take: 10, exactMatch: true }, CWD);
        expect(transport.urls()).toHaveLength(1);
        expect(cli.run).toHaveBeenCalledTimes(1);
    });

    it('answers empty and available without a request for an exactMatch query that is not a valid package id', async () => {
        const transport = new FakeTransport(() => json({ data: [entry('X', '1.0.0')] }));
        const cli = runner(answer('nuget-org-take-2'));

        for (const invalid of ['not a valid id!', '-flag', '../x', '']) {
            await expect(client(transport, cli).search([source('a')], [NUGET_ORG], { query: invalid, includePrerelease: false, take: 10, exactMatch: true }, CWD))
                .resolves.toEqual({ results: [], sourcesUnavailable: false });
        }
        expect(transport.urls()).toEqual([]);
        expect(cli.run).not.toHaveBeenCalled();
    });

    it('skips an entry without id or version instead of failing the search', async () => {
        const transport = new FakeTransport(() => json({ data: [{ id: 'No.Version' }, { version: '1.0.0' }, 'not an entry', entry('Kept', '2.0.0')] }));
        const cliOutput = JSON.stringify({ version: 2, problems: [], searchResult: [{ sourceName: 'nuget.org', packages: [{ id: 'Cli.NoVersion' }, { latestVersion: '1.0.0' }, { id: 'Cli.Kept', latestVersion: '3.0.0' }] }] });
        const cli = runner(argv => ({ exitCode: 0, stdout: cliOutput, stderr: '', durationMs: 1, argv }));

        const outcome = await client(transport, cli).search([source('a')], [NUGET_ORG], { query: 'kept', includePrerelease: false, take: 10 }, CWD);

        expect(outcome.sourcesUnavailable).toBe(false);
        expect(outcome.results.map(row => row.id)).toEqual(['Kept', 'Cli.Kept']);
    });

    it('puts no iconUrl on any result', async () => {
        const transport = new FakeTransport(() => json({ data: [entry('With.Icon', '1.0.0', { iconUrl: 'https://example.com/icon.png', verified: true })] }));

        const outcome = await client(transport, runner(answer('nuget-org-take-2'))).search([source('a')], [NUGET_ORG], { query: 'icon', includePrerelease: false, take: 10 }, CWD);
        const lite = await client(transport).lookup(source('a'), 'With.Icon');

        expect(outcome.results).toHaveLength(3);
        for (const row of outcome.results) {
            expect(row).not.toHaveProperty('iconUrl');
        }
        expect(outcome.results[0].verified).toBe(true);
        expect(lite).toEqual({ id: 'With.Icon', version: '1.0.0', authors: 'Someone', description: 'With.Icon description', verified: true });
    });

    it('redacts the argv and the problem text in the log', async () => {
        const secretFeed: NuGetSource = { name: 'private', url: 'https://user:s3cret@feed.example/v3/index.json', enabled: true };
        const problem = JSON.stringify({ version: 2, problems: [], searchResult: [{ sourceName: 'private', problems: [{ text: 'Unable to load the service index for source https://user:s3cret@feed.example/v3/index.json.', problemType: 'Error' }], packages: [] }] });
        const lines: string[] = [];
        const logger = { trace: () => undefined, debug: (m: string) => lines.push(m), info: () => undefined, warn: (m: string) => lines.push(m), error: () => undefined };
        const transport = new FakeTransport(() => fail('network'));
        const cli = runner(argv => ({ exitCode: 0, stdout: problem, stderr: '', durationMs: 1, argv }));
        const apiSource: ResolvedSource = { source: secretFeed, endpoints: { searchQueryService: 'https://user:s3cret@feed.example/query' } };

        const outcome = await client(transport, cli, allowAll, logger).search([apiSource], [secretFeed], { query: 'x', includePrerelease: false, take: 1 }, CWD);
        await client(transport, runner(() => Promise.reject(new Error('cannot start https://user:s3cret@feed.example'))), allowAll, logger).search([], [secretFeed], { query: 'x', includePrerelease: false, take: 1 }, CWD);

        expect(outcome.sourcesUnavailable).toBe(true);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines.join('\n')).not.toContain('s3cret');
        expect(lines.some(line => line.includes('[REDACTED]') && line.includes('Unable to load the service index'))).toBe(true);
    });

    describe('quickSearch', () => {
        it('uses the autocomplete service when present and the search service otherwise, for any source', async () => {
            const withAutocomplete = source('auto', { searchAutocompleteService: 'https://auto.example/autocomplete', searchQueryService: 'https://auto.example/query' });
            const searchOnly = source('plain');
            const neither = source('none', {});
            const transport = new FakeTransport(request => request.url.startsWith('https://auto.')
                ? json({ data: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] })
                : json({ data: [entry('P1', '1.0.0'), entry('P2', '1.0.0')] }));

            const groups = await client(transport).quickSearch([withAutocomplete, searchOnly, neither], ' json ', true, 5);

            expect(groups).toEqual([
                { sourceName: 'auto', sourceUrl: withAutocomplete.source.url, packageIds: ['A1', 'A2', 'A3', 'A4', 'A5'] },
                { sourceName: 'plain', sourceUrl: searchOnly.source.url, packageIds: ['P1', 'P2'] },
            ]);
            expect(transport.urls().map(url => new URL(url).origin + new URL(url).pathname)).toEqual(['https://auto.example/autocomplete', 'https://plain.example/query']);
            for (const url of transport.urls()) {
                expect(Object.fromEntries(query(url))).toEqual({ q: 'json', take: '5', semVerLevel: '2.0.0', prerelease: 'true' });
            }
        });

        it('omits a source that fails or has no ids and answers [] for an empty query without a request', async () => {
            const transport = new FakeTransport(request => {
                if (request.url.startsWith('https://down.')) {
                    return fail('network');
                }
                if (request.url.startsWith('https://broken.')) {
                    return ok('oops', {}, 500);
                }
                return request.url.startsWith('https://empty.') ? json({ data: [] }) : json({ data: [entry('Up', '1.0.0')] });
            });
            const sources = [source('down'), source('broken'), source('empty'), source('up')];

            await expect(client(transport).quickSearch(sources, '   ', false, 5)).resolves.toEqual([]);
            expect(transport.urls()).toEqual([]);

            const groups = await client(transport).quickSearch(sources, 'up', false, 5);
            expect(groups.map(group => group.sourceName)).toEqual(['up']);
            expect(query(transport.urls()[0]).has('prerelease')).toBe(false);
        });

        it('never contacts a source it was not handed and has no nuget.org default', async () => {
            const transport = new FakeTransport(() => json({ data: ['Private.Lib'] }));

            await expect(client(transport).quickSearch([], 'json', false, 5)).resolves.toEqual([]);
            expect(transport.urls()).toEqual([]);

            const privateOnly = source('private', { searchAutocompleteService: 'https://private.example/autocomplete' });
            await client(transport).quickSearch([privateOnly], 'json', false, 5);
            expect(transport.urls()).toHaveLength(1);
            expect(transport.urls().every(url => new URL(url).hostname === 'private.example')).toBe(true);
        });
    });

    describe('searchById', () => {
        it('answers found with versions and downloads for the exact id', async () => {
            const transport = new FakeTransport(() => json({ data: [entry('newtonsoft.json', '13.0.4', {
                versions: [{ version: '12.0.3' }, { version: '13.0.4' }, { version: '13.0.5-beta' }],
                totalDownloads: 42,
            })] }));

            const fetched = await client(transport).searchById(source('feed', { searchQueryService: 'https://feed.example/query' }, 'Basic abc'), 'Newtonsoft.Json', true);

            expect(fetched.kind).toBe('found');
            expect(fetched.kind === 'found' && fetched.result).toMatchObject({ id: 'newtonsoft.json', version: '13.0.4', versions: ['13.0.5-beta', '13.0.4', '12.0.3'], totalDownloads: 42, sourceUrl: 'https://feed.example/v3/index.json' });
            expect(Object.fromEntries(query(transport.urls()[0]))).toEqual({ q: 'packageid:Newtonsoft.Json', take: '1', semVerLevel: '2.0.0', prerelease: 'true' });
            expect(transport.requests[0].headers).toEqual({ Authorization: 'Basic abc' });
        });

        it('answers missing for no entry and for a source the policy refuses, without a request in the second case', async () => {
            const transport = new FakeTransport(() => json({ data: [entry('Other.Package', '1.0.0')] }));

            await expect(client(transport).searchById(source('feed'), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'missing' });
            expect(transport.urls()).toHaveLength(1);

            const refuse: OutboundPolicy = { allowedSourcesFor: () => [] };
            await expect(client(transport, undefined, refuse).searchById(source('feed'), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'missing' });
            await expect(client(transport, undefined, refuse).lookup(source('feed'), 'Contoso.Lib')).resolves.toBeUndefined();
            expect(transport.urls()).toHaveLength(1);
        });

        it('answers failed, not missing, for a transport failure or non-2xx status', async () => {
            const answers = [fail('timeout'), ok('{"data":[]}', {}, 503), ok('not json'), fail('http-error', 404)];
            let call = 0;
            const transport = new FakeTransport(() => answers[call++]);
            const search = client(transport);

            await expect(search.searchById(source('feed'), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'failed', reason: 'timeout' });
            await expect(search.searchById(source('feed'), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'failed', reason: 'http-error 503' });
            await expect(search.searchById(source('feed'), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'failed', reason: 'invalid-json' });
            await expect(search.lookup(source('feed'), 'Contoso.Lib')).resolves.toBeUndefined();
            await expect(search.searchById(source('feed', {}), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'failed', reason: 'no search service' });
            await expect(search.searchById(source('feed', { searchQueryService: 'not a url' }), 'Contoso.Lib', false)).resolves.toEqual({ kind: 'failed', reason: 'no search service' });
        });
    });

    describe('with the real SDK', () => {
        let scratch: ScratchDir | undefined;

        afterEach(async () => {
            await scratch?.cleanup();
            scratch = undefined;
        });

        it.skipIf(process.env.NUIGET_SDK_TESTS !== '1')('real SDK: extracts the JSON document of dotnet package search on this runner', async () => {
            scratch = await createScratchDir('search');
            await fs.promises.writeFile(path.join(scratch.dir, 'nuget.config'), '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <packageSources>\n    <clear />\n  </packageSources>\n</configuration>\n');
            const dotnet = new DefaultDotnetRunner();
            const missing: NuGetSource = { name: 'missing', url: path.join(scratch.dir, 'missing-feed'), enabled: true, isLocal: true };

            const outcome = await new DefaultSearchClient({ transport: noApi, runner: dotnet, policy: allowAll, logger: silentLogger })
                .search([], [missing], { query: 'Newtonsoft.Json', includePrerelease: false, take: 2 }, scratch.dir);

            expect(outcome).toEqual({ results: [], sourcesUnavailable: true });
            const direct = await dotnet.run(packageSearchArgs({ query: 'Newtonsoft.Json', sources: [missing.url], take: 2 }), { cwd: scratch.dir, timeoutMs: 60_000 });
            const document = extractCliSearchOutput(direct.stdout);
            expect(document?.searchResult?.length).toBeGreaterThanOrEqual(1);
            const problems = [...(document?.problems ?? []), ...(document?.searchResult ?? []).flatMap(result => result.problems ?? [])];
            expect(problems.length).toBeGreaterThanOrEqual(1);
        }, 90_000);
    });
});
