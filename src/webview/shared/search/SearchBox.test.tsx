import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SearchBox, type Suggestion } from './SearchBox';

const PREFIXES = ['@installed', '@updates', '@vulnerable'] as const;

function Harness({ suggestions, onSubmit = vi.fn(), onPick = vi.fn() }: { suggestions?: Suggestion[]; onSubmit?: (value: string) => void; onPick?: (suggestion: Suggestion) => void }) {
    const [value, setValue] = useState('');
    return (
        <>
            <SearchBox
                value={value}
                onChange={setValue}
                onSubmit={onSubmit}
                prefixes={PREFIXES}
                suggestions={suggestions}
                onPickSuggestion={onPick}
                label="Search packages"
                placeholder="Search"
                testId="box"
                className="box"
            />
            <button type="button">elsewhere</button>
        </>
    );
}

const box = (): HTMLInputElement => screen.getByTestId('box');
const optionTexts = (): string[] => screen.queryAllByRole('option').map(option => option.textContent ?? '');

describe('SearchBox', () => {
    it('typing @ lists the prefixes that match as the text grows, and a complete prefix closes the list', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        expect(box()).toHaveAttribute('role', 'combobox');
        expect(box()).toHaveAttribute('aria-expanded', 'false');

        await user.type(box(), '@');
        expect(optionTexts()).toEqual(['@installed', '@updates', '@vulnerable']);
        expect(box()).toHaveAttribute('aria-expanded', 'true');
        expect(box()).toHaveAttribute('aria-controls', screen.getByRole('listbox', { name: 'Filters' }).id);
        await user.type(box(), 'up');
        expect(optionTexts()).toEqual(['@updates']);
        await user.type(box(), 'dates');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('ArrowDown and ArrowUp move the active option while focus stays in the box; Enter or Tab takes it', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(box(), '@');
        await user.keyboard('{ArrowDown}{ArrowDown}');
        const active = screen.getByRole('option', { name: '@updates' });
        expect(box()).toHaveAttribute('aria-activedescendant', active.id);
        expect(active).toHaveAttribute('aria-selected', 'true');
        expect(box()).toHaveFocus();
        // Past the first option the last one follows.
        await user.keyboard('{ArrowUp}{ArrowUp}');
        expect(box()).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: '@vulnerable' }).id);

        await user.keyboard('{Enter}');
        expect(box()).toHaveValue('@vulnerable ');
        await user.clear(box());
        await user.type(box(), '@i');
        await user.keyboard('{ArrowDown}{Tab}');
        expect(box()).toHaveValue('@installed ');
        expect(box()).toHaveFocus();
    });

    it('Enter without an active option submits the text', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        render(<Harness onSubmit={onSubmit} />);
        await user.type(box(), 'serilog{Enter}');
        expect(onSubmit).toHaveBeenCalledWith('serilog');
    });

    it('Escape closes the list, then clears the box, then leaves it', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.type(box(), '@u');
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(box()).toHaveValue('@u');
        await user.keyboard('{Escape}');
        expect(box()).toHaveValue('');
        expect(box()).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(box()).not.toHaveFocus();
    });

    it('lists suggestions for plain text with their source when several sources answer, and a click picks one', async () => {
        const user = userEvent.setup();
        const onPick = vi.fn();
        const suggestions = [{ id: 'Serilog', sourceName: 'nuget.org' }, { id: 'Serilog.Sinks.Console', sourceName: 'nuget.org' }, { id: 'Serilog', sourceName: 'Contoso' }];
        render(<Harness suggestions={suggestions} onPick={onPick} />);
        await user.type(box(), 'seri');

        expect(screen.getByRole('listbox', { name: 'Suggestions' })).toBeInTheDocument();
        expect(optionTexts()).toEqual(['Serilognuget.org', 'Serilog.Sinks.Consolenuget.org', 'SerilogContoso']);
        await user.click(screen.getAllByRole('option')[1]);
        expect(onPick).toHaveBeenCalledWith({ id: 'Serilog.Sinks.Console', sourceName: 'nuget.org' });
        expect(box()).toHaveFocus();
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('a single source is not repeated on every suggestion; leaving the box closes the list', async () => {
        const user = userEvent.setup();
        render(<Harness suggestions={[{ id: 'Moq', sourceName: 'nuget.org' }]} />);
        await user.type(box(), 'mo');
        expect(optionTexts()).toEqual(['Moq']);
        await user.click(screen.getByRole('button', { name: 'elsewhere' }));
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('has no axe violations with the list open', async () => {
        const user = userEvent.setup();
        const { container } = render(<Harness />);
        await user.type(box(), '@');
        await user.keyboard('{ArrowDown}');
        expect(await axe(container)).toHaveNoViolations();
    });
});
