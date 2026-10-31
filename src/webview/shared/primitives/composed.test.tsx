import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as primitives from './index';
import { Badge, Banner, ConfirmDialog, Dialog, IconButton, Listbox, LiveStatus, Popover, Row, SectionHeader, SyncIcon, Tabs, Toolbar, TrashIcon } from './index';
import { axeRuleOutcome, installFakeLayout } from './testSupport';

const packages = [{ id: 'Serilog', version: '3.0.0' }, { id: 'Newtonsoft.Json', version: '13.0.3', central: true }, { id: 'xunit', version: '2.9.0' }];

/** The primitives as a surface puts them together: one section of the sidebar. */
function Section() {
    return (
        <main>
            <Banner severity="warning" action={{ label: 'Retry', onClick: () => undefined }}>Sources unreachable</Banner>
            <SectionHeader
                title="Installed"
                titleId="installed-title"
                expanded
                onToggle={() => undefined}
                contentId="installed-content"
                testKey="installed"
                count={packages.length}
                actions={<IconButton label="Refresh installed packages"><SyncIcon /></IconButton>}
            />
            <div id="installed-content">
                <Listbox
                    items={packages}
                    labelledBy="installed-title"
                    hint="Enter uninstalls. Shift+F10 opens the actions menu."
                    testId="sidebar-installed-list"
                    density="compact"
                    selectedId="Serilog"
                    renderRow={(item, placement) => (
                        <Row
                            {...placement}
                            itemId={item.id}
                            name={item.id}
                            version={item.version}
                            badges={item.central ? <Badge label="CPM" title="Centrally managed" /> : undefined}
                            actions={<IconButton label={`Uninstall ${item.id}`} tabIndex={-1} data-testid="row-action-uninstall"><TrashIcon /></IconButton>}
                        />
                    )}
                />
            </div>
            <LiveStatus message="Uninstalled Moq" />
        </main>
    );
}

/**
 * The three dialogs of 1.x (finding U2) rebuilt from the primitives: Source Settings (`SourceSettingsOverlay.tsx:85`),
 * its Remove Source confirmation (`:295`) and the Multi Install picker (`PackageDetailsPanel.tsx:316`), on a page
 * with the details tabs and a bulk toolbar.
 */
function Panel() {
    const [tab, setTab] = useState<'details' | 'readme'>('details');
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const multiInstall = useRef<HTMLButtonElement>(null);
    return (
        <main>
            <h1>Serilog</h1>
            <Toolbar label="Bulk actions">
                <button type="button" data-testid="select-all-button">Select all</button>
                <button type="button" data-testid="uninstall-selected-button">Uninstall selected</button>
                <button type="button" onClick={() => setSourcesOpen(true)}>Sources</button>
            </Toolbar>
            <Tabs
                tabs={[{ id: 'details', label: 'Details', 'data-testid': 'details-tab-details' }, { id: 'readme', label: 'README', 'data-testid': 'details-tab-readme' }]}
                selected={tab}
                onSelect={setTab}
                label="Package details"
            >
                <button ref={multiInstall} type="button" aria-expanded={picking} onClick={() => setPicking(value => !value)}>Multi Install</button>
                <Popover open={picking} anchor={multiInstall} label="Install in projects" onClose={() => setPicking(false)}>
                    <label><input type="checkbox" /> App.csproj</label>
                    <button type="button">Install</button>
                </Popover>
            </Tabs>
            <Dialog open={sourcesOpen} onClose={() => setSourcesOpen(false)} title="NuGet sources" closeLabel="Close NuGet sources" data-testid="source-settings-modal">
                <label><input type="checkbox" defaultChecked /> nuget.org</label>
                <IconButton label="Remove nuget.org" onClick={() => setRemoving('nuget.org')}><TrashIcon /></IconButton>
                <ConfirmDialog open={removing !== null} title="Remove source?" confirmLabel="Remove" onConfirm={() => setRemoving(null)} onCancel={() => setRemoving(null)}>
                    {`The source ${removing ?? ''} is removed from nuget.config. This cannot be undone.`}
                </ConfirmDialog>
            </Dialog>
        </main>
    );
}

describe('primitives together', () => {
    let removeLayout: () => void;

    beforeEach(() => {
        removeLayout = installFakeLayout();
    });

    afterEach(() => {
        removeLayout();
    });

    it('SectionHeader, Listbox with three rows and actions, Banner and LiveStatus together have no axe violations', async () => {
        const { container } = render(<Section />);
        // The list is named by the title of its section, and all three rows are there to be checked.
        expect(screen.getByRole('listbox', { name: 'Installed' })).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3);
        // Two regions announce: the banner by its own role, and the one `status-live`.
        expect(screen.getAllByRole('status')).toHaveLength(2);
        expect(screen.getAllByTestId('status-live')).toHaveLength(1);

        const results = await axe(container);
        expect(results).toHaveNoViolations();
        expect(['nested-interactive', 'aria-required-children', 'aria-hidden-focus', 'heading-order'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes', 'passes']);
    });

    it('the three 1.x dialogs, the details tabs and a bulk toolbar together have no axe violations', async () => {
        const user = userEvent.setup();
        render(<Panel />);
        // The popover over the page.
        await user.click(screen.getByRole('button', { name: 'Multi Install' }));
        expect(screen.getByRole('dialog', { name: 'Install in projects' })).toBeInTheDocument();
        let results = await axe(document.body);
        expect(results).toHaveNoViolations();
        await user.keyboard('{Escape}');
        // The settings dialog, and the confirmation over it.
        await user.click(screen.getByRole('button', { name: 'Sources' }));
        await user.click(screen.getByRole('button', { name: 'Remove nuget.org' }));
        expect(screen.getByRole('dialog', { name: 'NuGet sources' })).toBeInTheDocument();
        expect(screen.getByRole('alertdialog', { name: 'Remove source?' })).toBeInTheDocument();
        results = await axe(document.body);
        expect(results).toHaveNoViolations();
        expect(['aria-dialog-name', 'heading-order', 'nested-interactive'].map(rule => axeRuleOutcome(results, rule))).toEqual(['passes', 'passes', 'passes']);
    });

    it('the barrel exports every primitive, the icons and cssVars, and no test support', () => {
        const names = Object.keys(primitives);
        expect(names).toEqual(expect.arrayContaining([
            'Badge', 'Banner', 'EmptyState', 'IconButton', 'Listbox', 'LiveStatus', 'ProgressBar', 'Row', 'Sash', 'SectionHeader', 'Skeleton', 'Spinner',
            'ConfirmDialog', 'Dialog', 'Popover', 'Tabs', 'Toolbar',
            'cssVars', 'ChevronRightIcon', 'LoadingIcon',
        ]));
        expect(names.filter(name => /fake|axe|layer|tabbable|placePopover/i.test(name))).toEqual([]);
    });
});
