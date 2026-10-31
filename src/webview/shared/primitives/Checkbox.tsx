import type React from 'react';
import { CheckIcon } from './icons';
import './primitives.css';

export interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    'aria-label'?: string;
    'data-testid'?: string;
}

/**
 * The workbench's 18 px check box (DS-HEIGHT-9): a native input in the check-box colours, so its role, keys and label stay
 * the browser's; the label is the caller's, a wrapping `<label>` or `htmlFor`. The glyph is rendered when checked.
 */
export function Checkbox({ checked, onChange, ...rest }: CheckboxProps): React.JSX.Element {
    return (
        <span className="nuiget-checkbox">
            <input type="checkbox" className="nuiget-checkbox-input" checked={checked} onChange={event => onChange(event.target.checked)} {...rest} />
            {checked ? <span className="nuiget-checkbox-mark" aria-hidden="true"><CheckIcon size={16} /></span> : null}
        </span>
    );
}
