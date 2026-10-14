import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import { PlusIcon, TrashIcon } from './icons';
import { Row, type RowProps } from './Row';
import { axeRuleOutcome, installFakeLayout } from './testSupport';

const INLINE_STYLE = /^(--nuiget-[a-z0-9-]+: [^;]+;\s*)+$/;

/** A row where a row lives: inside a listbox. */
function renderRow(props: Partial<RowProps> = {}) {
    const row: RowProps = {
        itemId: 'Serilog', name: 'Serilog', version: '3.0.0', density: 'compact',
        index: 0, setSize: 1, active: true, selected: false, optionId: 'installed-0', offset: 48,
        ...props,
    };
    return render(<div role="listbox" aria-label="Installed packages"><Row {...row} /></div>);
}

const uninstall = (onClick?: React.MouseEventHandler<HTMLButtonElement>) => (
    <IconButton label="Uninstall Serilog" tabIndex={-1} data-testid="row-action-uninstall" onClick={onClick}><TrashIcon /></IconButton>
);

describe('Row', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout();
    });

    afterEach(() => {
        removeLayout();
    });

    it('the option is named by id and version and described by badges and status', () => {
        renderRow({ badges: <Badge label="CPM" title="Centrally managed" />, description: 'Structured logging', status: 'Updating' });
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0' });
        expect(option).toHaveAccessibleDescription('Centrally managed Structured logging Updating');
        // The name is the text one sees (WCAG 2.5.3), not a label of its own.
        expect(option).not.toHaveAttribute('aria-label');
        expect(option).toHaveAttribute('aria-posinset', '1');
        expect(option).toHaveAttribute('aria-setsize', '1');
        expect(option).toHaveAttribute('aria-selected', 'false');
        expect(option).toHaveAttribute('tabindex', '0');
    });

    it('a row with nothing to add has no description, and an inactive row is out of the tab order', () => {
        renderRow({ active: false, selected: true });
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0' });
        expect(option).not.toHaveAttribute('aria-describedby');
        expect(option).toHaveAttribute('tabindex', '-1');
        expect(option).toHaveAttribute('aria-selected', 'true');
    });

    it('the row wrapper carries no aria attribute and no tabindex', () => {
        renderRow({ actions: uninstall(), busy: true });
        const wrapper = screen.getByTestId('package-row-serilog');
        expect(wrapper).toHaveAttribute('role', 'presentation');
        expect(wrapper).toHaveAttribute('data-index', '0');
        // Anything more would make it an owned element of the listbox that is no option (axe: aria-required-children).
        expect(wrapper.getAttributeNames().filter(name => name.startsWith('aria-') || name === 'tabindex')).toEqual([]);
    });

    it('the actions container is hidden from assistive technology and its buttons are not tabbable', () => {
        const { container } = renderRow({ actions: uninstall() });
        const actions = container.querySelector('.nuiget-row-actions');
        expect(actions).toHaveAttribute('aria-hidden', 'true');
        // Beside the option, not inside it.
        expect(actions?.parentElement).toBe(screen.getByTestId('package-row-serilog'));
        expect(screen.getByRole('option').querySelector('button, [tabindex]')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByTestId('row-action-uninstall')).toHaveAttribute('tabindex', '-1');
    });

    it('clicking an action keeps focus on the option', () => {
        const onClick = vi.fn();
        renderRow({ actions: uninstall(onClick) });
        const button = screen.getByTestId('row-action-uninstall');
        // `false`: the default of the mousedown, which would focus the button, was prevented.
        expect(fireEvent.mouseDown(button)).toBe(false);
        expect(screen.getByRole('option')).toHaveFocus();
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('option')).toHaveFocus();
    });

    it('a busy row is aria-busy and shows a spinner instead of its actions', () => {
        const { container } = renderRow({ actions: uninstall(), busy: true, status: 'Uninstalling' });
        expect(screen.getByRole('option')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('option')).toHaveAccessibleDescription('Uninstalling');
        expect(screen.getByTestId('package-row-serilog')).toHaveClass('nuiget-row--busy');
        expect(screen.queryByTestId('row-action-uninstall')).toBeNull();
        expect(container.querySelector('.nuiget-row-actions .nuiget-spinner')).not.toBeNull();
    });

    it('a disabled row renders no actions', () => {
        const { container } = renderRow({ actions: uninstall(), disabled: true, status: 'Unresolved' });
        const option = screen.getByRole('option');
        expect(option).toHaveAttribute('aria-disabled', 'true');
        // Still a tab stop: one can go to it and hear why.
        expect(option).toHaveAttribute('tabindex', '0');
        expect(container.querySelector('.nuiget-row-actions')).toBeNull();
        expect(screen.queryByTestId('row-action-uninstall')).toBeNull();
    });

    it('the only inline style is the virtual offset custom property', () => {
        const { container } = renderRow({ actions: uninstall(), badges: <Badge label="2" /> });
        const styled = [...container.querySelectorAll('[style]')];
        expect(styled).toEqual([screen.getByTestId('package-row-serilog')]);
        expect(styled[0].getAttribute('style')).toBe('--nuiget-virtual-offset: 48px;');
        expect(styled[0].getAttribute('style')).toMatch(INLINE_STYLE);
    });

    it('a comfortable row shows its icon as decoration, a compact row does not show one', () => {
        const comfortable = renderRow({ density: 'comfortable', icon: <PlusIcon /> });
        expect(screen.getByTestId('package-row-serilog')).toHaveClass('nuiget-row--comfortable');
        expect(comfortable.container.querySelector('.nuiget-row-icon')).toHaveAttribute('aria-hidden', 'true');
        comfortable.unmount();
        const compact = renderRow({ density: 'compact', icon: <PlusIcon /> });
        expect(compact.container.querySelector('.nuiget-row-icon')).toBeNull();
    });

    it('the test id is the lower-cased package id', () => {
        renderRow({ itemId: 'Newtonsoft.Json', name: 'Newtonsoft.Json' });
        expect(screen.getByTestId('package-row-newtonsoft.json')).toBeInTheDocument();
    });

    it('has no axe violations', async () => {
        const { container } = renderRow({ actions: uninstall(), badges: <Badge label="CPM" title="Centrally managed" />, status: 'Updating', busy: false });
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        // The rule about focus under `aria-hidden` ran: without a layout axe skips it.
        expect(axeRuleOutcome(results, 'aria-hidden-focus')).toBe('passes');
        expect(axeRuleOutcome(results, 'nested-interactive')).toBe('passes');
    });
});

