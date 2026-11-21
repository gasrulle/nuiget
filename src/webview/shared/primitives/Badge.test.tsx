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

    it('carries a test id', () => {
        render(<Badge label="provisional" data-testid="installed-provisional" />);
        expect(screen.getByTestId('installed-provisional')).toHaveTextContent('provisional');
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

    it('a severity badge draws its level\'s glyph before the label, takes the severity class over the tone and sets no inline style (UX-P5.1b)', () => {
        const { container } = render(<Badge label="Critical (2)" title="2 known vulnerabilities, highest severity Critical" severity="error" tone="info" />);
        const badge = container.firstElementChild as HTMLElement;
        expect(badge).toHaveClass('nuiget-badge--label', 'nuiget-badge--severity-error');
        expect(badge).not.toHaveClass('nuiget-badge--info');
        const glyphs = badge.querySelectorAll('svg');
        expect(glyphs).toHaveLength(1);
        expect(glyphs[0]).toHaveAttribute('aria-hidden', 'true');
        expect(glyphs[0]).toHaveAttribute('data-codicon', 'error');
        expect(glyphs[0]).toHaveClass('nuiget-badge-icon');
        expect(badge.querySelector('[aria-hidden="true"]')?.textContent).toBe('Critical (2)');
        expect(container.querySelector('[style]')).toBeNull();
        for (const [severity, codicon] of [['warning', 'warning'], ['info', 'info']] as const) {
            const { container: other } = render(<Badge label="Moderate" severity={severity} />);
            expect(other.querySelector('svg')).toHaveAttribute('data-codicon', codicon);
            expect(other.firstElementChild).toHaveClass(`nuiget-badge--severity-${severity}`);
        }
    });

    it('the severity border reads the problems icon colours and the glyph is a square of the badge font (UX-P5.1b)', () => {
        const remove = installStylesheet();
        const rules = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]) as CSSStyleRule[];
        const rule = (selector: string): string => rules.find(entry => entry.selectorText === selector)?.style.cssText ?? '';
        expect(rule('.nuiget-badge--severity-error')).toBe('border-color: var(--nuiget-color-icon-error);');
        expect(rule('.nuiget-badge--severity-warning')).toBe('border-color: var(--nuiget-color-icon-warning);');
        expect(rule('.nuiget-badge--severity-info')).toBe('border-color: var(--nuiget-color-icon-info);');
        for (const declared of ['inline-size: var(--nuiget-font-size-badge)', 'block-size: var(--nuiget-font-size-badge)', 'margin-inline-end: var(--nuiget-space-1)']) {
            expect(rule('.nuiget-badge-icon')).toContain(declared);
        }
        remove();
    });
});
