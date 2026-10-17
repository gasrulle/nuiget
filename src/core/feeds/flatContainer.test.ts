import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { DefaultFlatContainerClient, flatContainerUrls, versionSegment } from './flatContainer';
import { FakeTransport, fail, json, ok, silentLogger } from './testSupport';
import type { ResolvedSource } from './types';

const BASE = 'https://api.nuget.org/v3-flatcontainer/';
const feed = (changes: Partial<ResolvedSource> = {}): ResolvedSource => ({
    source: { name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true, isLocal: false } as never,
    endpoints: { packageBaseAddress: BASE },
    ...changes,
});
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dirs: string[] = [];

function client(handler: ConstructorParameters<typeof FakeTransport>[0], options: ConstructorParameters<typeof DefaultFlatContainerClient>[1] = {}) {
    const transport = new FakeTransport(handler);
    return { transport, client: new DefaultFlatContainerClient({ transport, logger: silentLogger as never }, options) };
}

afterEach(() => {
    for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('flat container URLs', () => {
    it('use the lower-cased id and the lower-cased normalized version', () => {
        expect(versionSegment('1.0')).toBe('1.0.0');
        expect(versionSegment('2.0.0-Beta.1+build')).toBe('2.0.0-beta.1');
        expect(flatContainerUrls('https://feed/flat//', 'Newtonsoft.Json', '13.0.1')).toEqual({
            index: 'https://feed/flat/newtonsoft.json/index.json',
            nuspec: 'https://feed/flat/newtonsoft.json/13.0.1/newtonsoft.json.nuspec',
            nupkg: 'https://feed/flat/newtonsoft.json/13.0.1/newtonsoft.json.13.0.1.nupkg',
            icon: 'https://feed/flat/newtonsoft.json/13.0.1/icon',
        });
    });
});

describe('flat container client', () => {
    it('versionIndex: the versions, [] for an unknown package, undefined on failure or without a flat container', async () => {
        const { transport, client: c } = client(request => {
            if (request.url.includes('/unknown/')) {
                return fail('http-error', 404);
            }
            if (request.url.includes('/broken/')) {
                return fail('network');
            }
            if (request.url.includes('/odd/')) {
                return json({ items: [] });
            }
            return json({ versions: ['1.0.0', '', 2, '1.1.0'] });
        });
        expect(await c.versionIndex(feed(), 'Serilog')).toEqual(['1.0.0', '1.1.0']);
        expect(await c.versionIndex(feed(), 'unknown')).toEqual([]);
        expect(await c.versionIndex(feed(), 'broken')).toBeUndefined();
        expect(await c.versionIndex(feed(), 'odd')).toBeUndefined();
        expect(await c.versionIndex(feed({ endpoints: {} }), 'Serilog')).toBeUndefined();
        expect(transport.urls()[0]).toBe(`${BASE}serilog/index.json`);
    });

    it('nuspec: the text without a byte order mark, undefined when missing; the credential goes along', async () => {
        const { transport, client: c } = client(request => (request.url.includes('/missing/') ? fail('http-error', 404) : ok('\uFEFF<package/>')));
        expect(await c.nuspec(feed({ authHeader: 'Basic x' }), 'Serilog', '3.1.1')).toBe('<package/>');
        expect(await c.nuspec(feed(), 'missing', '1.0.0')).toBeUndefined();
        expect(transport.requests[0].headers).toEqual({ Authorization: 'Basic x' });
    });

    it('packageSize: the Content-Length of a HEAD request, undefined when it is absent or no number', async () => {
        const sizes: Record<string, Record<string, string>> = { a: { 'content-length': '12345' }, b: {}, c: { 'Content-Length': '12abc' } };
        const { transport, client: c } = client(request => ok('', sizes[request.url.split('/')[4]]));
        expect(await c.packageSize(feed(), 'a', '1.0.0')).toBe(12345);
        expect(await c.packageSize(feed(), 'b', '1.0.0')).toBeUndefined();
        expect(await c.packageSize(feed(), 'c', '1.0.0')).toBeUndefined();
        expect(transport.requests[0].method).toBe('HEAD');
    });

    it('downloadPackage: writes the package to a new temporary file under the cap', async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'nuiget-flat-'));
        dirs.push(dir);
        const { transport, client: c } = client(request => (request.url.includes('/empty/') ? ok('') : ok('PK-bytes')), { tempDir: () => dir, maxPackageBytes: 1024 });
        const file = await c.downloadPackage(feed(), 'Serilog', '3.1.1');
        expect(file && path.dirname(file)).toBe(dir);
        expect(file && readFileSync(file, 'utf8')).toBe('PK-bytes');
        expect(transport.requests[0].maxBytes).toBe(1024);
        expect(await c.downloadPackage(feed(), 'empty', '1.0.0')).toBeUndefined();
    });

    it('icon: found, or missing when the feed says there is none, or failed when the feed could not answer', async () => {
        const answers: Record<string, ReturnType<typeof ok>> = {
            png: ok(PNG, { 'content-type': 'image/png' }),
            octet: ok(PNG, { 'content-type': 'application/octet-stream' }),
            gone: fail('http-error', 404),
            removed: fail('http-error', 410),
            huge: fail('too-large'),
            empty: ok('', { 'content-type': 'image/png' }),
            html: ok('<html>', { 'content-type': 'text/html' }),
            down: fail('network'),
            slow: fail('timeout'),
            busy: fail('http-error', 503),
            limited: fail('http-error', 429),
            stopped: fail('cancelled'),
        };
        const { client: c } = client(request => answers[request.url.split('/')[4]]);
        const kinds = async (ids: string[]) => Promise.all(ids.map(async id => (await c.icon(feed(), id, '1.0.0')).kind));
        expect(await kinds(['png', 'octet'])).toEqual(['found', 'found']);
        expect(await kinds(['gone', 'removed', 'huge', 'empty', 'html'])).toEqual(['missing', 'missing', 'missing', 'missing', 'missing']);
        expect(await kinds(['down', 'slow', 'busy', 'limited', 'stopped'])).toEqual(['failed', 'failed', 'failed', 'failed', 'failed']);
        expect(await c.icon(feed(), 'png', '1.0.0')).toEqual({ kind: 'found', contentType: 'image/png', body: PNG });
        expect(await c.icon(feed(), 'busy', '1.0.0')).toEqual({ kind: 'failed', reason: 'http-error 503: http-error' });
        // A source without a flat container has no icon there: definitive.
        expect(await c.icon(feed({ endpoints: {} }), 'png', '1.0.0')).toEqual({ kind: 'missing' });
        // Only 404 and 410 say "this version has no icon"; the other misses answered with something that is no icon (P9.1).
        const unusable = async (ids: string[]) => Promise.all(ids.map(async id => (await c.icon(feed(), id, '1.0.0')) as { unusable?: true }));
        expect((await unusable(['gone', 'removed'])).map(answer => answer.unusable)).toEqual([undefined, undefined]);
        expect((await unusable(['huge', 'empty', 'html'])).map(answer => answer.unusable)).toEqual([true, true, true]);
    });
});
