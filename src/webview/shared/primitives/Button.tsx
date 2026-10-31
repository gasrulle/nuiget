import type React from 'react';
import './primitives.css';

export interface ButtonProps {
    variant?: 'primary' | 'secondary';
    type?: 'button' | 'submit';
    disabled?: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    children: React.ReactNode;
    /** A glyph the button shows alone when its toolbar is narrower than 250 px (the Extensions `narrow` breakpoint, §8); the label stays the name and the text of a wide button. */
    icon?: React.ReactNode;
    title?: string;
    'aria-pressed'?: boolean;
    'aria-expanded'?: boolean;
    'aria-describedby'?: string;
    'data-testid'?: string;
    ref?: React.Ref<HTMLButtonElement>;
}

/** The text button: 26 px, a 12 px label, primary or secondary (DS-HEIGHT-6). A feature places it, and never styles it. */
export function Button({ variant = 'primary', type = 'button', children, icon, ...rest }: ButtonProps): React.JSX.Element {
    return <button type={type} className={variant === 'secondary' ? 'nuiget-button nuiget-button--secondary' : 'nuiget-button'} {...rest}>{icon === undefined ? children : <><span className="nuiget-button-icon" aria-hidden="true">{icon}</span><span className="nuiget-button-label">{children}</span></>}</button>;
}
