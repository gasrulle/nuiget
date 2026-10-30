import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, generateModule, GENERATED_MARK, parseSvg, readCodicon, readList, write } from '../../../scripts/sync-codicons.mjs';

/**
 * DS-ICON-1 (UX-P1.4a, ADR-012): the icon plan `docs/design/icons.json` names drawings of the pinned `@vscode/codicons`
 * release, each with a product file that renders it, and `icons.tsx` is what the script generates from them.
 */
const ICONS = 'src/webview/shared/primitives/icons.tsx';
const list = readList() as { release: string; icons: Record<string, string> };
const module_ = readFileSync(ICONS, 'utf8').replace(/\r\n/g, '\n');

/** The 2.0 product sources: no test, no barrel, no test support, not the icon module itself. */
function productSources(dir = 'src/webview'): string[] {
    return readdirSync(dir).flatMap(entry => {
        const file = path.join(dir, entry);
        if (statSync(file).isDirectory()) {
            return productSources(file);
        }
        const skipped = !/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry) || entry === 'testSupport.ts' || entry === 'testSupport.tsx'
            || file.split(path.sep).join('/') === ICONS || file.split(path.sep).join('/') === 'src/webview/shared/primitives/index.ts';
        return skipped ? [] : [readFileSync(file, 'utf8')];
    });
}

describe('2.0 webview icons against the codicon release (DS-ICON-1)', () => {
    it('pins one exact release, the installed one', () => {
        const pinned = (JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies: Record<string, string> }).devDependencies['@vscode/codicons'];
        const installed = (JSON.parse(readFileSync('node_modules/@vscode/codicons/package.json', 'utf8')) as { version: string }).version;
        expect(pinned).toBe(list.release);
        expect(installed).toBe(list.release);
    });

    it('every entry of the icon plan names a drawing of the release made of paths', () => {
        expect(Object.keys(list.icons).length).toBeGreaterThan(0);
        for (const file of Object.values(list.icons)) {
            expect(readCodicon(file).paths.length, file).toBeGreaterThan(0);
        }
    });

    it('every entry of the icon plan is rendered by a product file', () => {
        const sources = productSources();
        expect(sources.length).toBeGreaterThan(0);
        expect(Object.keys(list.icons).filter(name => !sources.some(source => new RegExp(`\\b${name}\\b`).test(source)))).toEqual([]);
    });

    it('the parser refuses what it cannot keep verbatim, by name', () => {
        const svg = (body: string, root = '') => `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"${root}>${body}</svg>`;
        expect(parseSvg('a', svg('<path fill-rule="evenodd" clip-rule="evenodd" d="M0 0"/><path d="M1 1"/>'))).toEqual({
            viewBox: '0 0 16 16',
            paths: [{ 'fill-rule': 'evenodd', 'clip-rule': 'evenodd', d: 'M0 0' }, { d: 'M1 1' }],
        });
        expect(() => parseSvg('grouped', svg('<g><path d="M0 0"/></g>'))).toThrow('grouped: <g> is not a path');
        expect(() => parseSvg('stroked', svg('<path d="M0 0" stroke="red"/>'))).toThrow('stroked: <path> attribute stroke');
        expect(() => parseSvg('clipped', svg('<path d="M0 0" clip-path="url(#a)"/>'))).toThrow('clipped: <path> attribute clip-path');
        expect(() => parseSvg('round', svg('<circle r="1"/>'))).toThrow('round: <circle> is not a path');
        expect(() => parseSvg('moved', svg('<path d="M0 0"/>', ' transform="scale(2)"'))).toThrow('moved: <svg> attribute transform');
        expect(() => parseSvg('empty', svg(''))).toThrow('empty: no <path>');
        // A tag the attribute reader cannot read is refused too, never skipped: a digit in a name, single quotes, a bare word.
        expect(() => parseSvg('line', svg('<path d="M0 0"/><line x1="0" y1="0" x2="1" y2="1"/>'))).toThrow('line: <line> is not a path');
        expect(() => parseSvg('quoted', svg("<path d='M0 0' stroke='red'/>"))).toThrow('quoted: <path> attribute stroke');
        expect(() => parseSvg('rect', svg("<path d=\"M0 0\"/><rect x='1'/>"))).toThrow('rect: <rect> is not a path');
        expect(() => parseSvg('bare', svg('<path d="M0 0" hidden/>'))).toThrow('bare: <path> has an attribute the generator cannot read');
        expect(() => readCodicon('no-such-codicon')).toThrow('no-such-codicon: not in the installed');
    });

    it('the generation keeps each viewBox and path verbatim, in list order, as a pure component without a style', () => {
        const text = generateModule({ release: '1.2.3', icons: { BIcon: 'b', AIcon: 'a' } }, file => (file === 'b'
            ? { viewBox: '0 0 24 24', paths: [{ d: 'M2 2', 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' }] }
            : { viewBox: '0 0 16 16', paths: [{ d: 'M1 1' }, { d: 'M3 3' }] }));
        expect(text.startsWith(`${GENERATED_MARK} from @vscode/codicons 1.2.3; do not edit. Code MIT; drawings CC-BY-4.0`)).toBe(true);
        expect(text.indexOf('export const BIcon = /* @__PURE__ */ React.memo<IconProps>')).toBeLessThan(text.indexOf('export const AIcon = /* @__PURE__ */ React.memo<IconProps>'));
        expect(text).toContain('viewBox="0 0 24 24"');
        expect(text).toContain('<path fillRule="evenodd" clipRule="evenodd" d="M2 2" />');
        expect(text).toContain('<path d="M1 1" />');
        expect(text).toContain('<path d="M3 3" />');
        expect(text).not.toContain('style');
    });

    it('--check reads the release, the list and the module', () => {
        const sample = { release: '1.2.3', icons: { AIcon: 'a' } };
        const read = () => ({ viewBox: '0 0 16 16', paths: [{ d: 'M1 1' }] });
        const generation = generateModule(sample, read);
        expect(() => check({ list: sample, installed: '1.2.4', module: generation, read })).toThrow('docs/design/icons.json names 1.2.3, the installed release is 1.2.4');
        expect(check({ list: sample, installed: '1.2.3', module: generation, read })).toEqual(['1 icons match @vscode/codicons 1.2.3']);
        expect(check({ list: sample, installed: '1.2.3', module: generation.replace(/\n/g, '\r\n'), read })).toEqual(['1 icons match @vscode/codicons 1.2.3']);
        expect(() => check({ list: sample, installed: '1.2.3', module: generation.replace('M1 1', 'M2 2'), read })).toThrow('differs from the generation');
        expect(() => check({ list: sample, installed: '1.2.3', module: 'export const AIcon = null;', read })).toThrow('does not carry the generator\'s header');
    });

    it('--write writes the generation', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'nuiget-icons-'));
        try {
            const target = path.join(dir, 'icons.tsx');
            const sample = { release: '1.2.3', icons: { AIcon: 'a' } };
            const read = () => ({ viewBox: '0 0 16 16', paths: [{ d: 'M1 1' }] });
            write({ list: sample, target, read });
            expect(readFileSync(target, 'utf8')).toBe(generateModule(sample, read));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('icons.tsx is the generation, and exports the icon plan and nothing else', () => {
        expect(module_).toBe(generateModule(list));
        expect(module_.match(/data-codicon="/g)).toHaveLength(Object.keys(list.icons).length);
        expect(module_).not.toContain('/** Custom:');
        expect([...module_.matchAll(/^export const (\w+Icon) = /gm)].map(match => match[1])).toEqual(Object.keys(list.icons));
    });
});
