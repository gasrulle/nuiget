import type React from 'react';
import './primitives.css';

export interface TextFieldProps {
    type?: 'text' | 'search' | 'url' | 'password';
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    autoComplete?: 'off';
    spellCheck?: boolean;
    disabled?: boolean;
    id?: string;
    role?: 'combobox';
    'aria-label'?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    'aria-autocomplete'?: 'list';
    'aria-expanded'?: boolean;
    'aria-controls'?: string;
    'aria-activedescendant'?: string;
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    'data-testid'?: string;
    ref?: React.Ref<HTMLInputElement>;
}

/** A native text input: 26 px as a search box, 25 px otherwise (DS-HEIGHT-7). Combobox attributes pass through unrenamed. */
export function TextField({ type = 'text', value, onChange, ...rest }: TextFieldProps): React.JSX.Element {
    return <input className="nuiget-text-field" type={type} value={value} onChange={event => onChange(event.target.value)} {...rest} />;
}
