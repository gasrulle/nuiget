import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Transport, TransportResult } from '../contracts';
import {
    DEFAULT_README_CACHE_CAPACITY,
    MAX_README_BYTES,
    ReadmeExtractor,
    declaredReadmePath,
    expandReadmeTemplate,
    isSafeArchivePath,
    readReadmeFromArchive,
} from './readme';
import type { FlatContainerClient, ResolvedSource } from './types';

const SCRATCH = path.join(__dirname, '__fixtures__', '.scratch', 'readme-b');

function source(url: string, readmeUriTemplate?: string, authHeader?: string): ResolvedSource {
    return {
        source: { name: url, url, enabled: true },
        endpoints: { packageBaseAddress: `${url}/flat/`, readmeUriTemplate },
        authHeader,
    };
}

const NUGET = source('https://api.nuget.org/v3/index.json', 'https://api.nuget.org/v3-flatcontainer/{lower_id}/{lower_version}/readme');
const PRIVATE = source('https://feed.example/nuget/v3/index.json', undefined, 'Basic abc');

function buildNupkg(entries: Record<string, string | Buffer>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(entries)) {
        zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
    }
    return zip.toBuffer();
}

let scratchCounter = 0;
async function writeScratch(buffer: Buffer): Promise<string> {
    const file = path.join(SCRATCH, `pkg-${process.pid}-${scratchCounter++}.nupkg`);
    await fs.promises.writeFile(file, buffer);
    return file;
}

function fakeTransport(fetch: (url: string, headers: Record<string, string> | undefined) => TransportResult | Promise<TransportResult>): Transport & { fetch: ReturnType<typeof vi.fn> } {
    const fetchMock = vi.fn(async (request: { url: string; headers?: Record<string, string> }) => fetch(request.url, request.headers));
    return {
        fetch: fetchMock as unknown as Transport['fetch'] & ReturnType<typeof vi.fn>,
        fetchJson: vi.fn(async () => ({ ok: false as const, code: 'network' as const, message: 'unused' })),
        head: vi.fn(async () => ({ ok: false as const, code: 'network' as const, message: 'unused' })),
        dispose: vi.fn(),
    };
}

function fakeFlat(downloadPackage: FlatContainerClient['downloadPackage']): FlatContainerClient & { downloadPackage: ReturnType<typeof vi.fn> } {
    return {
        downloadPackage: vi.fn(downloadPackage) as FlatContainerClient['downloadPackage'] & ReturnType<typeof vi.fn>,
        icon: vi.fn(async () => ({ kind: 'missing' as const })),
        versionIndex: vi.fn(async () => undefined),
        nuspec: vi.fn(async () => undefined),
        packageSize: vi.fn(async () => undefined),
    };
}

function okText(text: string, status = 200): TransportResult {
    return { ok: true, status, headers: {}, body: Buffer.from(text, 'utf8'), url: 'https://final.example/readme' };
}

function notFound(): TransportResult {
    return { ok: false, code: 'http-error', status: 404, message: 'Not Found' };
}

const noTransport = fakeTransport(() => ({ ok: false, code: 'network', message: 'offline' }));
const noFlat = fakeFlat(async () => undefined);

beforeAll(async () => {
    await fs.promises.mkdir(SCRATCH, { recursive: true });
});

afterAll(async () => {
    await fs.promises.rm(SCRATCH, { recursive: true, force: true });
});

describe('expandReadmeTemplate', () => {
    it('fills nuget.org style placeholders with lower-cased id and normalized lower-cased version', () => {
        expect(expandReadmeTemplate(NUGET.endpoints.readmeUriTemplate as string, 'Newtonsoft.Json', '13.0.3.0'))
            .toBe('https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/readme');
        expect(expandReadmeTemplate('https://x/{lower_id}/{lower_version}', 'Pkg', '1.0-Beta.1')).toBe('https://x/pkg/1.0.0-beta.1');
    });

    it('keeps original casing for {id} and {version} and URL-encodes the values', () => {
        expect(expandReadmeTemplate('https://x/{ID}/{Version}/readme', 'My Pkg', '1.0.0+build')).toBe('https://x/My%20Pkg/1.0.0%2Bbuild/readme');
    });

    it('leaves unknown placeholders untouched', () => {
        expect(expandReadmeTemplate('https://x/{lower_id}/{other}', 'Pkg', '1.0.0')).toBe('https://x/pkg/{other}');
    });
});

