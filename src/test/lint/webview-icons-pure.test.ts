import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATED_MARK, readList } from '../../../scripts/sync-codicons.mjs';

/**
 * N63: esbuild keeps a call whose result nobody uses unless the call is marked pure, because the call might have
 * side effects. Unannotated, every `React.memo` icon lands in each bundle that imports the barrel, used or not
 * (17 758 bytes of the sidebar at P3.6; 2 284 with the annotation at P5.1).
 */
const ICONS = 'src/webview/shared/primitives/icons.tsx';

/** A `React.memo` call, with or without type arguments, and what precedes it on its line. */
const MEMO_CALL = /^(.*?)React\.memo\s*(?:<[^>]*>)?\(/;
const PURE = /\/\*\s*[#@]__PURE__\s*\*\/\s*$/;

/** The lines of `source` that call `React.memo` without the pure annotation directly before the call. */
export function unannotatedMemoCalls(source: string): string[] {
    return source.split(/\r?\n/).filter(line => {
        const call = MEMO_CALL.exec(line);
        return call !== null && !PURE.test(call[1]);
    });
}

describe('2.0 webview icons', () => {
    it('every icon is a pure call', () => {
        const source = readFileSync(ICONS, 'utf8');
        expect(unannotatedMemoCalls(source)).toEqual([]);
        // The check has something to look at: one call per exported icon.
        const calls = source.split(/\r?\n/).filter(line => MEMO_CALL.test(line));
        expect(calls).toHaveLength((source.match(/^export const \w+Icon = /gm) ?? []).length);
        // The generated module holds the icon plan's count; the hand-drawn one its 26 until UX-P1.4b.
        expect(calls).toHaveLength(source.startsWith(GENERATED_MARK) ? Object.keys(readList().icons).length : 26);
    });

    it('the scanner finds planted defects and accepts the annotation', () => {
        const planted = [
            'export const AIcon = React.memo<IconProps>(({ size }) => null);',
            'export const BIcon = React.memo(({ size }) => null);',
            'export const CIcon = /* @__PURE__ */ React.memo<IconProps>(({ size }) => null);',
            'export const DIcon = /*#__PURE__*/ React.memo(({ size }) => null);',
            '/* @__PURE__ */ export const EIcon = React.memo(({ size }) => null);',
        ].join('\n');
        expect(unannotatedMemoCalls(planted)).toEqual([
            'export const AIcon = React.memo<IconProps>(({ size }) => null);',
            'export const BIcon = React.memo(({ size }) => null);',
            '/* @__PURE__ */ export const EIcon = React.memo(({ size }) => null);',
        ]);
    });
});
