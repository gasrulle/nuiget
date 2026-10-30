import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import { TrashIcon } from './icons';
import { Listbox } from './Listbox';
import { Row } from './Row';
import { axeRuleOutcome, installFakeLayout } from './testSupport';

interface Package {
    id: string;
    version: string;
    disabled?: boolean;
    central?: boolean;
}

const HINT = 'Enter uninstalls. Shift+F10 opens the actions menu.';
const INLINE_STYLE = /^(--nuiget-[a-z0-9-]+: [^;]+;\s*)+$/;
const three: Package[] = [{ id: 'Alpha', version: '1.0.0' }, { id: 'Beta', version: '2.0.0', central: true }, { id: 'Gamma', version: '3.0.0' }];
const many = (count: number): Package[] => Array.from({ length: count }, (_, index) => ({ id: `Package${index}`, version: '1.0.0' }));

type Handlers = Pick<React.ComponentProps<typeof Listbox<Package>>, 'onSelect' | 'onActivate' | 'onSecondaryActivate' | 'onDelete' | 'onContextMenu' | 'selectedId' | 'busy' | 'empty'>;

function PackageList({ items, onAction, ...rest }: { items: Package[]; onAction?: (id: string) => void } & Handlers): React.JSX.Element {
    return (
        <Listbox
            {...rest}
            items={items}
            label="Installed packages"
            hint={HINT}
            testId="sidebar-installed-list"
            density="compact"
            isDisabled={item => item.disabled === true}
            renderRow={(item, placement) => (
                <Row
                    {...placement}
                    itemId={item.id}
                    name={item.id}
                    version={item.version}
                    density="compact"
                    status={item.disabled ? 'Unresolved' : undefined}
                    badges={item.central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                    actions={<IconButton label={`Uninstall ${item.id}`} tabIndex={-1} data-testid="row-action-uninstall" onClick={() => onAction?.(item.id)}><TrashIcon /></IconButton>}
                />
            )}
        />
    );
}

const options = (): HTMLElement[] => screen.getAllByRole('option');
const option = (id: string): HTMLElement => screen.getByRole('option', { name: new RegExp(`^${id} `) });
const tabStops = (): string[] => options().filter(element => element.tabIndex === 0).map(element => element.textContent ?? '');

describe('Listbox', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        // Five compact rows fit.
        removeLayout = installFakeLayout({ viewport: 120, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    it('renders rows as options with posinset and setsize', () => {
        render(<PackageList items={three} selectedId="Beta" busy />);
        const listbox = screen.getByRole('listbox', { name: 'Installed packages' });
        expect(listbox).toHaveAttribute('data-testid', 'sidebar-installed-list');
        expect(listbox).toHaveAccessibleDescription(HINT);
        expect(listbox).toHaveAttribute('aria-busy', 'true');
        // One tab stop for the whole list: the list itself is not one.
        expect(listbox).not.toHaveAttribute('tabindex');
        expect(options().map(element => [element.getAttribute('aria-posinset'), element.getAttribute('aria-setsize'), element.getAttribute('aria-selected')])).toEqual([
            ['1', '3', 'false'], ['2', '3', 'true'], ['3', '3', 'false'],
        ]);
        // The selected row is where the tab stop starts.
        expect(tabStops()).toEqual([expect.stringContaining('Beta')]);
    });

    it('ArrowDown, ArrowUp, Home and End move the active option and the roving tabindex', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(<PackageList items={three} onSelect={onSelect} />);
        await user.tab();
        expect(option('Alpha')).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(option('Beta')).toHaveFocus();
        expect(tabStops()).toHaveLength(1);
        await user.keyboard('{End}');
        expect(option('Gamma')).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(option('Gamma')).toHaveFocus();
        await user.keyboard('{ArrowUp}');
        expect(option('Beta')).toHaveFocus();
        await user.keyboard('{Home}');
        expect(option('Alpha')).toHaveFocus();
        await user.keyboard('{ArrowUp}');
        expect(option('Alpha')).toHaveFocus();
        expect(tabStops()).toEqual([expect.stringContaining('Alpha')]);
        // Moving is not selecting.
        expect(onSelect).not.toHaveBeenCalled();
        expect(options().every(element => element.getAttribute('aria-selected') === 'false')).toBe(true);
    });

    it('ArrowDown scrolls the active option into view (a list in an outer scroller cannot scroll itself)', async () => {
        const user = userEvent.setup();
        render(<PackageList items={three} />);
        await user.tab();
        const scrollIntoView = vi.fn();
        Object.defineProperty(option('Beta'), 'scrollIntoView', { value: scrollIntoView, configurable: true });
        await user.keyboard('{ArrowDown}');
        expect(option('Beta')).toHaveFocus();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('Enter activates, Ctrl+Enter and Meta+Enter are the secondary action', async () => {
        const user = userEvent.setup();
        const onActivate = vi.fn();
        const onSecondaryActivate = vi.fn();
        render(<PackageList items={three} onActivate={onActivate} onSecondaryActivate={onSecondaryActivate} />);
        await user.tab();
        await user.keyboard('{ArrowDown}{Enter}');
        expect(onActivate).toHaveBeenCalledExactlyOnceWith(three[1]);
        await user.keyboard('{Control>}{Enter}{/Control}');
        await user.keyboard('{Meta>}{Enter}{/Meta}');
        expect(onSecondaryActivate.mock.calls).toEqual([[three[1]], [three[1]]]);
        expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('Delete and Meta+Backspace delete the active item', async () => {
        const user = userEvent.setup();
        const onDelete = vi.fn();
        render(<PackageList items={three} onDelete={onDelete} />);
        await user.tab();
        await user.keyboard('{Delete}');
        await user.keyboard('{Meta>}{Backspace}{/Meta}');
        expect(onDelete.mock.calls).toEqual([[three[0]], [three[0]]]);
        // Backspace alone is not a command.
        await user.keyboard('{Backspace}');
        expect(onDelete).toHaveBeenCalledTimes(2);
    });

    it('Shift+F10 and the ContextMenu key report the active item with an anchor', async () => {
        const user = userEvent.setup();
        const onContextMenu = vi.fn();
        render(<PackageList items={three} onContextMenu={onContextMenu} />);
        await user.tab();
        await user.keyboard('{End}');
        await user.keyboard('{Shift>}{F10}{/Shift}');
        await user.keyboard('{ContextMenu}');
        // Anchored at the left and the bottom of the third row, where a menu opens.
        expect(onContextMenu.mock.calls).toEqual([[three[2], { x: 0, y: 72 }], [three[2], { x: 0, y: 72 }]]);
        // F10 alone belongs to the editor.
        await user.keyboard('{F10}');
        expect(onContextMenu).toHaveBeenCalledTimes(2);
    });

    it('right-click on a row reports the item', () => {
        const onContextMenu = vi.fn();
        render(<PackageList items={three} onContextMenu={onContextMenu} />);
        // `false`: the browser's own menu is suppressed.
        expect(fireEvent.contextMenu(option('Beta'), { clientX: 5, clientY: 6 })).toBe(false);
        // Anywhere on the row, its actions included.
        fireEvent.contextMenu(screen.getAllByTestId('row-action-uninstall')[2], { clientX: 7, clientY: 8 });
        expect(onContextMenu.mock.calls).toEqual([[three[1], { x: 5, y: 6 }], [three[2], { x: 7, y: 8 }]]);
    });

    it('a disabled option ignores Enter, Ctrl+Enter and Delete but keeps focus and the context menu', async () => {
        const user = userEvent.setup();
        const handlers = { onActivate: vi.fn(), onSecondaryActivate: vi.fn(), onDelete: vi.fn(), onContextMenu: vi.fn() };
        const items: Package[] = [three[0], { id: 'Broken', version: 'unresolved', disabled: true }];
        render(<PackageList items={items} {...handlers} />);
        await user.tab();
        await user.keyboard('{ArrowDown}');
        expect(option('Broken')).toHaveFocus();
        await user.keyboard('{Enter}{Control>}{Enter}{/Control}{Delete}');
        expect(handlers.onActivate).not.toHaveBeenCalled();
        expect(handlers.onSecondaryActivate).not.toHaveBeenCalled();
        expect(handlers.onDelete).not.toHaveBeenCalled();
        await user.keyboard('{ContextMenu}');
        expect(handlers.onContextMenu).toHaveBeenCalledExactlyOnceWith(items[1], expect.anything());
        expect(option('Broken')).toHaveFocus();
    });

    it('a click selects the row, a click on an action does not', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        const onAction = vi.fn();
        render(<PackageList items={three} onSelect={onSelect} onAction={onAction} />);
        await user.click(option('Gamma'));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(three[2]);
        // The row that was clicked is the active one from then on.
        expect(tabStops()).toEqual([expect.stringContaining('Gamma')]);
        await user.click(screen.getAllByTestId('row-action-uninstall')[0]);
        expect(onAction).toHaveBeenCalledExactlyOnceWith('Alpha');
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('the active row follows its id when items reorder', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<PackageList items={three} />);
        await user.tab();
        await user.keyboard('{ArrowDown}');
        expect(option('Beta')).toHaveFocus();
        rerender(<PackageList items={[three[2], three[0], three[1]]} />);
        expect(option('Beta')).toHaveFocus();
        expect(option('Beta')).toHaveAttribute('aria-posinset', '3');
        expect(tabStops()).toEqual([expect.stringContaining('Beta')]);
    });

    it('when the active item disappears focus moves to the row at its index', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<PackageList items={three} />);
        await user.tab();
        await user.keyboard('{ArrowDown}');
        // Beta is uninstalled: the row that takes its place is Gamma.
        rerender(<PackageList items={[three[0], three[2]]} />);
        expect(option('Gamma')).toHaveFocus();
        // The last row goes: focus moves up to the new last row.
        rerender(<PackageList items={[three[0]]} />);
        expect(option('Alpha')).toHaveFocus();
        expect(tabStops()).toEqual([expect.stringContaining('Alpha')]);
    });

    it('when the list empties the empty container takes focus', async () => {
        const user = userEvent.setup();
        const empty = <p>No packages installed</p>;
        const { rerender, container } = render(<PackageList items={three} empty={empty} />);
        await user.tab();
        rerender(<PackageList items={[]} empty={empty} />);
        expect(screen.queryByRole('listbox')).toBeNull();
        const holder = container.querySelector('.nuiget-listbox-empty');
        expect(holder).toHaveFocus();
        expect(holder).toHaveTextContent('No packages installed');
        // Focusable by script only: it is not a tab stop.
        expect(holder).toHaveAttribute('tabindex', '-1');
    });

    it('never takes focus from elsewhere when its items change', async () => {
        const user = userEvent.setup();
        const Page = ({ items }: { items: Package[] }) => <><button type="button">Refresh</button><PackageList items={items} /></>;
        const { rerender } = render(<Page items={three} />);
        await user.click(screen.getByRole('button', { name: 'Refresh' }));
        rerender(<Page items={[three[1]]} />);
        rerender(<Page items={[]} />);
        expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
    });

    it('only the rows in view plus overscan are rendered, and the active row stays mounted off-screen', async () => {
        // Five rows fit; five more are kept ready below.
        const user = userEvent.setup();
        const items = many(100);
        const { container } = render(<PackageList items={items} />);
        const rendered = options().map(element => Number(element.getAttribute('aria-posinset')));
        expect(rendered[0]).toBe(1);
        expect(rendered.length).toBeGreaterThanOrEqual(5);
        expect(rendered.length).toBeLessThanOrEqual(12);
        // Every option says where it is among all hundred.
        expect(options()[0]).toHaveAttribute('aria-setsize', '100');
        expect(container.querySelector('.nuiget-listbox-sizer')?.getAttribute('style')).toBe('--nuiget-virtual-total: 2400px;');
        expect(screen.getByTestId('package-row-package3').getAttribute('style')).toBe('--nuiget-virtual-offset: 72px;');

        await user.tab();
        await user.keyboard('{End}');
        // jsdom does not scroll, so the view is still at the top; the active row is in the document all the same.
        const last = screen.getByRole('option', { name: /^Package99 / });
        expect(last).toHaveFocus();
        expect(last).toHaveAttribute('aria-posinset', '100');
        expect(options().length).toBeLessThanOrEqual(13);
        expect(screen.getByTestId('package-row-package99').getAttribute('style')).toBe('--nuiget-virtual-offset: 2376px;');
    });

    it('the only inline styles are the virtual total and offsets', () => {
        const { container } = render(<PackageList items={many(30)} />);
        const styles = [...container.querySelectorAll('[style]')].map(element => element.getAttribute('style') ?? '');
        expect(styles.length).toBeGreaterThan(1);
        expect(styles.filter(style => !INLINE_STYLE.test(style))).toEqual([]);
        const properties = new Set(styles.flatMap(style => [...style.matchAll(/(--[a-z0-9-]+):/g)].map(match => match[1])));
        expect([...properties].sort()).toEqual(['--nuiget-virtual-offset', '--nuiget-virtual-total']);
    });

    it('a listbox with rows, badges and actions has no axe violations', async () => {
        const { container } = render(<PackageList items={[...three, { id: 'Broken', version: 'unresolved', disabled: true }]} selectedId="Alpha" />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        // The rules this markup exists for ran and passed; none was skipped or found nothing to look at.
        expect(['nested-interactive', 'aria-required-children', 'aria-hidden-focus'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes']);
    });

    it('an empty listbox has no axe violations', async () => {
        const { container } = render(<PackageList items={[]} empty={<p>No packages installed</p>} />);
        expect(await axe(container)).toHaveNoViolations();
    });
});

describe('Listbox group rows (UX-P2.1a)', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 120, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    const mixed: Package[] = [{ id: 'Group', version: '' }, { id: 'Alpha', version: '1.0.0' }, { id: 'Beta', version: '2.0.0' }];
    const handlers = () => ({ onSelect: vi.fn(), onActivate: vi.fn(), onSecondaryActivate: vi.fn(), onDelete: vi.fn(), onContextMenu: vi.fn(), onToggleSelected: vi.fn() });

    function Grouped({ items = mixed, group = true, content, ...rest }: { items?: Package[]; group?: boolean; content?: React.ReactNode } & Partial<ReturnType<typeof handlers>>): React.JSX.Element {
        return (
            <Listbox
                {...rest}
                items={items}
                label="Installed packages"
                hint={HINT}
                testId="grouped-list"
                density="compact"
                selectedIds={rest.onToggleSelected ? new Set<string>() : undefined}
                isGroup={group ? item => item.id === 'Group' : undefined}
                renderGroup={(item, placement) => content ?? <span data-testid="group-content">{item.id} {placement.index} {String(placement.active)}</span>}
                renderRow={(item, placement) => <Row {...placement} density="compact" itemId={item.id} name={item.id} version={item.version} />}
            />
        );
    }

    it('group rows render through renderGroup with a data-row-kind marker, in order and at their offsets', () => {
        render(<Grouped items={[{ id: 'Alpha', version: '1.0.0' }, { id: 'Group', version: '' }, { id: 'Beta', version: '2.0.0' }]} />);
        const list = screen.getByTestId('grouped-list');
        const marked = list.querySelectorAll<HTMLElement>('[data-row-kind="group"]');
        expect(marked).toHaveLength(1);
        expect(marked[0]).toHaveAttribute('data-index', '1');
        expect(marked[0].getAttribute('style')).toMatch(INLINE_STYLE);
        expect(marked[0].getAttribute('style')).toContain('--nuiget-virtual-offset: 24px');
        expect(within(marked[0]).getByTestId('group-content')).toHaveTextContent('Group 1 false');
        expect(within(list).getAllByRole('option').map(option => option.closest('[data-index]')?.getAttribute('data-index'))).toEqual(['0', '2']);
    });

    it('ArrowDown, ArrowUp, Home and End stop on group rows', async () => {
        const user = userEvent.setup();
        render(<Grouped />);
        const list = screen.getByTestId('grouped-list');
        const group = list.querySelector<HTMLElement>('[data-row-kind="group"]')!;
        const options = within(list).getAllByRole('option');
        await user.click(options[0]);
        expect(screen.getByTestId('group-content')).toHaveTextContent('Group 0 false');
        await user.keyboard('{ArrowUp}');
        expect(document.activeElement).toBe(group);
        expect(screen.getByTestId('group-content')).toHaveTextContent('Group 0 true');
        await user.keyboard('{ArrowDown}');
        expect(document.activeElement).toBe(options[0]);
        await user.keyboard('{End}');
        expect(document.activeElement).toBe(options[1]);
        await user.keyboard('{Home}');
        expect(document.activeElement).toBe(group);
    });

    it('an arrow key puts focus on the first enabled control of a group row', async () => {
        const user = userEvent.setup();
        render(<Grouped content={<><button type="button" disabled>Off</button><button type="button">Toggle</button></>} />);
        const list = screen.getByTestId('grouped-list');
        await user.click(within(list).getAllByRole('option')[0]);
        await user.keyboard('{ArrowUp}');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Toggle' }));
    });

    it('Enter, Ctrl+Enter, Delete, Space, Shift+F10 and a click on a group row report nothing', async () => {
        const user = userEvent.setup();
        const spies = handlers();
        render(<Grouped {...spies} />);
        const list = screen.getByTestId('grouped-list');
        const group = list.querySelector<HTMLElement>('[data-row-kind="group"]')!;
        await user.click(screen.getByTestId('group-content'));
        fireEvent.contextMenu(screen.getByTestId('group-content'));
        group.focus();
        await user.keyboard('{Enter}{Control>}{Enter}{/Control}{Delete} {Shift>}{F10}{/Shift}');
        for (const spy of Object.values(spies)) {
            expect(spy).not.toHaveBeenCalled();
        }
    });

    it('the list reads nothing from the row\'s markup: a renderRow that is not Row still gets focus, keys, disabled and the toggle through placement', async () => {
        const user = userEvent.setup();
        const onActivate = vi.fn();
        const onToggleSelected = vi.fn();
        const plain: Package[] = [{ id: 'Plain', version: '' }, { id: 'Off', version: '', disabled: true }];
        render(
            <Listbox
                items={plain}
                label="Plain rows"
                hint={HINT}
                testId="plain-list"
                density="compact"
                selectedIds={new Set<string>()}
                isDisabled={item => item.disabled === true}
                onActivate={onActivate}
                onToggleSelected={onToggleSelected}
                renderRow={(item, placement) => (
                    <div data-index={placement.index}>
                        <div data-testid={`plain-${item.id}`} tabIndex={placement.active ? 0 : -1} data-disabled={String(placement.disabled)}>
                            {item.id}
                            <button type="button" tabIndex={-1} onClick={placement.onToggle}>Toggle {item.id}</button>
                        </div>
                    </div>
                )}
            />,
        );
        const first = screen.getByTestId('plain-Plain');
        const second = screen.getByTestId('plain-Off');
        expect(first).toHaveAttribute('data-disabled', 'false');
        expect(second).toHaveAttribute('data-disabled', 'true');
        await user.click(screen.getByRole('button', { name: 'Toggle Plain' }));
        expect(onToggleSelected).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: 'Toggle Off' }));
        expect(onToggleSelected).toHaveBeenCalledTimes(1);
        first.focus();
        await user.keyboard('{Enter}');
        expect(onActivate).toHaveBeenCalledTimes(1);
        await user.keyboard('{ArrowDown}');
        expect(document.activeElement).toBe(second);
        await user.keyboard('{Enter}');
        expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('a list without isGroup renders every item as an option', () => {
        render(<Grouped group={false} />);
        const list = screen.getByTestId('grouped-list');
        expect(list.querySelector('[data-row-kind="group"]')).toBeNull();
        expect(within(list).getAllByRole('option')).toHaveLength(3);
    });
});

// What the markup of Row and Listbox avoids, shown to fail: "no axe violations" above is not vacuous.
describe('Listbox: the markup it must not have', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout();
    });

    afterEach(() => {
        removeLayout();
    });

    const violations = async (html: string): Promise<string[]> => (await axe(html)).violations.map(violation => violation.id);

    it('a button inside an option is a nested-interactive violation', async () => {
        const withButton = (attributes: string) => `<div role="listbox" aria-label="Packages"><div role="option" aria-selected="false" tabindex="0">Serilog <button type="button"${attributes}>Uninstall</button></div></div>`;
        expect(await violations(withButton(''))).toContain('nested-interactive');
        // Taking the button out of the tab order does not help.
        expect(await violations(withButton(' tabindex="-1"'))).toContain('nested-interactive');
    });

    it('a wrapper with aria-busy between listbox and option is an aria-required-children violation', async () => {
        const html = '<div role="listbox" aria-label="Packages"><div aria-busy="true"><div role="option" aria-selected="false" tabindex="0">Serilog</div></div></div>';
        expect(await violations(html)).toContain('aria-required-children');
    });

    it('a tabbable button under aria-hidden is an aria-hidden-focus violation', async () => {
        expect(await violations('<main><div aria-hidden="true"><button type="button">Uninstall</button></div></main>')).toContain('aria-hidden-focus');
        // Out of the tab order it is what Row renders, and passes.
        expect(await violations('<main><div aria-hidden="true"><button type="button" tabindex="-1">Uninstall</button></div></main>')).not.toContain('aria-hidden-focus');
    });
});

