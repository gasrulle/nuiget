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

    it('writes a package item as `<id> <old> → <new>`: a break opportunity after each dot of the id, the versions whole (UX-P4.fix-14)', async () => {
        const { container } = render(<DialogGroups groups={[{ items: [
            { id: 'Microsoft.Extensions.AI.Abstractions', versions: { from: '3.0.0', to: '3.1.0' } },
            { id: 'Serilog.Sinks.File' },
            'Gateway',
        ] }]} />);
        const [change, removal, text] = screen.getAllByRole('listitem');
        expect(change.textContent).toBe('Microsoft.Extensions.AI.Abstractions 3.0.0 → 3.1.0');
        expect(change.querySelectorAll('wbr')).toHaveLength(3);
        const parts = [...change.querySelectorAll('.nuiget-dialog-item-part')];
        expect(parts.map(part => part.textContent)).toEqual(['3.0.0', '→ 3.1.0']);
        expect(parts.every(part => part.querySelector('wbr') === null)).toBe(true);
        // The arrow is text of its version's part, never a node of its own.
        expect(parts[1].childNodes).toHaveLength(1);
        expect(removal.textContent).toBe('Serilog.Sinks.File');
        expect(removal.querySelectorAll('wbr')).toHaveLength(2);
        expect(removal.querySelector('.nuiget-dialog-item-part')).toBeNull();
        expect(text.textContent).toBe('Gateway');
        expect(text.querySelector('wbr, .nuiget-dialog-item-part')).toBeNull();
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(['list', 'listitem'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes']);
    });

    it('renders nothing for no groups', () => {
        const { container } = render(<DialogGroups groups={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