describe('isSafeArchivePath', () => {
    it('rejects traversal, absolute and backslash paths', () => {
        expect(isSafeArchivePath('README.md')).toBe(true);
        expect(isSafeArchivePath('docs/README.md')).toBe(true);
        expect(isSafeArchivePath('../README.md')).toBe(false);
        expect(isSafeArchivePath('docs/../../etc/passwd')).toBe(false);
        expect(isSafeArchivePath('/README.md')).toBe(false);
        expect(isSafeArchivePath('docs\\README.md')).toBe(false);
        expect(isSafeArchivePath('')).toBe(false);
    });
});

describe('declaredReadmePath', () => {
    it('reads the nuspec <readme> element and normalizes backslashes', () => {
        expect(declaredReadmePath('<package><metadata><readme>docs\\README.md</readme></metadata></package>')).toBe('docs/README.md');
        expect(declaredReadmePath('<readme xml:space="preserve"> README.md </readme>')).toBe('README.md');
    });

    it('returns undefined when the element is missing or unsafe', () => {
        expect(declaredReadmePath('<package><metadata><id>x</id></metadata></package>')).toBeUndefined();
        expect(declaredReadmePath('<readme>../secret.md</readme>')).toBeUndefined();
        expect(declaredReadmePath('<readme>/etc/hosts</readme>')).toBeUndefined();
    });
});

describe('readReadmeFromArchive', () => {
    it('prefers the nuspec-declared path over conventional names', () => {
        const archive = new AdmZip(buildNupkg({
            'Pkg.nuspec': '<package><metadata><readme>docs\\GUIDE.md</readme></metadata></package>',
            'README.md': '# root',
            'docs/GUIDE.md': '# guide',
        }));
        expect(readReadmeFromArchive(archive)).toEqual({ kind: 'found', text: '# guide' });
    });

    it('falls back to README.md at the root, then docs/README.md, case-insensitively', () => {
        expect(readReadmeFromArchive(new AdmZip(buildNupkg({ 'Pkg.nuspec': '<package/>', 'Readme.MD': '\uFEFF# hi' })))).toEqual({ kind: 'found', text: '# hi' });
        expect(readReadmeFromArchive(new AdmZip(buildNupkg({ 'Pkg.nuspec': '<package/>', 'docs/readme.md': '# docs' })))).toEqual({ kind: 'found', text: '# docs' });
        expect(readReadmeFromArchive(new AdmZip(buildNupkg({ 'Pkg.nuspec': '<package/>', 'lib/net8.0/Pkg.dll': 'MZ' })))).toEqual({ kind: 'none' });
    });

    it('ignores entries with traversal names and oversized entries', () => {
        const archive = new AdmZip(buildNupkg({
            'Pkg.nuspec': '<package><metadata><readme>../README.md</readme></metadata></package>',
            '../README.md': '# escaped',
            'docs/README.md': '# safe',
        }));
        expect(readReadmeFromArchive(archive)).toEqual({ kind: 'found', text: '# safe' });

        const oversized = new AdmZip(buildNupkg({ 'README.md': 'x'.repeat(64), 'docs/README.md': '# small' }));
        expect(readReadmeFromArchive(oversized, 32)).toEqual({ kind: 'found', text: '# small' });
        expect(readReadmeFromArchive(new AdmZip(buildNupkg({ 'README.md': 'x'.repeat(64) })), 32)).toEqual({ kind: 'none' });
    });

    it('treats a whitespace-only README as none and accepts a nested nuspec', () => {
        expect(readReadmeFromArchive(new AdmZip(buildNupkg({ 'README.md': '   \n' })))).toEqual({ kind: 'none' });
        const nested = new AdmZip(buildNupkg({ 'meta/Pkg.nuspec': '<readme>docs/x.md</readme>', 'docs/x.md': '# nested' }));
        expect(readReadmeFromArchive(nested)).toEqual({ kind: 'found', text: '# nested' });
    });

    it('exports the default limits used by the extractor', () => {
        expect(MAX_README_BYTES).toBe(2 * 1024 * 1024);
        expect(DEFAULT_README_CACHE_CAPACITY).toBe(100);
    });
});