describe('Listbox multi-selection', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout({ viewport: 120, row: 24 });
    });

    afterEach(() => {
        removeLayout();
    });

    /** A bulk-action list: `selectedIds` is the bulk set, `selectedId` the current row. */
    function BulkList({ items, selectedIds, selectedId, onToggleSelected, onSelect, onKeyDown }: {
        items: Package[];
        selectedIds?: ReadonlySet<string>;
        selectedId?: string | null;
        onToggleSelected?: (item: Package) => void;
        onSelect?: (item: Package) => void;
        onKeyDown?: (key: string) => void;
    }): React.JSX.Element {
        return (
            <div onKeyDown={event => onKeyDown?.(event.key)}>
                <Listbox
                    items={items}
                    label="Installed packages"
                    hint="Space selects the package for a bulk action."
                    testId="installed-list"
                    density="comfortable"
                    selectedIds={selectedIds}
                    selectedId={selectedId}
                    onToggleSelected={onToggleSelected}
                    onSelect={onSelect}
                    isDisabled={item => item.disabled === true}
                    renderRow={(item, placement) => (
                        <Row
                            {...placement}
                            itemId={item.id}
                            name={item.id}
                            version={item.version}
                            density="comfortable"
                            actions={<IconButton label={`Uninstall ${item.id}`} tabIndex={-1} data-testid="row-action-uninstall"><TrashIcon /></IconButton>}
                        />
                    )}
                />
            </div>
        );
    }

    it('a multi-selectable listbox marks the rows of the set selected and the current row aria-current', () => {
        render(<BulkList items={three} selectedIds={new Set(['Alpha', 'Gamma'])} selectedId="Beta" />);
        expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');
        expect(options().map(element => element.getAttribute('aria-selected'))).toEqual(['true', 'false', 'true']);
        expect(options().map(element => element.getAttribute('aria-current'))).toEqual([null, 'true', null]);
        // Every option begins with a decorative check mark; only the selected rows show the tick.
        const marks = options().map(element => element.querySelector('.nuiget-row-check'));
        expect(marks.every(mark => mark?.getAttribute('aria-hidden') === 'true')).toBe(true);
        expect(marks.map(mark => mark?.querySelector('svg') !== null)).toEqual([true, false, true]);
    });

    it('Space toggles the active row; Ctrl+click, Cmd+click and a click on the check mark do the same; a plain click selects', async () => {
        const user = userEvent.setup();
        const onToggleSelected = vi.fn();
        const onSelect = vi.fn();
        render(<BulkList items={three} selectedIds={new Set()} onToggleSelected={onToggleSelected} onSelect={onSelect} />);
        options()[0].focus();
        await user.keyboard(' ');
        expect(onToggleSelected.mock.calls.map(([item]) => item.id)).toEqual(['Alpha']);
        await user.keyboard('{ArrowDown} ');
        expect(onToggleSelected.mock.calls.map(([item]) => item.id)).toEqual(['Alpha', 'Beta']);
        fireEvent.click(options()[2], { ctrlKey: true });
        fireEvent.click(options()[2], { metaKey: true });
        fireEvent.click(options()[0].querySelector('.nuiget-row-check') as Element);
        expect(onToggleSelected.mock.calls.map(([item]) => item.id)).toEqual(['Alpha', 'Beta', 'Gamma', 'Gamma', 'Alpha']);
        expect(onSelect).not.toHaveBeenCalled();
        await user.click(options()[1]);
        expect(onSelect.mock.calls.map(([item]) => item.id)).toEqual(['Beta']);
        expect(onToggleSelected).toHaveBeenCalledTimes(5);
    });

    it('Space on a disabled option toggles nothing, and Space without a selection set is not handled', async () => {
        const user = userEvent.setup();
        const onToggleSelected = vi.fn();
        const onKeyDown = vi.fn();
        const items: Package[] = [{ id: 'Alpha', version: '1.0.0', disabled: true }, { id: 'Beta', version: '2.0.0' }];
        const { unmount } = render(<BulkList items={items} selectedIds={new Set()} onToggleSelected={onToggleSelected} onKeyDown={onKeyDown} />);
        options()[0].focus();
        await user.keyboard(' ');
        fireEvent.click(options()[0], { ctrlKey: true });
        fireEvent.click(options()[0].querySelector('.nuiget-row-check') as Element);
        expect(onToggleSelected).not.toHaveBeenCalled();
        unmount();

        // Single selection: no check mark, no aria-current, no aria-multiselectable, and Space bubbles unhandled.
        render(<BulkList items={three} selectedId="Beta" onToggleSelected={onToggleSelected} onKeyDown={onKeyDown} />);
        expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-multiselectable');
        expect(document.querySelector('.nuiget-row-check')).toBeNull();
        expect(options().map(element => element.getAttribute('aria-current'))).toEqual([null, null, null]);
        expect(options().map(element => element.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
        onKeyDown.mockClear();
        options()[0].focus();
        const space = fireEvent.keyDown(options()[0], { key: ' ' });
        expect(space).toBe(true);
        expect(onKeyDown).toHaveBeenCalledWith(' ');
        expect(onToggleSelected).not.toHaveBeenCalled();
    });

    it('a multi-selectable listbox with a current row and check marks has no axe violations', async () => {
        const { container } = render(<BulkList items={three} selectedIds={new Set(['Alpha'])} selectedId="Gamma" />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(['aria-allowed-attr', 'nested-interactive', 'aria-required-children'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes']);
    });
});
