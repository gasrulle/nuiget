import { useCallback, useMemo, useState } from 'react';

export interface BulkSelection {
    selected: ReadonlySet<string>;
    /** Flips a candidate and returns `true`; for any other id changes nothing and returns `false`, and the feature says why. */
    toggle: (id: string) => boolean;
    /** Selects every candidate, or clears when every candidate is already in. */
    selectAll: () => void;
    clear: () => void;
    allSelected: boolean;
    count: number;
}

const NOTHING: ReadonlySet<string> = new Set();

/**
 * The one owner of a list's bulk set (UX-P2.1c). The set is always a subset of `candidates`, the row ids a bulk action may
 * take (shown, applicable, not busy): a row that leaves them leaves the set, and does not come back with them. A change of
 * `resetKey` (the project selection, a new listing) clears it.
 */
export function useBulkSelection(candidates: readonly string[], resetKey?: unknown): BulkSelection {
    const [held, setHeld] = useState<ReadonlySet<string>>(NOTHING);
    const [heldKey, setHeldKey] = useState(resetKey);
    const allowed = useMemo(() => new Set(candidates), [candidates]);
    let selected = held;
    if (!Object.is(heldKey, resetKey)) {
        selected = NOTHING;
        setHeldKey(resetKey);
    } else if ([...held].some(id => !allowed.has(id))) {
        selected = new Set([...held].filter(id => allowed.has(id)));
    }
    if (selected !== held) {
        setHeld(selected);
    }

    const toggle = useCallback((id: string): boolean => {
        if (!allowed.has(id)) {
            return false;
        }
        setHeld(previous => {
            const next = new Set(previous);
            if (!next.delete(id)) {
                next.add(id);
            }
            return next;
        });
        return true;
    }, [allowed]);
    const selectAll = useCallback((): void => {
        setHeld(previous => ([...allowed].every(id => previous.has(id)) ? NOTHING : new Set(allowed)));
    }, [allowed]);
    const clear = useCallback((): void => setHeld(NOTHING), []);

    return { selected, toggle, selectAll, clear, allSelected: candidates.length > 0 && candidates.every(id => selected.has(id)), count: selected.size };
}
