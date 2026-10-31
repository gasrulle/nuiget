import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Select, type SelectProps } from './Select';
import { axeRuleOutcome } from './testSupport';

const options = <><option value="a">Alpha</option><option value="b">Beta</option></>;

describe('Select', () => {
    it('is a native select: role combobox, name from its aria-label or its label, value, disabled; onChange gets the chosen value', async () => {
        const onChange = vi.fn();
        const { container, rerender } = render(<Select aria-label="Project" data-testid="project" value="a" onChange={onChange}>{options}</Select>);
        const select = screen.getByRole('combobox', { name: 'Project' });
        expect(select).toBe(screen.getByTestId('project'));
        expect(select).toHaveValue('a');
        await userEvent.selectOptions(select, 'b');
        expect(onChange).toHaveBeenCalledWith('b');
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'select-name')).toBe('passes');
        rerender(<><label htmlFor="v">Version</label><Select id="v" value="a" disabled onChange={onChange}>{options}</Select></>);
        expect(screen.getByRole('combobox', { name: 'Version' })).toBeDisabled();
    });

    it('draws the chevron hidden from assistive technology; the arrow and the disabled colour come from the stylesheet', () => {
        const { container } = render(<Select aria-label="Project" value="a" disabled onChange={() => undefined}>{options}</Select>);
        expect(container.querySelector('.nuiget-select-chevron')).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelector('.nuiget-select')).toHaveClass('nuiget-select--disabled');
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
        const input = /(?:^|\n)\.nuiget-select-input \{([^}]*)\}/.exec(stylesheet)?.[1];
        expect(input).toContain('appearance: none;');
        // Fills what its span is given, so the chevron stays inside the box in a stretched field.
        expect(input).toContain('flex: 1 1 auto;');
        expect(/(?:^|\n)\.nuiget-select--disabled \{([^}]*)\}/.exec(stylesheet)?.[1]).toContain('color: var(--nuiget-color-fg-disabled);');
    });

    it('has no className or style prop', () => {
        // @ts-expect-error A feature places a select and never styles it (ADR-010).
        const classed: SelectProps = { value: '', onChange: () => undefined, children: null, className: 'x' };
        // @ts-expect-error A feature places a select and never styles it (ADR-010).
        const styled: SelectProps = { value: '', onChange: () => undefined, children: null, style: {} };
        expect([classed.value, styled.value]).toEqual(['', '']);
    });
});
