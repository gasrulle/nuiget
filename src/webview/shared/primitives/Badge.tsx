import type React from 'react';
import './primitives.css';

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'error';

export interface BadgeProps {
    /** The short visible text, for example "CPM" or a count. */
    label: string;
    /** What the badge means, in words. When given, assistive technology reads this in place of the label. */
    title?: string;
    tone?: BadgeTone;
}

/** A small label next to a name. No role and no `aria-label`: a span may not carry one; the words are text. */
export function Badge({ label, title, tone = 'neutral' }: BadgeProps): React.JSX.Element {
    return (
        <span className={`nuiget-badge nuiget-badge--${tone}`}>
            {title === undefined ? label : (
                <>
                    <span aria-hidden="true">{label}</span>
                    <span className="nuiget-visually-hidden">{title}</span>
                </>
            )}
        </span>
    );
}
