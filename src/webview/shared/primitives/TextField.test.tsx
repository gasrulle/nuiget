import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TextField, type TextFieldProps } from './TextField';

const ruleOf = (selector: string): string => {
    const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(stylesheet)?.[1] ?? '';
};

describe('TextField', () => {
    it('is a native input: textbox (searchbox for type search), name from its label, value, placeholder, required and disabled; onChange gets the text', async () => {
        const onChange = vi.fn();
        const { rerender } = render(<><label htmlFor="u">URL</label><TextField id="u" value="" placeholder="https://" required onChange={onChange} /></>);
        const box = screen.getByRole('textbox', { name: 'URL' });
        expect(box).toBeRequired();
        expect(box).toHaveAttribute('placeholder', 'https://');
        await userEvent.type(box, 'a');
        expect(onChange).toHaveBeenCalledWith('a');
        rerender(<TextField aria-label="Search" type="search" value="x" disabled onChange={onChange} />);
        const search = screen.getByRole('searchbox', { name: 'Search' });
        expect(search).toHaveValue('x');
        expect(search).toBeDisabled();
    });

    it('forwards the combobox attributes, the key handlers and the ref without renaming them', async () => {
        const onKeyDown = vi.fn();
        const ref = createRef<HTMLInputElement>();
        render(<TextField ref={ref} type="search" role="combobox" aria-label="Search" aria-autocomplete="list" aria-expanded aria-controls="list" aria-activedescendant="one" data-testid="box" value="" onChange={() => undefined} onKeyDown={onKeyDown} />);
        const box = screen.getByRole('combobox', { name: 'Search' });
        expect(ref.current).toBe(box);
        expect(box).toHaveAttribute('aria-expanded', 'true');
        expect(box).toHaveAttribute('aria-controls', 'list');
        expect(box).toHaveAttribute('aria-activedescendant', 'one');
        expect(box).toHaveAttribute('data-testid', 'box');
        box.focus();
        await userEvent.keyboard('{ArrowDown}');
        expect(onKeyDown).toHaveBeenCalled();
    });

    it('the box, the two heights, the invalid line and the layer radius come from the stylesheet', () => {
        expect(ruleOf('.nuiget-text-field')).toContain('block-size: var(--nuiget-input-height);');
        expect(ruleOf('.nuiget-text-field[type="search"]')).toContain('block-size: var(--nuiget-control-height);');
        expect(ruleOf('.nuiget-text-field[aria-invalid="true"]')).toContain('border-color: var(--nuiget-color-input-error-border);');
        expect(ruleOf('.nuiget-dialog')).toContain('--nuiget-text-field-radius: var(--nuiget-radius-layer-input);');
    });

    it('has no className or style prop', () => {
        // @ts-expect-error A feature places a field and never styles it (ADR-010).
        const classed: TextFieldProps = { value: '', onChange: () => undefined, className: 'x' };
        // @ts-expect-error A feature places a field and never styles it (ADR-010).
        const styled: TextFieldProps = { value: '', onChange: () => undefined, style: {} };
        expect([classed.value, styled.value]).toEqual(['', '']);
    });
});
