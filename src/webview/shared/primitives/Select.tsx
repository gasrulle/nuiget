import type React from 'react';
import { ChevronDownIcon } from './icons';
import './primitives.css';

export interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    children: React.ReactNode;
    disabled?: boolean;
    id?: string;
    'aria-label'?: string;
    'data-testid'?: string;
}

/**
 * The workbench's 26 px select (DS-HEIGHT-7): a native `<select>`, so its list, keys and role stay the browser's, with the
 * codicon chevron drawn over its end. The options are the children; the test id, `id` and label stay on the native element.
 */
export function Select({ value, onChange, children, disabled, ...rest }: SelectProps): React.JSX.Element {
    return (
        <span className={disabled ? 'nuiget-select nuiget-select--disabled' : 'nuiget-select'}>
            <select className="nuiget-select-input" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} {...rest}>{children}</select>
            <span className="nuiget-select-chevron" aria-hidden="true"><ChevronDownIcon size={16} /></span>
        </span>
    );
}
