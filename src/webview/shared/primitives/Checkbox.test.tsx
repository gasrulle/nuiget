import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';
import { axeRuleOutcome } from './testSupport';

describe('Checkbox', () => {
    it('is a native check box: role, name from its label, checked and disabled state, Space toggles it', async () => {
        const onChange = vi.fn();
        const { container, rerender } = render(<label>Restore <Checkbox checked={false} onChange={onChange} /></label>);
        const box = screen.getByRole('checkbox', { name: 'Restore' });
        expect(box).not.toBeChecked();
        box.focus();
        await userEvent.keyboard(' ');
        expect(onChange).toHaveBeenCalledWith(true);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'label')).toBe('passes');
        rerender(<label>Restore <Checkbox checked disabled onChange={onChange} /></label>);
        expect(box).toBeChecked();
        expect(box).toBeDisabled();
    });

    it('shows the glyph only when checked and the glyph is hidden from assistive technology', () => {
        const { container, rerender } = render(<Checkbox aria-label="Restore" checked={false} onChange={() => undefined} />);
        expect(container.querySelector('.nuiget-checkbox-mark')).toBeNull();
        rerender(<Checkbox aria-label="Restore" checked onChange={() => undefined} />);
        expect(container.querySelector('.nuiget-checkbox-mark')).toHaveAttribute('aria-hidden', 'true');
    });

    it('the glyph colour and the box come from the stylesheet', () => {
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
        const input = /(?:^|\n)\.nuiget-checkbox-input \{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
        expect(input).toContain('appearance: none;');
        expect(input).toContain('background: var(--nuiget-color-checkbox-bg);');
        const mark = /(?:^|\n)\.nuiget-checkbox-mark \{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
        expect(mark).toContain('color: var(--nuiget-color-checkbox-fg);');
    });
});