describe('Row in a multi-selectable list', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout();
    });

    afterEach(() => {
        removeLayout();
    });

    it('in a multi-selectable list the option shows a decorative check mark and is aria-current when it is the current row', () => {
        const row = (props: Partial<RowProps>) => (
            <Row itemId="Serilog" name="Serilog" version="3.0.0" density="comfortable" index={0} setSize={1} active selected={false} optionId="installed-0" offset={0} checkable {...props} />
        );
        const { rerender } = render(<div role="listbox" aria-label="Installed packages" aria-multiselectable="true">{row({ selected: true, current: true })}</div>);
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0' });
        expect(option).toHaveAttribute('aria-selected', 'true');
        expect(option).toHaveAttribute('aria-current', 'true');
        const mark = option.querySelector('.nuiget-row-check');
        expect(mark).toHaveAttribute('aria-hidden', 'true');
        expect(mark?.querySelector('svg')).not.toBeNull();
        // Nothing in the mark can take focus; the name stays the text.
        expect(mark?.querySelectorAll('button, input, [tabindex]')).toHaveLength(0);
        rerender(<div role="listbox" aria-label="Installed packages" aria-multiselectable="true">{row({ selected: false, current: false })}</div>);
        expect(option).toHaveAttribute('aria-selected', 'false');
        expect(option).not.toHaveAttribute('aria-current');
        expect(option.querySelector('.nuiget-row-check svg')).toBeNull();
        rerender(<div role="listbox" aria-label="Installed packages">{row({ checkable: false })}</div>);
        expect(option.querySelector('.nuiget-row-check')).toBeNull();
    });
});
