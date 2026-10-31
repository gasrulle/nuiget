import { render } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Row, type RowProps } from './Row';

const renders = vi.hoisted(() => ({ count: 0 }));

// A memo that bails out renders nothing a Profiler can tell apart (it reports the parent's commit), so the row's one
// useRef counts its renders.
vi.mock('react', async importOriginal => {
    const actual = await importOriginal<typeof import('react')>();
    const useRef = ((initial: unknown) => {
        renders.count++;
        return actual.useRef(initial);
    }) as typeof actual.useRef;
    return { ...actual, default: { ...actual, useRef }, useRef };
});

const props: RowProps = { itemId: 'Serilog', name: 'Serilog', version: '3.0.0', density: 'compact', index: 0, setSize: 1, active: true, selected: false, optionId: 'memo-0', offset: 0 };

describe('Row and its memo', () => {
    it('a row renders again only when a prop changes (X38)', () => {
        const held = new Map<string, RowProps>();
        const stable = (name: string): RowProps => {
            const kept = held.get(name) ?? { ...props, name };
            held.set(name, kept);
            return kept;
        };
        const Parent = ({ tick, name }: { tick: number; name: string }): React.JSX.Element => <div role="listbox" aria-label="Packages" data-tick={tick}><Row {...stable(name)} /></div>;
        const { rerender } = render(<Parent tick={0} name="Serilog" />);
        const first = renders.count;
        expect(first).toBeGreaterThan(0);
        rerender(<Parent tick={1} name="Serilog" />);
        expect(renders.count).toBe(first);
        rerender(<Parent tick={2} name="Moq" />);
        expect(renders.count).toBeGreaterThan(first);
    });
});
