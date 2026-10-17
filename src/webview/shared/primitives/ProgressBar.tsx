import type React from 'react';
import { cssVars } from './cssVars';
import './primitives.css';

export interface ProgressBarProps {
    /** What is in progress, for example "Refreshing installed packages". */
    label: string;
    /** Percent done, 0 to 100. Leave it out when the amount of work is unknown. */
    value?: number;
}

/** A thin bar for work in progress: a known share when `value` is given, a moving stripe when it is not. */
export function ProgressBar({ label, value }: ProgressBarProps): React.JSX.Element {
    const percent = value === undefined ? undefined : Math.min(100, Math.max(0, value));
    return (
        <div
            className={percent === undefined ? 'nuiget-progress nuiget-progress--indeterminate' : 'nuiget-progress'}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
        >
            <div className="nuiget-progress-bar" style={percent === undefined ? undefined : cssVars({ '--nuiget-progress-value': `${percent}%` })} />
        </div>
    );
}
