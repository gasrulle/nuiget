import React, { useEffect, useState } from 'react';
import './primitives.css';

export interface LiveStatusProps {
    /** The latest thing to announce; `null` for nothing. */
    message: string | null;
    /** Change it to announce the same message once more (the same outcome twice in a row). */
    repeat?: number;
}

/**
 * The one live region of a surface (`data-testid="status-live"`). It is in the document from the first
 * render, because a live region announces changes only. A message is announced by emptying the region and
 * filling it on the next frame, which is what makes a screen reader read an identical message again.
 */
export function LiveStatus({ message, repeat }: LiveStatusProps): React.JSX.Element {
    const [text, setText] = useState('');

    useEffect(() => {
        setText('');
        if (!message) {
            return undefined;
        }
        const frame = requestAnimationFrame(() => setText(message));
        return () => cancelAnimationFrame(frame);
    }, [message, repeat]);

    return (
        <div className="nuiget-visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-testid="status-live">
            {text}
        </div>
    );
}
