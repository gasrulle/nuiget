import type React from 'react';
import { Button } from './Button';
import { InfoIcon, WarningIcon } from './icons';
import './primitives.css';

export type BannerSeverity = 'info' | 'warning' | 'error';

export interface BannerProps {
    severity: BannerSeverity;
    /** The message. */
    children: React.ReactNode;
    /** The one thing to do about it, for example "Retry". */
    action?: { label: string; onClick: () => void };
    'data-testid'?: string;
}

const SPOKEN: Record<BannerSeverity, string> = { info: 'Info', warning: 'Warning', error: 'Error' };

/**
 * A message that stays on the page until its cause is gone, for example "Sources unreachable". It is announced
 * when it appears: an error at once (`role="alert"`), anything else when the screen reader is idle
 * (`role="status"`). The severity is said in words before the message; colour and icon alone say nothing to
 * someone who cannot see them.
 */
export function Banner({ severity, children, action, 'data-testid': testId }: BannerProps): React.JSX.Element {
    const Icon = severity === 'info' ? InfoIcon : WarningIcon;
    return (
        <div className={`nuiget-banner nuiget-banner--${severity}`} role={severity === 'error' ? 'alert' : 'status'} data-testid={testId}>
            <Icon className="nuiget-banner-icon" />
            <span className="nuiget-visually-hidden">{`${SPOKEN[severity]}: `}</span>
            <span className="nuiget-banner-text">{children}</span>
            {action ? <Button variant="secondary" onClick={action.onClick}>{action.label}</Button> : null}
        </div>
    );
}
