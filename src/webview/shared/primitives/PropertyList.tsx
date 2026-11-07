import type React from 'react';
import './primitives.css';

export interface PropertyListProps {
    /** Label–value pairs in display order. A term is one noun and never ends in ':' (DS-COPY-2). */
    items: ReadonlyArray<{ term: string; value: React.ReactNode }>;
    'data-testid'?: string;
}

/**
 * Label–value pairs as a two-column definition list: the terms in a column as wide as the widest of them, the values
 * in one column beside it, so every value starts at one x (DS-ALIGN-1), as the Extensions editor's More Info table. A
 * long value wraps inside its column.
 */
export function PropertyList({ items, 'data-testid': testId }: PropertyListProps): React.JSX.Element {
    return (
        <dl className="nuiget-property-list" data-testid={testId}>
            {items.map(({ term, value }) => [
                <dt key={`${term}-term`} className="nuiget-property-term">{term}</dt>,
                <dd key={`${term}-value`} className="nuiget-property-value">{value}</dd>,
            ])}
        </dl>
    );
}
