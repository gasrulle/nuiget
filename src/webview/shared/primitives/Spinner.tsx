import type React from 'react';
import { LoadingIcon } from './icons';
import './primitives.css';

export interface SpinnerProps {
    /** Names the spinner when nothing next to it says what is in progress. Without it the spinner is decoration. */
    label?: string;
    size?: number;
}

/** A turning icon. It turns for as long as the duration tokens allow: not at all under reduced motion. */
export function Spinner({ label, size }: SpinnerProps): React.JSX.Element {
    return (
        <span className="nuiget-spinner">
            <LoadingIcon title={label} size={size} />
        </span>
    );
}
