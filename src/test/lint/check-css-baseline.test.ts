import { execFileSync } from 'child_process';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { entriesFor, formatEntry, itemId } from '../../../scripts/check-css-baseline.mjs';

/**
 * UX-P0.21: `scripts/check-css-baseline.mjs --item <ID>`, G-UI step 1's count of the CSS lint gate's baseline entries an
 * item still owns (`css-audit.test.ts`): `0 entries` closes a screen or primitive item. The test reads a fixture
 * baseline, never the live one, whose entries the items remove.
 */
const root = path.resolve(__dirname, '../../..');
const script = path.join(root, 'scripts/check-css-baseline.mjs');
const fixture = path.join(root, 'src/test/lint/__fixtures__/check-css-baseline.json');

/** The CLI's exit code and output. */
function run(...args: string[]): { status: number; out: string } {
    try {
        return { status: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' }) };
    } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string };
        return { status: failure.status, out: failure.stdout + failure.stderr };
    }
}

describe('check-css-baseline (UX-P0.21)', () => {
    it('reads plan item ids with or without the UX- prefix', () => {
        expect(itemId('P2.5')).toBe('P2.5');
        expect(itemId('UX-P2.1e')).toBe('P2.1e');
        expect(itemId('2.5')).toBeUndefined();
        expect(itemId(undefined)).toBeUndefined();
    });

    it('lists the entries labelled with an item, as the lint prints them', () => {
        const entries = [{ item: 'P9.1', n: 1 }, { item: 'P9.2', n: 2 }, { item: 'P9.1', n: 3 }];
        expect(entriesFor(entries, 'P9.1')).toEqual([{ item: 'P9.1', n: 1 }, { item: 'P9.1', n: 3 }]);
        expect(entriesFor(entries, 'P9.3')).toEqual([]);
        expect(formatEntry({ file: 'a.css', rule: 'specificity', selector: '.a .b .c', property: null, value: '(0,3,0)' })).toBe('a.css  specificity  .a .b .c  (0,3,0)');
        expect(formatEntry({ file: 'a.css', rule: 'pxLength', selector: '.a', property: 'width', value: '3px' })).toBe('a.css  pxLength  .a  width: 3px');
    });

    it('exits 0 with 0 entries for an item that owns none, 1 while entries are left, 2 for a wrong usage', () => {
        const clear = run('--item', 'P9.3', '--baseline', fixture);
        expect(clear).toMatchObject({ status: 0 });
        expect(clear.out).toContain('check-css-baseline: 0 entries for P9.3');
        const left = run('--item', 'UX-P9.1', '--baseline', fixture);
        expect(left.status).toBe(1);
        expect(left.out).toContain('check-css-baseline: 2 entries for P9.1');
        expect(left.out).toContain('src/webview/main/main.css  specificity  .nuiget-a .nuiget-b .nuiget-c  (0,3,0)');
        expect(left.out).not.toContain('.nuiget-d');
        expect(run().status).toBe(2);
        expect(run('--item', 'two').status).toBe(2);
        expect(run('--item', 'P9.1', '--baseline').status).toBe(2);
    });

    it('reads the gate\'s own baseline by default', () => {
        const live = run('--item', 'P0.21');
        expect(live).toMatchObject({ status: 0 });
        expect(live.out).toContain('check-css-baseline: 0 entries for P0.21');
    });
});
