import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveArtboards } from '../../../scripts/serve-artboards.mjs';

/** UX-P0.27a: `scripts/serve-artboards.mjs`, the static server the artboard export opens artboards from. */
describe('scripts/serve-artboards.mjs', () => {
    let parent = '';
    let dir = '';
    let close = (): void => undefined;

    beforeEach(() => {
        // The served root inside a folder that holds a file the server must never answer.
        parent = mkdtempSync(path.join(tmpdir(), 'nuiget-serve-'));
        dir = path.join(parent, 'root');
        mkdirSync(dir);
        writeFileSync(path.join(parent, 'outside.txt'), 'outside');
        mkdirSync(path.join(dir, 'artboards'));
        mkdirSync(path.join(dir, 'themes'));
        writeFileSync(path.join(dir, 'artboards', 'a.html'), '<!doctype html><link href="../themes/t.css">');
        writeFileSync(path.join(dir, 'themes', 't.css'), ':root { --x: 1px; }');
    });

    afterEach(() => {
        close();
        rmSync(parent, { recursive: true, force: true });
    });

    /** GETs a raw path (no URL normalisation), so a `..` reaches the server as sent. */
    const get = (url: string, rawPath: string): Promise<{ status: number; type: string | undefined; body: string }> => new Promise((resolve, reject) => {
        const { port } = new URL(url);
        request({ host: '127.0.0.1', port, path: rawPath }, response => {
            let body = '';
            response.on('data', chunk => (body += String(chunk)));
            response.on('end', () => resolve({ status: response.statusCode ?? 0, type: response.headers['content-type'], body }));
        }).on('error', reject).end();
    });

    it('serves the files under its root on 127.0.0.1 with their content types, and a sibling folder through ..', async () => {
        const { server, url } = await serveArtboards(dir);
        close = () => server.close();
        expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(await get(url, '/artboards/a.html')).toMatchObject({ status: 200, type: 'text/html; charset=utf-8' });
        // An artboard's relative theme link resolves inside the root.
        expect(await get(url, '/artboards/../themes/t.css')).toMatchObject({ status: 200, type: 'text/css; charset=utf-8', body: ':root { --x: 1px; }' });
    });

    it('answers 404 for a missing file and for any path outside its root', async () => {
        const { server, url } = await serveArtboards(dir);
        close = () => server.close();
        expect((await get(url, '/artboards/missing.html')).status).toBe(404);
        expect((await get(url, '/../outside.txt')).status).toBe(404);
        expect((await get(url, '/%2e%2e/outside.txt')).status).toBe(404);
        // URL parsing keeps an encoded slash: only the containment check stops it.
        expect((await get(url, '/..%2foutside.txt')).status).toBe(404);
    });

    it('prints its URL as the first line when run as a script, as the export suite reads it', async () => {
        const child = spawn(process.execPath, [path.resolve('scripts/serve-artboards.mjs'), dir], { stdio: ['ignore', 'pipe', 'inherit'] });
        close = () => child.kill();
        const line = await new Promise<string>(resolve => child.stdout.once('data', chunk => resolve(String(chunk).split('\n')[0])));
        expect(line).toMatch(/^serve-artboards: http:\/\/127\.0\.0\.1:\d+\/$/);
        expect((await get(line.replace('serve-artboards: ', ''), '/artboards/a.html')).status).toBe(200);
    });
});