describe('ReadmeExtractor', () => {
    it('fetches through the readme template with the source auth header and caches the text', async () => {
        const transport = fakeTransport(() => okText('\uFEFF# Hello'));
        const flat = fakeFlat(async () => undefined);
        const authed = { ...NUGET, authHeader: 'Bearer t' };
        const extractor = new ReadmeExtractor(transport, flat);

        await expect(extractor.extract([authed], 'Newtonsoft.Json', '13.0.3')).resolves.toBe('# Hello');
        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(transport.fetch.mock.calls[0][0]).toMatchObject({
            url: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/readme',
            headers: { Authorization: 'Bearer t' },
            maxBytes: MAX_README_BYTES,
        });
        expect(flat.downloadPackage).not.toHaveBeenCalled();

        await expect(extractor.extract([authed], 'newtonsoft.json', '13.0.3')).resolves.toBe('# Hello');
        expect(transport.fetch).toHaveBeenCalledTimes(1);

        extractor.clear();
        await extractor.extract([authed], 'Newtonsoft.Json', '13.0.3');
        expect(transport.fetch).toHaveBeenCalledTimes(2);
    });

    it('moves to the next source on a template 404 without downloading that source\'s package', async () => {
        const transport = fakeTransport(() => notFound());
        const nupkg = buildNupkg({ 'Pkg.nuspec': '<package/>', 'README.md': '# from private feed' });
        const flat = fakeFlat(async () => writeScratch(nupkg));
        const extractor = new ReadmeExtractor(transport, flat);

        await expect(extractor.extract([NUGET, PRIVATE], 'Pkg', '1.0.0')).resolves.toBe('# from private feed');
        expect(flat.downloadPackage).toHaveBeenCalledTimes(1);
        expect(flat.downloadPackage).toHaveBeenCalledWith(PRIVATE, 'Pkg', '1.0.0', undefined);

        await expect(extractor.extract([NUGET, PRIVATE], 'Pkg', '1.0.0')).resolves.toBe('# from private feed');
        expect(transport.fetch).toHaveBeenCalledTimes(1);
        expect(flat.downloadPackage).toHaveBeenCalledTimes(1);
    });

    it('also treats an ok 404 pass-through, an empty body and a too-large body as "no README"', async () => {
        const answers: TransportResult[] = [
            okText('', 404),
            okText('   '),
            { ok: false, code: 'too-large', message: 'cap' },
        ];
        const transport = fakeTransport(() => answers.shift() ?? notFound());
        const flat = fakeFlat(async () => undefined);
        const extractor = new ReadmeExtractor(transport, flat);

        await expect(extractor.extract([NUGET], 'A', '1.0.0')).resolves.toBeUndefined();
        await expect(extractor.extract([NUGET], 'B', '1.0.0')).resolves.toBeUndefined();
        await expect(extractor.extract([NUGET], 'C', '1.0.0')).resolves.toBeUndefined();
        expect(flat.downloadPackage).not.toHaveBeenCalled();
        await expect(extractor.extract([NUGET], 'A', '1.0.0')).resolves.toBeUndefined();
        expect(transport.fetch).toHaveBeenCalledTimes(3);
    });

    it('falls back to the archive when the template request fails transiently and does not cache the failure', async () => {
        const answers: TransportResult[] = [
            { ok: false, code: 'network', message: 'ECONNRESET' },
            { ok: true, status: 503, headers: {}, body: Buffer.alloc(0), url: 'u' },
        ];
        const transport = fakeTransport(() => answers.shift() ?? notFound());
        const flat = fakeFlat(async () => undefined);
        const extractor = new ReadmeExtractor(transport, flat);

        await expect(extractor.extract([NUGET], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.downloadPackage).toHaveBeenCalledTimes(1);
        await expect(extractor.extract([NUGET], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.downloadPackage).toHaveBeenCalledTimes(2);
        expect(transport.fetch).toHaveBeenCalledTimes(2);
    });

    it('extracts the nuspec-declared README from a downloaded package and deletes the temp file', async () => {
        const downloaded: string[] = [];
        const nupkg = buildNupkg({
            'Pkg.nuspec': '<package><metadata><readme>docs\\USAGE.md</readme></metadata></package>',
            'README.md': '# root',
            'docs/USAGE.md': '# usage',
        });
        const flat = fakeFlat(async () => {
            const file = await writeScratch(nupkg);
            downloaded.push(file);
            return file;
        });
        const extractor = new ReadmeExtractor(noTransport, flat);

        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBe('# usage');
        expect(downloaded).toHaveLength(1);
        expect(fs.existsSync(downloaded[0])).toBe(false);
        expect(noTransport.fetch).not.toHaveBeenCalled();
    });

    it('caches "no README" for a fully inspected package so the archive is not downloaded twice', async () => {
        const nupkg = buildNupkg({ 'Pkg.nuspec': '<package/>', 'lib/net8.0/Pkg.dll': 'MZ' });
        const flat = fakeFlat(async () => writeScratch(nupkg));
        const extractor = new ReadmeExtractor(noTransport, flat);

        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.downloadPackage).toHaveBeenCalledTimes(1);
    });

    it('does not cache download failures or unreadable archives, and still removes the temp file', async () => {
        const corrupt: string[] = [];
        const outcomes: Array<() => Promise<string | undefined>> = [
            async () => undefined,
            async () => { throw new Error('timeout'); },
            async () => {
                const file = await writeScratch(Buffer.from('not a zip'));
                corrupt.push(file);
                return file;
            },
        ];
        const flat = fakeFlat(async () => (outcomes.shift() ?? (async () => undefined))());
        const extractor = new ReadmeExtractor(noTransport, flat);

        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        expect(flat.downloadPackage).toHaveBeenCalledTimes(3);
        expect(corrupt).toHaveLength(1);
        expect(fs.existsSync(corrupt[0])).toBe(false);
    });

    it('returns a cached text from any allowed source before asking the network', async () => {
        const transport = fakeTransport(() => okText('# nuget'));
        const nupkg = buildNupkg({ 'README.md': '# private' });
        const flat = fakeFlat(async () => writeScratch(nupkg));
        const extractor = new ReadmeExtractor(transport, flat);

        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBe('# private');
        await expect(extractor.extract([NUGET, PRIVATE], 'Pkg', '1.0.0')).resolves.toBe('# private');
        expect(transport.fetch).not.toHaveBeenCalled();
    });

    it('stops without network work when the signal is aborted', async () => {
        const transport = fakeTransport(() => okText('# x'));
        const extractor = new ReadmeExtractor(transport, noFlat);
        const controller = new AbortController();
        controller.abort();

        await expect(extractor.extract([NUGET], 'Pkg', '1.0.0', controller.signal)).resolves.toBeUndefined();
        expect(transport.fetch).not.toHaveBeenCalled();
    });

    it('honours a custom entry cap and cache capacity', async () => {
        const nupkg = buildNupkg({ 'README.md': 'x'.repeat(100) });
        const flat = fakeFlat(async () => writeScratch(nupkg));
        const extractor = new ReadmeExtractor(noTransport, flat, { maxEntryBytes: 10, cacheCapacity: 1 });

        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBeUndefined();
        const small = buildNupkg({ 'README.md': 'short' });
        flat.downloadPackage.mockImplementation(async () => writeScratch(small));
        await expect(extractor.extract([PRIVATE], 'Other', '1.0.0')).resolves.toBe('short');
        await expect(extractor.extract([PRIVATE], 'Pkg', '1.0.0')).resolves.toBe('short');
        expect(flat.downloadPackage).toHaveBeenCalledTimes(3);
    });
});
