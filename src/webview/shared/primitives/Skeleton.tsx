import type React from 'react';
import './primitives.css';

export interface SkeletonProps {
    /** How many placeholder rows. */
    rows?: number;
    density: 'compact' | 'comfortable';
}

/**
 * Placeholder rows for a list that has no data yet. Decoration only: it says nothing to assistive technology
 * and is no live region. The words "Loading …" are a message of the surface's `LiveStatus`.
 */
export function Skeleton({ rows = 3, density }: SkeletonProps): React.JSX.Element {
    return (
        <div className="nuiget-skeleton" aria-hidden="true">
            {Array.from({ length: rows }, (_, index) => <div key={index} className={`nuiget-skeleton-row nuiget-skeleton-row--${density}`} />)}
        </div>
    );
}
