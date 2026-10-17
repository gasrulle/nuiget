import type React from 'react';
import './primitives.css';

export interface EmptyStateProps {
    /** One sentence, for example "No packages installed". */
    message: string;
    /** The one thing to do about it, if there is one. */
    action?: { label: string; onClick: () => void };
    'data-testid'?: string;
}

/**
 * What a list or a details area shows when it has nothing to show. It has no role and takes no focus: inside
 * a `Listbox` the container around it is the focus target, and the sentence is read from there.
 */
export function EmptyState({ message, action, 'data-testid': testId }: EmptyStateProps): React.JSX.Element {
    return (
        <div className="nuiget-empty" data-testid={testId}>
            <p className="nuiget-empty-text">{message}</p>
            {action ? <button type="button" className="nuiget-button" onClick={action.onClick}>{action.label}</button> : null}
        </div>
    );
}
