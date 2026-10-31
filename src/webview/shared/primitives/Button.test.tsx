import { readFileSync } from 'node:fs';
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

    it('a button with an icon keeps its label as its name and shows the glyph only in a narrow toolbar', () => {
        render(<Button icon={<span data-testid="glyph" />} data-testid="b">Select all</Button>);
        expect(screen.getByRole('button', { name: 'Select all' })).toBe(screen.getByTestId('b'));
        const icon = screen.getByTestId('glyph').parentElement as HTMLElement;
        expect(icon).toHaveClass('nuiget-button-icon');
        expect(icon).toHaveAttribute('aria-hidden', 'true');
        expect(icon.nextElementSibling).toHaveClass('nuiget-button-label');
        const css = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8').replace(/\r\n/g, '\n');
        const narrow = css.slice(css.indexOf('@container (max-width: 250px)'));
        expect(narrow).toMatch(/\.nuiget-button-icon \{\n\s+display: inline-flex;/);
        expect(narrow).toMatch(/\.nuiget-button-icon \+ \.nuiget-button-label \{[^}]*clip-path: inset\(50%\)/);
        expect(narrow).toMatch(/\.nuiget-tab-count,\n\s+\.nuiget-tab-badge \{\n\s+display: none;/);
    });

    it('a button without an icon renders its children alone', () => {
        render(<Button data-testid="b">Plain</Button>);
        expect(screen.getByTestId('b').children).toHaveLength(0);
    });
});
