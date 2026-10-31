import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Newline terminators, the number `wc -l` prints, the same on a CRLF checkout. */
export function countLines(text: string): number {
    return (text.match(/\n/g) ?? []).length;
}

describe('the size of the shell (CA-R3, ADR-008)', () => {
    it('MainShell.tsx has fewer than 300 lines (CA-R3, ADR-008)', () => {
        expect(countLines(readFileSync('src/webview/main/MainShell.tsx', 'utf8'))).toBeLessThan(300);
    });

    it('counts terminators, on a CRLF checkout too', () => {
        expect(countLines('a\nb\n')).toBe(2);
        expect(countLines('a\r\nb\r\n')).toBe(2);
        expect(countLines('a\nb')).toBe(1);
    });
});
