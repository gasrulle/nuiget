import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';
import { installStylesheet } from './testSupport';

describe('Badge', () => {
    it('reads its title to assistive technology when one is given', () => {
        const { container } = render(<p aria-label="described" id="about"><Badge label="CPM" title="Centrally managed" tone="info" /></p>);
        const badge = container.querySelector('.nuiget-badge');
        expect(badge).toHaveClass('nuiget-badge--info');
        // The abbreviation is for the eye, the words for the ear.
        expect(screen.getByText('CPM')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByText('Centrally managed')).toHaveClass('nuiget-visually-hidden');
        // A span may not carry `aria-label` (axe: aria-prohibited-attr).
        expect(badge).not.toHaveAttribute('aria-label');
        expect(badge).not.toHaveAttribute('role');
    });

    it('shows its label as it is when it has no title', () => {
        const { container } = render(<Badge label="3" />);
        const badge = container.querySelector('.nuiget-badge');
        expect(badge).toHaveTextContent('3');
        expect(badge).toHaveClass('nuiget-badge--neutral');
        expect(badge?.querySelector('[aria-hidden]')).toBeNull();
    });

    it('has no axe violations', async () => {
        const { container } = render(<p>Serilog <Badge label="CPM" title="Centrally managed" /> <Badge label="2" /></p>);
        expect(await axe(container)).toHaveNoViolations();
    });

    it('a count badge and a label badge carry their kind; digits alone are a count', () => {
        const classOf = (element: React.JSX.Element): string => { const { container, unmount } = render(element); const name = (container.firstElementChild as HTMLElement).className; unmount(); return name; };
        expect(classOf(<Badge label="9" kind="count" />)).toContain('nuiget-badge--count');
        expect(classOf(<Badge label="CPM" />)).toContain('nuiget-badge--label');
        expect(classOf(<Badge label="15" />)).toContain('nuiget-badge--count');
        expect(classOf(<Badge label="15" kind="label" />)).toContain('nuiget-badge--label');
    });

    it('its size, type, radius and high-contrast line come from the stylesheet', () => {
        const remove = installStylesheet();
        const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]) as CSSStyleRule[];
        const rule = (selector: string): string => rules.find(entry => entry.selectorText === selector)?.style.cssText ?? '';
        for (const declared of ['box-sizing: border-box', 'line-height: 1', 'font-size: var(--nuiget-font-size-badge)', 'border: var(--nuiget-line-width) solid var(--nuiget-color-contrast-border)']) {
            expect(rule('.nuiget-badge')).toContain(declared);
        }
        for (const declared of ['min-inline-size: var(--nuiget-badge-size)', 'min-block-size: var(--nuiget-badge-size)', 'padding: var(--nuiget-badge-padding-block) var(--nuiget-badge-padding-inline)', 'border-radius: var(--nuiget-radius-badge)']) {
            expect(rule('.nuiget-badge--count')).toContain(declared);
        }
        for (const declared of ['padding: var(--nuiget-label-badge-padding-block) var(--nuiget-label-badge-padding-inline)', 'border-radius: var(--nuiget-radius-label-badge)']) {
            expect(rule('.nuiget-badge--label')).toContain(declared);
        }
        remove();
    });
});
