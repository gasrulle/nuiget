import { describe, expect, it } from 'vitest';
import { directCount } from './counts';

describe('directCount (DS-COPY-5, UX-P3.7b)', () => {
    it('is the total without a filter and "k of N" with one, "0 of N" included', () => {
        expect(directCount(15, 15, false)).toBe(15);
        expect(directCount(15, 2, true)).toBe('2 of 15');
        expect(directCount(15, 0, true)).toBe('0 of 15');
    });
});
