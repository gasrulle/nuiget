import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { DialogGroups } from './DialogGroups';
import { axeRuleOutcome } from './testSupport';

describe('DialogGroups (UX-P3.5)', () => {
    it('renders a lead above each labelled list and a list alone for an unlabelled group, with no axe violations', async () => {
        const { container } = render(<DialogGroups groups={[{ label: 'From Api:', items: ['Serilog', 'Polly'] }, { items: ['xunit'] }]} />);
        expect(screen.getAllByRole('list')).toHaveLength(2);
        expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Serilog', 'Polly', 'xunit']);
        expect(screen.getByText('From Api:')).toHaveClass('nuiget-dialog-lead');
        expect(container.querySelectorAll('.nuiget-dialog-lead')).toHaveLength(1);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(['list', 'listitem'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes']);
    });

    it('renders nothing for no groups', () => {
        const { container } = render(<DialogGroups groups={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
