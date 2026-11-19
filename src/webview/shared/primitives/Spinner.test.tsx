import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
    it('is decorative without a label and an image with one', () => {
        const decorative = render(<Spinner />);
        expect(decorative.container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('img')).toBeNull();
        decorative.unmount();

        render(<Spinner label="Updating Serilog" />);
        expect(screen.getByRole('img', { name: 'Updating Serilog' })).toBeInTheDocument();
    });

    it('renders no inline style: the stylesheet turns it', () => {
        const { container } = render(<Spinner label="Loading" size={12} />);
        expect(container.querySelector('.nuiget-spinner')).not.toBeNull();
        expect(container.querySelectorAll('[style]')).toHaveLength(0);
        expect(container.querySelector('svg')).toHaveAttribute('width', '12');
    });

    it('takes the icon button\'s box and colour carriers, and a section header keeps its own box (DS-STATE-6, DS-ICON-2, UX-P4.fix-15)', () => {
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8').replace(/\r\n/g, '\n');
        const spinnerRule = /(?:^|\n)\.nuiget-spinner \{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
        expect(spinnerRule).toContain('min-width: var(--nuiget-icon-button-size, var(--nuiget-action-size));');
        expect(spinnerRule).toContain('min-height: var(--nuiget-icon-button-size, var(--nuiget-action-size));');
        expect(spinnerRule).toContain('color: var(--nuiget-icon-button-color, var(--nuiget-color-icon));');
        expect(spinnerRule).not.toContain('--nuiget-target-min');
        expect(/(?:^|\n)\.nuiget-section-header \.nuiget-spinner \{([^}]*)\}/.exec(stylesheet)?.[1]).toBe('\n    min-width: 0;\n    min-height: 0;\n');
        // One home for the spinner's colour: no other rule ending in `.nuiget-spinner` sets one.
        const others = [...stylesheet.matchAll(/(?:^|\n)([^{}\n]*\.nuiget-spinner) \{([^}]*)\}/g)].filter(([, prelude]) => prelude.trim() !== '.nuiget-spinner');
        expect(others.filter(([, , body]) => /(?:^|[\s;])color:/.test(body)).map(([, prelude]) => prelude)).toEqual([]);
    });

    it('has no axe violations', async () => {
        const { container } = render(<p><Spinner /> <Spinner label="Updating Serilog" /></p>);
        expect(await axe(container)).toHaveNoViolations();
    });
});
