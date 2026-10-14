/**
 * Benchmarks for the 2.0 transport (`src/core/http`): a small JSON document and a gzip-compressed one over
 * HTTP/1.1 from a local server, the path every feed request takes when no HTTP/2 origin applies. No agent is
 * passed (ADR-005), so these numbers include a new connection per request wherever the host's Node does not
 * keep the global agent alive.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as zlib from 'zlib';
import { afterAll, beforeAll, describe, test } from 'vitest';
import * as httpModule from '../../core/http';
import { runBenchmark } from './benchmark';

// Bound once on purpose (see core-cache.bench.ts): an imported binding is a getter under Vitest's module runner.
const { NodeTransport } = httpModule;

const SMALL = JSON.stringify({ version: '3.0.0', resources: Array.from({ length: 12 }, (_, index) => ({ '@id': `https://api.nuget.org/v3/r${index}/`, '@type': 'SearchQueryService' })) });
const LARGE = zlib.gzipSync(Buffer.from(JSON.stringify({ data: Array.from({ length: 2_000 }, (_, index) => ({ id: `Package.${index}`, version: '1.0.0', description: 'x'.repeat(80) })) })));

describe('core transport — HTTP/1.1 from a local server', () => {
    let server: http.Server;
    let origin = '';
    const transport = new NodeTransport({ proxy: { isConfigured: () => false }, http2Origins: [], allowLoopback: true });

    beforeAll(async () => {
        server = http.createServer((request, response) => {
            if (request.url === '/large') {
                response.setHeader('content-encoding', 'gzip');
                response.end(LARGE);
                return;
            }
            response.end(SMALL);
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        transport.dispose();
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    test('fetchJson service index (1 KB)', async (context) => {
        await runBenchmark(context, 'fetchJson service index (1 KB)', async () => {
            await transport.fetchJson({ url: `${origin}/index.json` });
        });
    });

    test('fetchJson gzip document (about 250 KB decoded)', async (context) => {
        await runBenchmark(context, 'fetchJson gzip document (about 250 KB decoded)', async () => {
            await transport.fetchJson({ url: `${origin}/large`, acceptCompressed: true });
        });
    });
});
