import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PropertyList, type PropertyListProps } from './PropertyList';
import { axeRuleOutcome } from './testSupport';

const rule = (stylesheet: string, selector: string): string | undefined => new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(stylesheet)?.[1];

describe('PropertyList', () => {
    it('is a definition list whose terms and values are its direct children, in order', async () => {
        const { container } = render(<PropertyList data-testid="facts" items={[{ term: 'Version', value: '8.4.2' }, { term: 'Authors', value: <a href="https://example.org">App vNext</a> }]} />);
        const list = screen.getByTestId('facts');
        expect(list.tagName).toBe('DL');
        expect(list).toHaveClass('nuiget-property-list');
        expect([...list.children].map(child => [child.tagName, child.className, child.textContent])).toEqual([
            ['DT', 'nuiget-property-term', 'Version'],
            ['DD', 'nuiget-property-value', '8.4.2'],
            ['DT', 'nuiget-property-term', 'Authors'],
            ['DD', 'nuiget-property-value', 'App vNext'],
        ]);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'definition-list')).toBe('passes');
        expect(axeRuleOutcome(results, 'dlitem')).toBe('passes');
    });

    it('two columns from the stylesheet: the terms as wide as the widest, one value column that wraps (DS-ALIGN-1)', () => {
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
        const list = rule(stylesheet, '.nuiget-property-list');
        expect(list).toContain('display: grid;');
        expect(list).toContain('grid-template-columns: max-content minmax(0, 1fr);');
        expect(rule(stylesheet, '.nuiget-property-term')).toContain('color: var(--nuiget-color-fg-muted);');
        const value = rule(stylesheet, '.nuiget-property-value');
        expect(value).toContain('overflow-wrap: anywhere;');
        expect(value).not.toContain('nowrap');
    });

    it('has no className or style prop', () => {
        // @ts-expect-error A feature places a property list and never styles it (ADR-010).
        const classed: PropertyListProps = { items: [], className: 'x' };
        // @ts-expect-error A feature places a property list and never styles it (ADR-010).
        const styled: PropertyListProps = { items: [], style: {} };
        expect([classed.items, styled.items]).toEqual([[], []]);
    });
});
