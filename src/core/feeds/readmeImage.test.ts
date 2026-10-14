import { describe, expect, it, vi } from 'vitest';
import { MAX_README_IMAGE_BYTES, ReadmeImageFetcher } from './readmeImage';
import { FakeTransport, fail, ok, silentLogger } from './testSupport';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const PNG_URI = `data:image/png;base64,${PNG.toString('base64')}`;
const SOURCE = 'https://pkgs.example.com/feed/v3/index.json';

function pngTransport(): FakeTransport {
    return new FakeTransport(() => ok(PNG, { 'content-type': 'image/png' }));
}

describe('ReadmeImageFetcher', () => {
    it('returns a data URI for an https image under the cap, using the declared image type', async () => {
        const transport = new FakeTransport(() => ok(PNG, { 'Content-Type': 'image/gif; charset=binary' }));
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger, timeoutMs: 1234 });

        await expect(fetcher.fetch('https://img.example.com/logo.png')).resolves.toBe(`data:image/gif;base64,${PNG.toString('base64')}`);
        expect(transport.requests).toHaveLength(1);
        expect(transport.requests[0]).toMatchObject({ url: 'https://img.example.com/logo.png', maxBytes: MAX_README_IMAGE_BYTES, timeoutMs: 1234 });
    });

    it('sniffs the image type when the server declares an octet stream', async () => {
        const transport = new FakeTransport(() => ok(PNG, { 'content-type': 'application/octet-stream' }));
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger });

        await expect(fetcher.fetch('https://img.example.com/logo')).resolves.toBe(PNG_URI);
    });

    it('answers null without a request for an http:, data: or malformed URL', async () => {
        const transport = pngTransport();
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger });

        await expect(fetcher.fetch('http://img.example.com/logo.png')).resolves.toBeNull();
        await expect(fetcher.fetch(PNG_URI)).resolves.toBeNull();
        await expect(fetcher.fetch('not a url')).resolves.toBeNull();
        await expect(fetcher.fetch('file:///etc/passwd')).resolves.toBeNull();
        expect(transport.urls()).toEqual([]);
    });

    it('answers null without a request for a loopback, private or link-local IP literal and for localhost names', async () => {
        const transport = pngTransport();
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger });
        const refused = [
            'https://127.0.0.1/a.png',
            'https://10.1.2.3/a.png',
            'https://192.168.0.10:8443/a.png',
            'https://169.254.169.254/latest/meta-data',
            'https://[::1]/a.png',
            'https://[fe80::1]/a.png',
            'https://[::ffff:10.0.0.1]/a.png',
            'https://0.0.0.0/a.png',
            'https://localhost/a.png',
            'https://intranet.localhost./a.png',
        ];

        for (const url of refused) {
            await expect(fetcher.fetch(url), url).resolves.toBeNull();
        }
        expect(transport.urls()).toEqual([]);

        await expect(fetcher.fetch('https://93.184.216.34/a.png')).resolves.toBe(PNG_URI);
        expect(transport.urls()).toEqual(['https://93.184.216.34/a.png']);
    });

    it('sends the source credential only to the source\'s own origin', async () => {
        const transport = pngTransport();
        const getAuthHeader = vi.fn(async (sourceUrl: string) => (sourceUrl === SOURCE ? 'Basic c2VjcmV0' : undefined));
        const fetcher = new ReadmeImageFetcher(transport, { getAuthHeader, logger: silentLogger });

        await expect(fetcher.fetch('https://pkgs.example.com/images/logo.png', SOURCE)).resolves.toBe(PNG_URI);

        expect(getAuthHeader).toHaveBeenCalledWith(SOURCE);
        expect(transport.requests[0].headers).toEqual({ authorization: 'Basic c2VjcmV0' });
    });

    it('sends no credential to another origin, and none without a sourceUrl', async () => {
        const transport = pngTransport();
        const getAuthHeader = vi.fn(async () => 'Basic c2VjcmV0');
        const fetcher = new ReadmeImageFetcher(transport, { getAuthHeader, logger: silentLogger });

        await fetcher.fetch('https://cdn.example.net/logo.png', SOURCE);
        await fetcher.fetch('https://pkgs.example.com:8443/logo.png', SOURCE);
        await fetcher.fetch('https://pkgs.example.com/other.png');

        expect(transport.requests).toHaveLength(3);
        for (const request of transport.requests) {
            expect(request.headers).toEqual({});
        }
        expect(getAuthHeader).not.toHaveBeenCalled();
    });

    it('answers null for an oversized, empty or non-image body such as an HTML login page', async () => {
        const answers = new Map([
            ['https://img.example.com/big.png', fail('too-large')],
            ['https://img.example.com/huge.png', ok(Buffer.concat([PNG, Buffer.alloc(MAX_README_IMAGE_BYTES)]), { 'content-type': 'image/png' })],
            ['https://img.example.com/empty.png', ok(Buffer.alloc(0), { 'content-type': 'image/png' })],
            ['https://img.example.com/login', ok('<!doctype html><title>Sign in</title>', { 'content-type': 'text/html' })],
            ['https://img.example.com/unknown', ok('just text', { 'content-type': 'application/octet-stream' })],
        ]);
        const transport = new FakeTransport(request => answers.get(request.url) ?? fail('network'));
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger });

        for (const url of answers.keys()) {
            await expect(fetcher.fetch(url), url).resolves.toBeNull();
        }
        expect(transport.urls()).toEqual([...answers.keys()]);

        for (const url of answers.keys()) {
            await expect(fetcher.fetch(url), url).resolves.toBeNull();
        }
        expect(transport.urls()).toEqual([...answers.keys(), ...answers.keys()]);
    });

    it('answers null on a transport failure or redirect-blocked and caches nothing, so the next call asks again', async () => {
        const failures = [fail('network'), fail('timeout'), fail('redirect-blocked'), fail('too-many-redirects'), fail('http-error', 503), ok(PNG, { 'content-type': 'image/png' }, 304)];
        let next = 0;
        const transport = new FakeTransport(() => failures[next++] ?? ok(PNG, { 'content-type': 'image/png' }));
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger });
        const url = 'https://img.example.com/flaky.png';

        for (let i = 0; i < failures.length; i++) {
            await expect(fetcher.fetch(url)).resolves.toBeNull();
        }
        await expect(fetcher.fetch(url)).resolves.toBe(PNG_URI);
        expect(transport.urls()).toHaveLength(failures.length + 1);
    });

    it('serves a cached data URI without touching the network and evicts beyond the capacity', async () => {
        const transport = pngTransport();
        const fetcher = new ReadmeImageFetcher(transport, { cacheCapacity: 2, logger: silentLogger });

        await fetcher.fetch('https://img.example.com/a.png');
        await fetcher.fetch('https://img.example.com/b.png');
        await expect(fetcher.fetch('https://img.example.com/a.png')).resolves.toBe(PNG_URI);
        expect(transport.urls()).toHaveLength(2);

        await fetcher.fetch('https://img.example.com/c.png');
        await fetcher.fetch('https://img.example.com/a.png');
        expect(transport.urls()).toHaveLength(3);
        await fetcher.fetch('https://img.example.com/b.png');
        expect(transport.urls()).toEqual(['https://img.example.com/a.png', 'https://img.example.com/b.png', 'https://img.example.com/c.png', 'https://img.example.com/b.png']);

        fetcher.clear();
        await fetcher.fetch('https://img.example.com/a.png');
        expect(transport.urls()).toHaveLength(5);
    });

    it('answers null without a request when the signal is already aborted', async () => {
        const transport = pngTransport();
        const fetcher = new ReadmeImageFetcher(transport, { logger: silentLogger });
        const controller = new AbortController();
        controller.abort();

        await expect(fetcher.fetch('https://img.example.com/a.png', undefined, controller.signal)).resolves.toBeNull();
        expect(transport.urls()).toEqual([]);

        const live = new AbortController();
        await expect(fetcher.fetch('https://img.example.com/a.png', undefined, live.signal)).resolves.toBe(PNG_URI);
        expect(transport.requests[0].signal).toBe(live.signal);

        await expect(fetcher.fetch('https://img.example.com/a.png', undefined, controller.signal)).resolves.toBeNull();
    });
});
