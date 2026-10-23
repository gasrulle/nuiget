import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';
import { SyncIcon } from './icons';
import { SectionHeader, type SectionHeaderProps } from './SectionHeader';
import { axeRuleOutcome } from './testSupport';

function renderHeader(props: Partial<SectionHeaderProps> = {}) {
    const header: SectionHeaderProps = {
        title: 'Installed', titleId: 'installed-title', expanded: true, onToggle: () => undefined,
        contentId: 'installed-content', testKey: 'installed', ...props,
    };
    return render(<>
        <SectionHeader {...header} />
        {header.expanded ? <div id="installed-content">rows</div> : null}
    </>);
}

describe('SectionHeader', () => {
    it('is a heading with a toggle button that reports aria-expanded and aria-controls', async () => {
        const onToggle = vi.fn();
        const { rerender } = renderHeader({ onToggle });
        const heading = screen.getByRole('heading', { level: 2, name: 'Installed' });
        const toggle = within(heading).getByRole('button', { name: 'Installed' });
        expect(toggle).toBe(screen.getByTestId('section-header-installed'));
        expect(toggle).toHaveAttribute('type', 'button');
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(toggle).toHaveAttribute('aria-controls', 'installed-content');
        // The title has the id a list in the section is named by.
        expect(document.getElementById('installed-title')).toHaveTextContent('Installed');
        // The chevron is decoration; `aria-expanded` says the same in words.
        expect(toggle.querySelector('svg.nuiget-section-chevron')).toHaveAttribute('aria-hidden', 'true');

        await userEvent.click(toggle);
        expect(onToggle).toHaveBeenCalledTimes(1);

        rerender(<SectionHeader title="Installed" titleId="installed-title" expanded={false} onToggle={onToggle} contentId="installed-content" testKey="installed" level={3} />);
        expect(screen.getByRole('button', { name: 'Installed' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });

    it('actions are outside the button', async () => {
        const onRefresh = vi.fn();
        const onToggle = vi.fn();
        renderHeader({ onToggle, actions: <IconButton label="Refresh installed packages" onClick={onRefresh}><SyncIcon /></IconButton> });
        const toggle = screen.getByTestId('section-header-installed');
        const refresh = screen.getByRole('button', { name: 'Refresh installed packages' });
        expect(toggle).not.toContainElement(refresh);
        expect(screen.getByRole('heading')).not.toContainElement(refresh);
        // An action does not toggle the section, and it is a tab stop of its own.
        await userEvent.click(refresh);
        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(onToggle).not.toHaveBeenCalled();
        expect(refresh).not.toHaveAttribute('tabindex');
    });

    it('the count renders as a badge', () => {
        const { container, rerender } = renderHeader({ count: 12 });
        const badge = container.querySelector('.nuiget-badge');
        expect(badge).toHaveTextContent('12');
        // The count is part of what the toggle is called.
        expect(screen.getByRole('button', { name: 'Installed 12' })).toContainElement(badge as HTMLElement);
        // Zero is a count; no count is no badge.
        rerender(<SectionHeader title="Updates" titleId="t" expanded={false} onToggle={() => undefined} contentId="c" testKey="updates" count={0} />);
        expect(screen.getByRole('button', { name: 'Updates 0' })).toBeInTheDocument();
        rerender(<SectionHeader title="Updates" titleId="t" expanded={false} onToggle={() => undefined} contentId="c" testKey="updates" />);
        expect(container.querySelector('.nuiget-badge')).toBeNull();
    });

    it('a busy section shows a spinner that adds nothing to the name', () => {
        const { container } = renderHeader({ busy: true });
        expect(container.querySelector('.nuiget-section-toggle .nuiget-spinner')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Installed' })).toBeInTheDocument();
    });

    it('has no axe violations', async () => {
        const { container } = renderHeader({ count: 3, busy: true, actions: <IconButton label="Refresh installed packages"><SyncIcon /></IconButton> });
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'nested-interactive')).toBe('passes');
    });

    it('renders the heading level asked', () => {
        render(<SectionHeader title="net8.0 (1)" titleId="t" contentId="c" testKey="k" expanded={false} onToggle={() => undefined} level={4} />);
        expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('net8.0 (1)');
    });

    it('a tooltip goes on the toggle, none without one', () => {
        const { unmount } = renderHeader({ tooltip: '/w/App/App.csproj' });
        expect(screen.getByRole('button', { expanded: true })).toHaveAttribute('title', '/w/App/App.csproj');
        unmount();
        renderHeader();
        expect(screen.getByRole('button', { expanded: true })).not.toHaveAttribute('title');
    });

    it('its box carries section-box-<testKey> and the variant, group by default (UX-P0.10)', () => {
        const { unmount } = renderHeader();
        const box = screen.getByTestId('section-box-installed');
        expect(box).toHaveAttribute('data-variant', 'group');
        // The box holds the heading's toggle and the actions; the toggle keeps its own hook.
        expect(within(box).getByTestId('section-header-installed')).toBeInTheDocument();
        unmount();
        renderHeader({ variant: 'pane' });
        expect(screen.getByTestId('section-box-installed')).toHaveAttribute('data-variant', 'pane');
    });
});
