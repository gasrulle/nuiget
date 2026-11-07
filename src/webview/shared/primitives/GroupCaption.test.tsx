import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GroupCaption, type GroupCaptionProps } from './GroupCaption';

describe('GroupCaption', () => {
    it('is a heading at level 3 by default and at level 4 inside a section, with no toggle', async () => {
        const { container } = render(<section aria-label="Required by"><GroupCaption title="Required by" /><GroupCaption level={4} title="net8.0" /></section>);
        expect(screen.getByRole('heading', { level: 3, name: 'Required by' })).toHaveClass('nuiget-group-caption');
        expect(screen.getByRole('heading', { level: 4, name: 'net8.0' })).toHaveClass('nuiget-group-caption');
        expect(screen.queryByRole('button')).toBeNull();
        expect(await axe(container)).toHaveNoViolations();
    });

    it('carries the section-box hook and the level variant when given a test key, and the id a list is labelled by', () => {
        render(<><GroupCaption level={4} title="net8.0" id="block" testKey="required-by-net8.0" /><ul aria-labelledby="block"><li>Polly</li></ul></>);
        const heading = screen.getByTestId('section-box-required-by-net8.0');
        expect(heading).toHaveAttribute('data-variant', 'level');
        expect(heading).toHaveAttribute('id', 'block');
        expect(screen.getByRole('list', { name: 'net8.0' })).toBeInTheDocument();
        render(<GroupCaption title="Dependencies" />);
        const plain = screen.getByRole('heading', { name: 'Dependencies' });
        expect(plain).not.toHaveAttribute('data-testid');
        expect(plain).not.toHaveAttribute('data-variant');
    });

    it('sets its weight and size from the stylesheet and owns no margin around it (T-13, DS-TYPE-9)', () => {
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
        const caption = /(?:^|\n)\.nuiget-group-caption \{([^}]*)\}/.exec(stylesheet)?.[1];
        expect(caption).toContain('margin: 0;');
        expect(caption).toContain('font-size: var(--nuiget-font-size-md);');
        expect(caption).toContain('font-weight: var(--nuiget-font-weight-semibold);');
        expect(caption).toContain('text-transform: none;');
    });

    it('has no className or style prop', () => {
        // @ts-expect-error A feature places a caption and never styles it (ADR-010).
        const classed: GroupCaptionProps = { title: 'x', className: 'x' };
        // @ts-expect-error A feature places a caption and never styles it (ADR-010).
        const styled: GroupCaptionProps = { title: 'x', style: {} };
        expect([classed.title, styled.title]).toEqual(['x', 'x']);
    });
});
