import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axeRuleOutcome } from '../primitives/testSupport';
import { SearchBox, type SearchBoxProps, type Suggestion } from './SearchBox';

const PREFIXES = ['@installed', '@updates', '@vulnerable'] as const;

function Harness({ suggestions, onSubmit = vi.fn(), onPick = vi.fn(), extra = {} }: { suggestions?: Suggestion[]; onSubmit?: (value: string) => void; onPick?: (suggestion: Suggestion) => void; extra?: Partial<SearchBoxProps> }) {
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
                {...extra}
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

    it('lists suggestions for plain text grouped per source when several sources answer, and a click picks one', async () => {
        const user = userEvent.setup();
        const onPick = vi.fn();
        const suggestions = [{ id: 'Serilog', sourceName: 'nuget.org' }, { id: 'Serilog.Sinks.Console', sourceName: 'nuget.org' }, { id: 'Serilog', sourceName: 'Contoso' }];
        render(<Harness suggestions={suggestions} onPick={onPick} />);
        await user.type(box(), 'seri');

        expect(screen.getByRole('listbox', { name: 'Suggestions' })).toBeInTheDocument();
        expect(optionTexts()).toEqual(['Serilog', 'Serilog.Sinks.Console', 'Serilog']);
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

    it('Clear empties the box and keeps focus; Filters opens the prefix list', async () => {
        const user = userEvent.setup();
        const { container } = render(<Harness />);
        expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
        await user.type(box(), 'serilog');
        await user.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(box()).toHaveValue('');
        expect(box()).toHaveFocus();
        expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Filters' }));
        expect(box()).toHaveValue('@');
        expect(box()).toHaveFocus();
        expect(optionTexts()).toEqual([...PREFIXES]);
        expect(await axe(container)).toHaveNoViolations();
        await user.click(screen.getByRole('button', { name: 'Filters' }));
        expect(box()).toHaveValue('');
        expect(screen.queryByRole('listbox')).toBeNull();
        // Neither button is a stop of the Tab order: the box leads to what follows it.
        await user.tab();
        expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
    });

    it('has no axe violations with the list open', async () => {
        const user = userEvent.setup();
        const { container } = render(<Harness />);
        await user.type(box(), '@');
        await user.keyboard('{ArrowDown}');
        expect(await axe(container)).toHaveNoViolations();
    });

    it('quick search groups by source', async () => {
        const user = userEvent.setup();
        const suggestions = [{ id: 'Serilog', sourceName: 'nuget.org' }, { id: 'Serilog.Sinks.Console', sourceName: 'nuget.org' }, { id: 'Serilog', sourceName: 'Contoso' }];
        const { container } = render(<Harness suggestions={suggestions} />);
        await user.type(box(), 'seri');
        const groups = screen.getAllByRole('group');
        expect(groups.map(group => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby') as string)?.textContent)).toEqual(['nuget.org', 'Contoso']);
        expect(screen.getAllByRole('option')).toHaveLength(3);
        for (const index of [0, 1, 2]) {
            await user.keyboard('{ArrowDown}');
            expect(box()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[index].id);
        }
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-required-children')).toBe('passes');
    });

    it('a loading row while nothing is shown, and the old suggestions stay while the next fetch runs', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const { rerender } = render(<Harness onSubmit={onSubmit} extra={{ pending: true }} />);
        await user.type(box(), 'seri');
        const [loading] = screen.getAllByRole('option');
        expect(loading).toHaveTextContent('Searching…');
        expect(loading).toHaveAttribute('aria-disabled', 'true');
        await user.keyboard('{ArrowDown}');
        expect(box()).not.toHaveAttribute('aria-activedescendant');
        await user.keyboard('{Enter}');
        expect(onSubmit).toHaveBeenCalledWith('seri');

        rerender(<Harness onSubmit={onSubmit} suggestions={[{ id: 'Serilog', sourceName: 'nuget.org' }]} extra={{ pending: true }} />);
        await user.type(box(), 'l');
        expect(optionTexts()).toEqual(['Serilog']);
        expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    });

    it('ArrowRight asks for the versions and the versions level is a combobox level of its own', async () => {
        const user = userEvent.setup();
        const serilog: Suggestion = { id: 'Serilog', sourceName: 'nuget.org' };
        const onExpand = vi.fn();
        const onCollapse = vi.fn();
        const onPickVersion = vi.fn();
        const onQuickInstall = vi.fn();
        const handlers = { onExpandSuggestion: onExpand, onCollapseVersions: onCollapse, onPickVersion, onQuickInstall };
        const { rerender } = render(<Harness suggestions={[serilog]} extra={handlers} />);
        await user.type(box(), 'seri');
        await user.keyboard('{ArrowDown}{ArrowRight}');
        expect(onExpand).toHaveBeenCalledWith(serilog);

        rerender(<Harness suggestions={[serilog]} extra={{ ...handlers, versions: { suggestion: serilog, status: 'loading', versions: [] } }} />);
        expect(screen.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
        rerender(<Harness suggestions={[serilog]} extra={{ ...handlers, versions: { suggestion: serilog, status: 'error', versions: [], message: 'timeout' } }} />);
        expect(screen.getByRole('option')).toHaveTextContent('timeout. Press → to retry.');
        expect(screen.getByRole('option')).toHaveAttribute('aria-disabled', 'true');

        const versions = ['4.1.0', '4.0.0', '3.1.1', '3.1.0', '3.0.0', '2.12.0'];
        rerender(<Harness suggestions={[serilog]} extra={{ ...handlers, versions: { suggestion: serilog, status: 'ready', versions } }} />);
        const list = screen.getByRole('listbox', { name: 'Versions of Serilog' });
        const options = screen.getAllByRole('option');
        expect(options.map(option => option.textContent)).toEqual(versions.slice(0, 5));
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
        expect(box()).toHaveAttribute('aria-activedescendant', options[0].id);
        expect(list).toBeInTheDocument();
        await user.keyboard('{Control>}{Enter}{/Control}');
        expect(onQuickInstall).toHaveBeenCalledWith(serilog, '4.1.0');
        await user.keyboard('{ArrowDown}{Enter}');
        expect(onPickVersion).toHaveBeenCalledWith(serilog, '4.0.0');
        rerender(<Harness suggestions={[serilog]} extra={{ ...handlers, versions: { suggestion: serilog, status: 'ready', versions } }} />);
        await user.keyboard('{ArrowLeft}');
        expect(onCollapse).toHaveBeenCalled();
    });

    it('Ctrl+Enter on an active suggestion calls onQuickInstall and neither onSubmit nor onPickSuggestion', async () => {
        const user = userEvent.setup();
        const serilog: Suggestion = { id: 'Serilog', sourceName: 'nuget.org' };
        const onSubmit = vi.fn();
        const onPick = vi.fn();
        const onQuickInstall = vi.fn();
        render(<Harness suggestions={[serilog]} onSubmit={onSubmit} onPick={onPick} extra={{ onQuickInstall }} />);
        await user.type(box(), 'seri');
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
        expect(onQuickInstall).toHaveBeenCalledWith(serilog, undefined);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(onPick).not.toHaveBeenCalled();
    });
});
