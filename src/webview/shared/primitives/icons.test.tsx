import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import * as icons from './icons';
import type { IconProps } from './icons';

// Every export of the module, so that an icon added later is tested without a change here.
const entries = Object.entries(icons) as Array<[string, React.ComponentType<IconProps>]>;

const svgOf = (container: HTMLElement): SVGSVGElement => {
    const svg = container.querySelector('svg');
    if (!svg) {
        throw new Error('The component rendered no <svg>');
    }
    return svg;
};

describe('icons', () => {
    it('every export of the module is an icon component', () => {
        expect(entries.length).toBeGreaterThanOrEqual(26);
        for (const [name, Icon] of entries) {
            expect(name, 'export name').toMatch(/^[A-Z][A-Za-z]*Icon$/);
            const { container, unmount } = render(<Icon />);
            const svg = svgOf(container);
            // Icons take the colour of the text around them.
            expect(svg.getAttribute('fill'), name).toBe('currentColor');
            expect(svg.getAttribute('viewBox'), name).toBeTruthy();
            unmount();
        }
    });

    it('every icon is aria-hidden without a title', () => {
        for (const [name, Icon] of entries) {
            const { container, unmount } = render(<Icon />);
            const svg = svgOf(container);
            expect(svg.getAttribute('aria-hidden'), name).toBe('true');
            expect(svg.hasAttribute('role'), name).toBe(false);
            expect(svg.querySelector('title'), name).toBeNull();
            unmount();
        }
    });

    it('a titled icon is an image with an accessible name', () => {
        for (const [name, Icon] of entries) {
            const title = `${name} of the test`;
            const { unmount } = render(<Icon title={title} />);
            const image = screen.getByRole('img', { name: title });
            // Not `aria-hidden="false"`: the attribute is absent on an icon that has a name.
            expect(image.hasAttribute('aria-hidden'), name).toBe(false);
            unmount();
        }
    });

    it('no icon renders a style attribute', () => {
        // The Content Security Policy of the webviews has no 'unsafe-inline' for styles (ADR-006).
        for (const [name, Icon] of entries) {
            const { container, unmount } = render(<><Icon /><Icon title="Named" size={20} className="tinted" /></>);
            expect(container.querySelectorAll('[style]'), name).toHaveLength(0);
            unmount();
        }
    });

    it('width and height follow size', () => {
        for (const [name, Icon] of entries) {
            const sized = render(<Icon size={20} />);
            expect([svgOf(sized.container).getAttribute('width'), svgOf(sized.container).getAttribute('height')], name).toEqual(['20', '20']);
            sized.unmount();
            const plain = render(<Icon />);
            const width = svgOf(plain.container).getAttribute('width');
            // A default exists and the icon is square.
            expect(Number(width), name).toBeGreaterThan(0);
            expect(svgOf(plain.container).getAttribute('height'), name).toBe(width);
            plain.unmount();
        }
    });

    it('className is applied', () => {
        for (const [name, Icon] of entries) {
            const { container, unmount } = render(<Icon className="row-icon" />);
            // Among its classes: the loading icon also carries the class its animation is bound to.
            expect(svgOf(container).classList.contains('row-icon'), name).toBe(true);
            unmount();
        }
    });

    it('icons have no axe violations', async () => {
        const decorative = render(<div>{entries.map(([name, Icon]) => <Icon key={name} />)}</div>);
        expect(await axe(decorative.container)).toHaveNoViolations();
        decorative.unmount();
        const named = render(<div>{entries.map(([name, Icon]) => <Icon key={name} title={`${name} of the test`} />)}</div>);
        expect(await axe(named.container)).toHaveNoViolations();
    });

    it('the axe matcher is live: an image without a name is a violation', async () => {
        // Guards the wiring in the test setup: a matcher that always passed would make every axe test worthless.
        const results = await axe('<main><img src="package.png"></main>');
        expect(results.violations.map(violation => violation.id)).toContain('image-alt');
        expect(() => expect(results).toHaveNoViolations()).toThrow();
    });
});
