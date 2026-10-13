import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as primitives from './index';
import { Badge, Banner, IconButton, Listbox, LiveStatus, Row, SectionHeader, SyncIcon, TrashIcon } from './index';
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
                            density="compact"
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

    it('the barrel exports every primitive, the icons and cssVars, and no test support', () => {
        const names = Object.keys(primitives);
        expect(names).toEqual(expect.arrayContaining([
            'Badge', 'Banner', 'EmptyState', 'IconButton', 'Listbox', 'LiveStatus', 'ProgressBar', 'Row', 'Sash', 'SectionHeader', 'Skeleton', 'Spinner',
            'cssVars', 'ChevronRightIcon', 'LoadingIcon',
        ]));
        expect(names.filter(name => /fakeLayout|axe/i.test(name))).toEqual([]);
    });
});
