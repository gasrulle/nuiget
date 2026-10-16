import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, type TabItem } from './Tabs';

type MainTab = 'installed' | 'updates' | 'browse';

const TABS: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'installed', label: 'Installed', 'data-testid': 'installed-tab' },
    { id: 'updates', label: 'Updates', count: 3, 'data-testid': 'updates-tab' },
    { id: 'browse', label: 'Browse' },
];

/** The main panel's tabs (interaction model §2 and §8), selection owned by the caller. */
function MainTabs({ onSelect }: { onSelect?: (id: MainTab) => void }) {
    const [selected, setSelected] = useState<MainTab>('installed');
    return (
        <Tabs
            tabs={TABS}
            selected={selected}
            onSelect={id => {
                onSelect?.(id);
                setSelected(id);
            }}
            label="Package lists"
            data-testid="tab-bar"
        >
            <p>{`${selected} content`}</p>
        </Tabs>
    );
}

describe('Tabs', () => {
    it('is a tablist of tabs with aria-selected, and the selected tab controls and names the panel', () => {
        render(<MainTabs />);
        const list = screen.getByRole('tablist', { name: 'Package lists' });
        expect(list).toHaveAttribute('data-testid', 'tab-bar');
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
        const panel = screen.getByRole('tabpanel', { name: 'Installed' });
        expect(panel).toHaveTextContent('installed content');
        expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
        // A tab whose panel is not rendered points at nothing.
        expect(tabs[1]).not.toHaveAttribute('aria-controls');
        expect(screen.getByTestId('installed-tab')).toBe(tabs[0]);
    });

    it('one tab stop: the selected tab', async () => {
        const user = userEvent.setup();
        render(<><button type="button">Before</button><MainTabs /><button type="button">After</button></>);
        expect(screen.getAllByRole('tab').map(tab => tab.tabIndex)).toEqual([0, -1, -1]);
        await user.click(screen.getByRole('button', { name: 'Before' }));
        await user.tab();
        expect(screen.getByRole('tab', { name: 'Installed' })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    });

    it('ArrowRight, ArrowLeft, Home and End select and focus, wrapping around', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(<MainTabs onSelect={onSelect} />);
        await user.click(screen.getByRole('tab', { name: 'Installed' }));
        const expectSelected = (name: RegExp) => {
            const tab = screen.getByRole('tab', { name });
            expect(tab).toHaveFocus();
            expect(tab).toHaveAttribute('aria-selected', 'true');
            expect(tab.tabIndex).toBe(0);
            expect(screen.getByRole('tabpanel')).toHaveAccessibleName(tab.textContent ?? '');
        };
        await user.keyboard('{ArrowRight}');
        expectSelected(/^Updates/);
        await user.keyboard('{ArrowRight}{ArrowRight}');
        expectSelected(/^Installed/);
        await user.keyboard('{ArrowLeft}');
        expectSelected(/^Browse/);
        await user.keyboard('{Home}');
        expectSelected(/^Installed/);
        await user.keyboard('{End}');
        expectSelected(/^Browse/);
        expect(onSelect.mock.calls.map(call => call[0])).toEqual(['installed', 'updates', 'browse', 'installed', 'browse', 'installed', 'browse']);
        // Other keys are left alone.
        await user.keyboard('{ArrowDown}');
        expectSelected(/^Browse/);
    });

    it('a click selects, and the count is part of the tab name', async () => {
        const user = userEvent.setup();
        render(<MainTabs />);
        await user.click(screen.getByTestId('updates-tab'));
        expect(screen.getByRole('tab', { name: 'Updates 3' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveTextContent('updates content');
    });

    it('has no axe violations', async () => {
        const { container } = render(<MainTabs />);
        expect(await axe(container)).toHaveNoViolations();
    });

    it('a tab with a count and a badge names both', async () => {
        const { container } = render(
            <Tabs tabs={[{ id: 'installed', label: 'Installed', count: 3, badge: { label: '1', title: '1 package with known vulnerabilities', tone: 'error' } }]} selected="installed" onSelect={vi.fn()} label="Package lists">
                <p>content</p>
            </Tabs>,
        );
        expect(screen.getByRole('tab')).toHaveAccessibleName('Installed 3 1 package with known vulnerabilities');
        expect(await axe(container)).toHaveNoViolations();
    });
});
