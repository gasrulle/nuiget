import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, type ButtonProps } from './Button';

describe('Button', () => {
    it('renders a primary button with the nuiget-button class and a secondary one with its modifier', () => {
        render(<><Button>Save</Button><Button variant="secondary">Cancel</Button></>);
        expect(screen.getByRole('button', { name: 'Save' }).className).toBe('nuiget-button');
        expect(screen.getByRole('button', { name: 'Cancel' }).className).toBe('nuiget-button nuiget-button--secondary');
        expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
    });

    it('forwards disabled, type, title, aria-pressed and the ref; a disabled button does not fire onClick', async () => {
        const onClick = vi.fn();
        const ref = createRef<HTMLButtonElement>();
        render(<Button ref={ref} type="submit" disabled title="Why not" aria-pressed data-testid="the-button" onClick={onClick}>Add</Button>);
        const button = screen.getByTestId('the-button');
        expect(ref.current).toBe(button);
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('type', 'submit');
        expect(button).toHaveAttribute('title', 'Why not');
        expect(button).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('has no className or style prop', () => {
        // @ts-expect-error A feature places a button and never styles it (ADR-010).
        const styled: ButtonProps = { children: 'B', style: {} };
        expect(styled.children).toBe('B');
        // @ts-expect-error A feature places a button and never styles it (ADR-010).
        render(<Button className="x">A</Button>);
        expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    });
});
