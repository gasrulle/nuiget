// Serves a folder on 127.0.0.1 for the artboard export: node scripts/serve-artboards.mjs [root] [port]
//
// The artboard export suite (UX-P0.27a, `src/test/ui/v2/capture/zz-artboards.ui.test.ts`) opens the artboards in VS
// Code's integrated browser from this server; `docs/design/export-method.md` is the route. `root` defaults to
// `docs/design` (so an artboard's `../../themes/<slug>.css` resolves), `port` to 0 (the system picks one). The first line
// on stdout is `serve-artboards: http://127.0.0.1:<port>/`. Only files under `root` are served; anything else is 404.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

/** Starts the server; resolves with it and its URL once it listens. */
export function serveArtboards(root, port = 0) {
    const base = path.resolve(root);
    const server = createServer(async (request, response) => {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
        const file = path.resolve(base, '.' + pathname);
        // Joined, then checked: the resolved path must stay under the root.
        if (file !== base && !file.startsWith(base + path.sep)) {
            response.writeHead(404).end();
            return;
        }
        try {
            const body = await readFile(file);
            response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [root = 'docs/design', port = '0'] = process.argv.slice(2);
    const { url } = await serveArtboards(root, Number(port));
    console.log(`serve-artboards: ${url}`);
}
