import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import { PlusIcon, TrashIcon } from './icons';
import { Row, type RowProps } from './Row';
import { axeRuleOutcome, installFakeLayout, installStylesheet } from './testSupport';

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

    it('the version cell carries its title', () => {
        renderRow({ versionTitle: 'Why the version is what it is' });
        expect(screen.getByText('3.0.0')).toHaveAttribute('title', 'Why the version is what it is');
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

    it('a click on the check mark calls onToggle and does not reach the option\'s click', async () => {
        const onToggle = vi.fn();
        const onClick = vi.fn();
        const { container } = render(<div role="listbox" aria-label="Installed packages" onClick={onClick}><Row itemId="Serilog" name="Serilog" density="compact" index={0} setSize={1} active selected={false} optionId="o" offset={0} checkable onToggle={onToggle} /></div>);
        fireEvent.click(container.querySelector('.nuiget-row-check')!);
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('in a tree the row is a treeitem with its level and its position among its siblings', () => {
        renderRow({ level: 2, posInSet: 3, setSize: 4, index: 7 });
        const item = screen.getByRole('treeitem', { hidden: true });
        expect(item).toHaveAttribute('aria-level', '2');
        expect(item).toHaveAttribute('aria-posinset', '3');
        expect(item).toHaveAttribute('aria-setsize', '4');
        expect(item.closest('[data-index]')).toHaveAttribute('data-level', '2');
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
        expect(screen.getByRole('option')).toHaveClass('nuiget-row-option--comfortable');
        comfortable.unmount();
        const compact = renderRow({ density: 'compact', icon: <PlusIcon /> });
        expect(screen.getByRole('option')).toHaveClass('nuiget-row-option--compact');
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

    it('a row that cannot join a bulk action shows a muted check mark', async () => {
        const { container } = render(
            <div role="listbox" aria-label="Installed packages" aria-multiselectable="true">
                <Row itemId="Microsoft.NETCore.App" name="Microsoft.NETCore.App" version="8.0.0" density="comfortable" index={0} setSize={1} active selected optionId="installed-0" offset={0} checkable selectable={false} />
            </div>,
        );
        const mark = screen.getByRole('option').querySelector('.nuiget-row-check');
        expect(mark).toHaveClass('nuiget-row-check--off');
        expect(mark).toHaveAttribute('aria-hidden', 'true');
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
        const off = /(?:^|\n)\.nuiget-row-check--off \{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
        expect(off).toContain('--nuiget-row-check-border: var(--nuiget-color-fg-disabled);');
        expect(off).not.toContain('dashed');
        for (const selector of ['aria-selected', 'aria-current']) {
            const state = new RegExp(`(?:^|\\n)\\.nuiget-row-option\\[${selector}="true"\\] \\{([^}]*)\\}`).exec(stylesheet)?.[1] ?? '';
            expect(state, selector).toContain('--nuiget-row-check-bg: var(--nuiget-color-checkbox-select-bg);');
            expect(state, selector).toContain('--nuiget-row-check-border: var(--nuiget-color-checkbox-select-border);');
        }
        // Never a mark, even when the list calls the row selected; nothing in it can take focus.
        expect(mark?.querySelector('svg')).toBeNull();
        expect(mark?.querySelectorAll('button, input, [tabindex]')).toHaveLength(0);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-hidden-focus')).toBe('passes');
    });
});

describe('Row layout (P9.2, D46)', () => {
    let removeLayout: () => void;
    let removeStylesheet: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout();
        removeStylesheet = installStylesheet();
    });

    afterEach(() => {
        removeStylesheet();
        removeLayout();
    });

    const follows = (first: Element, second: Element): boolean => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('a Browse row shows three lines: name and badges, the description, then version · downloads · authors', async () => {
        const { container } = renderRow({
            density: 'comfortable', meta: '2.5M downloads', authors: 'Serilog Contributors', verified: true,
            badges: <Badge label="CPM" title="Centrally managed" />, description: 'Structured logging',
        });
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0' });
        const body = option.querySelector('.nuiget-row-body') as Element;
        const [first, description, third] = [...body.children];
        expect(body.children).toHaveLength(3);
        expect(first.querySelector('.nuiget-row-name')?.textContent).toBe('Serilog');
        expect(first.querySelector('.nuiget-row-badges')).not.toBeNull();
        expect(description).toHaveClass('nuiget-row-description');
        const [version, meta, authors] = ['.nuiget-row-version', '.nuiget-row-meta', '.nuiget-row-authors'].map(selector => third.querySelector(selector) as Element);
        expect(follows(version, meta) && follows(meta, authors)).toBe(true);
        expect(meta).toHaveClass('nuiget-row-sep');
        expect(authors).toHaveClass('nuiget-row-sep');
        expect(option).toHaveAccessibleDescription('Centrally managed 2.5M downloads Verified: the package id prefix is reserved by its owner Serilog Contributors Structured logging');
        // The icon column is there without an icon, so names line up.
        expect(option.querySelector('.nuiget-row-icon')).toHaveAttribute('aria-hidden', 'true');
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(axeRuleOutcome(results, 'aria-hidden-focus')).toBe('passes');
        expect(axeRuleOutcome(results, 'nested-interactive')).toBe('passes');
    });

    it('a comfortable row is the 72 px Extensions row: a fixed block size, border-box, no line under it', () => {
        renderRow({ density: 'comfortable', description: 'Structured logging' });
        const row = getComputedStyle(screen.getByTestId('package-row-serilog'));
        expect(row.blockSize).toBe('var(--nuiget-row-height-comfortable)');
        expect(row.boxSizing).toBe('border-box');
        expect(row.borderBottomWidth === '' || row.borderBottomWidth === '0px').toBe(true);
        expect(screen.getByRole('option')).toHaveClass('nuiget-row-option--comfortable');
    });

    it('an Installed row shows two lines: name and badges, then version · authors with the Verified mark', () => {
        renderRow({ density: 'comfortable', authors: 'Serilog Contributors', verified: true });
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0' });
        const body = option.querySelector('.nuiget-row-body');
        const lines = body ? [...body.querySelectorAll(':scope > .nuiget-row-line')] : [];
        expect(lines).toHaveLength(2);
        expect(lines[1].querySelector('.nuiget-row-version')).not.toBeNull();
        expect(lines[1].querySelector('.nuiget-row-authors')).toHaveTextContent('Serilog Contributors');
        expect(lines[1].querySelector('.nuiget-row-authors')).toHaveClass('nuiget-row-sep');
        const mark = screen.getByRole('img', { name: /^Verified/, hidden: true });
        expect(mark).toHaveAttribute('data-codicon', 'verified-filled');
        expect(mark).toHaveAttribute('width', '12');
        expect(mark).toHaveClass('nuiget-verified');
        expect(option).toHaveAccessibleDescription('Verified: the package id prefix is reserved by its owner Serilog Contributors');
    });

    it('the option is the band: it paints the hover, selection and focus carriers and the comfortable actions sit over its end', () => {
        renderRow({ density: 'comfortable', actions: uninstall() });
        const stylesheet = readFileSync('src/webview/shared/primitives/primitives.css', 'utf8');
        const optionRule = /(?:^|\n)\.nuiget-row-option \{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
        expect(optionRule).toContain('background: var(--nuiget-row-band-bg, transparent);');
        expect(optionRule).toContain('outline: var(--nuiget-line-width) var(--nuiget-row-outline-style, none) var(--nuiget-row-outline-color, transparent);');
        const actions = screen.getByTestId('package-row-serilog').querySelector('.nuiget-row-actions') as Element;
        expect(getComputedStyle(actions).position).toBe('absolute');
    });

    it('the name ellipsizes beside its badges, which keep their width', () => {
        renderRow({ density: 'comfortable', badges: <Badge label="CPM" title="Centrally managed" /> });
        const name = getComputedStyle(screen.getByRole('option').querySelector('.nuiget-row-name') as Element);
        const badges = getComputedStyle(screen.getByRole('option').querySelector('.nuiget-row-badges') as Element);
        expect(Number(name.flexShrink)).toBe(1);
        expect(name.minWidth).toBe('0px');
        expect(badges.flex === 'none' || Number(badges.flexShrink) === 0).toBe(true);
        expect(name.textOverflow).toBe('ellipsis');
    });

    it('only a part after another on its line starts with the separator', () => {
        const first = renderRow({ density: 'comfortable', version: undefined, meta: '2.5M downloads', authors: 'Ada' });
        expect(screen.getByRole('option').querySelector('.nuiget-row-meta')).not.toHaveClass('nuiget-row-sep');
        expect(screen.getByRole('option').querySelector('.nuiget-row-authors')).toHaveClass('nuiget-row-sep');
        first.unmount();
        renderRow({ density: 'comfortable', status: 'Updating' });
        expect(screen.getByRole('option').querySelector('.nuiget-row-status')).toHaveClass('nuiget-row-sep');
    });

    it('no element of the row holds a separator as its only text', () => {
        renderRow({ density: 'comfortable', meta: '2.5M downloads', authors: 'Ada', status: 'Updating', description: 'A library' });
        const row = screen.getByTestId('package-row-serilog');
        expect([...row.querySelectorAll('*')].every(element => element.textContent?.trim() !== '·')).toBe(true);
        expect(row.textContent).not.toContain('·');
    });

    it('long version never hides the name in compact density', () => {
        const version = '10.0.0-preview.7.25380.108.with.a.very.long.build.metadata.tail';
        renderRow({ density: 'compact', version, authors: 'Ada', description: 'A library' });
        const option = screen.getByRole('option', { name: `Serilog ${version}` });
        const name = option.querySelector('.nuiget-row-name') as HTMLElement;
        const shown = option.querySelector('.nuiget-row-version') as HTMLElement;
        expect(follows(name, shown)).toBe(true);
        expect(name.textContent).toBe('Serilog');
        // The version gives way first; the name keeps its width.
        expect(Number(getComputedStyle(name).flexShrink)).toBeLessThan(Number(getComputedStyle(shown).flexShrink));
        expect(getComputedStyle(shown).minWidth).toBe('0px');
        // Authors and description are read out, not shown (D14).
        for (const hidden of option.querySelectorAll('.nuiget-row-authors, .nuiget-row-description')) {
            expect(getComputedStyle(hidden).position).toBe('absolute');
        }
    });

    it('a comfortable row reads its meta in the description, a compact row hides it visually', () => {
        const comfortable = renderRow({ density: 'comfortable', meta: '2.5M downloads' });
        expect(screen.getByRole('option')).toHaveAccessibleDescription('2.5M downloads');
        comfortable.unmount();
        renderRow({ density: 'compact', meta: '2.5M downloads' });
        expect(getComputedStyle(screen.getByRole('option').querySelector('.nuiget-row-meta') as Element).position).toBe('absolute');
    });

    it('an update row reads old → new as text and marks the new version', () => {
        renderRow({ density: 'comfortable', nextVersion: '3.1.0' });
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0 → 3.1.0' });
        expect(option.querySelector('.nuiget-row-version')).toHaveTextContent('3.0.0 → 3.1.0');
        expect(option.querySelector('.nuiget-row-version-new')).toHaveTextContent(/^3\.1\.0$/);
    });

    it('the tooltip is on the body, not on the option', () => {
        renderRow({ density: 'comfortable' });
        const option = screen.getByRole('option', { name: 'Serilog 3.0.0' });
        expect(option.querySelector('.nuiget-row-body')).toHaveAttribute('title', 'Serilog 3.0.0');
        expect(option).not.toHaveAttribute('title');
        expect(screen.getByTestId('package-row-serilog')).not.toHaveAttribute('title');
        expect(option).not.toHaveAccessibleDescription();
    });
});
