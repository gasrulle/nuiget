import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBulkSelection } from './useBulkSelection';

const ids = (...names: string[]): string[] => names;

describe('useBulkSelection', () => {
    it('toggles a candidate and refuses any other id without a change', () => {
        const candidates = ids('a', 'b');
        const { result } = renderHook(() => useBulkSelection(candidates));
        let answer = false;
        act(() => { answer = result.current.toggle('a'); });
        expect(answer).toBe(true);
        expect([...result.current.selected]).toEqual(['a']);
        expect(result.current.count).toBe(1);
        act(() => { answer = result.current.toggle('busy'); });
        expect(answer).toBe(false);
        expect([...result.current.selected]).toEqual(['a']);
        act(() => { result.current.toggle('a'); });
        expect(result.current.count).toBe(0);
    });

    it('selects every candidate, clears when all are in, and reads no candidates as not all selected', () => {
        const candidates = ids('a', 'b');
        const { result, rerender } = renderHook(({ list }) => useBulkSelection(list), { initialProps: { list: candidates } });
        act(() => result.current.selectAll());
        expect(result.current.allSelected).toBe(true);
        expect(result.current.count).toBe(2);
        act(() => result.current.selectAll());
        expect(result.current.count).toBe(0);
        act(() => result.current.selectAll());
        act(() => result.current.clear());
        expect(result.current.count).toBe(0);
        rerender({ list: [] });
        expect(result.current.allSelected).toBe(false);
    });

    it('a row that leaves the candidates leaves the set for good, and a new reset key clears it', () => {
        const { result, rerender } = renderHook(({ list, key }) => useBulkSelection(list, key), { initialProps: { list: ids('a', 'b'), key: 'one' as string } });
        act(() => result.current.selectAll());
        rerender({ list: ids('b'), key: 'one' });
        expect([...result.current.selected]).toEqual(['b']);
        expect(result.current.allSelected).toBe(true);
        rerender({ list: ids('a', 'b'), key: 'one' });
        expect([...result.current.selected]).toEqual(['b']);
        rerender({ list: ids('a', 'b'), key: 'two' });
        expect(result.current.count).toBe(0);
    });
});
